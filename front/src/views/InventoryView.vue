<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import * as inventoryApi from '../api/inventory'
import type { AccountInventoryRow, InventoryKindFilter } from '../api/inventory'
import {
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  putCharacterCosmetics,
  SLOT_ORDER,
} from '../api/characterCosmetics'
import type { CosmeticColors, CosmeticLoadout, CosmeticSlot } from '../api/characterCosmetics'
import AvatarInventoryPreview from '../components/AvatarInventoryPreview.vue'

const items = ref<AccountInventoryRow[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const cosmeticLoadout = ref<CosmeticLoadout>(emptyCosmeticLoadout())
const cosmeticColors = ref<CosmeticColors>(defaultCosmeticColors())
/** Editable palette; preview uses this for live feedback. */
const draftColors = ref<CosmeticColors>(defaultCosmeticColors())
const loadoutError = ref<string | null>(null)
const equipMessage = ref<string | null>(null)
const equipError = ref<string | null>(null)
const equippingId = ref<number | null>(null)
const savingColors = ref(false)
const colorSaveError = ref<string | null>(null)

const kindFilter = ref<InventoryKindFilter>('')
const searchInput = ref('')
const debouncedQ = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (v) => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQ.value = v.trim()
    debounceTimer = null
  }, 350)
})

watch([kindFilter, debouncedQ], () => {
  void loadInventory()
}, { immediate: true })

const hasUnsavedColors = computed(() => {
  for (const slot of SLOT_ORDER) {
    if (draftColors.value[slot].toLowerCase() !== cosmeticColors.value[slot].toLowerCase()) {
      return true
    }
  }
  return false
})

async function refreshCosmeticLoadout() {
  loadoutError.value = null
  try {
    const state = await fetchCharacterCosmetics()
    cosmeticLoadout.value = state.slots
    cosmeticColors.value = state.colors
    draftColors.value = { ...state.colors }
  } catch (e) {
    loadoutError.value = e instanceof Error ? e.message : 'Could not load outfit'
    cosmeticLoadout.value = emptyCosmeticLoadout()
    const fallback = defaultCosmeticColors()
    cosmeticColors.value = fallback
    draftColors.value = { ...fallback }
  }
}

onMounted(() => {
  void refreshCosmeticLoadout()
})

async function loadInventory() {
  loading.value = true
  loadError.value = null
  try {
    const res = await inventoryApi.fetchAccountInventory({
      kind: kindFilter.value,
      q: debouncedQ.value === '' ? undefined : debouncedQ.value,
    })
    items.value = res.items
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Could not load inventory'
    items.value = []
  } finally {
    loading.value = false
  }
}

function slotDisplayName(slot: CosmeticSlot): string {
  const labels: Record<CosmeticSlot, string> = {
    body: 'Body',
    hair: 'Hair',
    top: 'Top',
    bottom: 'Bottom',
    shoes: 'Shoes',
    head_accessory: 'Head accessory',
  }
  return labels[slot]
}

const SLOT_SET: Record<CosmeticSlot, true> = {
  body: true,
  hair: true,
  top: true,
  bottom: true,
  shoes: true,
  head_accessory: true,
}

function canEquipCosmetic(row: AccountInventoryRow): boolean {
  if (row.item.kind !== 'cosmetic') return false
  const slot = row.item.cosmetic_slot
  return typeof slot === 'string' && slot in SLOT_SET
}

const cosmeticItems = computed(() => items.value.filter((row) => canEquipCosmetic(row)))

function isEquipped(row: AccountInventoryRow): boolean {
  if (!canEquipCosmetic(row)) return false
  const slot = row.item.cosmetic_slot as CosmeticSlot
  return cosmeticLoadout.value[slot]?.item_def_id === row.item.item_def_id
}

function slotLabelFromRow(row: AccountInventoryRow): string {
  if (!canEquipCosmetic(row)) return 'Item'
  return slotDisplayName(row.item.cosmetic_slot as CosmeticSlot)
}

function cardInitial(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '?'
  return trimmed.charAt(0).toUpperCase()
}

async function equipCosmetic(row: AccountInventoryRow) {
  if (!canEquipCosmetic(row)) return
  const slot = row.item.cosmetic_slot
  if (slot === undefined || slot === null || !(slot in SLOT_SET)) return
  const cosmeticSlot = slot as CosmeticSlot
  equipMessage.value = null
  equipError.value = null
  equippingId.value = row.id
  try {
    const state = await putCharacterCosmetics({ slots: { [cosmeticSlot]: row.item.item_def_id } })
    cosmeticLoadout.value = state.slots
    cosmeticColors.value = state.colors
    draftColors.value = { ...state.colors }
    equipMessage.value = `Equipped “${row.item.name}”. Preview updated — jump into Game when you are ready.`
    void loadInventory()
  } catch (e) {
    equipError.value = e instanceof Error ? e.message : 'Could not equip item'
  } finally {
    equippingId.value = null
  }
}

function normalizeHexInput(raw: string): string | null {
  const t = raw.trim()
  const withHash = t.startsWith('#') ? t : `#${t}`
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return null
  return withHash.toUpperCase()
}

function onHexBlur(slot: CosmeticSlot, ev: Event) {
  const el = ev.target as HTMLInputElement
  const n = normalizeHexInput(el.value)
  if (n) draftColors.value = { ...draftColors.value, [slot]: n }
  else el.value = draftColors.value[slot]
}

async function saveDraftColors() {
  colorSaveError.value = null
  savingColors.value = true
  try {
    const payload: Partial<CosmeticColors> = {}
    for (const slot of SLOT_ORDER) {
      payload[slot] = draftColors.value[slot]
    }
    const state = await putCharacterCosmetics({ colors: payload })
    cosmeticLoadout.value = state.slots
    cosmeticColors.value = state.colors
    draftColors.value = { ...state.colors }
    equipMessage.value = 'Colors saved. They will show in Game for other players after you connect.'
  } catch (e) {
    colorSaveError.value = e instanceof Error ? e.message : 'Could not save colors'
  } finally {
    savingColors.value = false
  }
}

function resetDraftColors() {
  colorSaveError.value = null
  draftColors.value = { ...cosmeticColors.value }
}
</script>

<template>
  <div class="min-h-0 bg-slate-950 text-slate-100">
    <div class="mx-auto flex max-w-[1600px] min-h-0 flex-col p-4 md:p-6 lg:p-8">
      <div class="mb-4 border-b border-white/10 pb-3">
        <p class="m-0 text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Character</p>
        <h2 class="m-0 mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Locker</h2>
        <p class="m-0 mt-1 text-sm text-slate-400">
          Build your look, then jump in game to show it off.
          <RouterLink to="/item-shop" class="font-semibold text-cyan-300 hover:text-cyan-200"> Open Item Shop </RouterLink>
        </p>
      </div>

      <div v-if="equipMessage" class="mb-3 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">
        {{ equipMessage }}
      </div>
      <div v-if="equipError" class="mb-3 rounded-lg border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
        {{ equipError }}
      </div>
      <div v-if="colorSaveError" class="mb-3 rounded-lg border border-rose-300/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">
        {{ colorSaveError }}
      </div>
      <div v-if="loadoutError" class="mb-3 rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="status">
        Outfit preview unavailable: {{ loadoutError }}
      </div>

      <div class="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <div class="order-2 flex flex-col gap-4 lg:order-none lg:col-span-5 xl:col-span-4">
          <div class="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-white/10 md:p-5 lg:p-6">
            <AvatarInventoryPreview :loadout="cosmeticLoadout" :colors="draftColors" />
          </div>

          <div class="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-white/10">
            <div class="mb-3 border-b border-white/10 pb-3">
              <p class="m-0 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300">Style</p>
              <p class="m-0 mt-1 text-sm font-semibold text-slate-100">Character colors</p>
              <p class="m-0 mt-1 text-xs text-slate-400">Live in preview, saved on click. FBX currently blends unmatched slots.</p>
            </div>
            <div class="mb-3 flex items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-lg border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                :disabled="!hasUnsavedColors || savingColors"
                @click="resetDraftColors"
              >
                Reset
              </button>
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                :disabled="!hasUnsavedColors || savingColors"
                @click="saveDraftColors"
              >
                {{ savingColors ? 'Saving…' : 'Save colors' }}
              </button>
            </div>
            <ul class="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
            <li
              v-for="slot in SLOT_ORDER"
              :key="slot"
              class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-800/70 px-3 py-2.5"
            >
              <label class="min-w-0 flex-1 text-sm font-medium text-slate-100" :for="`color-${slot}`">
                {{ slotDisplayName(slot) }}
              </label>
              <input
                :id="`color-${slot}`"
                v-model="draftColors[slot]"
                type="color"
                class="h-9 w-11 cursor-pointer rounded-md border border-white/15 bg-transparent p-0"
                :aria-label="`${slotDisplayName(slot)} color`"
              />
              <input
                type="text"
                class="w-[5.75rem] rounded-md border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                :value="draftColors[slot]"
                maxlength="7"
                spellcheck="false"
                autocomplete="off"
                @change="onHexBlur(slot, $event)"
              />
            </li>
            </ul>
          </div>
        </div>

        <div class="order-1 lg:order-none lg:col-span-7 xl:col-span-8">
          <div class="rounded-2xl bg-slate-900/80 p-4 ring-1 ring-white/10 md:p-5 lg:p-6">
            <div class="mb-4 border-b border-white/10 pb-3">
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <button type="button" class="rounded-full bg-cyan-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-950">Outfit</button>
                <button type="button" disabled class="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">Back Bling</button>
                <button type="button" disabled class="rounded-full bg-slate-700/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-300">Pickaxe</button>
              </div>
              <div class="flex flex-col gap-3 xl:flex-row xl:items-end">
                <div class="min-w-[180px] flex-1">
                  <label for="inv-search" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search</label>
                  <input
                    id="inv-search"
                    v-model="searchInput"
                    type="search"
                    autocomplete="off"
                    placeholder="Find cosmetics"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  />
                </div>
                <div class="min-w-[150px] xl:w-52">
                  <label for="inv-kind" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Kind</label>
                  <select
                    id="inv-kind"
                    v-model="kindFilter"
                    class="w-full rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                  >
                    <option value="">All kinds</option>
                    <option value="cosmetic">Cosmetic</option>
                    <option value="furniture">Furniture</option>
                    <option value="consumable">Consumable</option>
                    <option value="misc">Misc</option>
                  </select>
                </div>
              </div>
            </div>

            <div v-if="loading" class="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-6 text-center">
              <span class="mx-auto mb-3 block h-10 w-10 animate-spin rounded-full border-2 border-slate-500 border-t-cyan-400" aria-hidden="true" />
              <p class="m-0 text-sm text-slate-300">Loading locker items…</p>
            </div>

            <div v-else-if="loadError" class="rounded-xl border border-rose-300/30 bg-rose-500/10 p-6 text-center" role="alert">
              <p class="m-0 text-base font-semibold text-rose-100">Could not load inventory</p>
              <p class="mt-1 text-sm text-rose-200/90">{{ loadError }}</p>
              <button
                type="button"
                class="mt-4 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-400"
                @click="loadInventory"
              >
                Try again
              </button>
            </div>

            <div v-else-if="cosmeticItems.length === 0" class="rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-8 text-center">
              <p class="m-0 text-lg font-semibold text-slate-100">No cosmetics found</p>
              <p class="mt-2 text-sm text-slate-400">
                Try another filter or
                <RouterLink to="/item-shop" class="font-semibold text-cyan-300 hover:text-cyan-200">visit the shop</RouterLink>.
              </p>
            </div>

            <div v-else class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              <article
                v-for="row in cosmeticItems"
                :key="row.id"
                class="group relative overflow-hidden rounded-xl bg-slate-800/80 ring-1 ring-slate-700 transition hover:ring-cyan-400/60"
                :class="isEquipped(row) ? 'ring-2 ring-cyan-400 bg-cyan-500/10' : ''"
              >
                <span
                  v-if="isEquipped(row)"
                  class="absolute left-2 top-2 rounded bg-cyan-400 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-950"
                >
                  Equipped
                </span>
                <div class="flex aspect-square items-center justify-center bg-gradient-to-b from-sky-500/20 to-slate-900 px-4">
                  <span class="text-4xl font-black text-white/85">{{ cardInitial(row.item.name) }}</span>
                </div>
                <div class="p-3">
                  <p class="m-0 truncate text-sm font-semibold text-slate-100">{{ row.item.name }}</p>
                  <p class="m-0 mt-1 text-xs text-slate-400">{{ slotLabelFromRow(row) }} · Qty {{ row.quantity.toLocaleString() }}</p>
                  <button
                    type="button"
                    class="mt-3 w-full rounded-md py-2 text-sm font-semibold transition"
                    :class="isEquipped(row) ? 'cursor-default bg-cyan-400 text-slate-950' : 'bg-slate-700 text-slate-100 hover:bg-slate-600'"
                    :disabled="equippingId === row.id || isEquipped(row)"
                    @click="equipCosmetic(row)"
                  >
                    {{ isEquipped(row) ? 'Equipped' : equippingId === row.id ? 'Equipping…' : 'Equip' }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
</template>
