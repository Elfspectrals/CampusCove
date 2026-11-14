import { computed, onBeforeUnmount, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { loadBoxingFpClips } from '../../avatar/boxingAnimator'
import type { FpBoxingShot } from '../../game/firstPersonArms'
import { type WornGloves, wearGloves } from '../../game/sports/boxingGloves'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import { matches } from '../../config/keybindings'
import {
  ROCK_DURATION_S,
  bagInFront,
  boxerFor,
  clockLabel,
  parsePunchBags,
  rockAngle,
  type BagSpot,
  type BoxingBagHitPayload,
  isFighting,
  percentOf,
  punchKindFor,
  secondsUntil,
  serverClock,
  type BoxingDodgedPayload,
  type BoxingHitPayload,
  type BoxingStatePayload,
} from '../../game/sports/boxing'

const RESULT_SHOWN_MS = 8000
const CLOCK_TICK_MS = 250

export interface BoxingDeps {
  gameRoomRef: ShallowRef<Room | null>
  pointerLocked: () => boolean
  arms: () => BoxingArms | null
  play: (sound: 'whoosh' | 'boxing_bell' | 'glove_hit' | 'glove_block') => void
  playOn: (sound: 'bag_hit', object: THREE.Object3D) => void
  say: (text: string) => void
  tiredText: () => string
  noGlovesText: () => string
  myPosition: { x: number; z: number }
  getCamera: () => THREE.Camera | undefined
  getScene: () => THREE.Scene | undefined
}

export interface BoxingArms {
  punch: () => void
  hitStop: (seconds: number) => void
  leftHand: () => THREE.Object3D | null
  rightHand: () => THREE.Object3D | null
  setBoxing: (clips: THREE.AnimationClip[] | null) => void
  setBoxingBlock: (on: boolean) => void
  boxingShot: (name: FpBoxingShot) => void
}

const HIT_STOP_S = 0.08
const FP_SHOT: Record<'jab' | 'cross' | 'hook', FpBoxingShot> = { jab: 'FpJab', cross: 'FpCross', hook: 'FpHook' }

const BAG_KEY = 'punch_bag'
const BAG_MATCH_M = 1.5
const forward = new THREE.Vector3()

export function useBoxing(deps: BoxingDeps) {
  const state = shallowRef<BoxingStatePayload | null>(null)
  const receivedAt = ref(0)
  const now = ref(Date.now())
  let guarding = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS)
  let bags: BagSpot[] = []
  const rocking = new Map<THREE.Object3D, { start: number, rotationX: number }>()
  let rockFrame = 0
  fetch(sportRulesUrl('boxing'))
    .then((res) => {
      if (!res.ok) throw new Error(`${res.url} answered ${res.status}`)
      return res.json()
    })
    .then((rules: unknown) => (bags = parsePunchBags(rules)))
    .catch((error: unknown) => console.error('[boxing] punch bags not loaded', error))

  const mySessionId = () => deps.gameRoomRef.value?.sessionId ?? null
  const fighting = computed(() => isFighting(state.value, mySessionId()))
  const me = computed(() => boxerFor(state.value, mySessionId()))

  const view = computed(() => {
    const s = state.value
    if (!s) return null
    const serverNow = serverClock(s, receivedAt.value, now.value)
    return {
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      maxKnockdowns: s.maxKnockdowns,
      clock: clockLabel(secondsUntil(s.phaseEndsAt, serverNow)),
      boxers: s.boxers.map((b) => ({
        key: b.corner,
        name: b.name,
        corner: b.corner,
        isMe: b.sessionId !== null && b.sessionId === mySessionId(),
        health: percentOf(b.health, b.maxHealth),
        endurance: percentOf(b.endurance, b.maxEndurance),
        guard: b.guard,
        knockdowns: b.knockdowns,
        points: b.points,
        countLeft: b.countEndsAt === null ? null : secondsUntil(b.countEndsAt, serverNow),
        canGetUp: b.canGetUp,
      })),
      result: s.result && {
        method: s.result.method,
        winner: s.boxers.find((b) => b.sessionId !== null && b.sessionId === s.result?.winner)?.name ?? null,
        won: s.result.winner !== null && s.result.winner === mySessionId(),
      },
    }
  })

  function send(type: string, payload: Record<string, unknown> = {}) {
    deps.gameRoomRef.value?.send(type, payload)
  }

  function setGuard(up: boolean) {
    if (guarding === up) return
    guarding = up
    deps.arms()?.setBoxingBlock(up)
    send('boxing_guard', { up })
  }

  function bagAimed(): number | null {
    const camera = deps.getCamera()
    if (!camera || bags.length === 0) return null
    camera.getWorldDirection(forward)
    return bagInFront(bags, deps.myPosition.x, deps.myPosition.z, forward.x, forward.z)
  }

  function onBagPointerDown(e: MouseEvent): boolean {
    const kind = punchKindFor(e.button, e.shiftKey)
    const bag = kind ? bagAimed() : null
    if (bag === null) return false
    deps.arms()?.punch()
    deps.play('whoosh')
    send('boxing_bag', { bag, kind })
    return true
  }

  function bagObject(bag: BagSpot): THREE.Object3D | null {
    let found: THREE.Object3D | null = null
    let bestDist = BAG_MATCH_M
    deps.getScene()?.traverse((object) => {
      if ((object.userData.zoneProp as { key?: string } | undefined)?.key !== BAG_KEY) return
      const dist = Math.hypot(object.position.x - bag.x, object.position.z - bag.z)
      if (dist < bestDist) {
        bestDist = dist
        found = object
      }
    })
    return found
  }

  function rockStep() {
    const t = performance.now()
    for (const [object, rock] of rocking) {
      const elapsed = (t - rock.start) / 1000
      object.rotation.x = rock.rotationX + rockAngle(elapsed)
      if (elapsed >= ROCK_DURATION_S) {
        object.rotation.x = rock.rotationX
        rocking.delete(object)
      }
    }
    rockFrame = rocking.size > 0 ? requestAnimationFrame(rockStep) : 0
  }

  function rock(object: THREE.Object3D) {
    const rotationX = rocking.get(object)?.rotationX ?? object.rotation.x
    rocking.set(object, { start: performance.now(), rotationX })
    if (!rockFrame) rockFrame = requestAnimationFrame(rockStep)
  }

  function onPointerDown(e: MouseEvent): boolean {
    if (!deps.pointerLocked()) return false
    if (!fighting.value) return onBagPointerDown(e)
    if (me.value?.countEndsAt !== null && me.value?.countEndsAt !== undefined) {
      send('boxing_getup')
      return true
    }
    const kind = punchKindFor(e.button, e.shiftKey)
    if (!kind) return false
    deps.arms()?.boxingShot(FP_SHOT[kind])
    deps.play('whoosh')
    send('boxing_punch', { kind })
    return true
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!fighting.value) return false
    if (matches('cook', e.code)) {
      if (!e.repeat) setGuard(true)
      return true
    }
    if (matches('punch', e.code)) {
      if (!e.repeat) onPointerDown(new MouseEvent('mousedown', { button: 0, shiftKey: e.shiftKey }))
      return true
    }
    if (!e.repeat && (matches('moveLeft', e.code) || matches('moveRight', e.code))) {
      send('boxing_dodge', { side: matches('moveLeft', e.code) ? 'left' : 'right' })
    }
    return false
  }

  function onKeyUp(e: KeyboardEvent) {
    if (matches('cook', e.code)) setGuard(false)
  }

  function onBlur() {
    setGuard(false)
  }

  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  onBeforeUnmount(() => {
    clearInterval(clock)
    myGloves?.dispose()
    if (rockFrame) cancelAnimationFrame(rockFrame)
    if (hideTimer) clearTimeout(hideTimer)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  })

  let myGloves: WornGloves | null = null
  watch(fighting, (on) => {
    myGloves?.dispose()
    const arms = deps.arms()
    myGloves = on && arms ? wearGloves({ left: arms.leftHand(), right: arms.rightHand() }) : null
    if (!on) {
      arms?.setBoxing(null)
      return
    }
    loadBoxingFpClips()
      .then((clips) => {
        if (fighting.value) deps.arms()?.setBoxing(clips)
      })
      .catch((error: unknown) => console.error('[boxing] first-person clips not loaded', error))
  })

  watch(() => state.value?.phase, (phase, before) => {
    if (phase === 'round' && before !== 'round') deps.play('boxing_bell')
    if (phase === 'over' && before !== 'over') deps.play('boxing_bell')
    if (phase !== 'round') setGuard(false)
  })

  const handlers = {
    onState(data: BoxingStatePayload) {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = null
      state.value = data
      receivedAt.value = Date.now()
      if (data.phase === 'over') hideTimer = setTimeout(() => (state.value = null), RESULT_SHOWN_MS)
    },
    onHit(data: BoxingHitPayload, mySession: string) {
      if (data.outcome === 'blocked') deps.play('glove_block')
      if (data.outcome !== 'landed' || data.targetSessionId !== mySession) return
      deps.play('glove_hit')
      deps.arms()?.boxingShot('FpHit')
      deps.arms()?.hitStop(HIT_STOP_S)
    },
    onDodged(_data: BoxingDodgedPayload) {
      deps.play('whoosh')
    },
    onTired() {
      deps.say(deps.tiredText())
    },
    onBagHit(data: BoxingBagHitPayload) {
      const bag = bags[data.bag]
      const object = bag ? bagObject(bag) : null
      if (!object) return
      rock(object)
      deps.playOn('bag_hit', object)
    },
    onNoGloves() {
      deps.say(deps.noGlovesText())
    },
    onRoomLeft() {
      state.value = null
      guarding = false
    },
  }

  return { view, fighting, handlers, onPointerDown, onKeyDown }
}
