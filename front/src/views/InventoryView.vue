<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { AccountInventoryRow } from '../api/inventory'
import type { CosmeticSlot } from '../api/characterCosmetics'
import LockerCategoryTabs from '../components/locker/LockerCategoryTabs.vue'
import LockerCharacterPreview from '../components/locker/LockerCharacterPreview.vue'
import LockerItemCard from '../components/locker/LockerItemCard.vue'
import LockerStatChip from '../components/locker/LockerStatChip.vue'
import { useLockerInventory } from '../composables/useLockerInventory'
import { useCosmeticEquip } from '../composables/useCosmeticEquip'
import {
  DEFAULT_PREVIEW_CHARACTER_ASSET_ID,
  type PreviewCharacterAsset,
  getPreviewImageByCosmetic,
  resolvePreviewCharacterAssetIdFromCosmetic,
} from '../avatar/previewCharacterAssets'

interface LockerCategory {
  id: string
  label: string
}

interface LockerOwnedSkinEntry {
  key: string
  row: AccountInventoryRow
  isNew: boolean
  previewImageSrc: string
  fallbackImageUsed: boolean
  canEquip: boolean
  slotLabel: string
}

const categories: LockerCategory[] = [
  { id: 'outfit', label: 'Outfit' },
]

const selectedCategory = ref<string>('outfit')
const {
  items,
  loading,
  loadError,
  kindFilter,
  searchInput,
  debouncedQ,
} = useLockerInventory()
const {
  loadoutError,
  equipMessage,
  equipError,
  equippingId,
  slotDisplayName,
  canEquipCosmetic,
  isEquipped,
  equipCosmetic,
} = useCosmeticEquip()

const fpsStat = ref<string>('120 FPS')
const pingStat = ref<string>('35 MS')
const selectedPreviewAssetId = ref<PreviewCharacterAsset['id']>(DEFAULT_PREVIEW_CHARACTER_ASSET_ID)
const selectedPreviewAssetSrc = ref<string | null>(null)

const cosmeticItems = computed<AccountInventoryRow[]>(() =>
  items.value.filter(
    (row) =>
      row.item.kind === 'cosmetic' &&
      row.item.cosmetic_slot === 'body' &&
      row.quantity > 0,
  ),
)

const gridItems = computed<LockerOwnedSkinEntry[]>(() =>
  cosmeticItems.value.map((row) => {
    const previewMeta = row.item.preview_image
      ? { src: row.item.preview_image, fallbackUsed: false }
      : getPreviewImageByCosmetic(row.item.code, row.item.name)
    const canEquip = canEquipCosmetic(row)
    const slotLabel = canEquip
      ? slotDisplayName(row.item.cosmetic_slot as CosmeticSlot)
      : 'Outfit'
    return {
      key: `item-${row.id}`,
      row,
      isNew: row.quantity <= 1 || row.item.rarity >= 4,
      previewImageSrc: previewMeta.src,
      fallbackImageUsed: previewMeta.fallbackUsed,
      canEquip,
      slotLabel,
    }
  }),
)

const activeFilterCount = computed<number>(() => {
  let count = 0
  if (selectedCategory.value !== 'outfit') count += 1
  if (debouncedQ.value !== '') count += 1
  if (kindFilter.value !== 'cosmetic') count += 1
  return count
})

async function equipSkinFromInventoryRow(row: AccountInventoryRow): Promise<void> {
  if (!canEquipCosmetic(row)) return
  const mappedAssetId = resolvePreviewCharacterAssetIdFromCosmetic(row.item.code, row.item.name)
  selectedPreviewAssetId.value = mappedAssetId
  selectedPreviewAssetSrc.value = row.item.model_glb ?? null
  await equipCosmetic(row)
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-[#0A192F] to-[#1A365D] text-white">
    <div class="mx-auto grid min-h-screen max-w-[1800px] grid-cols-1 gap-4 p-4 md:p-6 lg:grid-cols-5 lg:gap-6 lg:p-8">
      <section class="relative flex min-h-[40vh] flex-col rounded-xl border border-slate-600/40 bg-black/10 p-4 lg:col-span-3 lg:min-h-[80vh]">
        <div class="mb-4">
          <p class="text-sm font-semibold uppercase tracking-[0.22em] text-slate-300">Character Locker</p>
          <h1 class="text-[32px] font-bold leading-none [text-shadow:0_2px_8px_rgba(0,0,0,0.95)]">CHARACTER</h1>
          <p class="mt-2 text-[14px] font-semibold text-slate-200">Customize your loadout and equip your best look.</p>
        </div>

        <div class="flex flex-1">
          <LockerCharacterPreview :asset-id="selectedPreviewAssetId" :asset-src="selectedPreviewAssetSrc" />
        </div>

        <div class="mt-4 flex items-center gap-3 self-start">
          <LockerStatChip label="FPS" :value="fpsStat" tone="success" />
          <LockerStatChip label="PING" :value="pingStat" tone="warning" />
        </div>
      </section>

      <section class="lg:col-span-2">
        <div class="rounded-[12px] border border-[#3B82F6] bg-[#1E293B]/80 p-4 shadow-[0_12px_36px_rgba(2,6,23,0.55)] backdrop-blur-sm md:p-5">
          <div class="mb-4 flex items-start justify-between gap-3">
            <LockerCategoryTabs v-model="selectedCategory" :categories="categories" />
            <RouterLink
              to="/item-shop"
              class="hidden rounded-md border border-slate-500 bg-[#475569] px-3 py-2 text-xs font-semibold text-white transition duration-200 hover:shadow-[0_0_10px_rgba(59,130,246,0.45)] md:inline-flex"
            >
              Shop
            </RouterLink>
          </div>

          <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label for="inv-search" class="relative block flex-1">
              <span class="sr-only">Search cosmetics</span>
              <svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M21 21l-4.4-4.4M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
              </svg>
              <input
                id="inv-search"
                v-model="searchInput"
                type="search"
                autocomplete="off"
                placeholder="Search items"
                class="w-full rounded-md border border-slate-600 bg-[#334155] py-2 pl-9 pr-3 text-sm font-semibold text-white placeholder:text-slate-300 transition duration-200 focus:border-[#3B82F6] focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/40"
              />
            </label>
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-md border border-slate-500 bg-[#475569] px-3 py-2 text-sm font-semibold text-white transition duration-200 hover:shadow-[0_0_12px_rgba(59,130,246,0.45)]"
            >
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Sort / Filter
              <span class="rounded-full bg-[#FFD700] px-2 text-xs font-bold text-black">{{ activeFilterCount }}</span>
            </button>
          </div>

          <div v-if="equipMessage" class="mb-3 rounded-md border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100" role="status">
            {{ equipMessage }}
          </div>
          <div v-if="equipError || loadError || loadoutError" class="mb-3 rounded-md border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100" role="alert">
            {{ equipError ?? loadError ?? loadoutError }}
          </div>

          <div v-if="loading" class="rounded-md border border-dashed border-slate-500 bg-black/20 p-8 text-center">
            <span class="mx-auto mb-3 block h-10 w-10 animate-spin rounded-full border-2 border-slate-500 border-t-[#3B82F6]" aria-hidden="true" />
            <p class="text-[14px] font-semibold text-slate-200">Loading locker items...</p>
          </div>

          <div v-else-if="gridItems.length === 0" class="rounded-md border border-dashed border-slate-500 bg-black/20 p-6 text-center">
            <p class="text-[14px] font-semibold text-slate-200">No skins found in your inventory.</p>
          </div>

          <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <LockerItemCard
              v-for="entry in gridItems"
              :key="entry.key"
              :selected="isEquipped(entry.row)"
              :is-new="entry.isNew"
              :is-empty="false"
              :busy="equippingId === entry.row?.id || !entry.canEquip"
              :item="
                {
                  id: entry.row.id,
                  name: entry.row.item.name,
                  slot: entry.slotLabel,
                  quantity: entry.row.quantity,
                  previewImageSrc: entry.previewImageSrc,
                  fallbackImageUsed: entry.fallbackImageUsed,
                }
              "
              @select="equipSkinFromInventoryRow(entry.row)"
              @equip="equipSkinFromInventoryRow(entry.row)"
            />
          </div>

          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-[6px] border border-slate-500 bg-[#475569] px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:shadow-[0_0_10px_rgba(59,130,246,0.4)]"
            >
              Edit
            </button>
            <button
              type="button"
              class="rounded-[6px] border border-slate-500 bg-[#475569] px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:shadow-[0_0_10px_rgba(59,130,246,0.4)]"
            >
              Back
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
