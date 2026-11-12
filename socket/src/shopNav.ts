// Walking around shelves in a shop zone (docs/NPC_BEHAVIOR.md): a grid over the zone with the shelves' footprints
// blocked, A* between two spots, then the path pulled tight so NPCs walk in long straight lines down the aisles.
import type { Json } from './backend.ts'
import type { Vec3Tuple } from './npcBehavior.ts'

export const NAV_CELL = 0.4
/** Room kept between a shopper's body and a shelf. */
export const NAV_CLEARANCE = 0.35
const SHELF_DEPTH: Record<string, number> = { gondola: 0.9, wall: 0.45, fridge: 0.75, chiller: 0.9 }

interface Rect {
  cx: number
  cz: number
  halfX: number
  halfZ: number
  cos: number
  sin: number
}

export class ShopNav {
  private readonly minX: number
  private readonly minZ: number
  private readonly cols: number
  private readonly rows: number
  private readonly blocked: Uint8Array

  constructor(bounds: { minX: number; maxX: number; minZ: number; maxZ: number }, rects: readonly Rect[]) {
    this.minX = bounds.minX
    this.minZ = bounds.minZ
    this.cols = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / NAV_CELL))
    this.rows = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / NAV_CELL))
    this.blocked = new Uint8Array(this.cols * this.rows)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const [x, z] = this.center(c, r)
        if (rects.some((rect) => inside(rect, x, z))) this.blocked[r * this.cols + c] = 1
      }
    }
  }

  /** Waypoints from `from` to `to`, `to` last; a straight line when nothing is in the way or no path exists. */
  route(from: Vec3Tuple, to: Vec3Tuple): Vec3Tuple[] {
    const start = this.free(this.cell(from[0], from[2]))
    const goal = this.free(this.cell(to[0], to[2]))
    if (start === null || goal === null || start === goal || this.clear(from[0], from[2], to[0], to[2])) return [to]
    const cells = this.search(start, goal)
    if (!cells) return [to]
    const points = cells.map((i) => this.center(i % this.cols, Math.floor(i / this.cols)))
    // pull the path tight: keep a corner only when the straight line past it would cut a shelf
    const kept: Array<[number, number]> = []
    let anchor: [number, number] = [from[0], from[2]]
    for (let i = 1; i < points.length; i++) {
      if (!this.clear(anchor[0], anchor[1], points[i]![0], points[i]![1])) {
        anchor = points[i - 1]!
        kept.push(anchor)
      }
    }
    const last = kept[kept.length - 1] ?? [from[0], from[2]]
    if (!this.clear(last[0], last[1], to[0], to[2])) kept.push(points[points.length - 1]!)
    return [...kept.map(([x, z]): Vec3Tuple => [x, to[1], z]), to]
  }

  private center(c: number, r: number): [number, number] {
    return [this.minX + (c + 0.5) * NAV_CELL, this.minZ + (r + 0.5) * NAV_CELL]
  }

  private cell(x: number, z: number): number {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / NAV_CELL)))
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor((z - this.minZ) / NAV_CELL)))
    return r * this.cols + c
  }

  /** The cell itself, or the nearest free one (a spot right against a shelf). */
  private free(i: number): number | null {
    if (!this.blocked[i]) return i
    const c0 = i % this.cols
    const r0 = Math.floor(i / this.cols)
    for (let ring = 1; ring <= 4; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          const c = c0 + dc
          const r = r0 + dr
          if (c >= 0 && r >= 0 && c < this.cols && r < this.rows && !this.blocked[r * this.cols + c]) return r * this.cols + c
        }
      }
    }
    return null
  }

  private walkable(x: number, z: number): boolean {
    const c = Math.floor((x - this.minX) / NAV_CELL)
    const r = Math.floor((z - this.minZ) / NAV_CELL)
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return true
    return !this.blocked[r * this.cols + c]
  }

  /** No blocked cell under the straight line (sampled every half cell). */
  private clear(x1: number, z1: number, x2: number, z2: number): boolean {
    const steps = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (NAV_CELL / 2))
    for (let s = 1; s < steps; s++) {
      const t = s / steps
      if (!this.walkable(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false
    }
    return true
  }

  /** A* on the 8-connected grid; no corner cutting past a blocked cell. */
  private search(start: number, goal: number): number[] | null {
    const cols = this.cols
    const g = new Float64Array(this.blocked.length).fill(Infinity)
    const from = new Int32Array(this.blocked.length).fill(-1)
    const closed = new Uint8Array(this.blocked.length)
    const gc = goal % cols
    const gr = Math.floor(goal / cols)
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - gc)
      const dr = Math.abs(Math.floor(i / cols) - gr)
      return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr)
    }
    const open: Array<[number, number]> = [[h(start), start]]
    g[start] = 0
    while (open.length > 0) {
      let best = 0
      for (let k = 1; k < open.length; k++) if (open[k]![0] < open[best]![0]) best = k
      const [, i] = open.splice(best, 1)[0]!
      if (i === goal) {
        const path = [i]
        for (let p = from[i]!; p !== -1; p = from[p]!) path.push(p)
        return path.reverse()
      }
      if (closed[i]) continue
      closed[i] = 1
      const c = i % cols
      const r = Math.floor(i / cols)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const nc = c + dc
          const nr = r + dr
          if (nc < 0 || nr < 0 || nc >= cols || nr >= this.rows) continue
          const n = nr * cols + nc
          if (this.blocked[n] || closed[n]) continue
          if (dr && dc && (this.blocked[r * cols + nc] || this.blocked[nr * cols + c])) continue
          const cost = g[i]! + (dr && dc ? Math.SQRT2 : 1)
          if (cost >= g[n]!) continue
          g[n] = cost
          from[n] = i
          open.push([cost + h(n), n])
        }
      }
    }
    return null
  }
}

function inside(rect: Rect, x: number, z: number): boolean {
  const dx = x - rect.cx
  const dz = z - rect.cz
  // into the shelf's own frame (inverse of three.js rotation.y)
  const lx = dx * rect.cos - dz * rect.sin
  const lz = dx * rect.sin + dz * rect.cos
  return Math.abs(lx) <= rect.halfX && Math.abs(lz) <= rect.halfZ
}

/** The shop zone's grid, from its bounds and shelves; null when the zone has no bounds. */
export function shopNav(decor: Json): ShopNav | null {
  const b = decor?.bounds
  if (!b || ![b.minX, b.maxX, b.minZ, b.maxZ].every(Number.isFinite)) return null
  const props: Json[] = Array.isArray(decor.props) ? decor.props : []
  const rects: Rect[] = props
    .filter((p) => p?.kind === 'shelf' && SHELF_DEPTH[p.shelf] && Array.isArray(p.position))
    .map((p) => {
      const yaw = Number.isFinite(p.yaw) ? p.yaw : 0
      return {
        cx: p.position[0],
        cz: p.position[2],
        halfX: Number(p.length) / 2 + NAV_CLEARANCE,
        halfZ: SHELF_DEPTH[p.shelf]! / 2 + NAV_CLEARANCE,
        cos: Math.cos(yaw),
        sin: Math.sin(yaw)
      }
    })
  return new ShopNav(b, rects)
}
