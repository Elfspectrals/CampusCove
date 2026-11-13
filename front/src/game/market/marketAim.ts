import type { Vec3 } from '../mallTemplates/mallTemplate.ts'

type Point = { x: number; y: number; z: number }

export interface AimTarget<T> {
  point: Vec3
  value: T
}

export function aimedTarget<T>(eye: Point, forward: Point, targets: readonly AimTarget<T>[], reach: number, maxAngle: number): T | null {
  const facing = Math.hypot(forward.x, forward.y, forward.z)
  let best: { angle: number; value: T } | null = null
  for (const { point: [x, y, z], value } of targets) {
    const dx = x - eye.x
    const dy = y - eye.y
    const dz = z - eye.z
    if (Math.hypot(dx, dz) > reach) continue
    const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / (Math.hypot(dx, dy, dz) * facing)
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)))
    if (angle <= maxAngle && (best === null || angle < best.angle)) best = { angle, value }
  }
  return best?.value ?? null
}
