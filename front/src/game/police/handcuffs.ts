import type { JailCellLayout } from './jailCell'
import type { Position } from './policeStation'

export const CUFF_PROMPT_REACH = 1.8
export const CELL_DOOR_PROMPT_REACH = 1.8
export const CUFF_HOLD_MS = 2000
const HEIGHT_REACH = 2

export interface CuffCandidate {
  sessionId: string
  x: number
  z: number
}

function groundDistance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

export function nearestCuffTarget(at: Position, candidates: readonly CuffCandidate[]): string | null {
  let best: CuffCandidate | null = null
  for (const candidate of candidates) {
    const distance = groundDistance(at, candidate)
    if (distance <= CUFF_PROMPT_REACH && (!best || distance < groundDistance(at, best))) best = candidate
  }
  return best?.sessionId ?? null
}

export function cellAtDoor(cells: readonly JailCellLayout[], at: Position): JailCellLayout | null {
  let best: JailCellLayout | null = null
  let bestDistance = Infinity
  for (const cell of cells) {
    const [x, y, z] = cell.door
    const distance = groundDistance(at, { x, z })
    if (distance <= CELL_DOOR_PROMPT_REACH && Math.abs(y - at.y) <= HEIGHT_REACH && distance < bestDistance) {
      best = cell
      bestDistance = distance
    }
  }
  return best
}

export function someoneInside(cell: JailCellLayout, positions: readonly { x: number; z: number }[]): boolean {
  const { minX, maxX, minZ, maxZ } = cell.bounds
  return positions.some(({ x, z }) => x >= minX && x <= maxX && z >= minZ && z <= maxZ)
}
