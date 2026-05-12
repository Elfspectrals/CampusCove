/** Numeric tiers sent to the API (SMALLINT); labels are for admins only. */
export const RARITY_PRESET_OPTIONS: readonly { value: number; label: string }[] = [
  { value: 0, label: 'Common' },
  { value: 1, label: 'Uncommon' },
  { value: 2, label: 'Rare' },
  { value: 3, label: 'Epic' },
  { value: 4, label: 'Legendary' },
]

export type ItemKind = 'furniture' | 'cosmetic' | 'consumable' | 'misc' | 'apartment_asset'
export type CosmeticSlot = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory'
export type BindMode = 'none' | 'bind_on_equip' | 'bind_on_place' | 'bound'
export type DeletedFilter = 'all' | 'active' | 'deleted'
export type BulkAction = 'publish' | 'unpublish' | 'activate' | 'deactivate' | 'soft_delete' | 'restore'
export type SortBy = 'name' | 'code' | 'kind' | 'price' | 'is_active' | 'is_published' | 'sort_order'

export interface ShopFormState {
  code: string
  name: string
  kind: ItemKind
  /** Not shown in the skin form; preserved on edit, default for new skins. */
  cosmetic_slot: CosmeticSlot | null
  rarity: number
  tradable: boolean
  premium_only: boolean
  /** Not shown; preserved on edit. */
  bind: BindMode
  /** Not shown; preserved on edit. */
  max_stack: number
  preview_image: string
  model_glb: string
  coins_price: number | null
  premium_price: number | null
  is_active: boolean
  is_published: boolean
  is_unique_per_account: boolean
  stock_remaining: number | null
  /** Not shown; preserved on edit. */
  sort_order: number
  previewImageFile: File | null
  modelGlbFile: File | null
}

export const ITEM_KIND_OPTIONS: readonly ItemKind[] = ['apartment_asset', 'furniture', 'consumable', 'misc']

export function newShopFormState(skinSection = true): ShopFormState {
  return {
    code: '',
    name: '',
    kind: skinSection ? 'cosmetic' : 'apartment_asset',
    cosmetic_slot: skinSection ? 'body' : null,
    rarity: 0,
    tradable: true,
    premium_only: false,
    bind: 'none',
    max_stack: 1,
    preview_image: '',
    model_glb: '',
    coins_price: null,
    premium_price: null,
    is_active: true,
    is_published: false,
    is_unique_per_account: false,
    stock_remaining: null,
    sort_order: 0,
    previewImageFile: null,
    modelGlbFile: null,
  }
}
