import { computed, onBeforeUnmount, ref, shallowRef, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { matches } from '../../config/keybindings'
import {
  boxerFor,
  clockLabel,
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
  punchArms: () => void
  shakeOnHit: () => void
  play: (sound: 'whoosh' | 'impact' | 'market_bell') => void
  say: (text: string) => void
  tiredText: () => string
}

export function useBoxing(deps: BoxingDeps) {
  const state = shallowRef<BoxingStatePayload | null>(null)
  const receivedAt = ref(0)
  const now = ref(Date.now())
  let guarding = false
  let hideTimer: ReturnType<typeof setTimeout> | null = null
  const clock = setInterval(() => (now.value = Date.now()), CLOCK_TICK_MS)

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
    send('boxing_guard', { up })
  }

  function onPointerDown(e: MouseEvent): boolean {
    if (!fighting.value || !deps.pointerLocked()) return false
    if (me.value?.countEndsAt !== null && me.value?.countEndsAt !== undefined) {
      send('boxing_getup')
      return true
    }
    const kind = punchKindFor(e.button, e.shiftKey)
    if (!kind) return false
    deps.punchArms()
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
    if (hideTimer) clearTimeout(hideTimer)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
  })

  watch(() => state.value?.phase, (phase, before) => {
    if (phase === 'round' && before !== 'round') deps.play('market_bell')
    if (phase === 'over' && before !== 'over') deps.play('market_bell')
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
      if (data.targetSessionId !== mySession || (data.outcome !== 'landed' && data.outcome !== 'blocked')) return
      deps.play('impact')
      if (data.outcome === 'landed') deps.shakeOnHit()
    },
    onDodged(_data: BoxingDodgedPayload) {
      deps.play('whoosh')
    },
    onTired() {
      deps.say(deps.tiredText())
    },
    onRoomLeft() {
      state.value = null
      guarding = false
    },
  }

  return { view, fighting, handlers, onPointerDown, onKeyDown }
}
