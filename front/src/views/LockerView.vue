<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { AccountInventoryRow } from '../api/inventory'
import UiIcon from '../components/ui/UiIcon.vue'
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
  <div class="mx-auto w-full max-w-[1600px]">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="cc-eyebrow">Your collection</p>
        <h1 class="cc-title">Locker</h1>
      </div>
      <div class="cc-tabs">
        <span class="cc-tab cc-tab-active"><UiIcon name="shirt" :size="16" /> Outfits</span>
        <RouterLink :to="{ name: 'shop-skin' }" class="cc-tab"><UiIcon name="plus" :size="16" /> Get more</RouterLink>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
      <section class="cc-panel min-w-0 p-5">
        <div class="mb-4 flex items-center justify-between">
          <h2 class="cc-display m-0 text-xl">Skins</h2>
          <span class="cc-chip">{{ gridItems.length }} owned</span>
        </div>

        <div v-if="equipMessage" class="cc-alert cc-alert-success mb-3" role="status"><UiIcon name="check" :size="18" /> {{ equipMessage }}</div>
        <div v-if="equipError || loadError || loadoutError" class="cc-alert cc-alert-error mb-4" role="alert">
          <UiIcon name="alert" :size="18" /> {{ equipError ?? loadError ?? loadoutError }}
        </div>

        <div v-if="loading" class="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
          <div v-for="n in 12" :key="n" class="aspect-square animate-pulse rounded-xl bg-ink-800/70" />
        </div>
        <div v-else-if="gridItems.length === 0" class="cc-panel-flat flex min-h-[280px] flex-col items-center justify-center gap-3 text-center">
          <UiIcon name="shirt" :size="40" class="text-ink-500" />
          <p class="m-0 font-bold text-mist">No outfit skins in your locker yet.</p>
          <RouterLink :to="{ name: 'shop-skin' }" class="cc-btn cc-btn-sun cc-btn-sm">Browse skins</RouterLink>
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

      <section class="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
        <div class="h-[440px]">
          <LockerCharacterPreview :asset-id="selectedPreviewAssetId" :asset-src="selectedPreviewAssetSrc" />
        </div>

        <div class="cc-panel p-5">
          <p class="cc-eyebrow">Selected outfit</p>
          <div class="mt-1 flex items-center justify-between gap-3">
            <p class="cc-display m-0 truncate text-3xl">{{ selectedEntry?.row.item.name ?? 'No skin selected' }}</p>
            <span v-if="selectedEntry && isEquipped(selectedEntry.row)" class="cc-chip cc-chip-grape shrink-0">Equipped</span>
          </div>
          <p class="m-0 mt-1 text-sm font-semibold text-mist">
            {{ selectedEntry ? `Owned ×${selectedEntry.row.quantity}` : 'Select a skin from your locker.' }}
          </p>
          <button
            type="button"
            :class="['cc-btn cc-btn-lg mt-4 w-full', selectedEntry && isEquipped(selectedEntry.row) ? 'cc-btn-ghost' : 'cc-btn-sun']"
            :disabled="!selectedEntry || !selectedEntry.canEquip || equippingId === selectedEntry.row.id"
            @click="equipSelectedSkin"
          >
            {{
              !selectedEntry
                ? 'Select skin'
                : equippingId === selectedEntry.row.id
                  ? 'Equipping…'
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
