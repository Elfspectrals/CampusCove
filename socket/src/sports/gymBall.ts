import type { Bounds } from '../types.ts'
import type { Basket } from './gymCourt.ts'

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

export interface BallWorld {
  floorY: number
  ceilingY: number
  arena: Bounds
  baskets: readonly Basket[]
}

export const GRAVITY = 9.81
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

function bounceBoard(ball: Ball, spec: BallSpec, basket: Basket): void {
  const r = spec.radius
  const front = Math.sign(basket.x - basket.boardX)
  const gap = (ball.x - basket.boardX) * front
  const within = Math.abs(ball.z - basket.z) <= basket.boardHalfWidth && ball.y >= basket.boardBottom && ball.y <= basket.boardTop
  if (!within || gap >= r || gap <= -r) return
  ball.x = basket.boardX + front * r
  if (ball.vx * front < 0) ball.vx = -ball.vx * spec.rimRestitution
}

function bounceRim(ball: Ball, spec: BallSpec, basket: Basket): void {
  const dx = ball.x - basket.x
  const dz = ball.z - basket.z
  const flat = Math.hypot(dx, dz)
  const ux = flat > 1e-6 ? dx / flat : 1
  const uz = flat > 1e-6 ? dz / flat : 0
  const qx = basket.x + ux * basket.rimRadius
  const qz = basket.z + uz * basket.rimRadius
  const nx = ball.x - qx
  const ny = ball.y - basket.y
  const nz = ball.z - qz
  const dist = Math.hypot(nx, ny, nz)
  if (dist >= spec.radius || dist < 1e-6) return
  const [mx, my, mz] = [nx / dist, ny / dist, nz / dist]
  ball.x = qx + mx * spec.radius
  ball.y = basket.y + my * spec.radius
  ball.z = qz + mz * spec.radius
  const vn = ball.vx * mx + ball.vy * my + ball.vz * mz
  if (vn < 0) {
    const k = (1 + spec.rimRestitution) * vn
    ball.vx -= k * mx
    ball.vy -= k * my
    ball.vz -= k * mz
  }
}

export function stepBall(ball: Ball, spec: BallSpec, world: BallWorld, dt: number): void {
  const resting = ball.vy === 0 && ball.y - spec.radius <= world.floorY + 1e-6
  const g = resting ? 0 : GRAVITY
  ball.x += ball.vx * dt
  ball.y += ball.vy * dt - 0.5 * g * dt * dt
  ball.z += ball.vz * dt
  ball.vy -= g * dt
  for (const basket of world.baskets) {
    bounceBoard(ball, spec, basket)
    bounceRim(ball, spec, basket)
  }
  bounceWalls(ball, spec, world.arena)
  bounceFloorAndCeiling(ball, spec, world, dt)
}

export function droppedThroughRim(before: Ball, after: Ball, basket: Basket): boolean {
  if (!(before.y > basket.y && after.y <= basket.y)) return false
  return Math.hypot(after.x - basket.x, after.z - basket.z) < basket.rimRadius
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
