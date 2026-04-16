<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import { useWalletBalances } from '../composables/useWalletBalances'
import LockerCharacterPreview from '../components/locker/LockerCharacterPreview.vue'
import * as itemShopApi from '../api/itemShop'
import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../api/itemShop'

const items = ref<ShopItem[]>([])
const catalogLoading = ref(true)
const catalogError = ref<string | null>(null)
const purchasingId = ref<number | null>(null)

interface ItemFeedback {
  kind: 'success' | 'error'
  text: string
}

const feedbackByItem = ref<Record<number, ItemFeedback>>({})

const auth = computed(() => getStoredAuth())
const isLoggedIn = computed(() => Boolean(auth.value?.token))
const balances = useWalletBalances()

const confirmItem = ref<ShopItem | null>(null)
const confirmCurrency = ref<ShopCurrency>('coins')
const selectedItemDefId = ref<number | null>(null)

const confirmOptions = computed(() => {
  return confirmItem.value?.options ?? []
})

const confirmOption = computed<ShopItemCurrencyOption | null>(() => {
  return confirmOptions.value.find((opt) => opt.currency === confirmCurrency.value) ?? null
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

const selectedItem = computed<ShopItem | null>(() => {
  if (items.value.length === 0) return null
  if (selectedItemDefId.value === null) return items.value[0] ?? null
  return items.value.find((item) => item.item_def_id === selectedItemDefId.value) ?? items.value[0] ?? null
})

const selectedPrimaryOption = computed<ShopItemCurrencyOption | null>(() => {
  return selectedItem.value?.options[0] ?? null
})

const selectedCurrencyText = computed<string>(() => {
  if (!selectedPrimaryOption.value) return 'Unavailable'
  return currencyLabel(selectedPrimaryOption.value.currency)
})

const selectedRarityText = computed<string>(() => {
  if (!selectedPrimaryOption.value) return 'Common'
  if (selectedPrimaryOption.value.currency === 'premium') return 'Rare'
  if (selectedItem.value && selectedItem.value.options.length > 1) return 'Epic'
  return 'Legendary'
})

const selectedRarityClass = computed<string>(() => {
  if (!selectedPrimaryOption.value) return 'border-white/25 text-white/70'
  if (selectedPrimaryOption.value.currency === 'premium') return 'border-cyan-300 text-cyan-300'
  if (selectedItem.value && selectedItem.value.options.length > 1) return 'border-fuchsia-300 text-fuchsia-300'
  return 'border-orange-300 text-orange-300'
})

function cardToneClasses(item: ShopItem): string {
  const hasPremium = item.options.some((option) => option.currency === 'premium')
  const hasCoins = item.options.some((option) => option.currency === 'coins')
  if (hasPremium && hasCoins) {
    return 'border-fuchsia-400/90 bg-[radial-gradient(circle_at_center,_#a855f7_0%,_#6d28d9_55%,_#3b1a73_100%)]'
  }
  if (hasPremium) {
    return 'border-cyan-300/90 bg-[radial-gradient(circle_at_center,_#4cc2ff_0%,_#1e5db7_58%,_#0e2b63_100%)]'
  }
  return 'border-orange-300/90 bg-[radial-gradient(circle_at_center,_#f59e66_0%,_#aa5b30_58%,_#6f311b_100%)]'
}

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

function clearFeedbackForItem(itemDefId: number) {
  const next = { ...feedbackByItem.value }
  delete next[itemDefId]
  feedbackByItem.value = next
}

function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

function priceBadge(option: ShopItemCurrencyOption): string {
  const sym = option.currency === 'coins' ? '🪙' : '✨'
  return `${sym} ${option.price.toLocaleString()}`
}

function openPurchaseConfirm(item: ShopItem) {
  if (!isLoggedIn.value) return
  confirmItem.value = item
  confirmCurrency.value = item.options[0]?.currency ?? 'coins'
}

function closePurchaseConfirm() {
  confirmItem.value = null
}

async function confirmPurchase() {
  const item = confirmItem.value
  const selected = confirmOption.value
  if (!item || !selected) return
  clearFeedbackForItem(item.item_def_id)
  purchasingId.value = selected.shop_catalog_item_id
  try {
    const result = await itemShopApi.purchaseShopItem({
      shop_catalog_item_id: selected.shop_catalog_item_id,
      currency: selected.currency,
    })
    feedbackByItem.value = {
      ...feedbackByItem.value,
      [item.item_def_id]: { kind: 'success', text: result.message },
    }
    closePurchaseConfirm()
  } catch (e) {
    const text = e instanceof Error ? e.message : 'Purchase failed'
    feedbackByItem.value = {
      ...feedbackByItem.value,
      [item.item_def_id]: { kind: 'error', text },
    }
  } finally {
    purchasingId.value = null
  }
}
</script>

<template>
  <div class="relative min-h-screen overflow-hidden bg-[#181c2c] text-white">
    <div class="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,#22273a_0%,#171c2d_30%,#111526_100%)]" />
    <div class="relative mx-auto flex min-h-screen max-w-[1540px] flex-col lg:flex-row">
      <section class="flex min-h-0 flex-1 flex-col border-b border-cyan-300/35 lg:border-b-0 lg:border-r lg:border-cyan-300/40">
        <header class="h-16 border-b border-slate-400/20 bg-[#5b71994d] px-6 py-3">
          <h1 class="m-0 text-2xl font-black uppercase tracking-[0.08em] text-white/85">My Locker</h1>
        </header>

        <div class="flex-1 p-5">
          <div
            v-if="!isLoggedIn"
            class="mb-4 rounded-md border border-amber-300/60 bg-amber-900/40 px-4 py-3 text-sm text-amber-100"
            role="status"
          >
            <p class="m-0 font-semibold">Sign in to purchase</p>
            <p class="m-0 mt-1 text-amber-100/90">You can still browse every catalog item.</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <RouterLink to="/login" class="rounded-md border border-amber-200 bg-amber-300/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-900">Sign in</RouterLink>
              <RouterLink to="/register" class="rounded-md border border-amber-200/60 bg-transparent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-100">Create account</RouterLink>
            </div>
          </div>

          <div v-if="catalogLoading" class="flex min-h-[320px] items-center justify-center text-sm font-semibold text-slate-200">
            Loading catalog...
          </div>

          <div v-else-if="catalogError" class="rounded-md border border-rose-300/50 bg-rose-950/50 p-4 text-rose-100" role="alert">
            <p class="m-0 font-semibold">Could not load items</p>
            <p class="m-0 mt-1 text-sm text-rose-100/90">{{ catalogError }}</p>
            <button type="button" class="mt-3 rounded-md border border-rose-200/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wide" @click="loadCatalog">
              Try again
            </button>
          </div>

          <div v-else-if="items.length === 0" class="flex min-h-[320px] items-center justify-center rounded-md border border-slate-200/20 bg-black/20 text-sm font-semibold text-slate-300">
            No skins yet. Check back later.
          </div>

          <ul v-else class="m-0 grid max-h-[calc(100vh-9.5rem)] list-none grid-cols-2 gap-3 overflow-y-auto p-0 sm:grid-cols-3 xl:grid-cols-4">
            <li
              v-for="item in items"
              :key="item.item_def_id"
              :class="[
                'relative overflow-hidden border transition',
                cardToneClasses(item),
                selectedItem?.item_def_id === item.item_def_id ? 'ring-2 ring-yellow-300/90 ring-offset-2 ring-offset-[#171c2d]' : '',
              ]"
            >
              <button
                type="button"
                class="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                @click="selectItem(item)"
              >
                <img
                  v-if="item.preview_image"
                  :src="item.preview_image"
                  :alt="`${item.name} preview`"
                  class="h-36 w-full object-cover"
                />
                <div v-else class="flex h-36 w-full items-center justify-center bg-black/25 text-xs font-semibold uppercase tracking-wide text-white/60">
                  No preview
                </div>
                <div class="bg-black/30 px-2 py-1.5 text-center">
                  <p class="m-0 truncate text-sm font-black uppercase tracking-wide text-white">{{ item.name }}</p>
                  <p class="m-0 text-xs tracking-wide text-white/75">{{ selectedItem?.item_def_id === item.item_def_id ? selectedCurrencyText : currencyLabel(item.options[0]?.currency ?? 'coins') }}</p>
                </div>
              </button>

              <button
                v-if="isLoggedIn"
                type="button"
                class="absolute right-2 top-2 rounded border border-white/60 bg-black/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-black/55"
                :disabled="purchasingId !== null"
                @click="openPurchaseConfirm(item)"
              >
                Buy
              </button>
              <RouterLink
                v-else
                to="/login"
                class="absolute right-2 top-2 rounded border border-white/55 bg-black/35 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white hover:bg-black/55"
              >
                Sign in
              </RouterLink>
            </li>
          </ul>
        </div>
      </section>

      <aside class="w-full bg-[#15182b] lg:w-[500px]">
        <div class="border-b border-cyan-300/80">
          <div
            v-if="selectedItem"
            class="relative h-[360px] border border-cyan-300/90 bg-[radial-gradient(circle_at_center,_#4cc2ff_0%,_#1e5db7_58%,_#0e2b63_100%)]"
          >
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
            <div v-else class="flex h-full items-center justify-center text-sm font-semibold uppercase tracking-wide text-white/70">
              No preview available
            </div>
            <span
              :class="['absolute right-4 top-4 rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wide', selectedRarityClass]"
            >
              {{ selectedRarityText }}
            </span>
          </div>
          <div v-else class="flex h-[360px] items-center justify-center border border-cyan-300/40 text-sm text-white/70">Select an item</div>
        </div>

        <div class="bg-[#000724f2] p-8">
          <template v-if="selectedItem">
            <h2 class="m-0 text-center text-4xl font-black uppercase tracking-[0.04em] text-white">{{ selectedItem.name }}</h2>
            <p class="m-0 mt-2 text-center text-sm uppercase tracking-[0.16em] text-white/70">{{ selectedCurrencyText }}</p>

            <dl class="mt-6 border-y border-white/10 py-4 text-sm">
              <div class="flex items-center justify-between py-1.5">
                <dt class="text-white/60">Season</dt>
                <dd class="font-semibold text-white">Season 1</dd>
              </div>
              <div class="flex items-center justify-between py-1.5">
                <dt class="text-white/60">Rarity</dt>
                <dd :class="['font-extrabold uppercase tracking-wide', selectedRarityClass]">{{ selectedRarityText }}</dd>
              </div>
            </dl>

            <ul class="m-0 mt-4 list-none space-y-2 p-0 text-sm">
              <li v-for="option in selectedItem.options" :key="`selected-option-${option.shop_catalog_item_id}`" class="flex items-center justify-between text-white/85">
                <span>{{ currencyLabel(option.currency) }}</span>
                <span class="font-bold">{{ priceBadge(option) }}</span>
              </li>
            </ul>

            <div
              v-if="feedbackByItem[selectedItem.item_def_id]"
              :class="[
                'mt-4 rounded-md border px-3 py-2 text-sm',
                feedbackByItem[selectedItem.item_def_id]?.kind === 'success'
                  ? 'border-emerald-300/50 bg-emerald-500/15 text-emerald-100'
                  : 'border-rose-300/50 bg-rose-500/15 text-rose-100',
              ]"
              role="status"
            >
              {{ feedbackByItem[selectedItem.item_def_id]?.text }}
            </div>

            <button
              v-if="isLoggedIn"
              type="button"
              class="mt-6 w-full border border-cyan-300/90 bg-[radial-gradient(circle_at_center,_#4cc2ff_0%,_#1e5db7_58%,_#0e2b63_100%)] px-4 py-4 text-3xl font-black uppercase tracking-wide text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="purchasingId !== null"
              @click="openPurchaseConfirm(selectedItem)"
            >
              {{ purchasingId ? 'Processing…' : 'Buy' }}
            </button>
            <RouterLink
              v-else
              to="/login"
              class="mt-6 flex w-full items-center justify-center border border-cyan-300/90 bg-[#02153c] px-4 py-4 text-xl font-black uppercase tracking-wide text-cyan-100 transition hover:bg-[#08245e]"
            >
              Sign in to buy
            </RouterLink>
            <p class="m-0 mt-2 text-center text-xs text-white/50">
              Purchased items appear in your
              <RouterLink to="/locker" class="font-semibold text-cyan-200 underline underline-offset-2">Locker</RouterLink>.
            </p>
          </template>
          <p v-else class="m-0 text-sm text-white/70">No item selected.</p>
        </div>
      </aside>
    </div>

    <div
      v-if="confirmItem"
      class="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-confirm-title"
      @click.self="closePurchaseConfirm"
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
        <h2 id="purchase-confirm-title" class="m-0 text-lg font-bold text-slate-900">Confirm purchase</h2>
        <p class="mt-1 text-sm text-slate-600">{{ confirmItem.name }}</p>

        <div class="mt-4">
          <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Choose currency</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <label
              v-for="option in confirmOptions"
              :key="`confirm-option-${option.shop_catalog_item_id}`"
              class="flex cursor-pointer items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <span class="flex items-center gap-2">
                <input v-model="confirmCurrency" :value="option.currency" type="radio" class="h-4 w-4 border-slate-300 text-purple-600 focus:ring-purple-500" />
                <span>{{ currencyLabel(option.currency) }}</span>
              </span>
              <span class="font-semibold text-slate-900">{{ option.price.toLocaleString() }}</span>
            </label>
          </div>
        </div>

        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-slate-500">Current balance</dt>
            <dd class="font-semibold text-slate-900">{{ confirmCurrent === null ? '—' : confirmCurrent.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-slate-500">Item cost</dt>
            <dd class="font-semibold text-slate-900">{{ confirmOption ? confirmOption.price.toLocaleString() : '—' }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-t border-slate-200 pt-2">
            <dt class="text-slate-500">Balance after purchase</dt>
            <dd class="font-semibold text-slate-900">{{ confirmAfter === null ? '—' : confirmAfter.toLocaleString() }}</dd>
          </div>
        </dl>

        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            @click="closePurchaseConfirm"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="purchasingId !== null || !confirmOption"
            @click="confirmPurchase"
          >
            {{ purchasingId === confirmOption?.shop_catalog_item_id ? 'Processing…' : 'Confirm purchase' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
