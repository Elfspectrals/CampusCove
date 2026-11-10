import { seededRandom } from '../crops/crops.ts'
import type { ShelfProp, Vec3 } from '../mallTemplates/mallTemplate.ts'

export const SHELF_TYPES = ['gondola', 'wall', 'fridge', 'chiller'] as const
export type ShelfType = (typeof SHELF_TYPES)[number]
export const SHELF_ARRANGES = ['rows', 'messy', 'stack', 'front'] as const
export type ShelfArrange = (typeof SHELF_ARRANGES)[number]
export const MIN_SHELF_LENGTH = 1
export const MAX_SHELF_LENGTH = 6
export const MAX_SHELF_SLOTS = 8
export const MAX_SLOT_COPIES = 48
export const SHELF_KIT = {
  upright: 'shelf_kit/upright',
  board: 'shelf_kit/board',
  back: 'shelf_kit/back',
  fridge: 'shelf_kit/fridge',
  door: 'shelf_kit/door',
  tub: 'shelf_kit/tub',
} as const

const UNIT = 1
const UPRIGHT = 0.04
const BOARD = 0.03
const BACK = 0.03
const DOOR = 0.03
const TUB_WALL = 0.05
const CLEARANCE = 0.03
const SLOT_GAP = 0.02
const COPY_GAP = 0.01
const TAG_DROP = 0.01
const TAG_AHEAD = 0.004
const MESSY_SHIFT = 0.25
const MESSY_TURN = 0.6
const KNOCKED_CHANCE = 1 / 6
const EPS = 1e-6

interface ShelfBuild {
  faces: 1 | 2
  depth: number
  height: number
  floor: number
  ceiling: number
  maxLevels: number
  faceBack: number
  faceFront: number
}

const BUILDS: Record<ShelfType, ShelfBuild> = {
  gondola: { faces: 2, depth: 0.9, height: 1.6, floor: 0.12, ceiling: 1.6, maxLevels: 6, faceBack: BACK / 2, faceFront: 0.45 },
  wall: { faces: 1, depth: 0.45, height: 1.9, floor: 0.12, ceiling: 1.9, maxLevels: 6, faceBack: -0.225 + BACK, faceFront: 0.225 },
  fridge: { faces: 1, depth: 0.75, height: 2.1, floor: 0.15, ceiling: 1.95, maxLevels: 6, faceBack: -0.325, faceFront: 0.375 - DOOR - 0.02 },
  chiller: { faces: 1, depth: 0.9, height: 0.85, floor: 0.4, ceiling: 0.85, maxLevels: 1, faceBack: -0.45 + TUB_WALL, faceFront: 0.45 - TUB_WALL },
}

type ShelfShape = Pick<ShelfProp, 'shelf' | 'length' | 'levels' | 'slots'>

export interface KitPiece {
  key: string
  position: Vec3
  yaw: number
  scale: Vec3
}

export interface ShelfUnit {
  center: Vec3
  size: Vec3
}

export interface SlotBox {
  key: string
  center: Vec3
  size: Vec3
  yaw: number
}

export interface SlotCopy {
  position: Vec3
  yaw: number
  tipped: boolean
}

export function shelfFaces(type: ShelfType): number {
  return BUILDS[type].faces
}

export function shelfMaxLevels(type: ShelfType): number {
  return BUILDS[type].maxLevels
}

export function slotKey(face: number, level: number, slot: number): string {
  return `${face}.${level}.${slot}`
}

function faceYaw(face: number): number {
  return face === 0 ? 0 : Math.PI
}

function turned([x, y, z]: Vec3, yaw: number): Vec3 {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return [x * cos + z * sin, y, -x * sin + z * cos]
}

function unitXs(length: number): number[] {
  return Array.from({ length: Math.round(length / UNIT) }, (_, i) => -length / 2 + UNIT * (i + 0.5))
}

function levelFloor(shape: ShelfShape, level: number): number {
  const build = BUILDS[shape.shelf]
  return build.floor + ((build.ceiling - build.floor) / shape.levels) * level
}

export function shelfUnits(shape: ShelfShape): ShelfUnit[] {
  const { depth, height } = BUILDS[shape.shelf]
  return unitXs(shape.length).map((x) => ({ center: [x, height / 2, 0], size: [UNIT, height, depth] }))
}

function unitShell(shape: ShelfShape, x: number): KitPiece[] {
  const { depth, height, floor } = BUILDS[shape.shelf]
  if (shape.shelf === 'gondola') return [{ key: SHELF_KIT.back, position: [x, 0, 0], yaw: 0, scale: [1, height, 1] }]
  if (shape.shelf === 'wall') return [{ key: SHELF_KIT.back, position: [x, 0, -depth / 2 + BACK / 2], yaw: 0, scale: [1, height, 1] }]
  if (shape.shelf === 'fridge') {
    return [
      { key: SHELF_KIT.fridge, position: [x, 0, 0], yaw: 0, scale: [1, 1, 1] },
      { key: SHELF_KIT.door, position: [x, floor, depth / 2 - DOOR / 2], yaw: 0, scale: [1, 1, 1] },
    ]
  }
  return [{ key: SHELF_KIT.tub, position: [x, 0, 0], yaw: 0, scale: [1, 1, 1] }]
}

function unitBoards(shape: ShelfShape, x: number): KitPiece[] {
  if (shape.shelf === 'chiller') return []
  const { faces, faceBack, faceFront } = BUILDS[shape.shelf]
  const pieces: KitPiece[] = []
  for (let face = 0; face < faces; face++) {
    for (let level = 0; level < shape.levels; level++) {
      const yaw = faceYaw(face)
      pieces.push({ key: SHELF_KIT.board, position: [x, levelFloor(shape, level) - BOARD, ((faceBack + faceFront) / 2) * Math.cos(yaw)], yaw, scale: [1, 1, faceFront - faceBack] })
    }
  }
  return pieces
}

export function shelfPieces(shape: ShelfShape): KitPiece[] {
  const { depth, height } = BUILDS[shape.shelf]
  const ends = [-1, 1].map((side): KitPiece => ({ key: SHELF_KIT.upright, position: [side * (shape.length / 2 - UPRIGHT / 2), 0, 0], yaw: 0, scale: [1, height, depth] }))
  return [...ends, ...unitXs(shape.length).flatMap((x) => [...unitShell(shape, x), ...unitBoards(shape, x)])]
}

export function slotBoxes(shape: ShelfShape): SlotBox[] {
  const { faces, faceBack, faceFront } = BUILDS[shape.shelf]
  const usable = shape.length - 2 * UPRIGHT
  const pitch = usable / shape.slots
  const height = levelFloor(shape, 1) - levelFloor(shape, 0) - BOARD - CLEARANCE
  const boxes: SlotBox[] = []
  for (let face = 0; face < faces; face++) {
    for (let level = 0; level < shape.levels; level++) {
      for (let slot = 0; slot < shape.slots; slot++) {
        const yaw = faceYaw(face)
        const local: Vec3 = [-usable / 2 + pitch * (slot + 0.5), levelFloor(shape, level) + height / 2, (faceBack + faceFront) / 2]
        boxes.push({ key: slotKey(face, level, slot), center: turned(local, yaw), size: [pitch - SLOT_GAP, height, faceFront - faceBack], yaw })
      }
    }
  }
  return boxes
}

export function slotTag(shape: ShelfShape, box: SlotBox): { position: Vec3; yaw: number } {
  const { faceFront, ceiling } = BUILDS[shape.shelf]
  const along = turned(box.center, -box.yaw)[0]
  const local: Vec3 = shape.shelf === 'chiller'
    ? [along, ceiling - TUB_WALL, faceFront + TUB_WALL + TAG_AHEAD]
    : [along, box.center[1] - box.size[1] / 2 - TAG_DROP, faceFront + TAG_AHEAD]
  return { position: turned(local, box.yaw), yaw: box.yaw }
}

function across(span: number, size: number): number {
  return Math.max(0, Math.floor((span + COPY_GAP + EPS) / (size + COPY_GAP)))
}

function pyramid(base: number, layers: number): number {
  let total = 0
  for (let layer = 0; layer < Math.min(base, layers); layer++) total += base - layer
  return total
}

interface Grid {
  columns: number
  rows: number
  layers: number
}

function gridOf(box: Vec3, size: Vec3): Grid {
  const [width, height, depth] = box
  const [w, h, d] = size
  if (h > height + EPS) return { columns: 0, rows: 0, layers: 0 }
  return { columns: across(width, w), rows: across(depth, d), layers: Math.floor((height + EPS) / h) }
}

export function slotCapacity(box: Vec3, size: Vec3, arrange: ShelfArrange): number {
  const { columns, rows, layers } = gridOf(box, size)
  const fit = arrange === 'front' ? columns : arrange === 'stack' ? rows * pyramid(columns, layers) : columns * rows
  return Math.min(fit, MAX_SLOT_COPIES)
}

function frontRowZ(box: Vec3, size: Vec3, row: number): number {
  return box[2] / 2 - size[2] / 2 - row * (size[2] + COPY_GAP)
}

function rowCopies(box: Vec3, size: Vec3, count: number): SlotCopy[] {
  const { columns } = gridOf(box, size)
  return Array.from({ length: count }, (_, i) => ({
    position: [(i % columns - (columns - 1) / 2) * (size[0] + COPY_GAP), 0, frontRowZ(box, size, Math.floor(i / columns))],
    yaw: 0,
    tipped: false,
  }))
}

function frontCopies(box: Vec3, size: Vec3, count: number): SlotCopy[] {
  return Array.from({ length: count }, (_, i) => ({ position: [(i - (count - 1) / 2) * (size[0] + COPY_GAP), 0, frontRowZ(box, size, 0)], yaw: 0, tipped: false }))
}

function stackCopies(box: Vec3, size: Vec3, count: number): SlotCopy[] {
  const { columns, layers } = gridOf(box, size)
  const perRow = pyramid(columns, layers)
  const copies: SlotCopy[] = []
  for (let row = 0; row * perRow < count; row++) {
    const inRow = Math.min(perRow, count - row * perRow)
    let base = 1
    while (pyramid(base, layers) < inRow) base++
    let left = inRow
    for (let layer = 0; left > 0; layer++) {
      const spots = base - layer
      const here = Math.min(spots, left)
      const start = Math.floor((spots - here) / 2)
      for (let j = start; j < start + here; j++) copies.push({ position: [(j - (spots - 1) / 2) * (size[0] + COPY_GAP), layer * size[1], frontRowZ(box, size, row)], yaw: 0, tipped: false })
      left -= here
    }
  }
  return copies
}

function footprint(size: Vec3, yaw: number, tipped: boolean): [number, number] {
  const a = (tipped ? size[1] : size[0]) / 2
  const b = size[2] / 2
  const cos = Math.abs(Math.cos(yaw))
  const sin = Math.abs(Math.sin(yaw))
  return [cos * a + sin * b, sin * a + cos * b]
}

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value))
}

function messyCopies(box: Vec3, size: Vec3, count: number, seed: string): SlotCopy[] {
  const random = seededRandom(seed)
  const [width, height, depth] = box
  const fits = (yaw: number, tipped: boolean) => {
    const [ex, ez] = footprint(size, yaw, tipped)
    return ex <= width / 2 + EPS && ez <= depth / 2 + EPS && (!tipped || size[0] <= height + EPS)
  }
  return rowCopies(box, size, count).map(({ position: [x, , z] }) => {
    const shiftX = (random() * 2 - 1) * MESSY_SHIFT * (size[0] + COPY_GAP)
    const shiftZ = (random() * 2 - 1) * MESSY_SHIFT * (size[2] + COPY_GAP)
    let yaw = (random() * 2 - 1) * MESSY_TURN
    let tipped = random() < KNOCKED_CHANCE && fits(0, true)
    if (!fits(yaw, tipped)) yaw = 0
    if (!fits(yaw, tipped)) tipped = false
    const [ex, ez] = footprint(size, yaw, tipped)
    const cx = clamp(x + shiftX, width / 2 - ex)
    const cz = clamp(z + shiftZ, depth / 2 - ez)
    if (!tipped) return { position: [cx, 0, cz], yaw, tipped }
    const lie = size[1] / 2
    return { position: [cx + lie * Math.cos(yaw), size[0] / 2, cz - lie * Math.sin(yaw)], yaw, tipped }
  })
}

export function slotCopies(box: Vec3, size: Vec3, count: number, arrange: ShelfArrange, seed: string): SlotCopy[] {
  const capacity = slotCapacity(box, size, arrange)
  if (capacity === 0) throw new RangeError('the item is too big for this slot')
  if (!Number.isInteger(count) || count < 1 || count > capacity) throw new RangeError(`${count} copies do not fit, the slot holds 1 to ${capacity} in ${arrange}`)
  if (arrange === 'front') return frontCopies(box, size, count)
  if (arrange === 'stack') return stackCopies(box, size, count)
  if (arrange === 'messy') return messyCopies(box, size, count, seed)
  return rowCopies(box, size, count)
}

export function lighterStock<P extends Pick<ShelfProp, 'fill'>>(shelf: P): P {
  return { ...shelf, fill: Object.fromEntries(Object.entries(shelf.fill).map(([key, slot]) => [key, { ...slot, count: Math.ceil(slot.count / 2) }])) }
}
