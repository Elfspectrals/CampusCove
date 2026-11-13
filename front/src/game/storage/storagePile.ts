import { seededRandom } from '../crops/crops.ts'

export const UNIT_WIDTH = 4
export const UNIT_DEPTH = 4
export const DOOR_CLEARANCE = 0.5
const PILE_GAP = 0.08
const MAX_STACK_SHOWN = 3
const UNCOVERED_MAX = 2

export interface PileItem {
  code: string
  quantity: number
  size: { w: number; d: number; h: number }
}

export interface PilePlacement {
  code: string
  x: number
  y: number
  z: number
  yaw: number
  height: number
  covered: boolean
}

export function uncoveredCount(items: number): number {
  return Math.min(UNCOVERED_MAX, items)
}

export function pileLayout(items: readonly PileItem[], seed: string): PilePlacement[] {
  const random = seededRandom(seed)
  const order = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => b.item.size.w * b.item.size.d - a.item.size.w * a.item.size.d || a.index - b.index)
  const singles = order.filter(({ item }) => item.quantity === 1).map(({ index }) => index)
  const uncovered = new Set<number>()
  while (uncovered.size < uncoveredCount(singles.length)) uncovered.add(singles[Math.floor(random() * singles.length)]!)
  const maxZ = UNIT_DEPTH - DOOR_CLEARANCE
  const placements: PilePlacement[] = []
  let layer = 0
  let layerBase = 0
  let layerTop = 0
  let rowZ = 0
  let rowDepth = 0
  let cursorX = 0
  for (const { item, index } of order) {
    const height = item.size.h * Math.min(item.quantity, MAX_STACK_SHOWN)
    const w = Math.min(item.size.w, UNIT_WIDTH)
    const d = Math.min(item.size.d, maxZ)
    if (cursorX + w > UNIT_WIDTH + PILE_GAP) {
      rowZ += rowDepth + PILE_GAP
      rowDepth = 0
      cursorX = 0
    }
    if (rowZ + d > maxZ) {
      layer += 1
      layerBase = layerTop
      rowZ = 0
      rowDepth = 0
      cursorX = 0
    }
    const jitter = (random() - 0.5) * 0.1
    placements.push({
      code: item.code,
      x: cursorX + w / 2 - UNIT_WIDTH / 2,
      y: layerBase,
      z: rowZ + d / 2,
      yaw: (random() - 0.5) * 0.3 + jitter,
      height,
      covered: !uncovered.has(index),
    })
    cursorX += w + PILE_GAP
    rowDepth = Math.max(rowDepth, d)
    layerTop = Math.max(layerTop, layerBase + height)
  }
  return placements
}
