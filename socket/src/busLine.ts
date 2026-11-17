import type { Json } from './backend.ts'

export type BusId = 'A' | 'B'
export const BUS_IDS: readonly BusId[] = ['A', 'B']

export interface XZ {
  x: number
  z: number
}

export interface BusPose extends XZ {
  yaw: number
}

export interface BusStopSide {
  stand: XZ
  boarding: XZ
}

export interface BusStop {
  id: string
  name: string
  sides: Record<BusId, BusStopSide>
}

export interface BusRoute {
  points: XZ[]
  cumulative: number[]
  length: number
}

export interface BusLine {
  stops: BusStop[]
  routes: Record<BusId, BusRoute>
}

function parseXZ(raw: Json, what: string): XZ {
  if (!Array.isArray(raw) || raw.length !== 2 || !raw.every(Number.isFinite)) throw new Error(`world manifest: invalid bus ${what} ${JSON.stringify(raw)}`)
  return { x: raw[0], z: raw[1] }
}

export function buildRoute(points: XZ[]): BusRoute {
  if (points.length < 3) throw new Error('world manifest: a bus route needs at least 3 points')
  const cumulative = [0]
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1]!
    const b = points[i % points.length]!
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z))
  }
  return { points, cumulative, length: cumulative[points.length]! }
}

export function yawAlong(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

export function poseAt(route: BusRoute, distance: number): BusPose {
  const s = ((distance % route.length) + route.length) % route.length
  let i = 0
  while (i < route.points.length - 1 && route.cumulative[i + 1]! <= s) i++
  const a = route.points[i]!
  const b = route.points[(i + 1) % route.points.length]!
  const span = route.cumulative[i + 1]! - route.cumulative[i]!
  const t = span > 0 ? (s - route.cumulative[i]!) / span : 0
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: yawAlong(b.x - a.x, b.z - a.z) }
}

export function projectOnRoute(route: BusRoute, p: XZ): { distance: number, offset: number } {
  let best = { distance: 0, offset: Infinity }
  for (let i = 0; i < route.points.length; i++) {
    const a = route.points[i]!
    const b = route.points[(i + 1) % route.points.length]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const span2 = dx * dx + dz * dz
    const t = span2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / span2)) : 0
    const offset = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z)
    if (offset < best.offset) best = { distance: route.cumulative[i]! + Math.sqrt(span2) * t, offset }
  }
  return best
}

export function parseBusLine(raw: Json): BusLine | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw?.stops) || raw.stops.length < 2) throw new Error('world manifest: the bus line needs at least 2 stops')
  const routes = {} as Record<BusId, BusRoute>
  for (const bus of BUS_IDS) {
    const points = raw.buses?.[bus]?.route
    if (!Array.isArray(points)) throw new Error(`world manifest: bus ${bus} has no route`)
    routes[bus] = buildRoute(points.map((p: Json, i: number) => parseXZ(p, `${bus} route point ${i}`)))
  }
  const ids = new Set<string>()
  const stops = raw.stops.map((stop: Json, i: number): BusStop => {
    if (typeof stop?.id !== 'string' || typeof stop?.name !== 'string' || ids.has(stop.id)) throw new Error(`world manifest: invalid bus stop ${i} ${JSON.stringify(stop?.id)}`)
    ids.add(stop.id)
    const sides = {} as Record<BusId, BusStopSide>
    for (const bus of BUS_IDS) {
      sides[bus] = { stand: parseXZ(stop[bus]?.stand, `${stop.id} ${bus} stand`), boarding: parseXZ(stop[bus]?.boarding, `${stop.id} ${bus} boarding`) }
    }
    return { id: stop.id, name: stop.name, sides }
  })
  return { stops, routes }
}
