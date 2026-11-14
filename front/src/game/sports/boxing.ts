export type BoxingPunchKind = 'jab' | 'cross' | 'hook'
export type BoxingPhase = 'intro' | 'round' | 'rest' | 'over'
export type BoxingMethod = 'ko' | 'points' | 'draw' | 'forfeit'
export type BoxingCorner = 'red' | 'blue'
export type BoxingOutcome = 'landed' | 'blocked' | 'dodged' | 'missed'

export interface BoxerView {
  sessionId: string | null
  name: string
  corner: BoxingCorner
  health: number
  maxHealth: number
  endurance: number
  maxEndurance: number
  guard: boolean
  knockdowns: number
  countEndsAt: number | null
  canGetUp: boolean
  points: number
}

export interface BoxingStatePayload {
  venue: string
  phase: BoxingPhase
  round: number
  rounds: number
  maxKnockdowns: number
  phaseEndsAt: number
  serverNow: number
  boxers: BoxerView[]
  result: { winner: string | null; method: BoxingMethod } | null
}

export interface BoxingHitPayload {
  sessionId: string
  targetSessionId: string
  kind: BoxingPunchKind
  outcome: BoxingOutcome
  damage: number
}

export interface BoxingDodgedPayload {
  sessionId: string
  side: 'left' | 'right'
}

const LEFT_BUTTON = 0
const RIGHT_BUTTON = 2

export function punchKindFor(button: number, shift: boolean): BoxingPunchKind | null {
  if (button !== LEFT_BUTTON && button !== RIGHT_BUTTON) return null
  if (shift) return 'hook'
  return button === LEFT_BUTTON ? 'jab' : 'cross'
}

export function serverClock(state: Pick<BoxingStatePayload, 'serverNow'>, receivedAt: number, now: number): number {
  return state.serverNow + (now - receivedAt)
}

export function secondsUntil(endsAt: number, serverNow: number): number {
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000))
}

export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function percentOf(value: number, max: number): number {
  if (max <= 0) throw new Error(`boxing: invalid maximum ${max}`)
  return Math.round(Math.min(1, Math.max(0, value / max)) * 100)
}

export function boxerFor(state: BoxingStatePayload | null, sessionId: string | null): BoxerView | null {
  if (!state || !sessionId) return null
  return state.boxers.find((b) => b.sessionId === sessionId) ?? null
}

export function isFighting(state: BoxingStatePayload | null, sessionId: string | null): boolean {
  return state !== null && state.phase !== 'over' && boxerFor(state, sessionId) !== null
}
