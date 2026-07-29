export type CoveRushMode = 'solo' | 'duel'
export type CoveRushPhase = 'countdown' | 'running'
export type CoveRushQueueStatus = 'queued' | 'idle' | 'matched'
export type CoveRushResultKind =
  | 'completed'
  | 'win'
  | 'loss'
  | 'forfeit'
  | 'cancelled'
  | 'timeout'
export type CoveRushParticleLevel = 'off' | 'low' | 'high'

export interface CoveRushWorldPoint {
  x: number
  y: number
  z: number
}

export interface CoveRushHub extends CoveRushWorldPoint {
  radius: number
}

export interface CoveRushCheckpoint extends CoveRushWorldPoint {
  index: number
  radius: number
}

export interface CoveRushConfig {
  mode: 'orb_rush'
  hub: CoveRushHub
  route: CoveRushCheckpoint[]
  checkpointCount: number
  countdownMs: number
  timeoutMs: number
}

export interface CoveRushOpponent {
  sessionId: string
  id: string
  pseudo: string
  checkpointIndex: number
}

export interface CoveRushRunState {
  activityId: string
  mode: CoveRushMode
  phase: CoveRushPhase
  serverNow: number
  startsAt: number
  endsAt: number
  checkpointIndex: number
  checkpointCount: number
  target: CoveRushCheckpoint | null
  opponent: CoveRushOpponent | null
  bestMs: number | null
}

export interface CoveRushQueueState {
  status: CoveRushQueueStatus
  serverNow: number
  queuedAt: number | null
  activityId: string | null
  opponent: CoveRushOpponent | null
  startsAt: number | null
}

export interface CoveRushFinishedState {
  activityId: string
  mode: CoveRushMode
  result: CoveRushResultKind
  serverNow: number
  winnerSessionId: string | null
  durationMs: number | null
  checkpointIndex: number
  checkpointCount: number
  bestMs: number | null
  isNewBest: boolean
  opponent: CoveRushOpponent | null
}

export interface CoveRushErrorState {
  code: string
  message: string
}

const FALLBACK_ROUTE_COORDINATES = [
  { x: -85, z: 20.5 },
  { x: -80.5, z: 22.5 },
  { x: -80.5, z: 28.5 },
  { x: -85, z: 33.5 },
  { x: -92, z: 32.5 },
  { x: -96, z: 27 },
  { x: -95, z: 19 },
  { x: -88, z: 17 },
] as const

export const FALLBACK_COVE_RUSH_CONFIG: CoveRushConfig = {
  mode: 'orb_rush',
  hub: {
    x: -85.5,
    y: 0.05,
    z: 26.5,
    radius: 7,
  },
  route: FALLBACK_ROUTE_COORDINATES.map((point, index) => ({
    index,
    x: point.x,
    y: 0.08,
    z: point.z,
    radius: 1.8,
  })),
  checkpointCount: FALLBACK_ROUTE_COORDINATES.length,
  countdownMs: 3_000,
  timeoutMs: 120_000,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < minimum || value > maximum) return null
  return value
}

function finiteInteger(value: unknown, minimum: number, maximum: number): number | null {
  const number = finiteNumber(value, minimum, maximum)
  return number !== null && Number.isInteger(number) ? number : null
}

function nonEmptyString(value: unknown, maximumLength = 160): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (normalized.length === 0 || normalized.length > maximumLength) return null
  return normalized
}

function nullableTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return finiteInteger(value, 0, Number.MAX_SAFE_INTEGER)
}

function nullableDuration(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return finiteInteger(value, 0, 86_400_000)
}

function parseWorldPoint(
  value: unknown,
  fallbackY: number,
): CoveRushWorldPoint | null {
  if (!isRecord(value)) return null
  const x = finiteNumber(value.x, -10_000, 10_000)
  const y =
    value.y === undefined ? fallbackY : finiteNumber(value.y, -1_000, 1_000)
  const z = finiteNumber(value.z, -10_000, 10_000)
  if (x === null || y === null || z === null) return null
  return { x, y, z }
}

function parseCheckpoint(
  value: unknown,
  fallbackIndex?: number,
): CoveRushCheckpoint | null {
  if (!isRecord(value)) return null
  const point = parseWorldPoint(value, 0.08)
  const index =
    value.index === undefined && fallbackIndex !== undefined
      ? fallbackIndex
      : finiteInteger(value.index, 0, 63)
  const radius = finiteNumber(value.radius, 0.25, 12)
  if (!point || index === null || radius === null) return null
  return { ...point, index, radius }
}

function parseOpponent(
  value: unknown,
  checkpointCount: number,
): CoveRushOpponent | null {
  if (!isRecord(value)) return null
  const sessionId = nonEmptyString(value.sessionId)
  const id = nonEmptyString(value.id)
  const pseudo = nonEmptyString(value.pseudo, 80)
  const checkpointIndex = finiteInteger(
    value.checkpointIndex,
    0,
    checkpointCount,
  )
  if (
    sessionId === null ||
    id === null ||
    pseudo === null ||
    checkpointIndex === null
  ) {
    return null
  }
  return { sessionId, id, pseudo, checkpointIndex }
}

function configCandidate(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  if (isRecord(raw.activityConfig)) return raw.activityConfig
  if (isRecord(raw.coveRush)) return raw.coveRush
  if (isRecord(raw.activities)) {
    if (isRecord(raw.activities.coveRush)) return raw.activities.coveRush
    if (isRecord(raw.activities.orbRush)) return raw.activities.orbRush
  }
  if (isRecord(raw.lobbyActivities)) {
    if (isRecord(raw.lobbyActivities.coveRush)) {
      return raw.lobbyActivities.coveRush
    }
    if (isRecord(raw.lobbyActivities.orbRush)) {
      return raw.lobbyActivities.orbRush
    }
  }
  return raw
}

export function parseCoveRushConfig(raw: unknown): CoveRushConfig | null {
  const candidate = configCandidate(raw)
  if (!isRecord(candidate)) return null
  if (
    candidate.mode !== undefined &&
    candidate.mode !== 'orb_rush' &&
    candidate.mode !== 'cove_rush'
  ) {
    return null
  }

  if (!isRecord(candidate.hub)) return null
  const hubPoint = parseWorldPoint(candidate.hub, 0.05)
  const hubRadius = finiteNumber(candidate.hub.radius, 1, 30)
  if (!hubPoint || hubRadius === null || !Array.isArray(candidate.route)) {
    return null
  }
  if (candidate.route.length < 2 || candidate.route.length > 32) return null

  const route: CoveRushCheckpoint[] = []
  const seenIndices = new Set<number>()
  for (let arrayIndex = 0; arrayIndex < candidate.route.length; arrayIndex += 1) {
    const checkpoint = parseCheckpoint(candidate.route[arrayIndex], arrayIndex)
    if (!checkpoint || seenIndices.has(checkpoint.index)) return null
    seenIndices.add(checkpoint.index)
    route.push(checkpoint)
  }
  route.sort((left, right) => left.index - right.index)
  if (route.some((checkpoint, index) => checkpoint.index !== index)) return null

  const checkpointCount =
    candidate.checkpointCount === undefined
      ? route.length
      : finiteInteger(candidate.checkpointCount, 2, 32)
  const countdownMs = finiteInteger(candidate.countdownMs, 500, 15_000)
  const timeoutMs = finiteInteger(candidate.timeoutMs, 5_000, 600_000)
  if (
    checkpointCount === null ||
    checkpointCount !== route.length ||
    countdownMs === null ||
    timeoutMs === null
  ) {
    return null
  }

  return {
    mode: 'orb_rush',
    hub: { ...hubPoint, radius: hubRadius },
    route,
    checkpointCount,
    countdownMs,
    timeoutMs,
  }
}

export function parseCoveRushRunState(raw: unknown): CoveRushRunState | null {
  if (!isRecord(raw)) return null
  const activityId = nonEmptyString(raw.activityId)
  const mode = raw.mode === 'solo' || raw.mode === 'duel' ? raw.mode : null
  const phase =
    raw.phase === 'countdown' || raw.phase === 'running' ? raw.phase : null
  const serverNow = finiteInteger(raw.serverNow, 0, Number.MAX_SAFE_INTEGER)
  const startsAt = finiteInteger(raw.startsAt, 0, Number.MAX_SAFE_INTEGER)
  const endsAt = finiteInteger(raw.endsAt, 0, Number.MAX_SAFE_INTEGER)
  const checkpointCount = finiteInteger(raw.checkpointCount, 1, 64)
  if (
    activityId === null ||
    mode === null ||
    phase === null ||
    serverNow === null ||
    startsAt === null ||
    endsAt === null ||
    startsAt > endsAt ||
    checkpointCount === null
  ) {
    return null
  }

  const checkpointIndex = finiteInteger(
    raw.checkpointIndex,
    0,
    checkpointCount,
  )
  if (checkpointIndex === null) return null
  const target =
    raw.target === null ? null : parseCheckpoint(raw.target, checkpointIndex)
  if (raw.target !== null && target === null) return null
  if (target !== null && target.index !== checkpointIndex) return null
  const opponent =
    raw.opponent === null || raw.opponent === undefined
      ? null
      : parseOpponent(raw.opponent, checkpointCount)
  if (raw.opponent !== null && raw.opponent !== undefined && opponent === null) {
    return null
  }
  const bestMs = nullableDuration(raw.bestMs)
  if (raw.bestMs !== null && raw.bestMs !== undefined && bestMs === null) {
    return null
  }

  return {
    activityId,
    mode,
    phase,
    serverNow,
    startsAt,
    endsAt,
    checkpointIndex,
    checkpointCount,
    target,
    opponent,
    bestMs,
  }
}

export function parseCoveRushQueueState(
  raw: unknown,
): CoveRushQueueState | null {
  if (!isRecord(raw)) return null
  const status =
    raw.status === 'queued' || raw.status === 'idle' || raw.status === 'matched'
      ? raw.status
      : null
  const serverNow = finiteInteger(raw.serverNow, 0, Number.MAX_SAFE_INTEGER)
  if (status === null || serverNow === null) return null

  const queuedAt = nullableTimestamp(raw.queuedAt)
  const activityId =
    raw.activityId === null || raw.activityId === undefined
      ? null
      : nonEmptyString(raw.activityId)
  const startsAt = nullableTimestamp(raw.startsAt)
  if (
    (raw.queuedAt !== null && raw.queuedAt !== undefined && queuedAt === null) ||
    (raw.activityId !== null &&
      raw.activityId !== undefined &&
      activityId === null) ||
    (raw.startsAt !== null && raw.startsAt !== undefined && startsAt === null)
  ) {
    return null
  }
  const opponent =
    raw.opponent === null || raw.opponent === undefined
      ? null
      : parseOpponent(raw.opponent, 64)
  if (raw.opponent !== null && raw.opponent !== undefined && opponent === null) {
    return null
  }

  return {
    status,
    serverNow,
    queuedAt,
    activityId,
    opponent,
    startsAt,
  }
}

export function parseCoveRushFinishedState(
  raw: unknown,
): CoveRushFinishedState | null {
  if (!isRecord(raw)) return null
  const activityId = nonEmptyString(raw.activityId)
  const mode = raw.mode === 'solo' || raw.mode === 'duel' ? raw.mode : null
  const resultKinds: readonly CoveRushResultKind[] = [
    'completed',
    'win',
    'loss',
    'forfeit',
    'cancelled',
    'timeout',
  ]
  const result =
    typeof raw.result === 'string' &&
    resultKinds.includes(raw.result as CoveRushResultKind)
      ? (raw.result as CoveRushResultKind)
      : null
  const serverNow = finiteInteger(raw.serverNow, 0, Number.MAX_SAFE_INTEGER)
  const checkpointCount = finiteInteger(raw.checkpointCount, 1, 64)
  if (
    activityId === null ||
    mode === null ||
    result === null ||
    serverNow === null ||
    checkpointCount === null
  ) {
    return null
  }
  const checkpointIndex = finiteInteger(
    raw.checkpointIndex,
    0,
    checkpointCount,
  )
  const winnerSessionId =
    raw.winnerSessionId === null || raw.winnerSessionId === undefined
      ? null
      : nonEmptyString(raw.winnerSessionId)
  const durationMs = nullableDuration(raw.durationMs)
  const bestMs = nullableDuration(raw.bestMs)
  if (
    checkpointIndex === null ||
    (raw.winnerSessionId !== null &&
      raw.winnerSessionId !== undefined &&
      winnerSessionId === null) ||
    (raw.durationMs !== null &&
      raw.durationMs !== undefined &&
      durationMs === null) ||
    (raw.bestMs !== null && raw.bestMs !== undefined && bestMs === null) ||
    typeof raw.isNewBest !== 'boolean'
  ) {
    return null
  }
  const opponent =
    raw.opponent === null || raw.opponent === undefined
      ? null
      : parseOpponent(raw.opponent, checkpointCount)
  if (raw.opponent !== null && raw.opponent !== undefined && opponent === null) {
    return null
  }

  return {
    activityId,
    mode,
    result,
    serverNow,
    winnerSessionId,
    durationMs,
    checkpointIndex,
    checkpointCount,
    bestMs,
    isNewBest: raw.isNewBest,
    opponent,
  }
}

export function parseCoveRushError(raw: unknown): CoveRushErrorState | null {
  if (!isRecord(raw)) return null
  const code = nonEmptyString(raw.code, 80)
  const message = nonEmptyString(raw.message, 300)
  if (code === null || message === null) return null
  return { code, message }
}
