import type { SportsTeam } from './sportsSignup'

export type PetanqueMode = 'point' | 'shoot'
type PetanquePhase = 'jack' | 'boules' | 'between'

export interface PetanqueBall {
  id: number
  kind: 'jack' | 'boule'
  team: SportsTeam | null
  owner: number | null
  x: number
  z: number
  dead: boolean
}

export interface PetanqueStatePayload {
  venue: string
  phase: PetanquePhase
  format: string
  target: number
  score: Record<SportsTeam, number>
  end: number
  circle: { x: number; z: number; axisZ: 1 | -1 }
  jackTeam: SportsTeam
  thrower: string | null
  busyUntil: number
  turnEndsAt: number
  serverNow: number
  players: { sessionId: string; name: string; team: SportsTeam | null; out: boolean; left: number }[]
  balls: PetanqueBall[]
  point: { team: SportsTeam; ball: number } | null
  distancesCm: { id: number; cm: number }[]
  lastEnd: { team: SportsTeam | null; points: number } | null
}

export type PetanqueFrame = [number, ...[number, number, number][]]

export interface PetanqueThrowPayload {
  venue: string
  kind: 'jack' | 'boule'
  mode: PetanqueMode
  thrower: string
  team: SportsTeam | null
  ball: number
  from: { x: number; z: number }
  landing: { x: number; z: number }
  airMs: number
  frames: PetanqueFrame[]
  carreau: boolean
  serverNow: number
}

export interface PetanqueClosedPayload {
  venue: string
  score: Record<SportsTeam, number> | null
  reason: 'finished' | 'forfeit'
}

export interface PetanqueClientRules {
  bouleRadiusM: number
  jackRadiusM: number
  circleReachM: number
  maxAimDeg: number
  pointApexM: number
  shootApexM: number
  riseMs: number
}

export const PETANQUE_SPORT = 'petanque'
const HAND_HEIGHT_M = 0.9

function positive(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`petanque rules: invalid ${what}`)
  return value
}

export function parsePetanqueClientRules(raw: unknown): PetanqueClientRules {
  const r = (raw ?? {}) as { boule?: { radiusM?: unknown }; jack?: { radiusM?: unknown }; throw?: Record<string, unknown>; powerMeter?: { riseMs?: unknown } }
  return {
    bouleRadiusM: positive(r.boule?.radiusM, 'boule.radiusM'),
    jackRadiusM: positive(r.jack?.radiusM, 'jack.radiusM'),
    circleReachM: positive(r.throw?.circleReachM, 'throw.circleReachM'),
    maxAimDeg: positive(r.throw?.maxAimDeg, 'throw.maxAimDeg'),
    pointApexM: positive(r.throw?.pointApexM, 'throw.pointApexM'),
    shootApexM: positive(r.throw?.shootApexM, 'throw.shootApexM'),
    riseMs: positive(r.powerMeter?.riseMs, 'powerMeter.riseMs'),
  }
}

export function meterPower(heldMs: number, riseMs: number): number {
  const phase = (Math.max(0, heldMs) % (2 * riseMs)) / riseMs
  return phase <= 1 ? phase : 2 - phase
}

export function throwYaw(dirX: number, dirZ: number, axisZ: 1 | -1, maxAimDeg: number): number {
  const max = (maxAimDeg * Math.PI) / 180
  return Math.max(-max, Math.min(max, Math.atan2(dirX, dirZ * axisZ)))
}

export function inCircle(x: number, z: number, circle: { x: number; z: number }, reachM: number): boolean {
  return Math.hypot(x - circle.x, z - circle.z) <= reachM
}

export function flightPoint(shot: Pick<PetanqueThrowPayload, 'from' | 'landing' | 'airMs'>, apexM: number, tMs: number, groundY: number): { x: number; y: number; z: number } {
  const u = Math.max(0, Math.min(1, tMs / shot.airMs))
  const start = HAND_HEIGHT_M
  const arc = 4 * apexM * u * (1 - u)
  return {
    x: shot.from.x + (shot.landing.x - shot.from.x) * u,
    y: groundY + start * (1 - u) + arc,
    z: shot.from.z + (shot.landing.z - shot.from.z) * u,
  }
}

export function rollPositions(frames: readonly PetanqueFrame[], tMs: number): Map<number, [number, number]> {
  const at = new Map<number, [number, number]>()
  let prevTime = 0
  for (const [time, ...balls] of frames) {
    if (time > tMs) {
      const u = time === prevTime ? 1 : (tMs - prevTime) / (time - prevTime)
      for (const [id, x, z] of balls) {
        const from = at.get(id)
        if (from) at.set(id, [from[0] + (x - from[0]) * u, from[1] + (z - from[1]) * u])
      }
      break
    }
    for (const [id, x, z] of balls) at.set(id, [x, z])
    prevTime = time
  }
  return at
}

export function rollDurationMs(frames: readonly PetanqueFrame[]): number {
  return frames.length === 0 ? 0 : frames[frames.length - 1]![0]
}

export function teamLeft(state: PetanqueStatePayload, team: SportsTeam): number {
  return state.players.filter((p) => p.team === team && !p.out).reduce((sum, p) => sum + p.left, 0)
}
