import type { Crop, FarmField } from './world/worldManifest'

type Point = { x: number; z: number }

export const PICK_MS = 3000
export const CROP_LABELS: Record<Crop, string> = { corn: 'corn', potato: 'a potato' }

export function fieldAt(fields: readonly FarmField[], at: Point): number | null {
  const index = fields.findIndex((f) => at.x >= f.minX && at.x <= f.maxX && at.z >= f.minZ && at.z <= f.maxZ)
  return index < 0 ? null : index
}
