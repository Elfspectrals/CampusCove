<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import * as itemShopApi from '../api/itemShop'
import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'
import NewNationMinimap from '../components/newNation/NewNationMinimap.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import { useWalletBalances } from '../composables/useWalletBalances'
import { NewNationShowroom } from '../game/newNationShowroom'
import type { ShowroomApartment, ShowroomGroup, ShowroomItem } from '../game/newNationShowroom'
import { currencyLabel, priceBadge } from '../utils/itemShopPresentation'

type Filter = 'all' | ShowroomGroup

const containerRef = ref<HTMLElement | null>(null)
const showroom = shallowRef<NewNationShowroom | null>(null)

const items = ref<ShopItem[]>([])
const mapLoading = ref(true)
const catalogLoading = ref(true)
/** Map failed to load (blocking). */
const loadError = ref<string | null>(null)
/** Shop catalog failed to load (non-blocking: the map still works). */
const catalogError = ref<string | null>(null)
const filter = ref<Filter>('all')
const selectedId = ref<number | null>(null)
const hoveredId = ref<number | null>(null)
const walking = ref(false)
const mouseLook = ref(false)
const apartments = ref<ShowroomApartment[]>([])
const currentApartmentId = ref<string | null>(null)
/** Controls hint shown for a few seconds each time walk mode starts. */
const showWalkHint = ref(false)
let walkHintTimer: number | undefined

const auth = computed(() => getStoredAuth())
const isLoggedIn = computed(() => Boolean(auth.value?.token))
const balances = useWalletBalances()

const purchasingId = ref<number | null>(null)
const confirmItem = ref<ShopItem | null>(null)
const confirmCurrency = ref<ShopCurrency>('coins')
const feedback = ref<{ itemId: number; kind: 'success' | 'error'; text: string } | null>(null)

function itemGroup(item: ShopItem): ShowroomGroup {
  return item.kind === 'apartment_asset' || item.kind === 'furniture' ? 'apartment' : 'skin'
}

const visibleItems = computed<ShopItem[]>(() =>
  filter.value === 'all' ? items.value : items.value.filter((item) => itemGroup(item) === filter.value),
)

const selectedItem = computed<ShopItem | null>(
  () => items.value.find((item) => item.item_def_id === selectedId.value) ?? null,
)

const hoveredItem = computed<ShopItem | null>(
  () => items.value.find((item) => item.item_def_id === hoveredId.value) ?? null,
)

const counts = computed(() => ({
  all: items.value.length,
  apartment: items.value.filter((i) => itemGroup(i) === 'apartment').length,
  skin: items.value.filter((i) => itemGroup(i) === 'skin').length,
}))

const confirmOption = computed<ShopItemCurrencyOption | null>(() => {
  const item = confirmItem.value
  if (!item) return null
  return item.options.find((opt) => opt.currency === confirmCurrency.value) ?? null
})

const confirmCurrent = computed(() => {
  if (!confirmOption.value) return null
  return confirmOption.value.currency === 'coins' ? balances.value.coins : balances.value.premium
})

const confirmAfter = computed(() => {
  const cur = confirmCurrent.value
  if (cur === null || !confirmOption.value) return null
  return cur - confirmOption.value.price
})

function toShowroomItem(item: ShopItem): ShowroomItem {
  const first = item.options[0]
  return {
    id: item.item_def_id,
    name: item.name,
    priceLabel: first ? priceBadge(first) : '',
    group: itemGroup(item),
    modelUrl: item.model_glb,
    imageUrl: item.preview_image,
  }
}

function selectItem(id: number | null) {
  selectedId.value = id
  showroom.value?.select(id)
}

function stepSelection(delta: number) {
  const list = visibleItems.value
  if (list.length === 0) return
  const idx = list.findIndex((i) => i.item_def_id === selectedId.value)
  const next = idx === -1 ? (delta > 0 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length
  selectItem(list[next]!.item_def_id)
}

function setWalking(on: boolean) {
  showroom.value?.setWalkMode(on)
}

const currentApartment = computed<ShowroomApartment | null>(
  () => apartments.value.find((a) => a.id === currentApartmentId.value) ?? null,
)

function visitApartment(id: string) {
  showroom.value?.goToApartment(id)
}

function visitNextApartment(step: 1 | -1) {
  showroom.value?.goToNextApartment(step)
}

function goToPlaza() {
  showroom.value?.goToPlaza()
}

/** Hold-to-turn buttons (mouse and touch). */
function startTurn(direction: -1 | 1) {
  showroom.value?.setTurnInput(direction)
}

function stopTurn() {
  showroom.value?.setTurnInput(0)
}

const getMinimapState = () => showroom.value?.getMinimapState() ?? null

function onKeyDown(e: KeyboardEvent) {
  if (confirmItem.value) return
  // In walk mode the arrow keys move the player instead of browsing.
  if (walking.value) {
    if (e.key === 'Escape' && !mouseLook.value) selectItem(null)
    else if (e.key === 'n' || e.key === 'N') visitNextApartment(1)
    else if (e.key === 'b' || e.key === 'B') visitNextApartment(-1)
    return
  }
  if (e.key === 'ArrowRight') stepSelection(1)
  else if (e.key === 'ArrowLeft') stepSelection(-1)
  else if (e.key === 'Escape') selectItem(null)
}

async function populateShowroom() {
  const room = showroom.value
  if (!room || mapLoading.value || catalogLoading.value) return
  await room.setItems(visibleItems.value.map(toShowroomItem))
  // The page may have been left while models were loading.
  if (showroom.value !== room) return
  if (selectedId.value !== null && !visibleItems.value.some((i) => i.item_def_id === selectedId.value)) {
    selectItem(null)
  } else {
    room.select(selectedId.value, false)
  }
}

/** Bumped per loadAll() so a slow, superseded attempt (e.g. before "Try again") cannot overwrite newer state. */
let loadToken = 0

/**
 * The shop catalog is optional for this page: if the API is down, the map and the model
 * apartments still open and a small banner offers a retry.
 */
async function fetchCatalog(token: number) {
  catalogError.value = null
  try {
    const res = await itemShopApi.fetchItemShopCatalog()
    if (token === loadToken) items.value = res.items
  } catch (e) {
    if (token !== loadToken) return
    catalogError.value = e instanceof Error ? e.message : 'Could not load the shop'
    items.value = []
  }
}

async function retryCatalog() {
  const token = loadToken
  catalogLoading.value = true
  await fetchCatalog(token)
  if (token !== loadToken) return
  catalogLoading.value = false
  await populateShowroom()
}

async function loadAll() {
  const token = ++loadToken
  loadError.value = null
  mapLoading.value = true
  catalogLoading.value = true
  const room = showroom.value
  const mapPromise = room
    ? room.loadMap().catch((e: unknown) => {
        if (token === loadToken) loadError.value = e instanceof Error ? e.message : 'Could not load the New Nation map'
      })
    : Promise.resolve()
  const catalogPromise = fetchCatalog(token)
  await Promise.all([mapPromise, catalogPromise])
  if (token !== loadToken) return
  apartments.value = room?.getApartments() ?? []
  mapLoading.value = false
  catalogLoading.value = false
  await populateShowroom()
}

watch(filter, () => {
  void populateShowroom()
})

onMounted(() => {
  if (!containerRef.value) return
  showroom.value = new NewNationShowroom(containerRef.value, {
    onSelect: (id) => selectItem(id),
    onHover: (id) => {
      hoveredId.value = id
    },
    onWalkStateChange: (state) => {
      if (state.walking && !walking.value) {
        showWalkHint.value = true
        window.clearTimeout(walkHintTimer)
        walkHintTimer = window.setTimeout(() => {
          showWalkHint.value = false
        }, 7000)
      }
      walking.value = state.walking
      mouseLook.value = state.mouseLook
    },
    onApartmentChange: (id) => {
      currentApartmentId.value = id
    },
  })
  window.addEventListener('keydown', onKeyDown)
  void loadAll()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.clearTimeout(walkHintTimer)
  showroom.value?.dispose()
  showroom.value = null
})

function openPurchaseConfirm(item: ShopItem) {
  if (!isLoggedIn.value) return
  confirmItem.value = item
  confirmCurrency.value = item.options[0]?.currency ?? 'coins'
}

async function confirmPurchase() {
  const item = confirmItem.value
  const selected = confirmOption.value
  if (!item || !selected) return
  feedback.value = null
  purchasingId.value = selected.shop_catalog_item_id
  try {
    const result = await itemShopApi.purchaseShopItem({
      shop_catalog_item_id: selected.shop_catalog_item_id,
      currency: selected.currency,
    })
    feedback.value = { itemId: item.item_def_id, kind: 'success', text: result.message }
    confirmItem.value = null
  } catch (e) {
    feedback.value = {
      itemId: item.item_def_id,
      kind: 'error',
      text: e instanceof Error ? e.message : 'Purchase failed',
    }
  } finally {
    purchasingId.value = null
  }
}

const filterTabs: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'apartment', label: 'Apartment' },
  { key: 'skin', label: 'Skins & more' },
]
</script>

<template>
  <div class="relative h-full min-h-[560px] w-full overflow-hidden bg-[#a9cbea] text-white">
    <div ref="containerRef" class="absolute inset-0 isolate" />

    <!-- title + filters -->
    <div class="pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-col gap-3 sm:left-6 sm:top-6">
      <div class="pointer-events-auto rounded-xl border border-cyan-300/50 bg-[#060e28]/80 px-5 py-3 shadow-lg backdrop-blur">
        <p class="m-0 text-[11px] font-bold uppercase tracking-[0.3em] text-cyan-200">Season showroom</p>
        <h1 class="m-0 text-2xl font-black uppercase tracking-[0.08em] text-amber-300 sm:text-3xl">New Nation</h1>
        <p class="m-0 mt-1 text-xs text-white/70">Walk the plaza and preview everything you can buy.</p>
      </div>
      <div class="pointer-events-auto flex flex-wrap gap-2">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          type="button"
          :class="[
            'rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide backdrop-blur transition',
            filter === tab.key
              ? 'border-amber-300 bg-amber-300 text-slate-900'
              : 'border-white/40 bg-[#060e28]/70 text-white hover:bg-[#060e28]/90',
          ]"
          @click="filter = tab.key"
        >
          {{ tab.label }} <span class="opacity-70">{{ counts[tab.key] }}</span>
        </button>
      </div>
      <div v-if="!mapLoading && !loadError" class="pointer-events-auto flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-cyan-300/70 bg-[#060e28]/80 px-3 py-2 text-xs font-bold uppercase tracking-wide backdrop-blur transition hover:bg-[#060e28]"
          @click="setWalking(!walking)"
        >
          {{ walking ? '🛰️ Overview' : '🚶 Walk around' }}
        </button>
        <button
          v-if="walking"
          type="button"
          class="rounded-lg border border-white/40 bg-[#060e28]/80 px-3 py-2 text-xs font-bold uppercase tracking-wide backdrop-blur transition hover:bg-[#060e28]"
          @click="goToPlaza"
        >
          ⛲ Plaza
        </button>
      </div>
      <!-- apartment tour -->
      <div
        v-if="!mapLoading && !loadError && apartments.length > 0"
        class="pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-amber-300/50 bg-[#060e28]/80 p-1.5 backdrop-blur"
      >
        <button
          type="button"
          class="rounded-md px-2 py-1.5 text-xs font-bold hover:bg-white/10"
          aria-label="Previous apartment"
          @click="visitNextApartment(-1)"
        >
          ◀
        </button>
        <button
          v-for="apt in apartments"
          :key="apt.id"
          type="button"
          :class="[
            'rounded-md px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide transition',
            currentApartmentId === apt.id ? 'bg-amber-300 text-slate-900' : 'text-white hover:bg-white/10',
          ]"
          @click="visitApartment(apt.id)"
        >
          🏠 {{ apt.name }}
        </button>
        <button
          type="button"
          class="rounded-md px-2 py-1.5 text-xs font-bold hover:bg-white/10"
          aria-label="Next apartment"
          @click="visitNextApartment(1)"
        >
          ▶
        </button>
      </div>
    </div>

    <!-- visiting banner -->
    <div
      v-if="walking && currentApartment"
      class="pointer-events-none absolute bottom-24 left-4 whitespace-nowrap rounded-full border border-amber-300/70 bg-[#060e28]/85 px-5 py-2 text-center text-sm font-bold shadow-lg"
    >
      Visiting <span class="text-amber-300">{{ currentApartment.name }}</span>
      <span class="ml-2 hidden text-xs font-medium text-white/60 md:inline">N / B · next / previous home</span>
    </div>

    <!-- minimap + camera rotation -->
    <div
      v-if="!mapLoading && !loadError"
      :class="[
        'pointer-events-auto absolute bottom-24 right-4 flex flex-col items-end gap-2 sm:right-6',
        selectedItem ? 'hidden sm:flex' : 'flex',
      ]"
    >
      <NewNationMinimap :get-state="getMinimapState" @visit="visitApartment" @plaza="goToPlaza" />
      <div class="flex items-center gap-2 rounded-xl border border-cyan-300/50 bg-[#060e28]/85 p-1.5 backdrop-blur">
        <button
          type="button"
          class="h-10 w-10 select-none rounded-lg text-lg font-bold hover:bg-white/10 active:bg-white/20"
          aria-label="Rotate camera left (hold)"
          title="Rotate left (hold) · Q"
          @pointerdown.prevent="startTurn(-1)"
          @pointerup="stopTurn"
          @pointerleave="stopTurn"
          @pointercancel="stopTurn"
        >
          ⟲
        </button>
        <span class="text-[10px] font-bold uppercase tracking-widest text-white/60">Rotate</span>
        <button
          type="button"
          class="h-10 w-10 select-none rounded-lg text-lg font-bold hover:bg-white/10 active:bg-white/20"
          aria-label="Rotate camera right (hold)"
          title="Rotate right (hold) · E"
          @pointerdown.prevent="startTurn(1)"
          @pointerup="stopTurn"
          @pointerleave="stopTurn"
          @pointercancel="stopTurn"
        >
          ⟳
        </button>
      </div>
    </div>

    <!-- walk mode: crosshair + controls hint -->
    <template v-if="walking">
      <div class="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <div class="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 bg-white/85 shadow" />
        <div class="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-white/85 shadow" />
      </div>
      <div
        v-if="showWalkHint && !mouseLook && !selectedItem"
        class="pointer-events-none absolute left-1/2 top-1/2 mt-10 -translate-x-1/2 rounded-xl bg-[#060e28]/85 px-5 py-3 text-center text-sm"
      >
        <p class="m-0 font-bold">Drag to look around · click to capture the mouse</p>
        <p class="m-0 mt-1 text-xs text-white/70">WASD / arrows to move · Q / E to turn · Shift to run · Esc frees the mouse</p>
      </div>
    </template>

    <!-- hover hint -->
    <div
      v-if="hoveredItem && hoveredItem.item_def_id !== selectedId"
      class="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-full bg-[#060e28]/85 px-4 py-1.5 text-xs font-semibold"
    >
      Click to inspect {{ hoveredItem.name }}
    </div>

    <!-- loading / error -->
    <div
      v-if="mapLoading"
      class="absolute inset-0 flex items-center justify-center bg-[#0b1640]/70 text-sm font-semibold uppercase tracking-widest"
    >
      Building New Nation…
    </div>
    <div
      v-else-if="loadError"
      class="absolute left-1/2 top-1/2 w-[min(92%,420px)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-rose-300/60 bg-rose-950/85 p-5 text-rose-50"
      role="alert"
    >
      <p class="m-0 font-semibold">Could not open New Nation</p>
      <p class="m-0 mt-1 text-sm text-rose-100/90">{{ loadError }}</p>
      <button type="button" class="mt-3 rounded-md border border-rose-200/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wide" @click="loadAll">
        Try again
      </button>
    </div>
    <div
      v-else-if="catalogError"
      class="absolute right-4 top-4 w-[min(calc(100%-2rem),320px)] rounded-xl border border-amber-300/60 sm:right-6 sm:top-6 bg-[#060e28]/90 px-4 py-3 text-sm shadow-lg"
      role="status"
    >
      <p class="m-0 font-semibold text-amber-200">Shop items are unavailable right now</p>
      <p class="m-0 mt-0.5 text-xs text-white/70">
        You can still walk the plaza and visit the apartments. ({{ catalogError }})
      </p>
      <button
        type="button"
        class="mt-2 rounded-md border border-amber-200/80 px-3 py-1 text-xs font-bold uppercase tracking-wide disabled:opacity-60"
        :disabled="catalogLoading"
        @click="retryCatalog"
      >
        {{ catalogLoading ? 'Retrying…' : 'Retry' }}
      </button>
    </div>
    <div
      v-else-if="!catalogLoading && visibleItems.length === 0"
      class="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#060e28]/80 px-5 py-3 text-sm font-semibold"
    >
      No items in this section yet.
    </div>

    <!-- selected item panel -->
    <aside
      v-if="selectedItem"
      class="absolute bottom-24 right-4 w-[min(calc(100%-2rem),360px)] rounded-xl border border-cyan-300/60 bg-[#060e28]/90 p-5 shadow-2xl backdrop-blur sm:bottom-auto sm:right-6 sm:top-6"
    >
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="m-0 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
            {{ itemGroup(selectedItem) === 'apartment' ? 'Apartment asset' : 'Skin & cosmetic' }}
          </p>
          <h2 class="m-0 mt-1 text-2xl font-black uppercase leading-tight">{{ selectedItem.name }}</h2>
        </div>
        <button
          type="button"
          class="rounded-md border border-white/30 px-2 py-1 text-xs font-bold text-white/80 hover:bg-white/10"
          aria-label="Close and return to overview"
          @click="selectItem(null)"
        >
          ✕
        </button>
      </div>
      <p v-if="selectedItem.description" class="m-0 mt-3 text-sm text-white/75">{{ selectedItem.description }}</p>

      <ul class="m-0 mt-4 list-none space-y-1.5 border-y border-white/10 p-0 py-3 text-sm">
        <li v-for="option in selectedItem.options" :key="option.shop_catalog_item_id" class="flex items-center justify-between">
          <span class="text-white/70">{{ currencyLabel(option.currency) }}</span>
          <span class="font-bold">{{ priceBadge(option) }}</span>
        </li>
      </ul>

      <div
        v-if="feedback && feedback.itemId === selectedItem.item_def_id"
        :class="[
          'mt-3 rounded-md border px-3 py-2 text-sm',
          feedback.kind === 'success' ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-100' : 'border-rose-300/50 bg-rose-500/15 text-rose-100',
        ]"
        role="status"
      >
        {{ feedback.text }}
      </div>

      <button
        v-if="isLoggedIn"
        type="button"
        class="mt-4 w-full rounded-lg border border-amber-200 bg-amber-300 px-4 py-3 text-lg font-black uppercase tracking-wide text-slate-900 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="purchasingId !== null"
        @click="openPurchaseConfirm(selectedItem)"
      >
        {{ purchasingId ? 'Processing…' : 'Buy' }}
      </button>
      <RouterLink
        v-else
        to="/login"
        class="mt-4 flex w-full items-center justify-center rounded-lg border border-cyan-300/80 bg-[#02153c] px-4 py-3 text-base font-black uppercase tracking-wide text-cyan-100 hover:bg-[#08245e]"
      >
        Sign in to buy
      </RouterLink>
      <RouterLink
        :to="{ name: itemGroup(selectedItem) === 'apartment' ? 'shop' : 'shop-skin' }"
        class="mt-2 block text-center text-xs font-semibold text-cyan-200 underline underline-offset-2"
      >
        Open in the shop
      </RouterLink>
    </aside>

    <!-- bottom item rail -->
    <div
      v-if="!mapLoading && !catalogLoading && visibleItems.length > 0"
      class="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-[#060e28]/90 to-transparent px-4 pb-4 pt-8"
    >
      <button
        type="button"
        class="shrink-0 rounded-full border border-white/40 bg-[#060e28]/80 px-3 py-2 text-sm font-bold hover:bg-[#060e28]"
        aria-label="Previous item"
        @click="stepSelection(-1)"
      >
        ◀
      </button>
      <ul class="m-0 flex min-w-0 flex-1 list-none gap-2 overflow-x-auto p-0 pb-1">
        <li v-for="item in visibleItems" :key="item.item_def_id" class="shrink-0">
          <button
            type="button"
            :class="[
              'rounded-lg border px-3 py-2 text-left text-xs transition',
              selectedId === item.item_def_id
                ? 'border-amber-300 bg-amber-300/20'
                : 'border-white/25 bg-[#060e28]/75 hover:border-cyan-300/70',
            ]"
            @click="selectItem(item.item_def_id)"
          >
            <span class="block max-w-[160px] truncate font-bold uppercase tracking-wide">{{ item.name }}</span>
            <span class="block text-cyan-200">{{ item.options[0] ? priceBadge(item.options[0]) : '' }}</span>
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="shrink-0 rounded-full border border-white/40 bg-[#060e28]/80 px-3 py-2 text-sm font-bold hover:bg-[#060e28]"
        aria-label="Next item"
        @click="stepSelection(1)"
      >
        ▶
      </button>
      <p class="m-0 hidden shrink-0 text-[11px] text-white/60 lg:block">
        {{ walking ? 'WASD to walk · Drag or Q/E to turn · N/B next home' : 'Drag to orbit · Q/E to rotate · ←/→ to browse' }}
      </p>
    </div>

    <ItemShopPurchaseConfirmModal
      v-if="confirmItem"
      :item="confirmItem"
      v-model:confirm-currency="confirmCurrency"
      :confirm-current="confirmCurrent"
      :confirm-after="confirmAfter"
      :confirm-option="confirmOption"
      :purchasing-id="purchasingId"
      @close="confirmItem = null"
      @confirm="confirmPurchase"
    />
  </div>
</template>
