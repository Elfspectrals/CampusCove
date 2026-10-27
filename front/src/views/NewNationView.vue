<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import * as itemShopApi from '../api/itemShop'
import type { ShopItem } from '../api/itemShop'
import UiIcon from '../components/ui/UiIcon.vue'
import UiLogo from '../components/ui/UiLogo.vue'
import NewNationApartmentTour from '../components/newNation/NewNationApartmentTour.vue'
import NewNationItemPanel from '../components/newNation/NewNationItemPanel.vue'
import NewNationItemRail from '../components/newNation/NewNationItemRail.vue'
import NewNationMinimap from '../components/newNation/NewNationMinimap.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import { useShopPurchase } from '../composables/useShopPurchase'
import { FISHING_PREVIEW_FILTER, FISHING_PREVIEW_ITEMS, isPreviewOnlyItem, previewItemRarity } from '../game/fishingPreviewItems'
import type { Rarity } from '../game/rarity'
import { NewNationShowroom } from '../game/newNation/NewNationShowroom'
import type { ShowroomApartment } from '../game/newNation/showroomLayout'
import type { ShowroomGroup, ShowroomItem } from '../game/newNation/showroomItems'
import { isApartmentItem, isFoodItem, itemRarity, priceBadge } from '../utils/itemShopPresentation'

type Filter = 'all' | ShowroomGroup | typeof FISHING_PREVIEW_FILTER

const containerRef = ref<HTMLElement | null>(null)
const showroom = shallowRef<NewNationShowroom | null>(null)

const shopItems = ref<ShopItem[]>([])
/** This whole page is admin-only (router guard), so the unreleased fishing previews are always included. */
const items = computed<ShopItem[]>(() => [...shopItems.value, ...FISHING_PREVIEW_ITEMS])
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

const {
  isLoggedIn,
  confirmItem,
  confirmCurrency,
  confirmOption,
  confirmCurrent,
  confirmAfter,
  purchasingId,
  feedbackByItem,
  openPurchaseConfirm,
  closePurchaseConfirm,
  confirmPurchase,
} = useShopPurchase()

function itemGroup(item: ShopItem): ShowroomGroup {
  return isApartmentItem(item) ? 'apartment' : 'skin'
}

const visibleItems = computed<ShopItem[]>(() =>
  filter.value === 'all'
    ? items.value
    : filter.value === FISHING_PREVIEW_FILTER
      ? items.value.filter(isPreviewOnlyItem)
      : items.value.filter((item) => !isPreviewOnlyItem(item) && itemGroup(item) === filter.value),
)

const selectedItem = computed<ShopItem | null>(
  () => items.value.find((item) => item.item_def_id === selectedId.value) ?? null,
)

const hoveredItem = computed<ShopItem | null>(
  () => items.value.find((item) => item.item_def_id === hoveredId.value) ?? null,
)

const counts = computed(() => ({
  all: items.value.length,
  apartment: items.value.filter((i) => !isPreviewOnlyItem(i) && itemGroup(i) === 'apartment').length,
  skin: items.value.filter((i) => itemGroup(i) === 'skin').length,
  fishing: items.value.filter(isPreviewOnlyItem).length,
}))

function rarityOf(item: ShopItem): Rarity {
  return previewItemRarity(item) ?? itemRarity(item)
}

function toShowroomItem(item: ShopItem): ShowroomItem {
  const first = item.options[0]
  return {
    id: item.item_def_id,
    name: item.name,
    priceLabel: first ? priceBadge(first) : isPreviewOnlyItem(item) ? 'Admin preview' : '',
    group: itemGroup(item),
    rarity: rarityOf(item),
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
    if (token === loadToken) shopItems.value = res.items.filter((item) => !isFoodItem(item))
  } catch (e) {
    if (token !== loadToken) return
    catalogError.value = e instanceof Error ? e.message : 'Could not load the shop'
    shopItems.value = []
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

const filterTabs = computed<Array<{ key: Filter; label: string }>>(() => [
  { key: 'all', label: 'All' },
  { key: 'apartment', label: 'Apartment' },
  { key: 'skin', label: 'Skins & more' },
  { key: FISHING_PREVIEW_FILTER as Filter, label: 'Fishing' },
])
</script>

<template>
  <div class="relative h-full min-h-[560px] w-full overflow-hidden bg-[#a9cbea] text-white">
    <div ref="containerRef" class="absolute inset-0 isolate" />

    <!-- title + filters -->
    <div class="pointer-events-none absolute left-4 top-4 flex max-w-[calc(100%-2rem)] flex-col gap-3 sm:left-6 sm:top-6">
      <div class="cc-panel-glass pointer-events-auto px-5 py-3.5">
        <p class="cc-eyebrow m-0 text-pool">Season 1 · Showroom</p>
        <h1 class="cc-display m-0 text-3xl text-sun sm:text-4xl">New Nation</h1>
        <p class="m-0 mt-1 text-xs font-semibold text-mist">Walk the plaza and preview everything you can buy.</p>
      </div>
      <div class="pointer-events-auto flex flex-wrap gap-2">
        <button
          v-for="tab in filterTabs"
          :key="tab.key"
          type="button"
          :class="[
            'cc-btn cc-btn-sm',
            filter === tab.key ? 'cc-btn-sun' : 'cc-btn-ghost backdrop-blur',
          ]"
          @click="filter = tab.key"
        >
          {{ tab.label }} <span class="opacity-70">{{ counts[tab.key] }}</span>
        </button>
      </div>
      <div v-if="!mapLoading && !loadError" class="pointer-events-auto flex flex-wrap gap-2">
        <button
          type="button"
          class="cc-btn cc-btn-pool cc-btn-sm"
          @click="setWalking(!walking)"
        >
          <UiIcon :name="walking ? 'eye' : 'walk'" :size="16" />
          {{ walking ? 'Overview' : 'Walk around' }}
        </button>
        <button
          v-if="walking"
          type="button"
          class="cc-btn cc-btn-ghost cc-btn-sm backdrop-blur"
          @click="goToPlaza"
        >
          <UiIcon name="flag" :size="16" /> Plaza
        </button>
      </div>
      <NewNationApartmentTour
        v-if="!mapLoading && !loadError && apartments.length > 0"
        :apartments="apartments"
        :current-apartment-id="currentApartmentId"
        @visit="visitApartment"
        @step="visitNextApartment"
      />
    </div>

    <!-- visiting banner -->
    <div
      v-if="walking && currentApartment"
      class="cc-hud pointer-events-none absolute bottom-24 left-4 whitespace-nowrap border-sun/60 px-5 py-2 text-center text-sm font-bold"
    >
      Visiting <span class="text-sun">{{ currentApartment.name }}</span>
      <span class="ml-2 hidden text-xs font-bold text-mist md:inline"><span class="cc-keycap">N</span> / <span class="cc-keycap">B</span> next / previous home</span>
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
      <div class="cc-hud flex items-center gap-2 p-1.5">
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
          <UiIcon name="rotate-left" class="mx-auto" />
        </button>
        <span class="text-[10px] font-extrabold uppercase tracking-widest text-mist">Rotate</span>
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
          <UiIcon name="rotate-right" class="mx-auto" />
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
        class="cc-hud pointer-events-none absolute left-1/2 top-1/2 mt-10 -translate-x-1/2 px-5 py-3 text-center text-sm"
      >
        <p class="m-0 font-bold">Drag to look around · click to capture the mouse</p>
        <p class="m-0 mt-1 text-xs font-semibold text-mist">WASD / arrows to move · Q / E to turn · Shift to run · Esc frees the mouse</p>
      </div>
    </template>

    <!-- hover hint -->
    <div
      v-if="hoveredItem && hoveredItem.item_def_id !== selectedId"
      class="cc-hud pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 px-4 py-1.5 text-xs font-extrabold"
    >
      Click to inspect {{ hoveredItem.name }}
    </div>

    <!-- loading / error -->
    <div
      v-if="mapLoading"
      class="cc-world absolute inset-0 flex flex-col items-center justify-center gap-4"
    >
      <UiLogo size="md" class="animate-cc-float" />
      <span class="cc-display text-2xl">Building New Nation…</span>
      <div class="cc-meter w-56"><span class="w-2/3 animate-pulse" /></div>
    </div>
    <div
      v-else-if="loadError"
      class="cc-panel absolute left-1/2 top-1/2 w-[min(92%,420px)] -translate-x-1/2 -translate-y-1/2 border-coral/60 p-6"
      role="alert"
    >
      <p class="cc-display m-0 text-2xl text-coral">Could not open New Nation</p>
      <p class="m-0 mt-1 text-sm font-semibold text-mist">{{ loadError }}</p>
      <button type="button" class="cc-btn cc-btn-coral cc-btn-sm mt-4" @click="loadAll">
        Try again
      </button>
    </div>
    <div
      v-else-if="catalogError"
      class="cc-panel-glass absolute right-4 top-4 w-[min(calc(100%-2rem),320px)] border-sun/50 px-4 py-3 text-sm sm:right-6 sm:top-6"
      role="status"
    >
      <p class="m-0 font-extrabold text-sun">Shop items are unavailable right now</p>
      <p class="m-0 mt-0.5 text-xs font-semibold text-mist">
        You can still walk the plaza and visit the apartments. ({{ catalogError }})
      </p>
      <button
        type="button"
        class="cc-btn cc-btn-sun cc-btn-sm mt-3"
        :disabled="catalogLoading"
        @click="retryCatalog"
      >
        {{ catalogLoading ? 'Retrying…' : 'Retry' }}
      </button>
    </div>
    <div
      v-else-if="!catalogLoading && visibleItems.length === 0"
      class="cc-hud pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-5 py-3 text-sm font-bold"
    >
      No items in this section yet.
    </div>

    <NewNationItemPanel
      v-if="selectedItem"
      :item="selectedItem"
      :rarity="rarityOf(selectedItem)"
      :is-logged-in="isLoggedIn"
      :purchasing="purchasingId !== null"
      :feedback="feedbackByItem[selectedItem.item_def_id]"
      @close="selectItem(null)"
      @buy="openPurchaseConfirm"
    />

    <NewNationItemRail
      v-if="!mapLoading && !catalogLoading && visibleItems.length > 0"
      :items="visibleItems"
      :selected-id="selectedId"
      :walking="walking"
      :rarity-of="rarityOf"
      @select="selectItem"
      @step="stepSelection"
    />

    <ItemShopPurchaseConfirmModal
      v-if="confirmItem"
      :item="confirmItem"
      v-model:confirm-currency="confirmCurrency"
      :confirm-current="confirmCurrent"
      :confirm-after="confirmAfter"
      :confirm-option="confirmOption"
      :purchasing-id="purchasingId"
      @close="closePurchaseConfirm"
      @confirm="confirmPurchase"
    />
  </div>
</template>
