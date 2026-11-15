import { computed, onBeforeUnmount, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { FP_CHARGE_EXIT_S, loadBoxingFpClips } from '../../avatar/boxingAnimator'
import type { FpBoxingCharge, FpBoxingShot } from '../../game/firstPersonArms'
import { type WornGloves, wearFpGloves } from '../../game/sports/boxingGloves'
import { sportRulesUrl } from '../../game/sports/sportsSignup'
import { matches } from '../../config/keybindings'
import type { Arena, SportsView } from '../../game/camera/sportsCamera'
import {
  ROCK_DURATION_S,
  bagInFront,
  bagSteps,
  boxerFor,
  clockLabel,
  handFor,
  parseHoldMs,
  parseBagDoubleFrom,
  parsePunchBags,
  parseRingArena,
  rockAngle,
  type BagSpot,
  type BoxingBagEndPayload,
  type BoxingBagHitPayload,
  type BoxingBagRoundPayload,
  type BoxingCombo,
  type BoxingHand,
  type BoxingPunchKind,
  isFighting,
  percentOf,
  punchKindAfter,
  secondsUntil,
  serverClock,
  type BoxingDodgedPayload,
  type BoxingHitPayload,
  type BoxingStatePayload,
} from '../../game/sports/boxing'

const RESULT_SHOWN_MS = 8000
const COMBO_SHOWN_MS = 1400
const BAG_RESULT_SHOWN_MS = 6000
const BAG_ARENA_M = 3
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
  comboName: (id: BoxingCombo) => string
  myPosition: { x: number; z: number }
  getCamera: () => THREE.Camera | undefined
  getScene: () => THREE.Scene | undefined
  remotePosition: (sessionId: string) => { x: number; z: number } | null
}

export interface BoxingArms {
  punch: () => void
  hitStop: (seconds: number) => void
  leftHand: () => THREE.Object3D | null
  rightHand: () => THREE.Object3D | null
  setBoxing: (clips: THREE.AnimationClip[] | null) => void
  setBoxingBlock: (on: boolean) => void
  boxingShot: (name: FpBoxingShot, fromS?: number) => void
  boxingCharge: (name: FpBoxingCharge) => void
  boxingRelax: () => void
}

const HIT_STOP_S = 0.08
const FP_SHOT: Record<BoxingPunchKind, FpBoxingShot> = { jab: 'FpJab', cross: 'FpCross', hook: 'FpHook', uppercut: 'FpUppercut' }
const FP_CHARGE: Record<BoxingHand, FpBoxingCharge> = { left: 'FpHookCharge', right: 'FpUppercutCharge' }
const FP_START_S: Record<BoxingPunchKind, number> = { jab: 0, cross: 0, hook: FP_CHARGE_EXIT_S.FpHook, uppercut: FP_CHARGE_EXIT_S.FpUppercut }

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
  let arena: Arena | null = null
  const rocking = new Map<THREE.Object3D, { start: number, rotationX: number }>()
  let rockFrame = 0
  let holdMs: number | null = null
  const presses = new Map<BoxingHand, { at: number, charge: ReturnType<typeof setTimeout> | null, fight: boolean }>()
  const combo = shallowRef<{ id: BoxingCombo, name: string, mine: boolean, damage: number, key: number } | null>(null)
  const bagRound = shallowRef<(BoxingBagRoundPayload & { receivedAt: number, key: number }) | null>(null)
  const bagResult = shallowRef<{ score: number, combos: number } | null>(null)
  let bagResultTimer: ReturnType<typeof setTimeout> | null = null
  const training = computed(() => bagRound.value !== null)
  const bagDoubleFrom = ref<number | null>(null)
  let comboTimer: ReturnType<typeof setTimeout> | null = null
  fetch(sportRulesUrl('boxing'))
    .then((res) => {
      if (!res.ok) throw new Error(`${res.url} answered ${res.status}`)
      return res.json()
    })
    .then((rules: unknown) => {
      bags = parsePunchBags(rules)
      bagDoubleFrom.value = parseBagDoubleFrom(rules)
      arena = parseRingArena(rules)
      holdMs = parseHoldMs(rules)
    })
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
      combo: combo.value,
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

  function pressHand(hand: BoxingHand): boolean {
    if (holdMs === null) return false
    const fight = fighting.value
    if (!fight && bagAimed() === null) return false
    if (fight && state.value?.phase !== 'round') return true
    const wait = holdMs
    releaseTimer(hand)
    const charge = fight || training.value ? setTimeout(() => deps.arms()?.boxingCharge(FP_CHARGE[hand]), wait) : null
    presses.set(hand, { at: performance.now(), charge, fight })
    if (fight) send('boxing_press', { hand })
    return true
  }

  function releaseTimer(hand: BoxingHand) {
    const press = presses.get(hand)
    if (press?.charge) clearTimeout(press.charge)
  }

  function releaseHand(hand: BoxingHand): boolean {
    const press = presses.get(hand)
    if (!press || holdMs === null) return false
    releaseTimer(hand)
    presses.delete(hand)
    const kind = punchKindAfter(hand, performance.now() - press.at, holdMs)
    deps.play('whoosh')
    if (press.fight) {
      send('boxing_release', { hand })
      deps.arms()?.boxingShot(FP_SHOT[kind], FP_START_S[kind])
      return true
    }
    const bag = bagAimed()
    if (training.value) deps.arms()?.boxingShot(FP_SHOT[kind], FP_START_S[kind])
    else deps.arms()?.punch()
    if (bag !== null) send('boxing_bag', { bag, kind })
    return true
  }

  function dropPresses() {
    for (const [hand, press] of presses) {
      releaseTimer(hand)
      if (press.fight) send('boxing_release', { hand })
    }
    presses.clear()
    deps.arms()?.boxingRelax()
  }

  function onPointerDown(e: MouseEvent): boolean {
    if (!deps.pointerLocked()) return false
    if (fighting.value && me.value?.countEndsAt !== null && me.value?.countEndsAt !== undefined) {
      send('boxing_getup')
      return true
    }
    const hand = handFor(e.button)
    return hand !== null && pressHand(hand)
  }

  function onPointerUp(e: MouseEvent) {
    const hand = handFor(e.button)
    if (hand) releaseHand(hand)
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (!fighting.value) return false
    if (matches('cook', e.code)) {
      if (!e.repeat) setGuard(true)
      return true
    }
    if (matches('punch', e.code)) {
      if (!e.repeat) onPointerDown(new MouseEvent('mousedown', { button: 0 }))
      return true
    }
    if (!e.repeat && (matches('moveLeft', e.code) || matches('moveRight', e.code))) {
      send('boxing_dodge', { side: matches('moveLeft', e.code) ? 'left' : 'right' })
    }
    return false
  }

  function onKeyUp(e: KeyboardEvent) {
    if (matches('cook', e.code)) setGuard(false)
    if (matches('punch', e.code)) releaseHand('left')
  }

  function onBlur() {
    setGuard(false)
    dropPresses()
  }

  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('blur', onBlur)
  onBeforeUnmount(() => {
    clearInterval(clock)
    myGloves?.dispose()
    if (rockFrame) cancelAnimationFrame(rockFrame)
    if (hideTimer) clearTimeout(hideTimer)
    if (comboTimer) clearTimeout(comboTimer)
    if (bagResultTimer) clearTimeout(bagResultTimer)
    for (const hand of presses.keys()) releaseTimer(hand)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onPointerUp)
    window.removeEventListener('blur', onBlur)
  })

  let myGloves: WornGloves | null = null
  watch(() => fighting.value || training.value, (on) => {
    myGloves?.dispose()
    const arms = deps.arms()
    myGloves = on && arms ? wearFpGloves({ left: arms.leftHand(), right: arms.rightHand() }) : null
    if (!on) {
      arms?.setBoxing(null)
      return
    }
    loadBoxingFpClips()
      .then((clips) => {
        if (fighting.value || training.value) deps.arms()?.setBoxing(clips)
      })
      .catch((error: unknown) => console.error('[boxing] first-person clips not loaded', error))
  })

  watch(() => state.value?.phase, (phase, before) => {
    if (phase === 'round' && before !== 'round') deps.play('boxing_bell')
    if (phase === 'over' && before !== 'over') deps.play('boxing_bell')
    if (phase !== 'round') {
      setGuard(false)
      dropPresses()
    }
  })

  function showCombo(id: BoxingCombo, mine: boolean, damage: number) {
    if (comboTimer) clearTimeout(comboTimer)
    combo.value = { id, name: deps.comboName(id), mine, damage, key: (combo.value?.key ?? 0) + 1 }
    comboTimer = setTimeout(() => (combo.value = null), COMBO_SHOWN_MS)
  }

  const handlers = {
    onState(data: BoxingStatePayload) {
      if (hideTimer) clearTimeout(hideTimer)
      hideTimer = null
      state.value = data
      receivedAt.value = Date.now()
      if (data.phase === 'over') hideTimer = setTimeout(() => (state.value = null), RESULT_SHOWN_MS)
    },
    onHit(data: BoxingHitPayload, mySession: string) {
      if (data.combo && (data.outcome === 'landed' || data.outcome === 'blocked')) showCombo(data.combo, data.sessionId === mySession, data.damage)
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
    onBagRound(data: BoxingBagRoundPayload) {
      if (bagResultTimer) clearTimeout(bagResultTimer)
      bagResult.value = null
      bagRound.value = { ...data, receivedAt: Date.now(), key: (bagRound.value?.key ?? 0) + 1 }
      if (data.outcome === 'combo') deps.play('boxing_bell')
      else if (data.outcome === 'wrong' || data.outcome === 'late') deps.play('glove_block')
    },
    onBagEnd(data: BoxingBagEndPayload, mySession: string) {
      if (data.sessionId !== mySession) return
      bagRound.value = null
      dropPresses()
      bagResult.value = { score: data.score, combos: data.combos }
      deps.play('boxing_bell')
      if (bagResultTimer) clearTimeout(bagResultTimer)
      bagResultTimer = setTimeout(() => (bagResult.value = null), BAG_RESULT_SHOWN_MS)
    },
    onRoomLeft() {
      state.value = null
      bagRound.value = null
      bagResult.value = null
      guarding = false
      for (const hand of presses.keys()) releaseTimer(hand)
      presses.clear()
    },
  }

  const bagView = computed(() => {
    const round = bagRound.value
    const doubleFrom = bagDoubleFrom.value
    if (!round || doubleFrom === null) return null
    return {
      doubleFrom,
      clock: clockLabel(secondsUntil(round.endsAt, serverClock(round, round.receivedAt, now.value))),
      comboName: deps.comboName(round.combo.id),
      steps: bagSteps(round.combo.sequence, round.index),
      score: round.score,
      combos: round.combos,
      streak: round.streak,
      outcome: round.outcome,
      key: round.key,
    }
  })

  function cameraView(): SportsView | null {
    const bag = bagRound.value ? bags[bagRound.value.bag] : undefined
    if (bag) {
      return { kind: 'duel', sport: 'boxing', optional: true, opponent: { x: bag.x, z: bag.z }, arena: { minX: bag.x - BAG_ARENA_M, maxX: bag.x + BAG_ARENA_M, minZ: bag.z - BAG_ARENA_M, maxZ: bag.z + BAG_ARENA_M }, walls: true }
    }
    const rival = fighting.value ? state.value?.boxers.find((b) => b.sessionId !== null && b.sessionId !== mySessionId()) : undefined
    const opponent = rival?.sessionId ? deps.remotePosition(rival.sessionId) : null
    return opponent && arena ? { kind: 'duel', sport: 'boxing', optional: true, opponent: { x: opponent.x, z: opponent.z }, arena } : null
  }

  return { view, bagView, bagResult, fighting, handlers, onPointerDown, onKeyDown, cameraView }
}
