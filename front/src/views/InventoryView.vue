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
  PREVIEW_CHARACTER_ASSETS,
  type PreviewCharacterAsset,
} from '../avatar/previewCharacterAssets'

interface LockerCategory {
  id: string
  label: string
}

interface LockerGridEntry {
  key: string
  row?: AccountInventoryRow
  isEmpty: boolean
  isNew: boolean
}

const categories: LockerCategory[] = [
  { id: 'outfit', label: 'Outfit' },
  { id: 'backbling', label: 'Back Bling' },
  { id: 'pickaxe', label: 'Pickaxe' },
  { id: 'glider', label: 'Glider' },
  { id: 'emote', label: 'Emote' },
  { id: 'wrap', label: 'Wrap' },
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

const cosmeticItems = computed<AccountInventoryRow[]>(() => items.value.filter((row) => canEquipCosmetic(row)))

const gridItems = computed<LockerGridEntry[]>(() => {
  const base = cosmeticItems.value.slice(0, 20).map((row) => ({
    key: `item-${row.id}`,
    row,
    isEmpty: false,
    isNew: row.quantity <= 1 || row.item.rarity >= 4,
  }))
  const placeholdersNeeded = Math.max(0, 20 - base.length)
  const placeholders: LockerGridEntry[] = Array.from({ length: placeholdersNeeded }, (_, index) => ({
    key: `empty-${index}`,
    isEmpty: true,
    isNew: false,
  }))
  return [...base, ...placeholders]
})

const activeFilterCount = computed<number>(() => {
  let count = 0
  if (selectedCategory.value !== 'outfit') count += 1
  if (debouncedQ.value !== '') count += 1
  if (kindFilter.value !== 'cosmetic') count += 1
  return count
})

function selectPreviewAsset(assetId: PreviewCharacterAsset['id']): void {
  selectedPreviewAssetId.value = assetId
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
          <LockerCharacterPreview :asset-id="selectedPreviewAssetId" />
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

          <div class="mb-4">
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
              Available Skins
            </p>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button
                v-for="asset in PREVIEW_CHARACTER_ASSETS"
                :key="asset.id"
                type="button"
                class="rounded-lg border px-3 py-2 text-left transition duration-150"
                :class="
                  selectedPreviewAssetId === asset.id
                    ? 'border-cyan-300 bg-cyan-500/20 text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,0.3)]'
                    : 'border-slate-500/80 bg-slate-900/40 text-slate-100 hover:border-cyan-300/60 hover:bg-cyan-500/10'
                "
                @click="selectPreviewAsset(asset.id)"
              >
                <p class="text-xs font-bold uppercase tracking-[0.1em]">{{ asset.label }}</p>
                <p class="mt-1 text-[11px] font-semibold text-slate-300">{{ asset.fileName }}</p>
              </button>
            </div>
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

          <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
            <LockerItemCard
              v-for="entry in gridItems"
              :key="entry.key"
              :selected="isEquipped(entry.row)"
              :is-new="entry.isNew"
              :is-empty="entry.isEmpty"
              :busy="equippingId === entry.row?.id"
              :item="
                entry.row
                  ? {
                      id: entry.row.id,
                      name: entry.row.item.name,
                      slot: slotDisplayName(entry.row.item.cosmetic_slot as CosmeticSlot),
                      quantity: entry.row.quantity,
                    }
                  : undefined
              "
              @select="equipCosmetic(entry.row)"
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
