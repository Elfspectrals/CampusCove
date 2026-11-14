import type { Bounds } from '../types.ts'

export type Foot = 'left' | 'right'
export type RunnerState = 'set' | 'running' | 'finished' | 'dnf'
export type DnfReason = 'false_start' | 'missed_gate' | 'left' | 'knocked_out' | 'time'

export interface TrackSpec {
  centre: [number, number]
  straightM: number
  kerbRadiusM: number
  laneWidthM: number
  lanes: number
  measureOffsetM: number
  chuteM: number
  gateSpacingM: number
  gateMarginM: number
}

export interface StrideSpec {
  goodStepMs: number
  toleranceMs: number
  topSpeedMps: number
}

export interface RunningRules {
  track: TrackSpec
  playArea: Bounds
  distancesM: number[]
  maxPlayers: number
  setAfterMs: number
  startBeepDelayRangeMs: [number, number]
  maxRaceMs: Record<string, number>
  stride: Record<string, StrideSpec>
  accelMps2: number
  decelMps2: number
  firstStepQuality: number
  tooFastQuality: number
  outOfStepQuality: number
  stallSteps: number
  minStepGapMs: number
  coach: { x: number, z: number }
}

export interface Gate {
  x: number
  z: number
  tx: number
  tz: number
  lap: number
}

export interface Course {
  distanceM: number
  gates: Gate[]
  starts: { x: number, z: number }[]
  startRy: number
  laps: number
}

export interface Runner {
  accountId: number
  sessionId: string
  lane: number
  x: number
  z: number
  ry: number
  speed: number
  quality: number
  lastFoot: Foot | null
  lastStepAt: number | null
  nextGate: number
  state: RunnerState
  timeMs: number | null
  dnf: DnfReason | null
}

export interface Race {
  course: Course
  stride: StrideSpec
  startedAt: number
  setAt: number
  beepAt: number
  endsAt: number
  simAt: number
  runners: Runner[]
}

const SIM_STEP_MS = 20

function positive(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`running rules: invalid ${what} ${JSON.stringify(value)}`)
  return value
}

function fraction(value: unknown, what: string): number {
  const n = positive(value, what)
  if (n > 1) throw new Error(`running rules: ${what} must be at most 1`)
  return n
}

function parseBounds(raw: unknown): Bounds {
  const b = raw as Bounds
  const ok = b && [b.minX, b.maxX, b.minZ, b.maxZ].every((v) => typeof v === 'number' && Number.isFinite(v)) && b.minX < b.maxX && b.minZ < b.maxZ
  if (!ok) throw new Error(`running rules: invalid playArea ${JSON.stringify(raw)}`)
  return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ }
}

function parseTrack(raw: unknown): TrackSpec {
  const t = (raw ?? {}) as Record<string, unknown>
  const centre = t.centre
  if (!Array.isArray(centre) || centre.length !== 2 || !centre.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`running rules: invalid track centre ${JSON.stringify(centre)}`)
  }
  const lanes = positive(t.lanes, 'track lanes')
  if (!Number.isInteger(lanes)) throw new Error('running rules: track lanes must be an integer')
  return {
    centre: [centre[0], centre[1]],
    straightM: positive(t.straightM, 'track straightM'),
    kerbRadiusM: positive(t.kerbRadiusM, 'track kerbRadiusM'),
    laneWidthM: positive(t.laneWidthM, 'track laneWidthM'),
    lanes,
    measureOffsetM: positive(t.measureOffsetM, 'track measureOffsetM'),
    chuteM: positive(t.chuteM, 'track chuteM'),
    gateSpacingM: positive(t.gateSpacingM, 'track gateSpacingM'),
    gateMarginM: positive(t.gateMarginM, 'track gateMarginM')
  }
}

export function parseRunningRules(raw: unknown): RunningRules {
  const r = (raw ?? {}) as Record<string, unknown>
  if (r.status !== 'ready') throw new Error('running rules: status is not ready')
  const distances = r.distancesM
  if (!Array.isArray(distances) || distances.length === 0) throw new Error('running rules: missing distancesM')
  const distancesM = distances.map((d) => positive(d, 'distance'))
  const strideRaw = (r.stride ?? {}) as Record<string, Record<string, unknown>>
  const limits = (r.maxRaceMs ?? {}) as Record<string, unknown>
  const stride: Record<string, StrideSpec> = {}
  const maxRaceMs: Record<string, number> = {}
  for (const d of distancesM) {
    const s = strideRaw[String(d)]
    stride[d] = { goodStepMs: positive(s?.goodStepMs, `stride ${d} goodStepMs`), toleranceMs: positive(s?.toleranceMs, `stride ${d} toleranceMs`), topSpeedMps: positive(s?.topSpeedMps, `stride ${d} topSpeedMps`) }
    maxRaceMs[d] = positive(limits[String(d)], `maxRaceMs ${d}`)
  }
  const beep = r.startBeepDelayRangeMs
  if (!Array.isArray(beep) || beep.length !== 2 || positive(beep[0], 'beep delay') > positive(beep[1], 'beep delay')) {
    throw new Error(`running rules: invalid startBeepDelayRangeMs ${JSON.stringify(beep)}`)
  }
  const setAfterMs = positive(r.setAfterMs, 'setAfterMs')
  if (setAfterMs >= beep[0]) throw new Error('running rules: setAfterMs must come before the earliest beep')
  const coach = (r.coach ?? {}) as { x?: unknown, z?: unknown }
  if (typeof coach.x !== 'number' || typeof coach.z !== 'number' || !Number.isFinite(coach.x) || !Number.isFinite(coach.z)) {
    throw new Error(`running rules: invalid coach ${JSON.stringify(r.coach)}`)
  }
  const maxPlayers = positive(r.maxPlayers, 'maxPlayers')
  const track = parseTrack(r.track)
  if (!Number.isInteger(maxPlayers) || maxPlayers > track.lanes) throw new Error('running rules: maxPlayers must be an integer within the lane count')
  return {
    track,
    playArea: parseBounds(r.playArea),
    distancesM,
    maxPlayers,
    setAfterMs,
    startBeepDelayRangeMs: [beep[0], beep[1]],
    maxRaceMs,
    stride,
    accelMps2: positive(r.accelMps2, 'accelMps2'),
    decelMps2: positive(r.decelMps2, 'decelMps2'),
    firstStepQuality: fraction(r.firstStepQuality, 'firstStepQuality'),
    tooFastQuality: fraction(r.tooFastQuality, 'tooFastQuality'),
    outOfStepQuality: fraction(r.outOfStepQuality, 'outOfStepQuality'),
    stallSteps: positive(r.stallSteps, 'stallSteps'),
    minStepGapMs: positive(r.minStepGapMs, 'minStepGapMs'),
    coach: { x: coach.x, z: coach.z }
  }
}

function measureRadius(track: TrackSpec): number {
  return track.kerbRadiusM + track.measureOffsetM
}

export function lapLength(track: TrackSpec): number {
  return 2 * track.straightM + 2 * Math.PI * measureRadius(track)
}

export function finishX(track: TrackSpec): number {
  return track.centre[0] + track.straightM / 2
}

export function pointAt(track: TrackSpec, s: number): Gate {
  const [cx, cz] = track.centre
  const r = measureRadius(track)
  const half = track.straightM / 2
  const curve = Math.PI * r
  const lap = lapLength(track)
  const u = ((s % lap) + lap) % lap
  const point = (x: number, z: number, tx: number, tz: number): Gate => ({ x, z, tx, tz, lap: 0 })
  if (u < curve) {
    const phi = u / r
    return point(cx + half + r * Math.sin(phi), cz + r * Math.cos(phi), Math.cos(phi), -Math.sin(phi))
  }
  if (u < curve + track.straightM) return point(cx + half - (u - curve), cz - r, -1, 0)
  if (u < 2 * curve + track.straightM) {
    const phi = Math.PI + (u - curve - track.straightM) / r
    return point(cx - half + r * Math.sin(phi), cz + r * Math.cos(phi), Math.cos(phi), -Math.sin(phi))
  }
  return point(cx - half + (u - 2 * curve - track.straightM), cz + r, 1, 0)
}

function straightGate(track: TrackSpec, beforeFinish: number): Gate {
  return { x: finishX(track) - beforeFinish, z: track.centre[1] + measureRadius(track), tx: 1, tz: 0, lap: 0 }
}

export function buildCourse(track: TrackSpec, distanceM: number): Course {
  const lap = lapLength(track)
  const count = Math.ceil(distanceM / track.gateSpacingM - 1e-9)
  const gates: Gate[] = []
  const sprint = distanceM <= track.chuteM
  const laps = Math.ceil(distanceM / lap - 1e-9)
  const firstLap = distanceM - (laps - 1) * lap
  for (let i = 1; i <= count; i++) {
    const done = Math.min(i * track.gateSpacingM, distanceM)
    const toGo = distanceM - done
    const gate = sprint ? straightGate(track, toGo) : pointAt(track, -toGo)
    gates.push({ ...gate, lap: Math.max(0, Math.ceil((done - firstLap) / lap - 1e-9)) })
  }
  const start = sprint ? straightGate(track, distanceM) : pointAt(track, -distanceM)
  const normal = outwardNormal(start)
  const starts = Array.from({ length: track.lanes }, (_, lane) => {
    const out = track.laneWidthM * (lane + 0.5) - track.measureOffsetM
    return { x: start.x - start.tx * 0.3 + normal.x * out, z: start.z - start.tz * 0.3 + normal.z * out }
  })
  return { distanceM, gates, starts, startRy: Math.atan2(-start.tx, -start.tz), laps }
}

function outwardNormal(gate: Gate): { x: number, z: number } {
  return { x: -gate.tz, z: gate.tx }
}

export function crossing(track: TrackSpec, gate: Gate, x0: number, z0: number, x1: number, z1: number): number | null {
  const d0 = (x0 - gate.x) * gate.tx + (z0 - gate.z) * gate.tz
  const d1 = (x1 - gate.x) * gate.tx + (z1 - gate.z) * gate.tz
  if (!(d0 < 0 && d1 >= 0)) return null
  const f = d0 / (d0 - d1)
  const n = outwardNormal(gate)
  const offset = (x0 + (x1 - x0) * f - gate.x) * n.x + (z0 + (z1 - z0) * f - gate.z) * n.z
  const inner = -track.measureOffsetM - track.gateMarginM
  const outer = track.laneWidthM * track.lanes - track.measureOffsetM + track.gateMarginM
  return offset >= inner && offset <= outer ? f : null
}

export function createRace(rules: RunningRules, distanceM: number, entrants: { accountId: number, sessionId: string }[], now: number, random: () => number): Race {
  const course = buildCourse(rules.track, distanceM)
  const [lo, hi] = rules.startBeepDelayRangeMs
  const beepAt = now + lo + Math.round((hi - lo) * random())
  if (entrants.length > course.starts.length) throw new Error(`running race: ${entrants.length} runners for ${course.starts.length} lanes`)
  return {
    course,
    stride: rules.stride[distanceM],
    startedAt: now,
    setAt: now + rules.setAfterMs,
    beepAt,
    endsAt: beepAt + rules.maxRaceMs[distanceM],
    simAt: now,
    runners: entrants.map((e, lane) => ({
      accountId: e.accountId,
      sessionId: e.sessionId,
      lane,
      x: course.starts[lane].x,
      z: course.starts[lane].z,
      ry: course.startRy,
      speed: 0,
      quality: 0,
      lastFoot: null,
      lastStepAt: null,
      nextGate: 0,
      state: 'set',
      timeMs: null,
      dnf: null
    }))
  }
}

export function runnerOf(race: Race, accountId: number): Runner | null {
  return race.runners.find((r) => r.accountId === accountId) ?? null
}

export function stepQuality(rules: RunningRules, stride: StrideSpec, runner: Runner, foot: Foot, now: number): number {
  if (runner.lastStepAt === null || runner.lastFoot === null) return rules.firstStepQuality
  if (foot === runner.lastFoot) return rules.outOfStepQuality
  const gap = now - runner.lastStepAt
  if (gap < stride.goodStepMs - stride.toleranceMs) return rules.tooFastQuality
  const late = gap - (stride.goodStepMs + stride.toleranceMs)
  if (late <= 0) return 1
  return Math.max(0, 1 - late / stride.goodStepMs)
}

export function disqualify(runner: Runner, reason: DnfReason): void {
  if (runner.state === 'finished' || runner.state === 'dnf') return
  runner.state = 'dnf'
  runner.dnf = reason
  runner.speed = 0
}

export function applyStep(rules: RunningRules, race: Race, runner: Runner, foot: Foot, now: number): void {
  if (runner.state === 'set') {
    if (now < race.beepAt) disqualify(runner, 'false_start')
    return
  }
  if (runner.state !== 'running') return
  if (runner.lastStepAt !== null && now - runner.lastStepAt < rules.minStepGapMs) return
  runner.quality = stepQuality(rules, race.stride, runner, foot, now)
  runner.lastFoot = foot
  runner.lastStepAt = now
}

export function applyLook(runner: Runner, ry: number): void {
  if (runner.state === 'set' || runner.state === 'running') runner.ry = ry
}

function targetSpeed(rules: RunningRules, race: Race, runner: Runner, at: number): number {
  if (runner.lastStepAt === null) return 0
  if (at - runner.lastStepAt > race.stride.goodStepMs * rules.stallSteps) return 0
  return race.stride.topSpeedMps * runner.quality
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

function moveRunner(rules: RunningRules, race: Race, runner: Runner, from: number, to: number): void {
  const dt = (to - from) / 1000
  const target = targetSpeed(rules, race, runner, to)
  runner.speed = runner.speed < target ? Math.min(target, runner.speed + rules.accelMps2 * dt) : Math.max(target, runner.speed - rules.decelMps2 * dt)
  const area = rules.playArea
  const x0 = runner.x
  const z0 = runner.z
  const x1 = clamp(x0 - Math.sin(runner.ry) * runner.speed * dt, area.minX, area.maxX)
  const z1 = clamp(z0 - Math.cos(runner.ry) * runner.speed * dt, area.minZ, area.maxZ)
  runner.x = x1
  runner.z = z1
  const gates = race.course.gates
  const lookahead = Math.min(gates.length, runner.nextGate + Math.max(1, Math.floor(lapLength(rules.track) / rules.track.gateSpacingM) - 1))
  for (let i = runner.nextGate; i < lookahead; i++) {
    const f = crossing(rules.track, gates[i], x0, z0, x1, z1)
    if (f === null) continue
    if (i > runner.nextGate) {
      disqualify(runner, 'missed_gate')
      return
    }
    runner.nextGate = i + 1
    if (runner.nextGate === gates.length) {
      runner.state = 'finished'
      runner.timeMs = Math.round(from + (to - from) * f - race.beepAt)
      runner.speed = 0
    }
    return
  }
}

export function advanceRace(rules: RunningRules, race: Race, now: number): void {
  while (race.simAt < now) {
    const from = race.simAt
    const to = Math.min(now, from + SIM_STEP_MS)
    for (const runner of race.runners) {
      if (runner.state === 'set' && to >= race.beepAt) runner.state = 'running'
      if (runner.state === 'running') moveRunner(rules, race, runner, Math.max(from, race.beepAt), to)
    }
    race.simAt = to
  }
  if (now >= race.endsAt) for (const runner of race.runners) disqualify(runner, 'time')
}

export function raceOver(race: Race): boolean {
  return race.runners.every((r) => r.state === 'finished' || r.state === 'dnf')
}

export interface RunnerResult {
  accountId: number
  result: 'finished' | 'dnf'
  place?: number
  timeMs?: number
}

export function raceResults(race: Race): RunnerResult[] {
  const finished = race.runners.filter((r) => r.state === 'finished').sort((a, b) => (a.timeMs as number) - (b.timeMs as number))
  return race.runners.map((r) => {
    const place = finished.indexOf(r)
    return place < 0 ? { accountId: r.accountId, result: 'dnf' } : { accountId: r.accountId, result: 'finished', place: place + 1, timeMs: r.timeMs as number }
  })
}
