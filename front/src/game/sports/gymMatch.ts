import type { GymFreeBall, GymSport, GymStatePayload, GymTeam } from '../../types/gameRealtime'

const GRAVITY = 9.81

export function teamJerseyUrl(team: GymTeam): string {
  return `/assets/wear/top/team_jersey_${team}/model.glb`
}

export interface GymMeter {
  chargeMs: number
  overFrom: number
}

export interface GymHudRules {
  sport: GymSport
  ballRadius: number
  meter: GymMeter | null
  shotJumpMs: number | null
  lob: { holdMs: number; chargeMs: number } | null
  defendCooldownMs: number
  standingCooldownMs: number | null
  downMs: number | null
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
      meter: { chargeMs: positive(r.shotChargeMs, 'football.shotChargeMs'), overFrom: positive(block(r, 'overcharge', sport).from, 'football.overcharge.from') },
      shotJumpMs: null,
      lob: { holdMs: positive(block(r, 'lob', sport).holdMs, 'football.lob.holdMs'), chargeMs: positive(block(r, 'lob', sport).chargeMs, 'football.lob.chargeMs') },
      defendCooldownMs: positive(block(r, 'tackle', sport).cooldownMs, 'football.tackle.cooldownMs'),
      standingCooldownMs: positive(block(r, 'standingTackle', sport).cooldownMs, 'football.standingTackle.cooldownMs'),
      downMs: positive(block(r, 'tackle', sport).groundMs, 'football.tackle.groundMs'),
    }
  }
  const shove = block(r, 'shove', sport)
  return {
    sport,
    ballRadius,
    meter: null,
    shotJumpMs: positive(block(r, 'shotMeter', sport).riseMs, 'basketball.shotMeter.riseMs'),
    lob: null,
    defendCooldownMs: positive(shove.cooldownMs, 'basketball.shove.cooldownMs'),
    standingCooldownMs: null,
    downMs: positive(shove.downMs, 'basketball.shove.downMs'),
  }
}

export function clockText(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function meterFill(meter: GymMeter, heldMs: number): number {
  return Math.min(1, Math.max(0, heldMs) / meter.chargeMs)
}

export const SHOT_JUMP_M = 0.9
export const DUNK_LEAP = { apexMs: 350, heightM: 1.5 } as const

export function leapLaunch(apexMs: number, heightM: number): { velocity: number; gravity: number } {
  const apexS = apexMs / 1000
  const gravity = (2 * heightM) / (apexS * apexS)
  return { velocity: gravity * apexS, gravity }
}

export function lobFill(lob: { holdMs: number; chargeMs: number } | null, heldMs: number): number | null {
  if (!lob || heldMs < lob.holdMs) return null
  return Math.min(1, (heldMs - lob.holdMs) / lob.chargeMs)
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

export interface GymScreen {
  x: number
  y: number
  z: number
  width: number
  height: number
  facing: [number, number]
}

export interface HoopSpot {
  x: number
  y: number
  z: number
}

interface CourtBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface GymCourtView {
  floorY: number
  court: CourtBounds
  playArea: CourtBounds
  baskets: Record<GymTeam, HoopSpot> | null
  sideBaskets: HoopSpot[]
  scoreboard: GymScreen | null
}

const COURT_URLS: Record<string, string> = {
  gym: '/assets/sports/gym/court.json',
  gym_football: '/assets/sports/gym/court.json',
  gym_basketball: '/assets/sports/gym/court.json',
  athletics: '/assets/sports/athletics/pitch.json',
  athletics_football: '/assets/sports/athletics/pitch.json',
}

export const COURT_FILES: readonly string[] = [...new Set(Object.values(COURT_URLS))]

export const FREE_PLAY_COACHES: Readonly<Record<string, readonly GymSport[]>> = {
  gym_coach: ['football', 'basketball'],
  athletics_coach: ['football'],
}

export function courtUrlOf(courtOrVenue: string): string {
  const url = COURT_URLS[courtOrVenue]
  if (!url) throw new Error(`no court file for ${courtOrVenue}`)
  return url
}

function finite(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`sports/gym/court.json: invalid ${what}`)
  return raw
}

function parseBaskets(raw: unknown): GymCourtView['baskets'] {
  if (raw === undefined) return null
  const baskets = (raw ?? {}) as Record<string, Raw | undefined>
  const spot = (team: GymTeam) => ({ x: finite(baskets[team]?.x, `baskets.${team}.x`), y: finite(baskets[team]?.y, `baskets.${team}.y`), z: finite(baskets[team]?.z, `baskets.${team}.z`) })
  return { red: spot('red'), blue: spot('blue') }
}

function parseBounds(raw: unknown, what = 'court'): CourtBounds {
  const b = (raw ?? {}) as Raw
  const bounds = { minX: finite(b.minX, `${what}.minX`), maxX: finite(b.maxX, `${what}.maxX`), minZ: finite(b.minZ, `${what}.minZ`), maxZ: finite(b.maxZ, `${what}.maxZ`) }
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) throw new Error(`sports/gym/court.json: ${what} must have a size`)
  return bounds
}

export function insideArea(area: CourtBounds, x: number, z: number): boolean {
  return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ
}

export function clampToArea(area: CourtBounds, x: number, z: number): { x: number; z: number } {
  return { x: Math.min(area.maxX, Math.max(area.minX, x)), z: Math.min(area.maxZ, Math.max(area.minZ, z)) }
}

export const DRIBBLE_MOVE_M = 1.4
export const DRIBBLE_MOVE_COOLDOWN_MS = 1500

export function dribbleMove(frameYaw: number, aside: -1 | 0 | 1, back: boolean): { x: number; z: number } {
  const retreat = back || aside === 0 ? 1 : 0
  const x = Math.cos(frameYaw) * aside + Math.sin(frameYaw) * retreat
  const z = -Math.sin(frameYaw) * aside + Math.cos(frameYaw) * retreat
  const length = Math.hypot(x, z)
  return { x: x / length, z: z / length }
}

export const JOCKEY_SPEED_FACTOR = 0.55

function parseSideBaskets(raw: unknown): HoopSpot[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error('sports/gym/court.json: sideBaskets must be a list')
  return raw.map((hoop: Raw, i) => ({ x: finite(hoop?.x, `sideBaskets[${i}].x`), y: finite(hoop?.y, `sideBaskets[${i}].y`), z: finite(hoop?.z, `sideBaskets[${i}].z`) }))
}

export function courtHoops(court: GymCourtView): HoopSpot[] {
  return [...(court.baskets ? [court.baskets.red, court.baskets.blue] : []), ...court.sideBaskets]
}

export function hoopAhead(hoops: readonly HoopSpot[], me: { x: number; z: number }, yaw: number): HoopSpot | null {
  const fx = -Math.sin(yaw)
  const fz = -Math.cos(yaw)
  let best: { hoop: HoopSpot; score: number } | null = null
  for (const hoop of hoops) {
    const d = Math.hypot(hoop.x - me.x, hoop.z - me.z)
    const ahead = d < 1e-6 ? 1 : ((hoop.x - me.x) * fx + (hoop.z - me.z) * fz) / d
    const score = d * (2 - ahead)
    if (!best || score < best.score) best = { hoop, score }
  }
  return best?.hoop ?? null
}

function parseScreen(raw: unknown): GymScreen | null {
  if (raw === undefined) return null
  const s = (raw ?? {}) as Raw
  const facing = Array.isArray(s.facing) ? s.facing : []
  return {
    x: finite(s.x, 'scoreboard.x'),
    y: finite(s.y, 'scoreboard.y'),
    z: finite(s.z, 'scoreboard.z'),
    width: finite(s.width, 'scoreboard.width'),
    height: finite(s.height, 'scoreboard.height'),
    facing: [finite(facing[0], 'scoreboard.facing[0]'), finite(facing[1], 'scoreboard.facing[1]')],
  }
}

export function parseGymCourtView(raw: unknown): GymCourtView {
  const r = (raw ?? {}) as Raw
  return { floorY: finite(r.floorY, 'floorY'), court: parseBounds(r.court), baskets: parseBaskets(r.baskets), sideBaskets: parseSideBaskets(r.sideBaskets), scoreboard: parseScreen(r.scoreboard), playArea: parseBounds(r.playArea, 'playArea') }
}

export function scoreboardLines(state: { score: Record<GymTeam, number>; clock: string; half: number; halves: number } | null): [string, string] {
  if (!state) return ['COVE GYM', '']
  const half = state.halves > 1 ? ` · ${state.half}/${state.halves}` : ''
  return [`${state.score.red} : ${state.score.blue}`, `${state.clock}${half}`]
}

const DRIBBLE_PERIOD_S = 0.5
const TOE_AHEAD_M = 0.15

export interface Spot {
  x: number
  y: number
  z: number
}

export function dribbleHeight(handY: number, floorY: number, radius: number, seconds: number): number {
  const low = floorY + radius
  return low + Math.max(0, handY - low) * Math.abs(Math.cos((Math.PI * seconds) / DRIBBLE_PERIOD_S))
}

export function dribbleBeat(seconds: number): number {
  return Math.floor(seconds / DRIBBLE_PERIOD_S + 0.5)
}

export function carriedSpot(sport: GymSport, anchor: Spot, yaw: number, floorY: number, radius: number, seconds: number): Spot {
  if (sport === 'football') return { x: anchor.x + Math.sin(yaw) * TOE_AHEAD_M, y: floorY + radius, z: anchor.z + Math.cos(yaw) * TOE_AHEAD_M }
  return { x: anchor.x, y: dribbleHeight(anchor.y, floorY, radius, seconds), z: anchor.z }
}

export function nearestFreeBall(balls: readonly GymFreeBall[], me: string, x: number, z: number, reach: number): GymFreeBall | null {
  const mine = balls.find((b) => b.owner === me)
  if (mine) return mine
  let best: { ball: GymFreeBall; d: number } | null = null
  for (const ball of balls) {
    if (ball.owner !== null) continue
    const d = Math.hypot(ball.ball[0] - x, ball.ball[2] - z)
    if (d <= reach && (!best || d < best.d)) best = { ball, d }
  }
  return best?.ball ?? null
}
