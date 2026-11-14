import type { Bounds } from '../types.ts'
import type { Team } from './signup.ts'

export interface Goal {
  lineX: number
  inward: 1 | -1
  minZ: number
  maxZ: number
  height: number
}

export interface Basket {
  x: number
  y: number
  z: number
  rimRadius: number
  boardX: number
  boardHalfWidth: number
  boardBottom: number
  boardTop: number
  threePointRadius: number
}

export interface GymCourt {
  floorY: number
  ceilingY: number
  arena: Bounds
  playArea: Bounds
  court: Bounds
  centre: { x: number, z: number }
  coach: { x: number, z: number }
  goals: Record<Team, Goal>
  baskets: Record<Team, Basket>
}

type Raw = Record<string, unknown>

function num(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`gym court: invalid ${what} ${JSON.stringify(raw)}`)
  return raw
}

function bounds(raw: unknown, what: string): Bounds {
  const b = (raw ?? {}) as Raw
  const out = { minX: num(b.minX, `${what}.minX`), maxX: num(b.maxX, `${what}.maxX`), minZ: num(b.minZ, `${what}.minZ`), maxZ: num(b.maxZ, `${what}.maxZ`) }
  if (out.minX >= out.maxX || out.minZ >= out.maxZ) throw new Error(`gym court: empty ${what}`)
  return out
}

function point(raw: unknown, what: string): { x: number, z: number } {
  const p = (raw ?? {}) as Raw
  return { x: num(p.x, `${what}.x`), z: num(p.z, `${what}.z`) }
}

function contains(outer: Bounds, inner: Bounds): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minZ >= outer.minZ && inner.maxZ <= outer.maxZ
}

function goal(raw: unknown, what: string): Goal {
  const g = (raw ?? {}) as Raw
  if (g.inward !== 1 && g.inward !== -1) throw new Error(`gym court: ${what}.inward must be 1 or -1`)
  const out = { lineX: num(g.lineX, `${what}.lineX`), inward: g.inward, minZ: num(g.minZ, `${what}.minZ`), maxZ: num(g.maxZ, `${what}.maxZ`), height: num(g.height, `${what}.height`) } as Goal
  if (out.minZ >= out.maxZ || out.height <= 0) throw new Error(`gym court: empty ${what}`)
  return out
}

function basket(raw: unknown, what: string): Basket {
  const b = (raw ?? {}) as Raw
  const keys = ['x', 'y', 'z', 'rimRadius', 'boardX', 'boardHalfWidth', 'boardBottom', 'boardTop', 'threePointRadius'] as const
  const out = Object.fromEntries(keys.map((k) => [k, num(b[k], `${what}.${k}`)])) as unknown as Basket
  if (out.rimRadius <= 0 || out.boardTop <= out.boardBottom || out.threePointRadius <= 0) throw new Error(`gym court: invalid ${what}`)
  return out
}

export function parseGymCourt(raw: unknown): GymCourt {
  const c = (raw ?? {}) as Raw
  const court: GymCourt = {
    floorY: num(c.floorY, 'floorY'),
    ceilingY: num(c.ceilingY, 'ceilingY'),
    arena: bounds(c.arena, 'arena'),
    playArea: bounds(c.playArea, 'playArea'),
    court: bounds(c.court, 'court'),
    centre: point(c.centre, 'centre'),
    coach: point(c.coach, 'coach'),
    goals: { red: goal((c.goals as Raw)?.red, 'goals.red'), blue: goal((c.goals as Raw)?.blue, 'goals.blue') },
    baskets: { red: basket((c.baskets as Raw)?.red, 'baskets.red'), blue: basket((c.baskets as Raw)?.blue, 'baskets.blue') }
  }
  if (court.ceilingY <= court.floorY + 4) throw new Error('gym court: ceiling too low')
  if (!contains(court.arena, court.court)) throw new Error('gym court: the court lines leave the arena')
  return court
}
