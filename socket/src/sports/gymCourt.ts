import type { Bounds } from '../types.ts'
import type { Box, Rim } from './gymBall.ts'
import type { Team } from './signup.ts'

export interface Goal {
  lineX: number
  inward: 1 | -1
  minZ: number
  maxZ: number
  height: number
  depth: number
}

export interface BoardBox {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface Hoop {
  x: number
  y: number
  z: number
  rimRadius: number
  board: BoardBox
}

export interface Basket extends Hoop {
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
  sideBaskets: Hoop[]
}

const POST = 0.1
const POST_RESTITUTION = 0.6
const NET_RESTITUTION = 0.1
const NET_THICKNESS = 0.04
const BOARD_RESTITUTION = 0.6

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
  const out: Goal = {
    lineX: num(g.lineX, `${what}.lineX`),
    inward: g.inward,
    minZ: num(g.minZ, `${what}.minZ`),
    maxZ: num(g.maxZ, `${what}.maxZ`),
    height: num(g.height, `${what}.height`),
    depth: num(g.depth, `${what}.depth`)
  }
  if (out.minZ >= out.maxZ || out.height <= 0 || out.depth <= 0) throw new Error(`gym court: empty ${what}`)
  return out
}

function board(raw: unknown, what: string): BoardBox {
  const b = (raw ?? {}) as Raw
  const keys = ['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ'] as const
  const out = Object.fromEntries(keys.map((k) => [k, num(b[k], `${what}.${k}`)])) as unknown as BoardBox
  if (out.minX >= out.maxX || out.minY >= out.maxY || out.minZ >= out.maxZ) throw new Error(`gym court: empty ${what}`)
  return out
}

function hoop(raw: unknown, what: string): Hoop {
  const h = (raw ?? {}) as Raw
  const out: Hoop = { x: num(h.x, `${what}.x`), y: num(h.y, `${what}.y`), z: num(h.z, `${what}.z`), rimRadius: num(h.rimRadius, `${what}.rimRadius`), board: board(h.board, `${what}.board`) }
  if (out.rimRadius <= 0) throw new Error(`gym court: invalid ${what}.rimRadius`)
  return out
}

function basket(raw: unknown, what: string): Basket {
  const threePointRadius = num((raw as Raw | undefined)?.threePointRadius, `${what}.threePointRadius`)
  if (threePointRadius <= 0) throw new Error(`gym court: invalid ${what}.threePointRadius`)
  return { ...hoop(raw, what), threePointRadius }
}

export function parseGymCourt(raw: unknown): GymCourt {
  const c = (raw ?? {}) as Raw
  if (!Array.isArray(c.sideBaskets)) throw new Error('gym court: sideBaskets must be a list')
  const court: GymCourt = {
    floorY: num(c.floorY, 'floorY'),
    ceilingY: num(c.ceilingY, 'ceilingY'),
    arena: bounds(c.arena, 'arena'),
    playArea: bounds(c.playArea, 'playArea'),
    court: bounds(c.court, 'court'),
    centre: point(c.centre, 'centre'),
    coach: point(c.coach, 'coach'),
    goals: { red: goal((c.goals as Raw)?.red, 'goals.red'), blue: goal((c.goals as Raw)?.blue, 'goals.blue') },
    baskets: { red: basket((c.baskets as Raw)?.red, 'baskets.red'), blue: basket((c.baskets as Raw)?.blue, 'baskets.blue') },
    sideBaskets: c.sideBaskets.map((s, i) => hoop(s, `sideBaskets[${i}]`))
  }
  if (court.ceilingY <= court.floorY + 4) throw new Error('gym court: ceiling too low')
  if (!contains(court.arena, court.court)) throw new Error('gym court: the court lines leave the arena')
  return court
}

function goalBoxes(g: Goal, floorY: number): Box[] {
  const back = g.lineX + g.inward * g.depth
  const [x0, x1] = [Math.min(g.lineX, back), Math.max(g.lineX, back)]
  const top = floorY + g.height
  const post = (z: number): Box => ({ minX: g.lineX - POST / 2, maxX: g.lineX + POST / 2, minY: floorY, maxY: top, minZ: z - POST / 2, maxZ: z + POST / 2, restitution: POST_RESTITUTION })
  const net = (box: Omit<Box, 'restitution'>): Box => ({ ...box, restitution: NET_RESTITUTION })
  return [
    post(g.minZ),
    post(g.maxZ),
    { minX: g.lineX - POST / 2, maxX: g.lineX + POST / 2, minY: top - POST, maxY: top, minZ: g.minZ, maxZ: g.maxZ, restitution: POST_RESTITUTION },
    net({ minX: back - NET_THICKNESS / 2, maxX: back + NET_THICKNESS / 2, minY: floorY, maxY: top, minZ: g.minZ, maxZ: g.maxZ }),
    net({ minX: x0, maxX: x1, minY: top - NET_THICKNESS, maxY: top, minZ: g.minZ, maxZ: g.maxZ }),
    net({ minX: x0, maxX: x1, minY: floorY, maxY: top, minZ: g.minZ - NET_THICKNESS, maxZ: g.minZ }),
    net({ minX: x0, maxX: x1, minY: floorY, maxY: top, minZ: g.maxZ, maxZ: g.maxZ + NET_THICKNESS })
  ]
}

export function courtHoops(court: GymCourt): Hoop[] {
  return [court.baskets.red, court.baskets.blue, ...court.sideBaskets]
}

export function courtObstacles(court: GymCourt): { boxes: Box[], rims: Rim[] } {
  const hoops = courtHoops(court)
  return {
    boxes: [
      ...goalBoxes(court.goals.red, court.floorY),
      ...goalBoxes(court.goals.blue, court.floorY),
      ...hoops.map((h) => ({ ...h.board, restitution: BOARD_RESTITUTION }))
    ],
    rims: hoops.map((h) => ({ x: h.x, y: h.y, z: h.z, radius: h.rimRadius }))
  }
}
