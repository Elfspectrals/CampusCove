import type { ShopItem } from '../api/itemShop'
import { Rarity } from './rarity'

/**
 * Fishing models that are not for sale yet. They are only injected into the New Nation showroom
 * for admins (see NewNationView), with negative ids so they can never collide with shop items.
 */
const ROOT = '/assets/items'

const FISHING_DEFS: Array<{ kind: 'fish' | 'rods'; key: string; name: string; tier: Rarity }> = [
  { kind: 'fish', key: 'roach', name: 'Gardon', tier: Rarity.Common },
  { kind: 'fish', key: 'perch', name: 'Perche', tier: Rarity.Common },
  { kind: 'fish', key: 'trout', name: 'Truite', tier: Rarity.Rare },
  { kind: 'fish', key: 'koi', name: 'Carpe koï', tier: Rarity.Rare },
  { kind: 'fish', key: 'golden_arowana', name: 'Arowana doré', tier: Rarity.Legendary },
  { kind: 'rods', key: 'wood', name: 'Canne en bois', tier: Rarity.Common },
  { kind: 'rods', key: 'gold', name: 'Canne en or', tier: Rarity.Rare },
  { kind: 'rods', key: 'premium', name: 'Canne premium', tier: Rarity.Legendary },
]

const TIER_BY_ITEM_ID = new Map<number, Rarity>(FISHING_DEFS.map((d, i) => [-(i + 1), d.tier]))

/** Explicit tier of a preview-only item (the shop derives its tiers from price / stored rarity instead). */
export function previewItemRarity(item: ShopItem): Rarity | null {
  return TIER_BY_ITEM_ID.get(item.item_def_id) ?? null
}

export const FISHING_PREVIEW_FILTER = 'fishing'

export function isPreviewOnlyItem(item: ShopItem): boolean {
  return item.item_def_id < 0
}

export const FISHING_PREVIEW_ITEMS: ShopItem[] = FISHING_DEFS.map((d, i) => ({
  item_def_id: -(i + 1),
  shop_catalog_item_id: -(i + 1),
  public_id: `preview-fishing-${d.key}`,
  code: `fishing_${d.kind}_${d.key}`,
  name: d.name,
  description: `Aperçu admin · ${d.kind === 'fish' ? 'poisson' : 'canne à pêche'} (non disponible à la vente)`,
  preview_image: `${ROOT}/${d.kind}/${d.key}/preview.png`,
  model_glb: `${ROOT}/${d.kind}/${d.key}/model.glb`,
  rarity: d.tier === Rarity.Legendary ? 5 : null,
  kind: 'furniture',
  options: [],
}))
