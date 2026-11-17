import type { Bounds } from '../types.ts'
import type { Team } from './signup.ts'

export type ThrowMode = 'point' | 'shoot'
export type BallKind = 'jack' | 'boule'

export interface PetanquePhysics {
  boule: { radiusM: number, massKg: number }
  jack: { radiusM: number, massKg: number, throwDistanceRangeM: [number, number], minSideGapM: number }
  ground: { rollingDecelMs2: number, restitution: number }
  throw: {
    maxDistanceM: number
    maxAimDeg: number
    pointLandFraction: number
    shootSpeedMs: number
    shootKeepFraction: number
    pointApexM: number
    shootApexM: number
    aimScatterDeg: number
    powerScatter: number
    carreauRadiusM: number
  }
}

export interface Ball {
  id: number
  kind: BallKind
  team: Team | null
  owner: number | null
  x: number
  z: number
  dead: boolean
}

export interface ThrowInput {
  kind: BallKind
  mode: ThrowMode
  from: { x: number, z: number }
  axisZ: 1 | -1
  yaw: number
  power: number
  team: Team | null
  owner: number | null
}

export type Frame = [number, ...[number, number, number][]]

export interface ThrowResult {
  ball: Ball
  landing: { x: number, z: number }
  airMs: number
  rollMs: number
  frames: Frame[]
  carreau: boolean
  balls: Ball[]
}

interface Body extends Ball {
  vx: number
  vz: number
  r: number
  m: number
}

const STEP_S = 1 / 120
const FRAME_STEPS = 6
const MAX_ROLL_S = 20
const GRAVITY = 9.81

export function meterPower(heldMs: number, riseMs: number): number {
  const phase = (Math.max(0, heldMs) % (2 * riseMs)) / riseMs
  return phase <= 1 ? phase : 2 - phase
}

export function gaussian(random: () => number): number {
  const u = 1 - random()
  const v = random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function bodyOf(ball: Ball, physics: PetanquePhysics): Body {
  const spec = ball.kind === 'jack' ? physics.jack : physics.boule
  return { ...ball, vx: 0, vz: 0, r: spec.radiusM, m: spec.massKg }
}

function plain({ id, kind, team, owner, x, z, dead }: Body): Ball {
  return { id, kind, team, owner, x, z, dead }
}

function touchesBoard(b: Body, piste: Bounds): boolean {
  return b.x - b.r <= piste.minX || b.x + b.r >= piste.maxX || b.z - b.r <= piste.minZ || b.z + b.r >= piste.maxZ
}

function kill(b: Body, piste: Bounds): void {
  b.x = clamp(b.x, piste.minX + b.r, piste.maxX - b.r)
  b.z = clamp(b.z, piste.minZ + b.r, piste.maxZ - b.r)
  b.vx = 0
  b.vz = 0
  b.dead = true
}

function contactNormal(a: Body, b: Body, dx: number, dz: number, dist: number): [number, number] {
  if (dist > 1e-9) return [dx / dist, dz / dist]
  const rvx = a.vx - b.vx
  const rvz = a.vz - b.vz
  const speed = Math.hypot(rvx, rvz)
  return speed > 1e-9 ? [rvx / speed, rvz / speed] : [1, 0]
}

function collide(a: Body, b: Body, restitution: number): boolean {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const dist = Math.hypot(dx, dz)
  const reach = a.r + b.r
  if (dist >= reach) return false
  const [nx, nz] = contactNormal(a, b, dx, dz, dist)
  const approach = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
  if (approach > 0) {
    const impulse = ((1 + restitution) * approach) / (1 / a.m + 1 / b.m)
    a.vx -= (impulse / a.m) * nx
    a.vz -= (impulse / a.m) * nz
    b.vx += (impulse / b.m) * nx
    b.vz += (impulse / b.m) * nz
  }
  const push = reach - dist
  const share = a.m + b.m
  a.x -= nx * push * (b.m / share)
  a.z -= nz * push * (b.m / share)
  b.x += nx * push * (a.m / share)
  b.z += nz * push * (a.m / share)
  return true
}

function roll(bodies: Body[], piste: Bounds, physics: PetanquePhysics): { frames: Frame[], rollMs: number } {
  const frames: Frame[] = []
  const decel = physics.ground.rollingDecelMs2 * STEP_S
  let step = 0
  for (; step < MAX_ROLL_S / STEP_S; step++) {
    const moving = bodies.filter((b) => !b.dead && (b.vx !== 0 || b.vz !== 0))
    if (moving.length === 0) break
    for (const b of moving) {
      const speed = Math.hypot(b.vx, b.vz)
      const next = Math.max(0, speed - decel)
      b.vx = speed > 0 ? (b.vx / speed) * next : 0
      b.vz = speed > 0 ? (b.vz / speed) * next : 0
      b.x += b.vx * STEP_S
      b.z += b.vz * STEP_S
    }
    const live = bodies.filter((b) => !b.dead)
    for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) collide(live[i], live[j], physics.ground.restitution)
    for (const b of live) if (touchesBoard(b, piste)) kill(b, piste)
    if (step % FRAME_STEPS === 0) frames.push(frameOf(step, moving))
  }
  const rollMs = Math.round(step * STEP_S * 1000)
  frames.push(frameOf(step, bodies))
  return { frames, rollMs }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function frameOf(step: number, bodies: Body[]): Frame {
  return [Math.round(step * STEP_S * 1000), ...bodies.map((b): [number, number, number] => [b.id, round3(b.x), round3(b.z)])]
}

function airMs(apexM: number): number {
  return Math.round(2 * Math.sqrt((2 * apexM) / GRAVITY) * 1000)
}

export function simulateThrow(balls: readonly Ball[], input: ThrowInput, piste: Bounds, physics: PetanquePhysics, random: () => number = Math.random): ThrowResult {
  const t = physics.throw
  const maxAim = (t.maxAimDeg * Math.PI) / 180
  const yaw = clamp(input.yaw, -maxAim, maxAim) + gaussian(random) * ((t.aimScatterDeg * Math.PI) / 180)
  const power = clamp(clamp(input.power, 0, 1) + gaussian(random) * t.powerScatter, 0, 1)
  const dirX = Math.sin(yaw)
  const dirZ = Math.cos(yaw) * input.axisZ
  const distance = power * t.maxDistanceM
  const shoot = input.kind === 'boule' && input.mode === 'shoot'
  const flight = shoot ? distance : distance * t.pointLandFraction
  const landing = { x: input.from.x + dirX * flight, z: input.from.z + dirZ * flight }
  const bodies = balls.map((b) => bodyOf(b, physics))
  const nextId = Math.max(0, ...balls.map((b) => b.id)) + 1
  const thrown = bodyOf({ id: nextId, kind: input.kind, team: input.team, owner: input.owner, x: landing.x, z: landing.z, dead: false }, physics)
  const groundSpeed = shoot ? t.shootSpeedMs : Math.sqrt(2 * physics.ground.rollingDecelMs2 * (distance - flight))
  thrown.vx = dirX * groundSpeed
  thrown.vz = dirZ * groundSpeed
  let hit: { id: number, x: number, z: number } | null = null
  if (touchesBoard(thrown, piste)) {
    kill(thrown, piste)
  } else if (shoot) {
    const target = bodies.find((b) => !b.dead && Math.hypot(b.x - thrown.x, b.z - thrown.z) < b.r + thrown.r)
    if (target) {
      hit = { id: target.id, x: target.x, z: target.z }
      collide(thrown, target, physics.ground.restitution)
    }
    thrown.vx *= t.shootKeepFraction
    thrown.vz *= t.shootKeepFraction
  }
  bodies.push(thrown)
  const { frames, rollMs } = roll(bodies, piste, physics)
  const hitBoule = hit && bodies.find((b) => b.id === hit.id)?.kind === 'boule'
  const carreau = Boolean(hit && hitBoule && !thrown.dead && Math.hypot(thrown.x - hit.x, thrown.z - hit.z) <= t.carreauRadiusM)
  return {
    ball: plain(thrown),
    landing: { x: round3(landing.x), z: round3(landing.z) },
    airMs: airMs(shoot ? t.shootApexM : t.pointApexM),
    rollMs,
    frames,
    carreau,
    balls: bodies.map(plain)
  }
}

export function validJackSpot(jack: Ball, circle: { x: number, z: number }, piste: Bounds, physics: PetanquePhysics): boolean {
  const [min, max] = physics.jack.throwDistanceRangeM
  const gap = physics.jack.minSideGapM
  const distance = Math.hypot(jack.x - circle.x, jack.z - circle.z)
  return !jack.dead && distance >= min && distance <= max && jack.x - piste.minX >= gap && piste.maxX - jack.x >= gap
}

export function placeJack(jack: Ball, circle: { x: number, z: number }, axisZ: 1 | -1, piste: Bounds, physics: PetanquePhysics): Ball {
  const [min, max] = physics.jack.throwDistanceRangeM
  const gap = physics.jack.minSideGapM
  const along = jack.dead ? (min + max) / 2 : clamp((jack.z - circle.z) * axisZ, min, max)
  const x = clamp(jack.x, piste.minX + gap, piste.maxX - gap)
  return { ...jack, x, z: circle.z + along * axisZ, dead: false }
}

export interface Standing {
  team: Team
  ballId: number
  distancesCm: { id: number, cm: number }[]
}

export function distancesCm(balls: readonly Ball[], physics: PetanquePhysics): { id: number, cm: number }[] {
  const jack = balls.find((b) => b.kind === 'jack')
  if (!jack || jack.dead) return []
  const gap = physics.boule.radiusM + physics.jack.radiusM
  return balls
    .filter((b) => b.kind === 'boule' && !b.dead)
    .map((b) => ({ id: b.id, cm: Math.max(0, Math.round((Math.hypot(b.x - jack.x, b.z - jack.z) - gap) * 100)) }))
    .sort((a, b) => a.cm - b.cm || a.id - b.id)
}

export function pointHolder(balls: readonly Ball[], physics: PetanquePhysics): Standing | null {
  const distances = distancesCm(balls, physics)
  if (distances.length === 0) return null
  const best = balls.find((b) => b.id === distances[0].id) as Ball
  return { team: best.team as Team, ballId: best.id, distancesCm: distances }
}

export interface EndScore {
  team: Team | null
  points: number
}

export function scoreEnd(balls: readonly Ball[], left: Record<Team, number>, physics: PetanquePhysics): EndScore {
  const jack = balls.find((b) => b.kind === 'jack')
  if (!jack || jack.dead) {
    if (left.red > 0 && left.blue === 0) return { team: 'red', points: left.red }
    if (left.blue > 0 && left.red === 0) return { team: 'blue', points: left.blue }
    return { team: null, points: 0 }
  }
  const distances = distancesCm(balls, physics)
  if (distances.length === 0) return { team: null, points: 0 }
  const teamOf = (id: number) => balls.find((b) => b.id === id)?.team
  const winner = teamOf(distances[0].id) as Team
  const opponentBest = distances.find((d) => teamOf(d.id) !== winner)
  const points = distances.filter((d) => teamOf(d.id) === winner && (!opponentBest || d.cm < opponentBest.cm)).length
  return { team: winner, points }
}
