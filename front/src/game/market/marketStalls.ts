import type { Vec3 } from '../mallTemplates/mallTemplate.ts'
import { slotCapacity } from '../shelves/shelves.ts'
import type { MarketLotContainer, MarketLotView, MarketSnapshot } from '../../types/gameRealtime.ts'

const LOTS_PER_STALL = 6
export const MARKET_ZONE = 'town_market'
export const MARKET_MUSIC_URL = '/assets/music/town_market.mp3'
const LOT_AIM_HEIGHT = 0.12

export const STALL_MODELS = { folded: 'market_stall_folded', free: 'market_stall_free', taken: 'market_stall_taken' } as const
type StallState = keyof typeof STALL_MODELS
export const CONTAINER_MODELS: Record<Exclude<MarketLotContainer, 'flat'>, string> = { crate: 'market_crate', basket: 'market_basket' }
export const MAX_COPIES_SHOWN = 8
const TABLE_TOP = 0.85
const SLOT_PITCH = 0.5
const FIRST_SLOT_X = -1.25

interface CopiesSpace {
  /** Height the copies stand on, from the table top. */
  floor: number
  /** Height of the container's rim: an item too big to go in sits on it. */
  top: number
  box: Vec3
}

// The basket model is a closed heap, so its copies lie on the heap instead of inside it.
const COPIES_SPACE: Record<MarketLotContainer, CopiesSpace> = {
  crate: { floor: 0.02, top: 0.18, box: [0.4, 0.35, 0.3] },
  basket: { floor: 0.13, top: 0.13, box: [0.22, 0.3, 0.22] },
  flat: { floor: 0, top: 0, box: [0.46, 0.3, 0.6] },
}

export interface StallLook {
  state: StallState
  canopy: string | null
  lots: MarketLotView[]
}

export function stallLook(market: MarketSnapshot | null, stallNo: number): StallLook {
  if (market === null || !market.open) return { state: 'folded', canopy: null, lots: [] }
  const stall = market.stalls.find((s) => s.stall_no === stallNo)
  if (!stall) return { state: 'free', canopy: null, lots: [] }
  return { state: 'taken', canopy: stall.canopy, lots: stall.lots }
}

export function stallLookKey(look: StallLook): string {
  return JSON.stringify([look.state, look.canopy, look.lots.map((l) => [l.lot_id, l.slot, l.model_glb, l.container, copiesShown(l.quantity)])])
}

export function slotOrigin(slot: number): Vec3 {
  return [FIRST_SLOT_X + (slot - 1) * SLOT_PITCH, TABLE_TOP, 0]
}

export function copiesShown(quantity: number): number {
  return Math.min(quantity, MAX_COPIES_SHOWN)
}

export function copiesSpace(container: MarketLotContainer): CopiesSpace {
  return COPIES_SPACE[container]
}

/** Where the copies stand: in the container, or on its rim when the item is too big to go in. */
export function copiesFloor(container: MarketLotContainer, fitting: number): number {
  const space = COPIES_SPACE[container]
  return fitting > 0 ? space.floor : space.top
}

export function copiesThatFit(container: MarketLotContainer, itemSize: Vec3, quantity: number): number {
  return Math.min(copiesShown(quantity), slotCapacity(COPIES_SPACE[container].box, itemSize, 'messy'))
}

export function lotAimPoint(slot: number): Vec3 {
  const [x, y, z] = slotOrigin(slot)
  return [x, y + LOT_AIM_HEIGHT, z]
}

export function ownStallNo(market: MarketSnapshot | null, accountId: number | null): number | null {
  if (market === null || !market.open || accountId === null) return null
  return market.stalls.find((s) => s.account_id === accountId)?.stall_no ?? null
}

export function firstFreeSlot(lots: readonly MarketLotView[]): number | null {
  for (let slot = 1; slot <= LOTS_PER_STALL; slot++) if (!lots.some((l) => l.slot === slot)) return slot
  return null
}
