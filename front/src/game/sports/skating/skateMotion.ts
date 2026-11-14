export interface SkateTuning {
  pushGain: number
  goodPushGain: number
  earlyPushGain: number
  rhythmMs: number
  toleranceMs: number
  friction: number
  brake: number
  maxSpeed: number
  turnStill: number
  turnAtMax: number
}

export interface RinkBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface SkatingSpec {
  tuning: SkateTuning
  rink: RinkBounds
  crashSpeed: number
  fallMs: number
}

export type PushKind = 'good' | 'normal' | 'early'

export interface Skater {
  speed: number
  heading: number
  lastPushAt: number | null
  fallenUntil: number
}

export const SKATING_RULES_URL = '/assets/sports/rules/skating.json'
export const ICE_SKATES_CODE = 'gear_ice_skates'
const BLOCKED_SHARE = 0.5
const KMH_PER_MS = 3.6

type Json = Record<string, unknown>

function num(raw: Json, key: string, what: string): number {
  const value = raw[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`skating.json: invalid ${what}.${key}`)
  return value
}

function block(raw: unknown, what: string): Json {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`skating.json: missing ${what}`)
  return raw as Json
}

export function parseSkatingSpec(raw: unknown): SkatingSpec {
  const root = block(raw, 'rules')
  const skate = block(root.skate, 'skate')
  const turn = block(skate.turnRate, 'skate.turnRate')
  const bounds = block(block(root.rink, 'rink').bounds, 'rink.bounds')
  const crash = block(root.crash, 'crash')
  return {
    tuning: {
      pushGain: num(skate, 'pushGain', 'skate'),
      goodPushGain: num(skate, 'goodPushGain', 'skate'),
      earlyPushGain: num(skate, 'earlyPushGain', 'skate'),
      rhythmMs: num(skate, 'rhythmMs', 'skate'),
      toleranceMs: num(skate, 'toleranceMs', 'skate'),
      friction: num(skate, 'friction', 'skate'),
      brake: num(skate, 'brake', 'skate'),
      maxSpeed: num(skate, 'maxSpeed', 'skate'),
      turnStill: num(turn, 'still', 'skate.turnRate'),
      turnAtMax: num(turn, 'atMaxSpeed', 'skate.turnRate'),
    },
    rink: {
      minX: num(bounds, 'minX', 'rink.bounds'),
      maxX: num(bounds, 'maxX', 'rink.bounds'),
      minZ: num(bounds, 'minZ', 'rink.bounds'),
      maxZ: num(bounds, 'maxZ', 'rink.bounds'),
    },
    crashSpeed: num(crash, 'speedThreshold', 'crash'),
    fallMs: num(crash, 'fallMs', 'crash'),
  }
}

export function onIce(rink: RinkBounds, x: number, z: number): boolean {
  return x >= rink.minX && x <= rink.maxX && z >= rink.minZ && z <= rink.maxZ
}

export function newSkater(heading: number): Skater {
  return { speed: 0, heading, lastPushAt: null, fallenUntil: 0 }
}

export function pushKind(t: SkateTuning, sinceLastPushMs: number | null): PushKind {
  if (sinceLastPushMs === null || sinceLastPushMs > t.rhythmMs + t.toleranceMs) return 'normal'
  if (sinceLastPushMs < t.rhythmMs - t.toleranceMs) return 'early'
  return 'good'
}

const GAIN: Record<PushKind, keyof SkateTuning> = { good: 'goodPushGain', normal: 'pushGain', early: 'earlyPushGain' }

export function push(t: SkateTuning, s: Skater, now: number): PushKind {
  const kind = pushKind(t, s.lastPushAt === null ? null : now - s.lastPushAt)
  s.speed = Math.min(t.maxSpeed, s.speed + t[GAIN[kind]])
  s.lastPushAt = now
  return kind
}

export function glide(t: SkateTuning, s: Skater, dt: number, braking: boolean): void {
  s.speed = Math.max(0, s.speed - (braking ? t.brake : t.friction) * dt)
}

export function turnRate(t: SkateTuning, speed: number): number {
  const share = Math.min(1, speed / t.maxSpeed)
  return t.turnStill + (t.turnAtMax - t.turnStill) * share
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function steer(t: SkateTuning, s: Skater, yaw: number, dt: number): void {
  const gap = wrap(yaw - s.heading)
  const max = turnRate(t, s.speed) * dt
  s.heading = wrap(s.heading + Math.max(-max, Math.min(max, gap)))
}

export function skateStep(t: SkateTuning, s: Skater, yaw: number, braking: boolean, dt: number, now: number): { dx: number; dz: number } {
  if (now < s.fallenUntil) {
    s.speed = 0
    return { dx: 0, dz: 0 }
  }
  steer(t, s, yaw, dt)
  const before = s.speed
  glide(t, s, dt, braking)
  const distance = ((before + s.speed) / 2) * dt
  return { dx: -Math.sin(s.heading) * distance, dz: -Math.cos(s.heading) * distance }
}

export function hitBoards(spec: SkatingSpec, s: Skater, wanted: number, moved: number, now: number): boolean {
  if (wanted <= 0 || moved >= wanted * BLOCKED_SHARE) return false
  const fell = s.speed >= spec.crashSpeed
  s.speed = 0
  if (fell) s.fallenUntil = now + spec.fallMs
  return fell
}

export function fall(s: Skater, until: number): void {
  s.speed = 0
  s.fallenUntil = until
}

export function rhythmCue(t: SkateTuning, s: Skater, now: number): number {
  if (s.lastPushAt === null) return 0
  return Math.min(1, (now - s.lastPushAt) / (t.rhythmMs + t.toleranceMs))
}

export function rhythmWindow(t: SkateTuning): { from: number; to: number } {
  const span = t.rhythmMs + t.toleranceMs
  return { from: (t.rhythmMs - t.toleranceMs) / span, to: 1 }
}

export function speedKmh(s: Skater): number {
  return Math.round(s.speed * KMH_PER_MS)
}

export function raceClock(ms: number): string {
  const clamped = Math.max(0, ms)
  const minutes = Math.floor(clamped / 60_000)
  const seconds = Math.floor((clamped % 60_000) / 1000)
  const tenths = Math.floor((clamped % 1000) / 100)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`
}
