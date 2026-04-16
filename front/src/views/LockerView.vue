<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AccountInventoryRow } from '../api/inventory'
import LockerCharacterPreview from '../components/locker/LockerCharacterPreview.vue'
import LockerItemCard from '../components/locker/LockerItemCard.vue'
import { useLockerInventory } from '../composables/useLockerInventory'
import { useCosmeticEquip } from '../composables/useCosmeticEquip'
import {
  DEFAULT_PREVIEW_CHARACTER_ASSET_ID,
  type PreviewCharacterAsset,
  getPreviewImageByCosmetic,
  resolvePreviewCharacterAssetIdFromCosmetic,
} from '../avatar/previewCharacterAssets'

interface LockerOwnedSkinEntry {
  key: string
  row: AccountInventoryRow
  isNew: boolean
  previewImageSrc: string
  fallbackImageUsed: boolean
  canEquip: boolean
}

const { items, loading, loadError } = useLockerInventory()
const {
  loadoutError,
  equipMessage,
  equipError,
  equippingId,
  canEquipCosmetic,
  isEquipped,
  equipCosmetic,
} = useCosmeticEquip()

const selectedPreviewAssetId = ref<PreviewCharacterAsset['id']>(DEFAULT_PREVIEW_CHARACTER_ASSET_ID)
const selectedPreviewAssetSrc = ref<string | null>(null)
const selectedInventoryRowId = ref<number | null>(null)

const cosmeticItems = computed<AccountInventoryRow[]>(() =>
  items.value.filter((row) => row.item.kind === 'cosmetic' && row.item.cosmetic_slot === 'body' && row.quantity > 0),
)

const gridItems = computed<LockerOwnedSkinEntry[]>(() =>
  cosmeticItems.value.map((row) => {
    const previewMeta = row.item.preview_image
      ? { src: row.item.preview_image, fallbackUsed: false }
      : getPreviewImageByCosmetic(row.item.code, row.item.name)
    const canEquip = canEquipCosmetic(row)
    return {
      key: `item-${row.id}`,
      row,
      isNew: row.quantity <= 1 || row.item.rarity >= 4,
      previewImageSrc: previewMeta.src,
      fallbackImageUsed: previewMeta.fallbackUsed,
      canEquip,
    }
  }),
)

const selectedEntry = computed<LockerOwnedSkinEntry | null>(() => {
  const found = gridItems.value.find((entry) => entry.row.id === selectedInventoryRowId.value)
  return found ?? gridItems.value[0] ?? null
})

function syncSelectedPreview(row: AccountInventoryRow): void {
  selectedInventoryRowId.value = row.id
  selectedPreviewAssetId.value = resolvePreviewCharacterAssetIdFromCosmetic(row.item.code, row.item.name)
  selectedPreviewAssetSrc.value = row.item.model_glb ?? null
}

async function equipSelectedSkin(): Promise<void> {
  const entry = selectedEntry.value
  if (!entry || !entry.canEquip) return
  await equipCosmetic(entry.row)
}

watch(
  gridItems,
  (entries) => {
    if (entries.length === 0) {
      selectedInventoryRowId.value = null
      return
    }
    const selectedStillExists = entries.some((entry) => entry.row.id === selectedInventoryRowId.value)
    if (selectedStillExists) return
    const defaultEntry = entries.find((entry) => isEquipped(entry.row)) ?? entries[0]
    if (!defaultEntry) return
    syncSelectedPreview(defaultEntry.row)
  },
  { immediate: true },
)
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#030b1f] text-white">
    <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(2,132,199,0.25),transparent_38%),radial-gradient(circle_at_82%_85%,rgba(6,78,146,0.24),transparent_42%),linear-gradient(100deg,#051633_0%,#0a1f4d_50%,#06122a_100%)]" />
    <div class="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(circle,_rgba(34,211,238,0.45)_1.1px,transparent_1.1px)] [background-size:140px_140px]" />

    <div class="relative mx-auto grid min-h-screen max-w-[1500px] grid-cols-1 lg:grid-cols-[1.25fr_0.92fr]">
      <section class="border-b border-cyan-300/45 p-7 lg:border-b-0 lg:border-r">
        <h1 class="mb-6 text-4xl font-black uppercase tracking-[0.08em] text-[#00d4ff] drop-shadow-[0_0_18px_rgba(0,212,255,0.45)]">Skins</h1>

        <div v-if="equipMessage" class="mb-3 rounded border border-emerald-300/45 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100" role="status">
          {{ equipMessage }}
        </div>
        <div v-if="equipError || loadError || loadoutError" class="mb-4 rounded border border-rose-300/45 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100" role="alert">
          {{ equipError ?? loadError ?? loadoutError }}
        </div>

        <div v-if="loading" class="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-cyan-200/30 bg-black/30 text-sm font-semibold text-slate-200">
          Loading locker items...
        </div>
        <div v-else-if="gridItems.length === 0" class="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-cyan-200/30 bg-black/30 text-sm font-semibold text-slate-200">
          No outfit skins in your locker yet.
        </div>
        <div v-else class="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <LockerItemCard
            v-for="entry in gridItems"
            :key="entry.key"
            :selected="selectedEntry?.row.id === entry.row.id"
            :equipped="isEquipped(entry.row)"
            :is-new="entry.isNew"
            :is-empty="false"
            :busy="equippingId === entry.row.id || !entry.canEquip"
            :item="{
              id: entry.row.id,
              name: entry.row.item.name,
              previewImageSrc: entry.previewImageSrc,
              fallbackImageUsed: entry.fallbackImageUsed,
            }"
            @select="syncSelectedPreview(entry.row)"
          />
        </div>
      </section>

      <section class="relative flex flex-col border-cyan-300/45 p-7">
        <div class="mb-6 flex h-full min-h-[220px] items-center justify-center rounded-xl border border-cyan-300/25 bg-black/20">
          <LockerCharacterPreview :asset-id="selectedPreviewAssetId" :asset-src="selectedPreviewAssetSrc" />
        </div>

        <div class="space-y-4 rounded-xl border border-cyan-300/25 bg-black/30 p-4">
          <p class="m-0 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200/80">Selected outfit</p>
          <p class="m-0 truncate text-2xl font-black uppercase tracking-[0.06em] text-white">
            {{ selectedEntry?.row.item.name ?? 'No skin selected' }}
          </p>
          <p class="m-0 text-sm font-semibold text-slate-200/90">
            {{ selectedEntry ? `Owned x${selectedEntry.row.quantity}` : 'Select a skin from your locker.' }}
          </p>
          <button
            type="button"
            class="w-full rounded-lg border border-cyan-300/80 bg-[radial-gradient(circle_at_center,_#4cc2ff_0%,_#1e5db7_58%,_#0e2b63_100%)] px-4 py-3 text-lg font-black uppercase tracking-[0.08em] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="!selectedEntry || !selectedEntry.canEquip || equippingId === selectedEntry.row.id"
            @click="equipSelectedSkin"
          >
            {{
              !selectedEntry
                ? 'Select Skin'
                : equippingId === selectedEntry.row.id
                  ? 'Equipping...'
                  : isEquipped(selectedEntry.row)
                    ? 'Equipped'
                    : 'Equip'
            }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
