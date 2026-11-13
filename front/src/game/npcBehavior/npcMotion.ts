/** Where a socket-driven NPC stands `elapsedMs` after its last `npc_state` (docs/NPC_BEHAVIOR.md). */
export interface NpcMotion {
  x: number
  y: number
  z: number
  move: { x: number; y: number; z: number; ms: number } | null
}

export interface NpcPose {
  x: number
  y: number
  z: number
  /** Ground speed in m/s, for the Idle / Walk / Run pick. */
  speed: number
}

export function npcPoseAt(state: NpcMotion, elapsedMs: number): NpcPose {
  const { move } = state
  if (!move || move.ms <= 0) return { x: move?.x ?? state.x, y: move?.y ?? state.y, z: move?.z ?? state.z, speed: 0 }
  const t = Math.min(1, Math.max(0, elapsedMs / move.ms))
  const lerp = (a: number, b: number) => a + (b - a) * t
  const speed = t < 1 ? Math.hypot(move.x - state.x, move.z - state.z) / (move.ms / 1000) : 0
  return { x: lerp(state.x, move.x), y: lerp(state.y, move.y), z: lerp(state.z, move.z), speed }
}

/** Turns `from` towards `to` by at most `maxStep` radians, the short way round. */
export function turnTowards(from: number, to: number, maxStep: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  return Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep
}
