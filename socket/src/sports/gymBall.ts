import type { Bounds } from '../types.ts'

export interface Ball {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface BallSpec {
  radius: number
  floorRestitution: number
  wallRestitution: number
  rimRestitution: number
  rollDecel: number
}

export interface Box {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  restitution: number
}

export interface Rim {
  x: number
  y: number
  z: number
  radius: number
}

export interface Body {
  x: number
  z: number
  vx: number
  vz: number
}

export interface BallWorld {
  floorY: number
  ceilingY: number
  arena: Bounds
  rims: readonly Rim[]
  boxes: readonly Box[]
}

export const GRAVITY = 9.81
export const BODY_RADIUS = 0.35
export const BODY_HEIGHT = 1.9
const BODY_RESTITUTION = 0.35
const REST_BOUNCE_SPEED = 0.6

function bounceWalls(ball: Ball, spec: BallSpec, arena: Bounds): void {
  const r = spec.radius
  const e = spec.wallRestitution
  if (ball.x - r < arena.minX) {
    ball.x = arena.minX + r
    ball.vx = Math.abs(ball.vx) * e
  } else if (ball.x + r > arena.maxX) {
    ball.x = arena.maxX - r
    ball.vx = -Math.abs(ball.vx) * e
  }
  if (ball.z - r < arena.minZ) {
    ball.z = arena.minZ + r
    ball.vz = Math.abs(ball.vz) * e
  } else if (ball.z + r > arena.maxZ) {
    ball.z = arena.maxZ - r
    ball.vz = -Math.abs(ball.vz) * e
  }
}

function bounceFloorAndCeiling(ball: Ball, spec: BallSpec, world: BallWorld, dt: number): void {
  const r = spec.radius
  if (ball.y + r > world.ceilingY) {
    ball.y = world.ceilingY - r
    ball.vy = -Math.abs(ball.vy) * spec.wallRestitution
  }
  if (ball.y - r > world.floorY) return
  ball.y = world.floorY + r
  if (ball.vy < 0) ball.vy = -ball.vy * spec.floorRestitution
  if (ball.vy < REST_BOUNCE_SPEED) ball.vy = 0
  if (ball.vy !== 0) return
  const speed = Math.hypot(ball.vx, ball.vz)
  if (speed === 0) return
  const slowed = Math.max(0, speed - spec.rollDecel * dt)
  ball.vx *= slowed / speed
  ball.vz *= slowed / speed
}

function reflect(ball: Ball, nx: number, ny: number, nz: number, restitution: number, carry: { vx: number, vz: number } = { vx: 0, vz: 0 }): void {
  const rvx = ball.vx - carry.vx
  const rvz = ball.vz - carry.vz
  const vn = rvx * nx + ball.vy * ny + rvz * nz
  if (vn >= 0) return
  const k = (1 + restitution) * vn
  ball.vx -= k * nx
  ball.vy -= k * ny
  ball.vz -= k * nz
}

export function bounceBox(ball: Ball, radius: number, box: Box): boolean {
  const cx = Math.min(Math.max(ball.x, box.minX), box.maxX)
  const cy = Math.min(Math.max(ball.y, box.minY), box.maxY)
  const cz = Math.min(Math.max(ball.z, box.minZ), box.maxZ)
  const dx = ball.x - cx
  const dy = ball.y - cy
  const dz = ball.z - cz
  const dist = Math.hypot(dx, dy, dz)
  if (dist >= radius) return false
  if (dist < 1e-9) {
    const exits = [
      { d: ball.x - box.minX, n: [-1, 0, 0] }, { d: box.maxX - ball.x, n: [1, 0, 0] },
      { d: ball.y - box.minY, n: [0, -1, 0] }, { d: box.maxY - ball.y, n: [0, 1, 0] },
      { d: ball.z - box.minZ, n: [0, 0, -1] }, { d: box.maxZ - ball.z, n: [0, 0, 1] }
    ]
    const { d, n } = exits.reduce((a, b) => (b.d < a.d ? b : a))
    ball.x += n[0] * (d + radius)
    ball.y += n[1] * (d + radius)
    ball.z += n[2] * (d + radius)
    reflect(ball, n[0], n[1], n[2], box.restitution)
    return true
  }
  const [nx, ny, nz] = [dx / dist, dy / dist, dz / dist]
  ball.x = cx + nx * radius
  ball.y = cy + ny * radius
  ball.z = cz + nz * radius
  reflect(ball, nx, ny, nz, box.restitution)
  return true
}

function bounceRim(ball: Ball, spec: BallSpec, rim: Rim): void {
  const dx = ball.x - rim.x
  const dz = ball.z - rim.z
  const flat = Math.hypot(dx, dz)
  const ux = flat > 1e-6 ? dx / flat : 1
  const uz = flat > 1e-6 ? dz / flat : 0
  const qx = rim.x + ux * rim.radius
  const qz = rim.z + uz * rim.radius
  const nx = ball.x - qx
  const ny = ball.y - rim.y
  const nz = ball.z - qz
  const dist = Math.hypot(nx, ny, nz)
  if (dist >= spec.radius || dist < 1e-6) return
  const [mx, my, mz] = [nx / dist, ny / dist, nz / dist]
  ball.x = qx + mx * spec.radius
  ball.y = rim.y + my * spec.radius
  ball.z = qz + mz * spec.radius
  reflect(ball, mx, my, mz, spec.rimRestitution)
}

export function bounceBody(ball: Ball, radius: number, floorY: number, body: Body): boolean {
  if (ball.y - radius > floorY + BODY_HEIGHT) return false
  const dx = ball.x - body.x
  const dz = ball.z - body.z
  const flat = Math.hypot(dx, dz)
  const reach = BODY_RADIUS + radius
  if (flat >= reach) return false
  const nx = flat > 1e-6 ? dx / flat : 1
  const nz = flat > 1e-6 ? dz / flat : 0
  ball.x = body.x + nx * reach
  ball.z = body.z + nz * reach
  reflect(ball, nx, 0, nz, BODY_RESTITUTION, body)
  return true
}

export function stepBall(ball: Ball, spec: BallSpec, world: BallWorld, dt: number, bodies: readonly Body[] = []): void {
  const travel = Math.hypot(ball.vx, ball.vy, ball.vz) * dt + 0.5 * GRAVITY * dt * dt
  const steps = Math.max(1, Math.ceil(travel / (spec.radius * 0.5)))
  for (let i = 0; i < steps; i++) moveBall(ball, spec, world, dt / steps, bodies)
}

function moveBall(ball: Ball, spec: BallSpec, world: BallWorld, dt: number, bodies: readonly Body[]): void {
  const resting = ball.vy === 0 && ball.y - spec.radius <= world.floorY + 1e-6
  const g = resting ? 0 : GRAVITY
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt - 0.5 * g * dt * dt
  ball.z += ball.vz * dt
  ball.vy -= g * dt
  for (const box of world.boxes) bounceBox(ball, spec.radius, box)
  for (const rim of world.rims) bounceRim(ball, spec, rim)
  for (const body of bodies) bounceBody(ball, spec.radius, world.floorY, body)
  bounceWalls(ball, spec, world.arena)
  bounceFloorAndCeiling(ball, spec, world, dt)
}

export function droppedThroughRim(before: Ball, after: Ball, rim: Rim): boolean {
  if (!(before.y > rim.y && after.y <= rim.y)) return false
  return Math.hypot(after.x - rim.x, after.z - rim.z) < rim.radius
}

export function launchToward(fromX: number, fromY: number, fromZ: number, toX: number, toY: number, toZ: number, angleRad: number): { vx: number, vy: number, vz: number } | null {
  const dx = toX - fromX
  const dz = toZ - fromZ
  const flat = Math.hypot(dx, dz)
  if (flat < 1e-6) return null
  const rise = toY - fromY
  const cos = Math.cos(angleRad)
  const denominator = 2 * cos * cos * (flat * Math.tan(angleRad) - rise)
  if (denominator <= 0) return null
  const speed = Math.sqrt((GRAVITY * flat * flat) / denominator)
  return { vx: (dx / flat) * speed * cos, vy: speed * Math.sin(angleRad), vz: (dz / flat) * speed * cos }
}
