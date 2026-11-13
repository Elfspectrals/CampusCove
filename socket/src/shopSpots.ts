// Where shopper NPCs stand in a shop zone (docs/NPC_BEHAVIOR.md): in front of each shelf slot that holds goods,
// and in line at the clerk's checkout. Read from zones/<zone>.json.
import type { Json } from './backend.ts'
import type { Vec3Tuple } from './npcBehavior.ts'

/** Shelf depths and faces: mirrors of BUILDS in front/src/game/shelves/shelves.ts. */
const SHELF_DEPTH: Record<string, number> = { gondola: 0.9, wall: 0.45, fridge: 0.75, chiller: 0.9 }
const SHELF_FACES: Record<string, number> = { gondola: 2 }
const UPRIGHT = 0.04
/** How far in front of a shelf a shopper stands. */
export const SHELF_STAND = 0.5
/** Mirrors COUNTER_REACH_AHEAD in front/src/game/mallTemplates/mallTemplate.ts: the counter is this far ahead of the clerk. */
const COUNTER_AHEAD = 2
/** A paying shopper stands this far past the counter; the next ones line up behind, this far apart. */
export const CHECKOUT_STAND = 0.6
export const QUEUE_GAP = 0.9

export interface ShelfItem {
  code: string
  key: string
}

export interface ShelfSpot {
  stand: Vec3Tuple
  /** The middle of the slot, to face it. */
  look: Vec3Tuple
  items: ShelfItem[]
}

export interface CheckoutSpot {
  /** Where the first in line pays, and the clerk to face. */
  stand: Vec3Tuple
  clerk: Vec3Tuple
  /** Unit step on the ground from one place in line to the next. */
  queue: [number, number]
}

export interface ShopLayout {
  spots: ShelfSpot[]
  checkout: CheckoutSpot | null
}

/** Same turn as the front's `turned` and three.js rotation.y. */
function turned([x, y, z]: Vec3Tuple, yaw: number): Vec3Tuple {
  const cos = Math.cos(yaw)
  const sin = Math.sin(yaw)
  return [x * cos + z * sin, y, -x * sin + z * cos]
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vec3(value: unknown): Vec3Tuple | null {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite) ? [value[0], value[1], value[2]] : null
}

function shelfSpots(shelf: Json): ShelfSpot[] {
  const depth = SHELF_DEPTH[shelf.shelf]
  const position = vec3(shelf.position)
  const slots = Number(shelf.slots)
  const length = Number(shelf.length)
  if (!depth || !position || !(slots >= 1) || !(length > 0) || typeof shelf.fill !== 'object' || shelf.fill === null) return []
  const yaw = Number.isFinite(shelf.yaw) ? shelf.yaw : 0
  const usable = length - 2 * UPRIGHT
  const spots: ShelfSpot[] = []
  for (let face = 0; face < (SHELF_FACES[shelf.shelf] ?? 1); face++) {
    for (let slot = 0; slot < slots; slot++) {
      const items = Object.entries(shelf.fill as Record<string, Json>)
        .filter(([key]) => key.startsWith(`${face}.`) && key.endsWith(`.${slot}`))
        .map(([, f]) => f)
        .filter((f) => typeof f?.code === 'string' && typeof f?.key === 'string')
        .map((f) => ({ code: f.code as string, key: f.key as string }))
      if (items.length === 0) continue
      const x = -usable / 2 + (usable / slots) * (slot + 0.5)
      const faceYaw = face === 0 ? 0 : Math.PI
      const at = (ahead: number): Vec3Tuple => add(position, turned(turned([x, 0, ahead], faceYaw), yaw))
      spots.push({ stand: at(depth / 2 + SHELF_STAND), look: at(0), items })
    }
  }
  return spots
}

function checkoutOf(decor: Json): CheckoutSpot | null {
  const area = (Array.isArray(decor.areas) ? decor.areas : []).find((a: Json) => a?.role === 'seller')
  const clerk = area && (decor.props as Json[]).find((p) => p?.kind === 'npc' && p.id === area.npc)
  const at = clerk && vec3(clerk.position)
  if (!at) return null
  const yaw = Number.isFinite(clerk.yaw) ? clerk.yaw : 0
  const forward: [number, number] = [Math.sin(yaw), Math.cos(yaw)]
  const stand: Vec3Tuple = [at[0] + forward[0] * (COUNTER_AHEAD + CHECKOUT_STAND), at[1], at[2] + forward[1] * (COUNTER_AHEAD + CHECKOUT_STAND)]
  // the line runs across the counter, towards the middle of the shop
  const b = area.bounds
  const middle = b ? [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2] : [stand[0], stand[2]]
  const side: [number, number] = [forward[1], -forward[0]]
  const towards = side[0] * (middle[0]! - stand[0]) + side[1] * (middle[1]! - stand[2]) >= 0 ? 1 : -1
  return { stand, clerk: at, queue: [side[0] * towards, side[1] * towards] }
}

export function shopLayout(decor: Json): ShopLayout {
  const props: Json[] = Array.isArray(decor?.props) ? decor.props : []
  return { spots: props.filter((p) => p?.kind === 'shelf').flatMap(shelfSpots), checkout: checkoutOf(decor) }
}

/** The shoppers waiting at one checkout, first to pay first. */
export class CheckoutLine {
  private readonly line: string[] = []

  /** Joins at the back (once); returns the place in line, 0 pays. */
  join(id: string): number {
    if (!this.line.includes(id)) this.line.push(id)
    return this.line.indexOf(id)
  }

  placeOf(id: string): number {
    return this.line.indexOf(id)
  }

  leave(id: string): void {
    const i = this.line.indexOf(id)
    if (i >= 0) this.line.splice(i, 1)
  }
}

export function queueSpot(checkout: CheckoutSpot, place: number): Vec3Tuple {
  const [dx, dz] = checkout.queue
  return [checkout.stand[0] + dx * QUEUE_GAP * place, checkout.stand[1], checkout.stand[2] + dz * QUEUE_GAP * place]
}
