export interface StallSpot {
  x: number
  z: number
  yaw: number
}

export interface CrowdWaypoint {
  x: number
  z: number
  faceYaw: number | null
}

export interface ShopperPose {
  x: number
  z: number
  yaw: number
  moving: boolean
}

export const MARKET_SHOPPER_PREFIX = 'market_shopper_'
export const SHOPPER_SPEED = 1.3
export const SHOPPER_PAUSE_S = 4
const BUYER_GAP = 1.8
const CLOSING_DETOUR = 3

function yawTowards(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

export function crowdPath(stalls: readonly StallSpot[]): CrowdWaypoint[] {
  if (stalls.length === 0) return []
  const spots = stalls.map((s) => ({ x: s.x + Math.sin(s.yaw) * BUYER_GAP, z: s.z + Math.cos(s.yaw) * BUYER_GAP, faceYaw: s.yaw + Math.PI }))
  const cx = spots.reduce((sum, s) => sum + s.x, 0) / spots.length
  const cz = spots.reduce((sum, s) => sum + s.z, 0) / spots.length
  const first = spots[0]!
  const last = spots[spots.length - 1]!
  const mx = (first.x + last.x) / 2
  const mz = (first.z + last.z) / 2
  const away = Math.hypot(mx - cx, mz - cz) || 1
  return [...spots, { x: mx + ((mx - cx) / away) * CLOSING_DETOUR, z: mz + ((mz - cz) / away) * CLOSING_DETOUR, faceYaw: null }]
}

function legLength(path: readonly CrowdWaypoint[], i: number): number {
  const a = path[i]!
  const b = path[(i + 1) % path.length]!
  return Math.hypot(b.x - a.x, b.z - a.z)
}

export function lapSeconds(path: readonly CrowdWaypoint[], speed = SHOPPER_SPEED, pause = SHOPPER_PAUSE_S): number {
  return path.reduce((sum, w, i) => sum + legLength(path, i) / speed + (w.faceYaw === null ? 0 : pause), 0)
}

export function shopperAt(path: readonly CrowdWaypoint[], seconds: number, speed = SHOPPER_SPEED, pause = SHOPPER_PAUSE_S): ShopperPose {
  if (path.length === 0) throw new RangeError('the crowd needs at least one stall')
  const lap = lapSeconds(path, speed, pause)
  let t = ((seconds % lap) + lap) % lap
  for (let i = 0; i < path.length; i++) {
    const here = path[i]!
    if (here.faceYaw !== null) {
      if (t < pause) return { x: here.x, z: here.z, yaw: here.faceYaw, moving: false }
      t -= pause
    }
    const next = path[(i + 1) % path.length]!
    const walk = legLength(path, i) / speed
    if (t < walk) {
      const k = walk === 0 ? 0 : t / walk
      return { x: here.x + (next.x - here.x) * k, z: here.z + (next.z - here.z) * k, yaw: yawTowards(next.x - here.x, next.z - here.z), moving: true }
    }
    t -= walk
  }
  const start = path[0]!
  return { x: start.x, z: start.z, yaw: start.faceYaw ?? 0, moving: false }
}
