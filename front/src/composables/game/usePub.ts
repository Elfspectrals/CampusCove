import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { fetchItemShopCatalog, type ShopItem } from '../../api/itemShop'
import { consumableModelUrl } from '../../game/assets/catalog'
import { BARTENDER_REACH, COUNTER_REACH, SECRET_OPEN_MS } from '../../game/gameRoomConstants'
import { createBartenderPour } from '../../game/pub/bartenderPour'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import { createSecretDoor } from '../../game/pub/secretDoor'
import { openHouseInterior } from '../../game/town/openHouses'
import type { PubLayout, WorldManifest } from '../../game/world/worldManifest'
import type {
  PubBellPayload,
  PubErrorPayload,
  PubPouringPayload,
  PubSecretDoorPayload,
  PubSecretResultPayload,
  PubServedPayload,
} from '../../types/gameRealtime'
import { isAlcoholItem } from '../../utils/itemShopPresentation'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PUB_KEY = 'pub'
const PUB_NAME = 'The Salty Shamrock'
const COUNTER_PROMPT_HEIGHT = 1.15
const NPC_PROMPT_HEIGHT = 2
const GLASS_PROMPT_HEIGHT = 0.35
const BOUNCER_GREETING = 'You look lost, friend.'
const BOUNCER_YES = "Second door on the left. Don't tell."
const BOUNCER_NO = 'Never heard of it.'

export type OrderVia = 'counter' | 'bartender'

export interface PubDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  /** Seated players call the barman instead of using the counter spot (its prompt would hide the stool's games). */
  seated: () => boolean
  refreshInventory: () => void
  /** The drink just picked up goes in hand. */
  selectHotbarItem: (code: string) => void
  say: (text: string) => void
  /** The server refused a pub action (useSeats drops a pending `sit`). */
  onError: () => void
}

/**
 * The Salty Shamrock's bar: ordering at the counter or from the barman (who pours, then slides the glass to the
 * serving spot), the bouncer's riddle for the staff door, and the "last orders" bell.
 */
export function usePub(deps: PubDeps) {
  const menuOpen = ref(false)
  const menu = ref<ShopItem[]>([])
  const loading = ref(false)
  const ordering = ref<string | null>(null)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const via = ref<OrderVia>('counter')
  const secretOpen = ref(false)
  const secretReply = ref<string | null>(null)
  const secretPending = ref(false)
  let layout: PubLayout | null = null
  let pour: ReturnType<typeof createBartenderPour> | null = null
  let secretDoor: ReturnType<typeof createSecretDoor> | null = null
  let staffDoorOpen = false
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function mySessionId(): string {
    return deps.gameRoomRef.value?.sessionId ?? ''
  }

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.pub ?? null
    pour?.dispose()
    pour = null
    secretDoor = null
    const interior = openHouseInterior(PUB_KEY)
    if (!layout || !interior) return
    pour = createBartenderPour(interior, layout)
    try {
      secretDoor = createSecretDoor(interior, PUB_KEY)
      secretDoor.setOpen(staffDoorOpen)
    } catch (err) {
      console.error('[pub] staff door unavailable', err)
    }
  }

  // ------------------------------------------------------------ reach

  function near(point: [number, number, number], reach: number): boolean {
    return Math.hypot(point[0] - deps.myPosition.x, point[2] - deps.myPosition.z) <= reach
  }

  function atCounter(): boolean {
    return layout !== null && !deps.seated() && near(layout.counter, COUNTER_REACH)
  }

  function aimingAt(npc: [number, number, number], reach: number): boolean {
    const camera = deps.getCamera()
    if (!camera) return false
    camera.getWorldDirection(forward)
    return isAimingAtNpc(deps.myPosition, forward, npc, reach)
  }

  // ------------------------------------------------------------ drinks

  async function loadMenu(): Promise<void> {
    loading.value = true
    try {
      const { items } = await fetchItemShopCatalog()
      menu.value = items.filter((item) => isAlcoholItem(item) && item.options.some((o) => o.currency === 'coins'))
    } catch {
      feedback.value = { kind: 'error', text: 'The drinks list could not be loaded.' }
    } finally {
      loading.value = false
    }
  }

  function openMenu(where: OrderVia): void {
    if (document.pointerLockElement) document.exitPointerLock()
    via.value = where
    feedback.value = null
    menuOpen.value = true
    if (menu.value.length === 0) void loadMenu()
  }

  function order(item: ShopItem): void {
    if (ordering.value !== null) return
    ordering.value = item.code
    deps.gameRoomRef.value?.send('pub_order', { code: item.code, via: via.value })
    menuOpen.value = false
  }

  function close(): void {
    menuOpen.value = false
  }

  function drinkName(code: string): string {
    return menu.value.find((item) => item.code === code)?.name ?? 'Your drink'
  }

  function onPouring(data: PubPouringPayload, me: string): void {
    pour?.pour(data.sessionId, data.code, consumableModelUrl(data.code), data.durationMs)
    if (data.sessionId === me) deps.say('The barman pulls your drink…')
  }

  function onServed(data: PubServedPayload): void {
    ordering.value = null
    pour?.serve(mySessionId(), data.code, consumableModelUrl(data.code))
    deps.refreshInventory()
    deps.say(`${drinkName(data.code)} is on the bar. Pick it up.`)
  }

  function onError(data: PubErrorPayload): void {
    ordering.value = null
    secretPending.value = false
    deps.onError()
    deps.say(data.message)
  }

  function pickUp(): boolean {
    const code = pour?.pickUp(mySessionId()) ?? null
    if (code === null) return false
    deps.selectHotbarItem(code)
    deps.say(`${drinkName(code)} in hand. Click to drink. Sláinte!`)
    return true
  }

  // ------------------------------------------------------------ bouncer and bell

  function talk(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    secretReply.value = null
    secretPending.value = false
    secretOpen.value = true
  }

  function whisper(phrase: string): void {
    if (secretPending.value) return
    secretPending.value = true
    deps.gameRoomRef.value?.send('pub_secret', { phrase })
  }

  function closeSecret(): void {
    secretOpen.value = false
  }

  function onSecretResult(data: PubSecretResultPayload): void {
    secretPending.value = false
    secretReply.value = data.ok ? BOUNCER_YES : BOUNCER_NO
    if (data.ok) deps.say(`The staff door is open for ${Math.round(SECRET_OPEN_MS / 1000)} s.`)
  }

  function onSecretDoor(data: PubSecretDoorPayload): void {
    staffDoorOpen = data.open
    secretDoor?.setOpen(data.open)
  }

  function ring(): void {
    deps.gameRoomRef.value?.send('pub_bell')
  }

  function onBell(_data: PubBellPayload): void {
    secretDoor?.ring()
    deps.say('Ding ding! Last orders!')
  }

  // ------------------------------------------------------------ per frame

  function tick(dt: number): void {
    pour?.update(dt)
    secretDoor?.update(dt)
  }

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function servedGlassWaiting(): boolean {
    return layout !== null && pour?.servedCode(mySessionId()) !== null && near(layout.serve, COUNTER_REACH)
  }

  function prompt(): ScreenPrompt | null {
    if (!layout || deps.promptsHidden() || menuOpen.value || secretOpen.value) return null
    if (servedGlassWaiting()) {
      const [x, y, z] = layout.serve
      const screen = projectToScreen(x, y + GLASS_PROMPT_HEIGHT, z)
      return screen && { ...screen, action: 'Pick up', detail: drinkName(pour!.servedCode(mySessionId())!) }
    }
    if (aimingAt(layout.bartender, BARTENDER_REACH)) {
      const [x, y, z] = layout.bartender
      const screen = projectToScreen(x, y + NPC_PROMPT_HEIGHT, z)
      return screen && { ...screen, action: 'Order', detail: 'The barman pours it' }
    }
    if (atCounter()) {
      const [x, y, z] = layout.counter
      const screen = projectToScreen(x, y + COUNTER_PROMPT_HEIGHT, z)
      return screen && { ...screen, action: 'Order', detail: PUB_NAME }
    }
    if (aimingAt(layout.bouncer, COUNTER_REACH)) {
      const [x, y, z] = layout.bouncer
      const screen = projectToScreen(x, y + NPC_PROMPT_HEIGHT, z)
      return screen && { ...screen, action: 'Talk', detail: 'Bouncer' }
    }
    if (near(layout.bell, COUNTER_REACH)) {
      const [x, y, z] = layout.bell
      const screen = projectToScreen(x, y, z)
      return screen && { ...screen, action: 'Ring', detail: 'Last orders bell' }
    }
    return null
  }

  function interact(): boolean {
    if (!layout || menuOpen.value || secretOpen.value) return false
    if (servedGlassWaiting()) return pickUp()
    if (aimingAt(layout.bartender, BARTENDER_REACH)) {
      openMenu('bartender')
      return true
    }
    if (atCounter()) {
      openMenu('counter')
      return true
    }
    if (aimingAt(layout.bouncer, COUNTER_REACH)) {
      talk()
      return true
    }
    if (near(layout.bell, COUNTER_REACH)) {
      ring()
      return true
    }
    return false
  }

  const source: InteractionSource = { prompt, interact }

  return {
    menuOpen,
    menu,
    loading,
    ordering,
    feedback,
    via,
    secretOpen,
    secretReply,
    secretPending,
    bouncerGreeting: BOUNCER_GREETING,
    onTownLoaded,
    order,
    close,
    whisper,
    closeSecret,
    tick,
    source,
    handlers: { onPouring, onServed, onError, onSecretResult, onSecretDoor, onBell },
  }
}
