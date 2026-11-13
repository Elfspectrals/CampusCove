type Vec3 = [number, number, number]

export interface JailCellLayout {
  id: string
  position: Vec3
  door: Vec3
  tap: Vec3
  hatch: Vec3
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

export const MEAL_TRAY_REACH = 2.0
const TRAY_INSET = 0.12
const TRAY_TOP = 0.025

export function inCellReach(cell: JailCellLayout, point: Vec3, x: number, z: number, reach: number): boolean {
  const { minX, maxX, minZ, maxZ } = cell.bounds
  const inside = x >= minX && x <= maxX && z >= minZ && z <= maxZ
  return inside && Math.hypot(point[0] - x, point[2] - z) <= reach
}

export function trayFoodPosition(cell: JailCellLayout): Vec3 {
  const [hx, hy, hz] = cell.hatch
  const barsX = cell.door[0] - hx
  const barsZ = cell.door[2] - hz
  const length = Math.hypot(barsX, barsZ)
  let normalX = -barsZ / length
  let normalZ = barsX / length
  if (normalX * (cell.position[0] - hx) + normalZ * (cell.position[2] - hz) < 0) {
    normalX = -normalX
    normalZ = -normalZ
  }
  return [hx + normalX * TRAY_INSET, hy + TRAY_TOP, hz + normalZ * TRAY_INSET]
}
