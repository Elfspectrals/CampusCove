import { computed, ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { matches } from '../../config/keybindings'
import { createBiteParticles } from '../../game/biteParticles'
import { lookAngles, recoveryProgress } from '../../game/clinic'
import { screenEffects, walkSpeedFactor, type SurvivalStats } from '../../game/survival'
import { createSurvivalWatch } from '../../game/survivalWatch'
import { createFountains } from '../../game/town/fountains'
import type { WorldManifest } from '../../game/world/worldManifest'
import type { ApartmentInventoryItem } from '../../types/gameRealtime'
import type { ScreenPrompt } from './useInteractionTargets'

/** Raw items that can be cooked (backend FoodCatalog::COOKING). */
const COOKABLE = new Set(['food_fish_raw'])
const REDUCED_EFFECTS_KEY = 'cc.reducedEffects'

type Arms = {
  leftHand: () => THREE.Object3D | null
  raiseWatch: (raised: boolean) => void
  eat: () => void
  isEating: () => boolean
}

export interface SurvivalDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  getFpHands: () => THREE.Group | null
  getArms: () => Arms | null
  myPosition: { x: number; y: number; z: number }
  pointerLocked: Ref<boolean>
  selectedItem: Ref<ApartmentInventoryItem | null>
  refreshInventory: () => void
  /** Moves the local player (respawn after passing out). */
  teleport: (x: number, y: number, z: number) => void
  setLook: (yaw: number, pitch: number) => void
  promptsHidden: () => boolean
  onStamina: (stamina: number) => void
}

function readReducedEffects(): boolean {
  try {
    return window.localStorage.getItem(REDUCED_EFFECTS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Hunger, thirst and health on the player's side: the values pushed by the server, the wrist watch that shows
 * them, the screen effects, and the actions (eat / drink what is held, sip at a fountain, cook raw food).
 */
export function useSurvival(deps: SurvivalDeps) {
  const stats = ref<SurvivalStats | null>(null)
  const boostUntil = ref(0)
  const healUntil = ref(0)
  const knockedOut = ref(false)
  const hospitalBill = ref<number | null>(null)
  /** Bumped on every hit, so the damage flash replays. */
  const damageFlash = ref(0)
  const message = ref<string | null>(null)
  const reducedEffects = ref(readReducedEffects())
  const prompt = ref<ScreenPrompt | null>(null)
  const recovery = ref<{ startedAt: number; durationMs: number; bed: [number, number, number] | null } | null>(null)
  const recovering = ref<number | null>(null)
  const effects = computed(() => (stats.value ? screenEffects(stats.value, reducedEffects.value) : null))

  const watchHud = createSurvivalWatch()
  let particles: ReturnType<typeof createBiteParticles> | null = null
  let fountains: ReturnType<typeof createFountains> | null = null
  /** Local time when the fountains give water again (server: survivalStats.fountainSip). */
  let fountainReadyAt = 0
  let messageTimer: number | undefined
  const projection = new THREE.Vector3()

  function say(text: string): void {
    message.value = text
    window.clearTimeout(messageTimer)
    messageTimer = window.setTimeout(() => (message.value = null), 3500)
  }

  // ------------------------------------------------------------ server messages

  function bindRoom(room: Room): void {
    room.onMessage('survival', (data: SurvivalStats & { speedBoostUntil?: number; healUntil?: number | null; stamina: number }) => {
      stats.value = { health: data.health, hunger: data.hunger, thirst: data.thirst }
      boostUntil.value = data.speedBoostUntil ?? 0
      healUntil.value = data.healUntil ?? 0
      watchHud.setStats(stats.value, boostUntil.value, healUntil.value)
      deps.onStamina(data.stamina)
    })
    room.onMessage('survival_damage', () => {
      damageFlash.value++
    })
    room.onMessage('survival_consumed', (data: { effect: string | null }) => {
      if (data.effect === 'food_poisoning') {
        damageFlash.value++
        say('That was raw… your stomach hurts.')
      } else if (data.effect === 'speed_boost') {
        say('Caffeine boost: you walk faster for a minute.')
      } else if (data.effect === 'heal_over_time') {
        say('Painkillers taken: your health comes back over time.')
      }
      deps.refreshInventory()
    })
    room.onMessage('survival_cooked', () => {
      say('Cooked! It is in your inventory.')
      deps.refreshInventory()
    })
    room.onMessage('fountain_cooldown', (data: { remainingMs: number }) => {
      fountainReadyAt = Date.now() + data.remainingMs
    })
    room.onMessage('survival_error', (data: { message?: string }) => say(data.message ?? 'Not possible.'))
    room.onMessage('survival_knocked_out', () => {
      knockedOut.value = true
      hospitalBill.value = null
      deps.getArms()?.raiseWatch(false)
    })
    room.onMessage('survival_hospital_bill', (data: { billed: number; balanceAfter: number | null }) => {
      hospitalBill.value = data.billed
      // the wallet in the header reads this cache
      if (typeof data.balanceAfter === 'number') applyCachedBalanceAfterPurchase('coins', data.balanceAfter)
    })
    room.onMessage(
      'survival_respawn',
      (data: { x: number; y: number; z: number; yaw: number; bed: [number, number, number] | null; recoveringMs: number }) => {
        deps.teleport(data.x, data.y, data.z)
        deps.setLook(data.yaw, 0)
        knockedOut.value = false
        if (data.recoveringMs > 0) {
          recovery.value = { startedAt: Date.now(), durationMs: data.recoveringMs, bed: data.bed }
          recovering.value = 0
        }
      },
    )
  }

  watch(deps.gameRoomRef, (room) => {
    if (room) bindRoom(room)
  })

  // ------------------------------------------------------------ world

  function onTownLoaded(manifest: WorldManifest): void {
    if (fountains) fountains.group.removeFromParent()
    fountains = createFountains(manifest.fountains ?? [])
    deps.getScene()?.add(fountains.group)
  }

  // ------------------------------------------------------------ actions

  const heldConsumable = () => {
    const item = deps.selectedItem.value
    return item && item.kind === 'consumable' && item.quantity > 0 ? item : null
  }

  function nearFountain() {
    return fountains?.nearest(deps.myPosition.x, deps.myPosition.z) ?? null
  }

  const fountainDry = () => Date.now() < fountainReadyAt

  function formatWait(ms: number): string {
    const s = Math.ceil(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function sip(): void {
    if (!nearFountain() || knockedOut.value || recovery.value || fountainDry()) return
    deps.gameRoomRef.value?.send('drink_fountain')
    deps.getArms()?.eat()
    particles?.burst('drink')
  }

  /** Left click (nothing else to interact with): returns true when it was used here. */
  function onPrimaryDown(): boolean {
    if (!deps.pointerLocked.value || knockedOut.value || recovery.value) return false
    if (nearFountain()) {
      if (fountainDry()) {
        say(`You already drank. Fountains are available again in ${formatWait(fountainReadyAt - Date.now())}.`)
        return true
      }
      sip()
      return true
    }
    const item = heldConsumable()
    if (!item) return false
    const arms = deps.getArms()
    if (arms?.isEating()) return true
    arms?.eat()
    deps.gameRoomRef.value?.send('consume', { code: item.code })
    window.setTimeout(() => particles?.burst((item.code.includes('water') || item.code.includes('juice') || item.code.includes('coffee')) ? 'drink' : 'eat'), 350)
    return true
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (matches('survivalWatch', e.code)) {
      if (!knockedOut.value) deps.getArms()?.raiseWatch(true)
      return true
    }
    if (matches('cook', e.code) && !e.repeat) {
      const item = heldConsumable()
      if (!item || !COOKABLE.has(item.code)) return false
      deps.gameRoomRef.value?.send('cook', { code: item.code })
      return true
    }
    return false
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (matches('survivalWatch', e.code)) deps.getArms()?.raiseWatch(false)
  }

  function bindInputListeners(): () => void {
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keyup', onKeyUp)
    }
  }

  // ------------------------------------------------------------ per frame

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function currentPrompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || knockedOut.value || recovery.value) return null
    const fountain = nearFountain()
    if (fountain) {
      const screen = projectToScreen(fountain.x, fountain.y + 1.25, fountain.z)
      if (!screen) return null
      if (fountainDry()) return { ...screen, action: 'Drinking fountain', detail: `Available in ${formatWait(fountainReadyAt - Date.now())}` }
      return { ...screen, action: 'Drink', detail: 'Drinking fountain' }
    }
    return null
  }

  function tick(dt: number): void {
    const arms = deps.getArms()
    watchHud.update(dt, arms?.leftHand() ?? null)
    const fpHands = deps.getFpHands()
    if (!particles && fpHands) particles = createBiteParticles(fpHands)
    particles?.update(dt)
    prompt.value = currentPrompt()
    tickRecovery()
  }

  function tickRecovery(): void {
    const current = recovery.value
    if (!current) return
    const progress = recoveryProgress(current.startedAt, current.durationMs, Date.now())
    if (progress >= 1) {
      recovery.value = null
      recovering.value = null
      return
    }
    recovering.value = progress
    if (!current.bed) return
    const look = lookAngles(deps.myPosition, current.bed)
    deps.setLook(look.yaw, look.pitch)
  }

  /** Walking speed multiplier for useGameMovement (0 while passed out). */
  function speedFactor(): number {
    if (knockedOut.value || recovery.value) return 0
    return stats.value ? walkSpeedFactor(stats.value, Date.now() < boostUntil.value) : 1
  }

  function toggleReducedEffects(): void {
    reducedEffects.value = !reducedEffects.value
    try {
      window.localStorage.setItem(REDUCED_EFFECTS_KEY, reducedEffects.value ? '1' : '0')
    } catch {
      /* the setting just won't be remembered */
    }
  }

  function dispose(): void {
    window.clearTimeout(messageTimer)
    watchHud.dispose()
    particles?.dispose()
    fountains?.group.removeFromParent()
  }

  return {
    stats,
    effects,
    knockedOut,
    hospitalBill,
    damageFlash,
    message,
    prompt,
    reducedEffects,
    recovering,
    say,
    heldConsumable,
    onTownLoaded,
    onPrimaryDown,
    onKeyDown,
    bindInputListeners,
    tick,
    speedFactor,
    toggleReducedEffects,
    dispose,
  }
}
