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

function parsePositiveInt(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 1 ? value : null
}

/** Client-side checks before create / update; returns the error to show, or null. */
export function validateShopForm(form: ShopFormState, skinSection: boolean): string | null {
  if (form.code.trim() === '') return 'Code is required'
  if (form.name.trim() === '') return 'Name is required'
  if (skinSection && form.cosmetic_slot === null) return 'Cosmetic slot is required for skins'
  if (!skinSection && form.kind === 'cosmetic') return 'Cosmetic items must be created in Admin Shop Skins'
  const coins = parsePositiveInt(form.coins_price)
  const premium = parsePositiveInt(form.premium_price)
  if (coins === null && premium === null) return 'At least one currency price is required'
  if (form.coins_price !== null && coins === null) return 'Coins price must be a positive integer'
  if (form.premium_price !== null && premium === null) return 'Premium price must be a positive integer'
  return null
}

/** Fields shared by the create and update requests (uploaded files are added by the caller). */
export function shopFormToBody(form: ShopFormState, skinSection: boolean) {
  const prices: Partial<Record<'coins' | 'premium', number>> = {}
  const coins = parsePositiveInt(form.coins_price)
  const premium = parsePositiveInt(form.premium_price)
  if (coins !== null) prices.coins = coins
  if (premium !== null) prices.premium = premium
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    kind: skinSection ? 'cosmetic' : form.kind,
    rarity: form.rarity,
    tradable: form.tradable,
    premium_only: form.premium_only,
    bind: form.bind,
    max_stack: form.max_stack,
    cosmetic_slot: skinSection ? form.cosmetic_slot : null,
    preview_image: form.preview_image.trim() || null,
    model_glb: form.model_glb.trim() || null,
    prices,
    is_active: form.is_active,
    is_published: form.is_published,
    is_unique_per_account: form.is_unique_per_account,
    stock_remaining: form.stock_remaining,
    sort_order: form.sort_order,
  }
}
