export type BusId = 'A' | 'B'

export type XZ = [number, number]

export interface BusStopSideLayout {
  stand: XZ
  boarding: XZ
  pole: XZ
  shelter: { center: XZ; rot: number } | null
}

export interface BusStopLayout {
  id: string
  name: string
  A: BusStopSideLayout
  B: BusStopSideLayout
  existing?: boolean
}

export interface BusLineLayout {
  modelUrl: string
  busModelUrl: string
  floorY: number
  buses: Record<BusId, { route: XZ[] }>
  stops: BusStopLayout[]
}

export interface BusSnapshot {
  id: BusId
  x: number
  z: number
  yaw: number
  stop: string | null
  departsInMs: number
  next: string
  riders: number
}

export interface BusSyncPayload {
  buses: BusSnapshot[]
}

export interface BusPose {
  x: number
  z: number
  yaw: number
}

export const BUS_RENDER_DELAY_MS = 250
export const BUS_PROMPT_REACH = 3.5

interface Timed {
  at: number
  pose: BusPose
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

export function createBusTrack() {
  const samples: Timed[] = []

  function push(at: number, pose: BusPose): void {
    samples.push({ at, pose })
    while (samples.length > 8) samples.shift()
  }

  function poseAt(now: number): BusPose | null {
    if (samples.length === 0) return null
    const target = now - BUS_RENDER_DELAY_MS
    const first = samples[0]!
    if (target <= first.at) return first.pose
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]!
      const b = samples[i]!
      if (target <= b.at) {
        const t = b.at > a.at ? (target - a.at) / (b.at - a.at) : 1
        return { x: a.pose.x + (b.pose.x - a.pose.x) * t, z: a.pose.z + (b.pose.z - a.pose.z) * t, yaw: lerpAngle(a.pose.yaw, b.pose.yaw, t) }
      }
    }
    return samples[samples.length - 1]!.pose
  }

  return { push, poseAt }
}

export function inBusFrame(pose: BusPose, local: XZ): { x: number; z: number } {
  const [lx, lz] = local
  const cos = Math.cos(pose.yaw)
  const sin = Math.sin(pose.yaw)
  return { x: pose.x + lx * cos + lz * sin, z: pose.z - lx * sin + lz * cos }
}

export function stopName(stops: readonly BusStopLayout[], id: string | null): string {
  return stops.find((stop) => stop.id === id)?.name ?? ''
}

export interface BoardableBus {
  bus: BusSnapshot
  door: XZ
}

export function boardableBus(buses: readonly BusSnapshot[], stops: readonly BusStopLayout[], me: { x: number; z: number }): BoardableBus | null {
  let best: (BoardableBus & { d: number }) | null = null
  for (const bus of buses) {
    if (bus.stop === null) continue
    const stop = stops.find((s) => s.id === bus.stop)
    if (!stop) continue
    const door = stop[bus.id].boarding
    const d = Math.hypot(door[0] - me.x, door[1] - me.z)
    if (d <= BUS_PROMPT_REACH && (!best || d < best.d)) best = { bus, door, d }
  }
  return best && { bus: best.bus, door: best.door }
}
