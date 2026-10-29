/**
 * Equipment slots of the wardrobe (Minecraft armour style): one slot per body part, the head one taking either a
 * haircut or a headset (the backend keeps them exclusive, AccountCosmeticService::setLoadout).
 */
export type GearSlot = 'head' | 'top' | 'bottom' | 'shoes'
type WearCosmeticSlot = 'hair' | 'head_accessory' | 'top' | 'bottom' | 'shoes'

export const GEAR_SLOTS: ReadonlyArray<{ id: GearSlot; label: string; slots: readonly WearCosmeticSlot[] }> = [
  { id: 'head', label: 'Head', slots: ['head_accessory', 'hair'] },
  { id: 'top', label: 'Top', slots: ['top'] },
  { id: 'bottom', label: 'Pants', slots: ['bottom'] },
  { id: 'shoes', label: 'Shoes', slots: ['shoes'] },
]

export function gearSlotOf(cosmeticSlot: string | null | undefined): GearSlot | null {
  return GEAR_SLOTS.find((g) => (g.slots as readonly string[]).includes(cosmeticSlot ?? ''))?.id ?? null
}

/** PUT /character/cosmetics slots that empty a gear slot. */
export function unequipPayload(gear: GearSlot): Partial<Record<WearCosmeticSlot, null>> {
  const slots = GEAR_SLOTS.find((g) => g.id === gear)!.slots
  return Object.fromEntries(slots.map((s) => [s, null]))
}
