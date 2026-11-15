export type BoxingPunchKind = 'jab' | 'cross' | 'hook' | 'uppercut'
export type BoxingHand = 'left' | 'right'
export type BoxingCombo = 'one_two' | 'double_jab' | 'one_two_hook' | 'upper_hook' | 'full_combo'
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
  combo: BoxingCombo | null
  chain: number
}

export interface BoxingChargePayload {
  sessionId: string
  hand: BoxingHand
  on: boolean
}

export interface BoxingDodgedPayload {
  sessionId: string
  side: 'left' | 'right'
}

const LEFT_BUTTON = 0
const RIGHT_BUTTON = 2

export function handFor(button: number): BoxingHand | null {
  return button === LEFT_BUTTON ? 'left' : button === RIGHT_BUTTON ? 'right' : null
}

export function punchKindAfter(hand: BoxingHand, heldMs: number, holdMs: number): BoxingPunchKind {
  const held = heldMs >= holdMs
  return hand === 'left' ? (held ? 'hook' : 'jab') : (held ? 'uppercut' : 'cross')
}

export function parseHoldMs(rules: unknown): number {
  const ms = (rules as { hold?: { ms?: unknown } } | null)?.hold?.ms
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) throw new Error('boxing rules: hold.ms must be a positive number')
  return ms
}

export function parseBagDoubleFrom(rules: unknown): number {
  const streak = (rules as { bag?: { streakForDouble?: unknown } } | null)?.bag?.streakForDouble
  if (typeof streak !== 'number' || !Number.isInteger(streak) || streak <= 0) throw new Error('boxing rules: bag.streakForDouble must be a positive whole number')
  return streak
}

export function serverClock(state: Pick<BoxingStatePayload, 'serverNow'>, receivedAt: number, now: number): number {
  return state.serverNow + Math.max(0, now - receivedAt)
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

export interface BoxingBagHitPayload {
  bag: number
  sessionId: string
  kind: BoxingPunchKind
  training: boolean
}

export type BagOutcome = 'hit' | 'combo' | 'wrong' | 'late' | 'over'

export interface BoxingBagRoundPayload {
  bag: number
  endsAt: number
  serverNow: number
  combo: { id: BoxingCombo; sequence: BoxingPunchKind[] }
  index: number
  score: number
  combos: number
  streak: number
  outcome: BagOutcome
}

export interface BoxingBagEndPayload {
  bag: number
  sessionId: string
  score: number
  combos: number
  reason: 'time' | 'left'
}

export interface BagStep {
  kind: BoxingPunchKind
  state: 'done' | 'next' | 'todo'
}

export function bagSteps(sequence: readonly BoxingPunchKind[], index: number): BagStep[] {
  return sequence.map((kind, i) => ({ kind, state: i < index ? 'done' : i === index ? 'next' : 'todo' }))
}

export interface BagSpot {
  x: number
  z: number
}

export const BAG_REACH_M = 1.3
const BAG_FACING_COS = 0.3
const ROCK_ANGLE_RAD = 0.06
const ROCK_RATE_RAD_S = 18
const ROCK_DECAY_S = 0.25
export const ROCK_DURATION_S = 0.9

const RING_CAMERA_MARGIN_M = 3.6

export function parseRingArena(rules: unknown): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const ring = (rules as { ring?: { centre?: { x?: unknown; z?: unknown }; halfM?: unknown } } | null)?.ring
  const x = ring?.centre?.x
  const z = ring?.centre?.z
  const half = ring?.halfM
  if (typeof x !== 'number' || typeof z !== 'number' || typeof half !== 'number' || !Number.isFinite(x + z + half) || half <= 0) throw new Error('boxing rules: invalid ring')
  const reach = half + RING_CAMERA_MARGIN_M
  return { minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach }
}

export function parsePunchBags(rules: unknown): BagSpot[] {
  const bags = (rules as { punchBags?: unknown } | null)?.punchBags
  if (!Array.isArray(bags) || bags.length === 0) throw new Error('boxing rules: punchBags must list the bags')
  return bags.map((bag, i) => {
    const { x, z } = (bag ?? {}) as { x?: unknown; z?: unknown }
    if (typeof x !== 'number' || typeof z !== 'number' || !Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`boxing rules: invalid punchBags.${i}`)
    return { x, z }
  })
}

export function bagInFront(bags: readonly BagSpot[], x: number, z: number, forwardX: number, forwardZ: number): number | null {
  const len = Math.hypot(forwardX, forwardZ)
  let best: number | null = null
  let bestDist = Infinity
  for (const [index, bag] of bags.entries()) {
    const dx = bag.x - x
    const dz = bag.z - z
    const dist = Math.hypot(dx, dz)
    const facing = dist === 0 || len === 0 ? 1 : (dx * forwardX + dz * forwardZ) / (dist * len)
    if (dist <= BAG_REACH_M && facing >= BAG_FACING_COS && dist < bestDist) {
      best = index
      bestDist = dist
    }
  }
  return best
}

export function rockAngle(elapsedS: number): number {
  if (elapsedS < 0 || elapsedS >= ROCK_DURATION_S) return 0
  return ROCK_ANGLE_RAD * Math.exp(-elapsedS / ROCK_DECAY_S) * Math.sin(ROCK_RATE_RAD_S * elapsedS)
}

export type GloveSide = 'left' | 'right'

export function trianglesBySide(positions: ArrayLike<number>, index: ArrayLike<number> | null, centreX: number): Record<GloveSide, number[]> {
  const count = index ? index.length : positions.length / 3
  if (count % 3 !== 0) throw new Error(`boxing gloves: ${count} vertices do not make whole triangles`)
  const sides: Record<GloveSide, number[]> = { left: [], right: [] }
  for (let t = 0; t < count; t += 3) {
    const corners = [0, 1, 2].map((k) => (index ? index[t + k]! : t + k))
    const x = corners.reduce((sum, v) => sum + positions[v * 3]!, 0) / 3
    sides[x >= centreX ? 'left' : 'right'].push(...corners)
  }
  return sides
}

export function boundsOfVertices(positions: ArrayLike<number>, vertices: readonly number[]): { min: [number, number, number]; max: [number, number, number] } {
  if (vertices.length === 0) throw new Error('boxing gloves: no vertices to bound')
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const v of vertices) {
    for (let k = 0; k < 3; k++) {
      const value = positions[v * 3 + k]!
      if (value < min[k]!) min[k] = value
      if (value > max[k]!) max[k] = value
    }
  }
  return { min, max }
}

export function boxerPose(state: BoxingStatePayload, boxer: BoxerView): { guard: boolean; down: boolean; result: 'won' | 'lost' | 'draw' | null } {
  const result = state.phase !== 'over' || !state.result ? null
    : state.result.winner === null ? 'draw'
      : state.result.winner === boxer.sessionId ? 'won' : 'lost'
  return { guard: boxer.guard, down: boxer.countEndsAt !== null, result }
}
