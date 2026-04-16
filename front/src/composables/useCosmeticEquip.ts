import { onMounted, ref } from 'vue'
import { emptyCosmeticLoadout, fetchCharacterCosmetics, putCharacterCosmetics } from '../api/characterCosmetics'
import type { CosmeticLoadout, CosmeticSlot } from '../api/characterCosmetics'
import type { AccountInventoryRow } from '../api/inventory'

const SLOT_SET: Record<CosmeticSlot, true> = {
  body: true,
  hair: true,
  top: true,
  bottom: true,
  shoes: true,
  head_accessory: true,
}

const SLOT_LABELS: Record<CosmeticSlot, string> = {
  body: 'Outfit',
  hair: 'Hair',
  top: 'Top',
  bottom: 'Bottom',
  shoes: 'Shoes',
  head_accessory: 'Back Bling',
}

export function useCosmeticEquip() {
  const cosmeticLoadout = ref<CosmeticLoadout>(emptyCosmeticLoadout())
  const loadoutError = ref<string | null>(null)
  const equipMessage = ref<string | null>(null)
  const equipError = ref<string | null>(null)
  const equippingId = ref<number | null>(null)

  onMounted(() => {
    void refreshCosmeticLoadout()
  })

  async function refreshCosmeticLoadout(): Promise<void> {
    loadoutError.value = null
    try {
      const state = await fetchCharacterCosmetics()
      cosmeticLoadout.value = state.slots
    } catch (error: unknown) {
      loadoutError.value = error instanceof Error ? error.message : 'Could not load outfit'
      cosmeticLoadout.value = emptyCosmeticLoadout()
    }
  }

  function slotDisplayName(slot: CosmeticSlot): string {
    return SLOT_LABELS[slot]
  }

  function canEquipCosmetic(row: AccountInventoryRow): boolean {
    if (row.item.kind !== 'cosmetic') return false
    const slot = row.item.cosmetic_slot
    return typeof slot === 'string' && slot in SLOT_SET
  }

  function isEquipped(row: AccountInventoryRow | undefined): boolean {
    if (!row || !canEquipCosmetic(row)) return false
    const slot = row.item.cosmetic_slot as CosmeticSlot
    return cosmeticLoadout.value[slot]?.item_def_id === row.item.item_def_id
  }

  async function equipCosmetic(row: AccountInventoryRow | undefined): Promise<void> {
    if (!row || !canEquipCosmetic(row)) return
    const slot = row.item.cosmetic_slot
    if (!slot || !(slot in SLOT_SET)) return
    const cosmeticSlot = slot as CosmeticSlot
    equipMessage.value = null
    equipError.value = null
    equippingId.value = row.id
    try {
      const state = await putCharacterCosmetics({ slots: { [cosmeticSlot]: row.item.item_def_id } })
      cosmeticLoadout.value = state.slots
      equipMessage.value = `Equipped ${row.item.name}.`
    } catch (error: unknown) {
      equipError.value = error instanceof Error ? error.message : 'Could not equip item'
    } finally {
      equippingId.value = null
    }
  }

  return {
    cosmeticLoadout,
    loadoutError,
    equipMessage,
    equipError,
    equippingId,
    refreshCosmeticLoadout,
    slotDisplayName,
    canEquipCosmetic,
    isEquipped,
    equipCosmetic,
  }
}
