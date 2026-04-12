<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import { useWalletBalances } from '../composables/useWalletBalances'
import * as itemShopApi from '../api/itemShop'
import type { ShopCurrency, ShopItem } from '../api/itemShop'

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

const confirmCurrent = computed(() => {
  const item = confirmItem.value
  if (!item) return null
  return item.currency === 'coins' ? balances.value.coins : balances.value.premium
})

const confirmAfter = computed(() => {
  const item = confirmItem.value
  const cur = confirmCurrent.value
  if (!item || cur === null) return null
  return cur - item.price_coins
})

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

function clearFeedbackForItem(shopCatalogItemId: number) {
  const next = { ...feedbackByItem.value }
  delete next[shopCatalogItemId]
  feedbackByItem.value = next
}

function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

function priceBadge(item: ShopItem): string {
  const sym = item.currency === 'coins' ? '🪙' : '✨'
  return `${sym} ${item.price_coins.toLocaleString()}`
}

function openPurchaseConfirm(item: ShopItem) {
  if (!isLoggedIn.value) return
  confirmItem.value = item
}

function closePurchaseConfirm() {
  confirmItem.value = null
}

async function confirmPurchase() {
  const item = confirmItem.value
  if (!item) return
  const id = item.shop_catalog_item_id
  clearFeedbackForItem(id)
  purchasingId.value = id
  try {
    const result = await itemShopApi.purchaseShopItem(id)
    feedbackByItem.value = {
      ...feedbackByItem.value,
      [id]: { kind: 'success', text: result.message },
    }
    closePurchaseConfirm()
  } catch (e) {
    const text = e instanceof Error ? e.message : 'Purchase failed'
    feedbackByItem.value = {
      ...feedbackByItem.value,
      [id]: { kind: 'error', text },
    }
  } finally {
    purchasingId.value = null
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <div class="mb-6 text-slate-600">
      <p class="m-0">
        Browse cosmetics and gear for your campus. Prices are in coins or premium.
      </p>
      <p v-if="isLoggedIn" class="m-0 mt-2 text-sm text-slate-500">
        After you buy, items appear in your
        <RouterLink
          to="/inventory"
          class="font-semibold text-purple-700 underline decoration-purple-300 underline-offset-2 hover:text-purple-600"
        >
          Inventory
        </RouterLink>
        .
      </p>
    </div>

    <div
      v-if="!isLoggedIn"
      class="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm"
      role="status"
    >
      <p class="m-0 font-semibold">Sign in to purchase</p>
      <p class="mt-1 text-sm text-amber-900/90">
        You can browse the catalog without an account. To buy items, sign in or create an account.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <RouterLink
          to="/login"
          class="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-amber-400"
        >
          Sign in
        </RouterLink>
        <RouterLink
          to="/register"
          class="inline-flex items-center justify-center rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
        >
          Create account
        </RouterLink>
      </div>
    </div>

    <div v-if="catalogLoading" class="flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
      <span
        class="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600"
        aria-hidden="true"
      />
      <p class="m-0 text-sm font-medium">Loading catalog…</p>
    </div>

    <div
      v-else-if="catalogError"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900"
      role="alert"
    >
      <p class="m-0 font-semibold">Could not load items</p>
      <p class="mt-1 text-sm">{{ catalogError }}</p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        @click="loadCatalog"
      >
        Try again
      </button>
    </div>

    <div v-else-if="items.length === 0" class="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-600">
      <p class="m-0 text-lg font-semibold text-slate-800">No items yet</p>
      <p class="mt-2 text-sm">Check back later for new listings.</p>
    </div>

    <ul v-else class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="item in items"
        :key="item.shop_catalog_item_id"
        class="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div class="mb-3 flex items-start justify-between gap-2">
          <h2 class="m-0 text-lg font-bold text-slate-900">{{ item.name }}</h2>
          <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
            {{ priceBadge(item) }}
          </span>
        </div>
        <p v-if="item.description" class="m-0 mb-1 flex-1 text-sm leading-relaxed text-slate-600">
          {{ item.description }}
        </p>
        <p v-else class="m-0 mb-1 flex-1 text-sm italic text-slate-400">No description</p>
        <p class="m-0 mb-4 text-xs text-slate-400">{{ item.code }}</p>

        <div
          v-if="feedbackByItem[item.shop_catalog_item_id]"
          :class="[
            'mb-3 rounded-lg px-3 py-2 text-sm',
            feedbackByItem[item.shop_catalog_item_id]?.kind === 'success'
              ? 'bg-emerald-50 text-emerald-900'
              : 'bg-red-50 text-red-900',
          ]"
          role="status"
        >
          <p class="m-0">{{ feedbackByItem[item.shop_catalog_item_id]?.text }}</p>
          <p
            v-if="feedbackByItem[item.shop_catalog_item_id]?.kind === 'success'"
            class="m-0 mt-2 text-xs font-medium text-emerald-800/90"
          >
            <RouterLink
              to="/inventory"
              class="underline decoration-emerald-600/60 underline-offset-2 hover:text-emerald-950"
            >
              View in Inventory
            </RouterLink>
          </p>
        </div>

        <div class="mt-auto">
          <button
            v-if="isLoggedIn"
            type="button"
            class="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="purchasingId !== null"
            @click="openPurchaseConfirm(item)"
          >
            Buy
          </button>
          <RouterLink
            v-else
            to="/login"
            class="flex w-full items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          >
            Sign in to buy
          </RouterLink>
        </div>
      </li>
    </ul>

    <div
      v-if="confirmItem"
      class="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-confirm-title"
      @click.self="closePurchaseConfirm"
    >
      <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="purchase-confirm-title" class="m-0 text-lg font-bold text-slate-900">Confirm purchase</h2>
        <p class="mt-1 text-sm text-slate-600">{{ confirmItem.name }}</p>

        <dl class="mt-4 space-y-2 text-sm">
          <div class="flex justify-between gap-4">
            <dt class="text-slate-500">Currency</dt>
            <dd class="font-semibold text-slate-900">{{ currencyLabel(confirmItem.currency) }}</dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-slate-500">Current balance</dt>
            <dd class="font-semibold text-slate-900">
              {{ confirmCurrent === null ? '—' : confirmCurrent.toLocaleString() }}
            </dd>
          </div>
          <div class="flex justify-between gap-4">
            <dt class="text-slate-500">Item cost</dt>
            <dd class="font-semibold text-slate-900">{{ confirmItem.price_coins.toLocaleString() }}</dd>
          </div>
          <div class="flex justify-between gap-4 border-t border-slate-200 pt-2">
            <dt class="text-slate-500">Balance after purchase</dt>
            <dd class="font-semibold text-slate-900">
              {{ confirmAfter === null ? '—' : confirmAfter.toLocaleString() }}
            </dd>
          </div>
        </dl>
        <p v-if="confirmCurrent === null" class="mt-3 text-xs text-amber-800">
          Balance will appear after your first purchase syncs, or once the server includes wallet data on sign-in.
        </p>

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
            :disabled="purchasingId !== null"
            @click="confirmPurchase"
          >
            {{ purchasingId === confirmItem.shop_catalog_item_id ? 'Processing…' : 'Confirm purchase' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
