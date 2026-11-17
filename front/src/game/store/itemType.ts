import type { ShopItem } from '../../api/itemShop'

/** What an item is, for the store card: its type, and the place or activity it is used for when it has one. */
export interface ItemType {
  label: string
  use: string | null
}

/** Items made for one place or activity (`docs/TOOLS.md`, `docs/LOCKPICK.md`). */
const USES: Readonly<Record<string, string>> = {
  tool_secateurs: 'Orchard: picks an apple in 2 s instead of 3',
  tool_lockpick: 'Picking house door locks',
  tool_reinforced_lock: 'Your house door: 5 pins instead of 3',
  decor_alarm: 'Your house: goes off on a break-in',
  tool_crowbar: 'Melee weapon',
  tool_hammer: 'Melee weapon',
  tool_wrench: 'Melee weapon',
  gear_swimsuit: 'Pool: needed to swim and dive',
  gear_boxing_gloves: 'Boxing hall: needed in the ring and on the bags',
  gear_boules: 'Pétanque pistes: needed to play',
  gear_tennis_racket: 'Tennis courts: needed to play',
  gear_running_spikes: 'Athletics track: needed to race',
  gear_ice_skates: 'Ice rink: needed to skate',
}

function kindLabel(item: Pick<ShopItem, 'kind' | 'code' | 'food'>): string {
  switch (item.kind) {
    case 'cosmetic':
      return 'Clothing'
    case 'consumable':
      if (item.code.startsWith('med_')) return 'Care'
      return item.food && item.food.thirst > item.food.hunger ? 'Drink' : 'Food'
    case 'furniture':
    case 'apartment_asset':
      return 'Furniture'
    case 'tool':
      return 'Tool'
    case 'sports_gear':
      return 'Sports gear'
    case 'misc':
      return 'Item'
  }
}

export function itemType(item: Pick<ShopItem, 'kind' | 'code' | 'food'>): ItemType {
  return { label: kindLabel(item), use: USES[item.code] ?? null }
}
