<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useShopPurchase } from '../composables/useShopPurchase'
import LockerCharacterPreview from '../components/locker/LockerCharacterPreview.vue'
import ItemShopPurchaseConfirmModal from '../components/shop/ItemShopPurchaseConfirmModal.vue'
import * as itemShopApi from '../api/itemShop'
import type { ShopItem } from '../api/itemShop'
import { currencyLabel, isApartmentItem, isFoodItem, itemRarity, rarityClass } from '../utils/itemShopPresentation'
import UiIcon from '../components/ui/UiIcon.vue'
import UiCurrency from '../components/ui/UiCurrency.vue'

const items = ref<ShopItem[]>([])
const catalogLoading = ref(true)
const catalogError = ref<string | null>(null)
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
const selectedItemDefId = ref<number | null>(null)

const selectedItem = computed<ShopItem | null>(() => {
  if (filteredItems.value.length === 0) return null
  if (selectedItemDefId.value === null) return filteredItems.value[0] ?? null
  return filteredItems.value.find((item) => item.item_def_id === selectedItemDefId.value) ?? filteredItems.value[0] ?? null
})

/** Skins only: furniture is bought by walking through the Cove Home store in /game. */
const filteredItems = computed<ShopItem[]>(() => items.value.filter((item) => !isApartmentItem(item) && !isFoodItem(item)))

function selectItem(item: ShopItem) {
  selectedItemDefId.value = item.item_def_id
}

onMounted(() => {
  void loadCatalog()
})

async function loadCatalog() {
  catalogLoading.value = true
  catalogError.value = null
  try {
    const res = await itemShopApi.fetchItemShopCatalog()
    items.value = res.items
  } catch (e) {
    catalogError.value = e instanceof Error ? e.message : 'Could not load the shop'
    items.value = []
  } finally {
    catalogLoading.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1600px]">
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="cc-eyebrow">Item shop · Season 1</p>
        <h1 class="cc-title">Skin Shop</h1>
      </div>
      <RouterLink :to="{ name: 'game' }" class="cc-panel-flat flex items-center gap-3 px-4 py-2.5 transition hover:brightness-110">
        <UiIcon name="chair" :size="22" class="text-sun" />
        <span class="text-left">
          <span class="block font-display text-sm uppercase tracking-wide text-fog">Looking for furniture?</span>
          <span class="block text-xs font-semibold text-mist">Walk through Cove Home, east of the business district</span>
        </span>
      </RouterLink>
    </div>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section class="min-w-0">
        <div v-if="!isLoggedIn" class="cc-alert cc-alert-warn mb-4" role="status">
          <UiIcon name="lock" :size="18" />
          <div class="flex-1">
            <p class="m-0 font-extrabold">Sign in to buy</p>
            <p class="m-0 mt-0.5 font-semibold text-sun/80">You can still browse every item in the catalog.</p>
          </div>
          <RouterLink to="/login" class="cc-btn cc-btn-sun cc-btn-sm">Sign in</RouterLink>
        </div>

        <div v-if="catalogLoading" class="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <div v-for="n in 8" :key="n" class="h-56 animate-pulse rounded-chunk border-2 border-ink-700 bg-ink-800/60" />
        </div>

        <div v-else-if="catalogError" class="cc-alert cc-alert-error" role="alert">
          <UiIcon name="alert" :size="18" />
          <div class="flex-1">
            <p class="m-0 font-extrabold">Could not load items</p>
            <p class="m-0 mt-0.5 font-semibold opacity-80">{{ catalogError }}</p>
          </div>
          <button type="button" class="cc-btn cc-btn-coral cc-btn-sm" @click="loadCatalog">Try again</button>
        </div>

        <div v-else-if="filteredItems.length === 0" class="cc-panel-flat flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
          <UiIcon name="box" :size="40" class="text-ink-500" />
          <p class="m-0 font-bold text-mist">No items in this section yet.</p>
        </div>

        <ul v-else class="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 xl:grid-cols-4">
          <li
            v-for="item in filteredItems"
            :key="item.item_def_id"
            :class="['cc-card', rarityClass(itemRarity(item)), selectedItem?.item_def_id === item.item_def_id && 'cc-card-selected']"
          >
            <button
              type="button"
              class="block w-full text-left"
              :aria-pressed="selectedItem?.item_def_id === item.item_def_id"
              @click="selectItem(item)"
            >
              <div class="cc-rarity-bg relative grid h-40 place-items-center overflow-hidden">
                <img
                  v-if="item.preview_image"
                  :src="item.preview_image"
                  :alt="`${item.name} preview`"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
                <UiIcon v-else name="shirt" :size="52" class="text-white/80 drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]" />
                <span class="cc-rarity-text absolute left-2 top-2 rounded-md bg-ink-950/75 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
                  {{ itemRarity(item) }}
                </span>
              </div>
              <div class="border-t-2 border-ink-950/60 bg-ink-950/60 px-3 py-2.5">
                <p class="cc-display m-0 truncate text-lg leading-tight">{{ item.name }}</p>
                <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <UiCurrency
                    v-for="opt in item.options"
                    :key="opt.shop_catalog_item_id"
                    :currency="opt.currency"
                    :amount="opt.price"
                    :size="16"
                    class="text-sm"
                    :class="opt.currency === 'coins' ? 'text-sun' : 'text-grape'"
                  />
                </div>
              </div>
            </button>
          </li>
        </ul>
      </section>

      <!-- featured item -->
      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div v-if="selectedItem" :class="['cc-panel overflow-hidden', rarityClass(itemRarity(selectedItem))]">
          <div class="cc-rarity-bg relative h-[340px] border-b-2 border-ink-950">
            <!-- stage floor -->
            <div class="pointer-events-none absolute inset-x-10 bottom-6 h-10 rounded-[50%] bg-ink-950/50 blur-md" />
            <template v-if="selectedItem.model_glb">
              <LockerCharacterPreview
                :asset-src="selectedItem.model_glb"
                :interactive="false"
                :show-drag-hint="false"
                :plain="true"
              />
            </template>
            <img
              v-else-if="selectedItem.preview_image"
              :src="selectedItem.preview_image"
              :alt="`${selectedItem.name} featured preview`"
              class="h-full w-full object-cover"
            />
            <div v-else class="grid h-full place-items-center">
              <UiIcon name="shirt" :size="96" class="text-white/80" />
            </div>
            <span class="cc-rarity-text cc-rarity-border absolute right-4 top-4 rounded-full border-2 bg-ink-950/75 px-3 py-1 text-xs font-black uppercase tracking-widest">
              {{ itemRarity(selectedItem) }}
            </span>
          </div>

          <div class="p-6">
            <h2 class="cc-display m-0 text-4xl leading-none">{{ selectedItem.name }}</h2>
            <p v-if="selectedItem.description" class="m-0 mt-2 text-sm font-semibold text-mist">{{ selectedItem.description }}</p>

            <dl class="mt-5 grid grid-cols-2 gap-2 text-sm">
              <div class="cc-panel-flat px-3 py-2">
                <dt class="cc-eyebrow">Season</dt>
                <dd class="m-0 font-extrabold">Season 1</dd>
              </div>
              <div class="cc-panel-flat px-3 py-2">
                <dt class="cc-eyebrow">Rarity</dt>
                <dd class="cc-rarity-text m-0 font-extrabold capitalize">{{ itemRarity(selectedItem) }}</dd>
              </div>
            </dl>

            <ul class="m-0 mt-4 list-none space-y-2 p-0">
              <li
                v-for="option in selectedItem.options"
                :key="`selected-option-${option.shop_catalog_item_id}`"
                class="flex items-center justify-between rounded-xl bg-ink-950/50 px-4 py-2.5"
              >
                <span class="text-sm font-bold text-mist">Pay with {{ currencyLabel(option.currency) }}</span>
                <UiCurrency :currency="option.currency" :amount="option.price" :size="20" class="text-lg" :class="option.currency === 'coins' ? 'text-sun' : 'text-grape'" />
              </li>
            </ul>

            <div
              v-if="feedbackByItem[selectedItem.item_def_id]"
              :class="['cc-alert mt-4', feedbackByItem[selectedItem.item_def_id]?.kind === 'success' ? 'cc-alert-success' : 'cc-alert-error']"
              role="status"
            >
              <UiIcon :name="feedbackByItem[selectedItem.item_def_id]?.kind === 'success' ? 'check' : 'alert'" :size="18" />
              {{ feedbackByItem[selectedItem.item_def_id]?.text }}
            </div>

            <button
              v-if="isLoggedIn"
              type="button"
              class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine mt-5 w-full"
              :disabled="purchasingId !== null"
              @click="openPurchaseConfirm(selectedItem)"
            >
              {{ purchasingId ? 'Processing…' : 'Buy' }}
            </button>
            <RouterLink v-else to="/login" class="cc-btn cc-btn-pool cc-btn-lg mt-5 w-full">
              <UiIcon name="login" :size="18" /> Sign in to buy
            </RouterLink>
            <p class="m-0 mt-3 text-center text-xs font-semibold text-mist">
              Purchased skins appear in your
              <RouterLink to="/locker" class="font-extrabold text-pool hover:underline">Locker</RouterLink>.
            </p>
          </div>
        </div>
        <div v-else class="cc-panel-flat grid h-[420px] place-items-center text-sm font-bold text-mist">Select an item</div>
      </aside>
    </div>

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
