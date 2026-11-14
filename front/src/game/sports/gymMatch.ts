import type { GymSport, GymStatePayload, GymTeam } from '../../types/gameRealtime'

const GRAVITY = 9.81

export type GymMeter = { kind: 'charge'; chargeMs: number } | { kind: 'bounce'; riseMs: number; windowNear: number; windowFar: number; farDistanceM: number }

export interface GymHudRules {
  sport: GymSport
  ballRadius: number
  meter: GymMeter
  defendCooldownMs: number
}

type Raw = Record<string, unknown>

function positive(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) throw new Error(`${what}: expected a positive number, got ${JSON.stringify(raw)}`)
  return raw
}

function block(raw: Raw, key: string, sport: string): Raw {
  const value = raw[key]
  if (typeof value !== 'object' || value === null) throw new Error(`${sport}.json: missing ${key}`)
  return value as Raw
}

export function parseGymHudRules(sport: GymSport, raw: unknown): GymHudRules {
  const r = (raw ?? {}) as Raw
  const ballRadius = positive(block(r, 'ball', sport).radiusM, `${sport}.ball.radiusM`)
  if (sport === 'football') {
    return {
      sport,
      ballRadius,
      meter: { kind: 'charge', chargeMs: positive(r.shotChargeMs, 'football.shotChargeMs') },
      defendCooldownMs: positive(block(r, 'tackle', sport).cooldownMs, 'football.tackle.cooldownMs'),
    }
  }
  const m = block(r, 'shotMeter', sport)
  return {
    sport,
    ballRadius,
    meter: {
      kind: 'bounce',
      riseMs: positive(m.riseMs, 'basketball.shotMeter.riseMs'),
      windowNear: positive(m.windowNear, 'basketball.shotMeter.windowNear'),
      windowFar: positive(m.windowFar, 'basketball.shotMeter.windowFar'),
      farDistanceM: positive(m.farDistanceM, 'basketball.shotMeter.farDistanceM'),
    },
    defendCooldownMs: positive(block(r, 'steal', sport).cooldownMs, 'basketball.steal.cooldownMs'),
  }
}

export function clockText(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function meterFill(meter: GymMeter, heldMs: number): number {
  const held = Math.max(0, heldMs)
  if (meter.kind === 'charge') return Math.min(1, held / meter.chargeMs)
  const phase = held / meter.riseMs
  return phase <= 1 ? phase : Math.max(0, 2 - phase)
}

export function goodWindowStart(meter: GymMeter, distanceM: number): number | null {
  if (meter.kind === 'charge') return null
  const t = Math.min(1, Math.max(0, distanceM / meter.farDistanceM))
  return 1 - (meter.windowNear + (meter.windowFar - meter.windowNear) * t)
}

export function predictBall(ball: GymStatePayload['ball'], ageS: number, floorY: number, radius: number, held: boolean): [number, number, number] {
  const [x, y, z, vx, vy, vz] = ball
  const t = Math.max(0, ageS)
  const rest = floorY + radius
  const resting = !held && vy === 0 && y <= rest + 1e-3
  const fall = held || resting ? 0 : 0.5 * GRAVITY * t * t
  return [x + vx * t, Math.max(rest, y + vy * t - fall), z + vz * t]
}

export function myTeam(state: GymStatePayload | null, sessionId: string | null): GymTeam | null {
  if (!state || !sessionId) return null
  return state.players.find((p) => p.sessionId === sessionId)?.team ?? null
}

export interface GymCourtView {
  floorY: number
  baskets: Record<GymTeam, { x: number; z: number }>
}

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`sports/gym/court.json: invalid ${what}`)
  return raw
}

export function parseGymCourtView(raw: unknown): GymCourtView {
  const r = (raw ?? {}) as Raw
  const baskets = (r.baskets ?? {}) as Record<string, Raw | undefined>
  const spot = (team: GymTeam) => ({ x: finite(baskets[team]?.x, `baskets.${team}.x`), z: finite(baskets[team]?.z, `baskets.${team}.z`) })
  return { floorY: finite(r.floorY, 'floorY'), baskets: { red: spot('red'), blue: spot('blue') } }
}
