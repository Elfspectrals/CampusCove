import { computed, ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import type { LockpickPin } from '../../game/town/lockpickDial'
import type { LockpickErrorPayload, LockpickPinPayload, LockpickResultPayload } from '../../types/gameRealtime'

export interface LockpickBoard {
  pinsSet: number
  pins: number
  window: number
  pin: LockpickPin | null
  readyAt: number
  outcome: LockpickResultPayload['outcome'] | null
  error: string | null
}

export interface LockpickDeps {
  gameRoomRef: ShallowRef<Room | null>
  onOutcome: (outcome: LockpickResultPayload['outcome']) => void
}

const ENDING_OUTCOMES: ReadonlySet<LockpickResultPayload['outcome']> = new Set(['broke', 'open', 'abandoned'])

export function useLockpick(deps: LockpickDeps) {
  const board = ref<LockpickBoard | null>(null)
  const open = computed(() => board.value !== null)

  function start(unitId: string): void {
    if (board.value || !deps.gameRoomRef.value) return
    if (document.pointerLockElement) document.exitPointerLock()
    board.value = { pinsSet: 0, pins: 0, window: 0, pin: null, readyAt: 0, outcome: null, error: null }
    deps.gameRoomRef.value.send('lockpick_start', { unitId })
  }

  function press(): void {
    const current = board.value
    if (!current?.pin || current.outcome && ENDING_OUTCOMES.has(current.outcome) || performance.now() < current.readyAt) return
    deps.gameRoomRef.value?.send('lockpick_press')
  }

  function close(): void {
    const current = board.value
    if (!current) return
    if (!current.outcome || !ENDING_OUTCOMES.has(current.outcome)) deps.gameRoomRef.value?.send('lockpick_cancel')
    board.value = null
  }

  const handlers = {
    onPin(data: LockpickPinPayload): void {
      if (!board.value) return
      const now = performance.now()
      board.value = {
        ...board.value,
        pinsSet: data.pinsSet,
        pins: data.pins,
        window: data.window,
        pin: { period: data.period, phase: data.phase, receivedAt: now },
        readyAt: now + data.readyInMs,
        error: null,
      }
    },
    onResult(data: LockpickResultPayload): void {
      deps.onOutcome(data.outcome)
      if (!board.value) return
      board.value = { ...board.value, outcome: data.outcome, pin: ENDING_OUTCOMES.has(data.outcome) ? null : board.value.pin }
    },
    onError(data: LockpickErrorPayload): void {
      if (!board.value) return
      if (data.code === 'lockpick_settling') return
      board.value = { ...board.value, pin: null, outcome: 'abandoned', error: data.message }
    },
  }

  return { board, open, start, press, close, handlers }
}
