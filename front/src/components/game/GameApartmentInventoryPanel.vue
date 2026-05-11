<script setup lang="ts">
import type { ApartmentInventoryItem } from '../../types/gameRealtime'

defineProps<{
  apartmentInventory: ApartmentInventoryItem[]
  apartmentInventoryLoading: boolean
  apartmentInventoryError: string | null
  selectedInventoryObjectKey: string
  selectedPlacedObjectId: string
  apartmentObjectIds: string[]
  selectedInventoryItem: ApartmentInventoryItem | null
  canSpawnSelectedInventoryItem: boolean
  hotbarSlots: string[]
  selectedHotbarIndex: number
}>()

const emit = defineEmits<{
  refreshApartmentInventory: []
  selectInventoryItem: [code: string]
  spawnSelectedInventoryAsset: []
  pickupSelectedPlacedObject: []
  placedObjectSelected: [objectId: string]
  onHotbarSlotClick: [index: number]
  clearHotbarSlot: [index: number]
}>()

function onPlacedSelect(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLSelectElement)) return
  emit('placedObjectSelected', target.value)
}
</script>

<template>
  <div
    class="pointer-events-auto absolute left-3 top-14 z-10 hidden w-[54rem] max-w-[calc(100vw-2rem)] rounded-lg border border-white/20 bg-black/75 p-3 text-xs text-white/90 md:block"
  >
    <div class="mb-3 flex items-center justify-between">
      <span class="font-semibold uppercase tracking-wide text-white/85">Apartment Inventory</span>
      <button
        type="button"
        class="rounded border border-white/25 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:border-campus-accent hover:text-campus-accent disabled:opacity-50"
        :disabled="apartmentInventoryLoading"
        @click="emit('refreshApartmentInventory')"
      >
        {{ apartmentInventoryLoading ? 'Loading…' : 'Refresh' }}
      </button>
    </div>
    <p v-if="apartmentInventoryError" class="mb-2 text-rose-300">{{ apartmentInventoryError }}</p>
    <div class="grid grid-cols-[1fr_17rem] gap-3">
      <div>
        <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Assets (click to select)</div>
        <div class="grid max-h-[22rem] grid-cols-6 gap-2 overflow-y-auto rounded border border-white/10 bg-black/35 p-2">
          <button
            v-for="item in apartmentInventory"
            :key="`asset-card-${item.code}`"
            type="button"
            class="group relative overflow-hidden rounded border p-1 text-left transition"
            :class="
              selectedInventoryObjectKey === item.code
                ? 'border-campus-accent bg-campus-accent/20'
                : 'border-white/15 bg-black/40 hover:border-white/40'
            "
            @click="emit('selectInventoryItem', item.code)"
          >
            <img
              v-if="item.preview_image"
              :src="item.preview_image"
              :alt="`${item.name} preview`"
              class="h-14 w-full rounded object-cover"
            />
            <div
              v-else
              class="flex h-14 w-full items-center justify-center rounded border border-dashed border-white/20 bg-black/35 text-[10px] uppercase text-white/55"
            >
              No preview
            </div>
            <div class="mt-1 truncate text-[10px] font-semibold text-white/90">{{ item.name }}</div>
            <div class="text-[10px] text-white/70">x{{ item.quantity }}</div>
            <div
              v-if="item.quantity <= 0"
              class="absolute inset-0 flex items-center justify-center rounded bg-black/70 text-[10px] font-semibold uppercase text-rose-200"
            >
              Out
            </div>
          </button>
        </div>
        <div class="mt-2 text-[11px] text-white/65">
          Tip: press keys <span class="font-semibold">1..9</span> to select a hotbar slot.
        </div>
      </div>

      <div class="rounded border border-white/10 bg-black/35 p-2">
        <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Selected Asset</div>
        <div v-if="selectedInventoryItem" class="space-y-2">
          <img
            v-if="selectedInventoryItem.preview_image"
            :src="selectedInventoryItem.preview_image"
            :alt="`${selectedInventoryItem.name} preview`"
            class="h-24 w-full rounded object-cover"
          />
          <div
            v-else
            class="flex h-24 w-full items-center justify-center rounded border border-dashed border-white/20 bg-black/30 text-[11px] uppercase text-white/55"
          >
            No preview
          </div>
          <div class="text-sm font-semibold text-white">{{ selectedInventoryItem.name }}</div>
          <div class="text-[11px] text-white/70">Code: {{ selectedInventoryItem.code }}</div>
          <div class="text-[11px] text-white/70">Qty: x{{ selectedInventoryItem.quantity }}</div>
        </div>
        <div v-else class="text-[11px] text-white/60">Select an asset card.</div>

        <button
          type="button"
          class="mt-3 w-full rounded border border-white/30 bg-black/35 px-2 py-1.5 text-xs font-semibold hover:border-campus-accent hover:text-campus-accent disabled:opacity-50"
          :disabled="!canSpawnSelectedInventoryItem"
          @click="emit('spawnSelectedInventoryAsset')"
        >
          Spawn Selected Asset
        </button>

        <div class="mt-3 text-[11px] uppercase tracking-wide text-white/70">Placed Objects</div>
        <select
          class="mt-1 mb-2 w-full rounded border border-white/25 bg-black/50 px-2 py-1 text-xs text-white"
          :value="selectedPlacedObjectId"
          @change="onPlacedSelect"
        >
          <option value="">Select placed object</option>
          <option v-for="objectId in apartmentObjectIds" :key="`placed-${objectId}`" :value="objectId">
            {{ objectId }}
          </option>
        </select>
        <button
          type="button"
          class="w-full rounded border border-white/30 bg-black/35 px-2 py-1.5 text-xs font-semibold hover:border-campus-accent hover:text-campus-accent disabled:opacity-50"
          :disabled="!selectedPlacedObjectId"
          @click="emit('pickupSelectedPlacedObject')"
        >
          Pickup Selected Object
        </button>
      </div>
    </div>

    <div class="mt-3 rounded border border-white/10 bg-black/35 p-2">
      <div class="mb-2 text-[11px] uppercase tracking-wide text-white/70">Hotbar (1..9)</div>
      <div class="grid grid-cols-9 gap-1.5">
        <button
          v-for="(slotCode, index) in hotbarSlots"
          :key="`hotbar-${index}`"
          type="button"
          class="rounded border p-1.5 text-left transition"
          :class="
            selectedHotbarIndex === index
              ? 'border-campus-accent bg-campus-accent/20'
              : 'border-white/20 bg-black/45 hover:border-white/45'
          "
          :title="slotCode || `Slot ${index + 1}`"
          @click="emit('onHotbarSlotClick', index)"
          @contextmenu.prevent="emit('clearHotbarSlot', index)"
        >
          <div class="text-[10px] font-bold text-white/80">{{ index + 1 }}</div>
          <div class="truncate text-[10px] text-white/70">{{ slotCode || 'Empty' }}</div>
        </button>
      </div>
    </div>
  </div>
</template>
