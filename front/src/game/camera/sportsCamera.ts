export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CameraPose {
  position: Vec3
  target: Vec3
  fov: number | null
  pivot: Vec3 | null
}

export type SportsView =
  | { kind: 'follow'; sport: string; optional: boolean; distance: number; lift: number; waterY: number | null }
  | { kind: 'duel'; sport: string; optional: boolean; opponent: { x: number; z: number }; arena: Arena }
  | { kind: 'court'; sport: string; optional: boolean; cx: number; netZ: number; halfLength: number; side: 1 | -1 }
  | { kind: 'stage'; sport: string; optional: boolean; facingYaw: number }
  | { kind: 'broadcast'; sport: string; optional: boolean; court: Arena; focusX: number; focusZ: number; fallback: SportsView | null }

export interface Arena {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface ViewFrame {
  eye: Vec3
  feetY: number
  yaw: number
  pitch: number
  timeS: number
}

export const BODY_SHOWN_FROM = 0.15
const BLEND_PER_S = 8
const BLEND_SNAP = 0.002
const FOLLOW_LOOK_AHEAD_M = 10
const FOLLOW_MIN_ABOVE_FEET_M = 0.35
const WATER_SURFACE_BAND_M = 0.1
const CAMERA_ABOVE_WATER_M = 0.6
const CAMERA_BELOW_WATER_M = 0.3
const DUEL_SHOULDER_RAD = (32 * Math.PI) / 180
const DUEL_BASE_M = 2.0
const DUEL_PER_SEPARATION = 0.7
const DUEL_DISTANCE_M = [2.6, 5.5] as const
const DUEL_HEIGHT_M = 1.9
const DUEL_TARGET_HEIGHT_M = 1.25
const DUEL_FOV = 52
const COURT_BEHIND_BASELINE_M = 16
const COURT_HEIGHT_M = 10
const COURT_FOLLOW_SHARE = 0.2
const COURT_TARGET_INSIDE_BASELINE_M = 2.4
const COURT_FOV = 44
const STAGE_DISTANCE_M = 4.6
const STAGE_HEIGHT_M = 1.35
const STAGE_TARGET_HEIGHT_M = 1.0
const STAGE_SWAY_RAD = (18 * Math.PI) / 180
const STAGE_SWAY_PERIOD_S = 14
const STAGE_FOV = 40
const STAGE_SIDE_SHIFT_M = 1.7
const BROADCAST_BEHIND_LINE_M = 7
const BROADCAST_HEIGHT_M = 8.5
const BROADCAST_TARGET_PAST_LINE_M = 5.8
const BROADCAST_EDGE_M = 9
const BROADCAST_FOV = 46
const BROADCAST_DEPTH_FOLLOW = 0.25
const BROADCAST_LEAD_M = 7

export function blendStep(blend: number, active: boolean, dt: number): number {
  const goal = active ? 1 : 0
  const next = blend + (goal - blend) * (1 - Math.exp(-BLEND_PER_S * dt))
  return Math.abs(goal - next) < BLEND_SNAP ? goal : next
}

export function damp(current: number, goal: number, perS: number, dt: number): number {
  return current + (goal - current) * (1 - Math.exp(-perS * dt))
}

export function lookDirection(yaw: number, pitch: number): Vec3 {
  const flat = Math.cos(pitch)
  return { x: -Math.sin(yaw) * flat, y: Math.sin(pitch), z: -Math.cos(yaw) * flat }
}

export function yawTowards(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

function followPose(view: Extract<SportsView, { kind: 'follow' }>, frame: ViewFrame): CameraPose {
  const forward = lookDirection(frame.yaw, frame.pitch)
  const pivot = { x: frame.eye.x, y: frame.eye.y + view.lift, z: frame.eye.z }
  const position = { x: pivot.x - forward.x * view.distance, y: pivot.y - forward.y * view.distance, z: pivot.z - forward.z * view.distance }
  position.y = Math.max(position.y, frame.feetY + FOLLOW_MIN_ABOVE_FEET_M)
  if (view.waterY !== null) {
    if (frame.eye.y >= view.waterY - WATER_SURFACE_BAND_M) position.y = Math.max(position.y, view.waterY + CAMERA_ABOVE_WATER_M)
    else position.y = Math.min(position.y, view.waterY - CAMERA_BELOW_WATER_M)
  }
  const target = { x: pivot.x + forward.x * FOLLOW_LOOK_AHEAD_M, y: pivot.y + forward.y * FOLLOW_LOOK_AHEAD_M, z: pivot.z + forward.z * FOLLOW_LOOK_AHEAD_M }
  return { position, target, fov: null, pivot }
}

function duelPose(view: Extract<SportsView, { kind: 'duel' }>, frame: ViewFrame): CameraPose {
  const dx = view.opponent.x - frame.eye.x
  const dz = view.opponent.z - frame.eye.z
  const separation = Math.hypot(dx, dz)
  const facing = lookDirection(frame.yaw, 0)
  const ax = separation > 0.01 ? dx / separation : facing.x
  const az = separation > 0.01 ? dz / separation : facing.z
  const cos = Math.cos(DUEL_SHOULDER_RAD)
  const sin = Math.sin(DUEL_SHOULDER_RAD)
  const bx = ax * cos - az * sin
  const bz = ax * sin + az * cos
  const distance = Math.min(DUEL_DISTANCE_M[1], Math.max(DUEL_DISTANCE_M[0], DUEL_BASE_M + separation * DUEL_PER_SEPARATION))
  return {
    position: {
      x: Math.min(view.arena.maxX, Math.max(view.arena.minX, frame.eye.x - bx * distance)),
      y: frame.feetY + DUEL_HEIGHT_M,
      z: Math.min(view.arena.maxZ, Math.max(view.arena.minZ, frame.eye.z - bz * distance)),
    },
    target: { x: frame.eye.x + dx / 2, y: frame.feetY + DUEL_TARGET_HEIGHT_M, z: frame.eye.z + dz / 2 },
    fov: DUEL_FOV,
    pivot: null,
  }
}

function courtPose(view: Extract<SportsView, { kind: 'court' }>, frame: ViewFrame): CameraPose {
  const offset = frame.eye.x - view.cx
  return {
    position: { x: view.cx + offset * COURT_FOLLOW_SHARE, y: frame.feetY + COURT_HEIGHT_M, z: view.netZ + view.side * (view.halfLength + COURT_BEHIND_BASELINE_M) },
    target: { x: view.cx + offset * COURT_FOLLOW_SHARE, y: frame.feetY, z: view.netZ + view.side * (view.halfLength - COURT_TARGET_INSIDE_BASELINE_M) },
    fov: COURT_FOV,
    pivot: null,
  }
}

function stagePose(view: Extract<SportsView, { kind: 'stage' }>, frame: ViewFrame): CameraPose {
  const sway = STAGE_SWAY_RAD * Math.sin((frame.timeS * 2 * Math.PI) / STAGE_SWAY_PERIOD_S)
  const front = lookDirection(view.facingYaw + sway, 0)
  const sideX = front.z * STAGE_SIDE_SHIFT_M
  const sideZ = -front.x * STAGE_SIDE_SHIFT_M
  return {
    position: { x: frame.eye.x + front.x * STAGE_DISTANCE_M + sideX, y: frame.feetY + STAGE_HEIGHT_M, z: frame.eye.z + front.z * STAGE_DISTANCE_M + sideZ },
    target: { x: frame.eye.x + sideX, y: frame.feetY + STAGE_TARGET_HEIGHT_M, z: frame.eye.z + sideZ },
    fov: STAGE_FOV,
    pivot: { x: frame.eye.x, y: frame.feetY + STAGE_TARGET_HEIGHT_M, z: frame.eye.z },
  }
}

function broadcastPose(view: Extract<SportsView, { kind: 'broadcast' }>, frame: ViewFrame): CameraPose {
  const middle = (view.court.minX + view.court.maxX) / 2
  const reach = Math.max(0, (view.court.maxX - view.court.minX) / 2 - BROADCAST_EDGE_M)
  const followed = frame.eye.x + Math.min(BROADCAST_LEAD_M, Math.max(-BROADCAST_LEAD_M, view.focusX - frame.eye.x))
  const x = Math.min(middle + reach, Math.max(middle - reach, followed))
  return {
    position: { x, y: frame.feetY + BROADCAST_HEIGHT_M, z: view.court.minZ - BROADCAST_BEHIND_LINE_M },
    target: { x, y: frame.feetY, z: view.court.minZ + BROADCAST_TARGET_PAST_LINE_M + (Math.min(view.court.maxZ, Math.max(view.court.minZ, view.focusZ)) - view.court.minZ - BROADCAST_TARGET_PAST_LINE_M) * BROADCAST_DEPTH_FOLLOW },
    fov: BROADCAST_FOV,
    pivot: null,
  }
}

export function moveFrameYawFor(view: SportsView): number | null {
  return view.kind === 'broadcast' ? Math.PI : null
}

export function poseFor(view: SportsView, frame: ViewFrame): CameraPose {
  if (view.kind === 'broadcast') return broadcastPose(view, frame)
  if (view.kind === 'follow') return followPose(view, frame)
  if (view.kind === 'duel') return duelPose(view, frame)
  if (view.kind === 'court') return courtPose(view, frame)
  return stagePose(view, frame)
}

export function lockedLookFor(view: SportsView, me: { x: number; z: number }): { yaw: number; pitch: number } | null {
  if (view.kind === 'duel') return { yaw: yawTowards(me, view.opponent), pitch: 0 }
  if (view.kind === 'court') return { yaw: view.side === 1 ? 0 : Math.PI, pitch: 0 }
  if (view.kind === 'stage') return { yaw: view.facingYaw, pitch: 0 }
  return null
}
