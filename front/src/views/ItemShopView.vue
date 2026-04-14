<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { getStoredAuth } from '../api/auth'
import { useWalletBalances } from '../composables/useWalletBalances'
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
  <div class="flex min-h-0 flex-col">
    <div class="mb-6 text-slate-600">
      <p class="m-0">
        Browse skins added by admins and buy them with coins, premium, or either when both are available.
      </p>
      <p v-if="isLoggedIn" class="m-0 mt-2 text-sm text-slate-500">
        After you buy, items appear in your
        <RouterLink
          to="/locker"
          class="font-semibold text-purple-700 underline decoration-purple-300 underline-offset-2 hover:text-purple-600"
        >
          Locker
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
        You can browse the catalog without an account. To buy skins, sign in or create an account.
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
      <span class="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600" aria-hidden="true" />
      <p class="m-0 text-sm font-medium">Loading catalog…</p>
    </div>

    <div v-else-if="catalogError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900" role="alert">
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
      <p class="m-0 text-lg font-semibold text-slate-800">No skins yet</p>
      <p class="mt-2 text-sm">Check back later for new listings.</p>
    </div>

    <ul v-else class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="item in items"
        :key="item.item_def_id"
        class="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <img
          v-if="item.preview_image"
          :src="item.preview_image"
          :alt="`${item.name} preview`"
          class="mb-3 h-36 w-full rounded-xl border border-slate-200 object-cover"
        />
        <div v-else class="mb-3 flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          No preview available
        </div>

        <div class="mb-3 flex items-start justify-between gap-2">
          <h2 class="m-0 text-lg font-bold text-slate-900">{{ item.name }}</h2>
          <span class="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-950">
            {{ item.options.length }} {{ item.options.length > 1 ? 'options' : 'option' }}
          </span>
        </div>
        <p v-if="item.description" class="m-0 mb-1 flex-1 text-sm leading-relaxed text-slate-600">
          {{ item.description }}
        </p>
        <p v-else class="m-0 mb-1 flex-1 text-sm italic text-slate-400">No description</p>
        <p class="m-0 mb-3 text-xs text-slate-400">{{ item.code }}</p>

        <ul class="mb-3 mt-0 list-none space-y-2 p-0 text-sm text-slate-700">
          <li v-for="option in item.options" :key="option.shop_catalog_item_id" class="flex items-center justify-between">
            <span>{{ currencyLabel(option.currency) }}</span>
            <span class="font-semibold">{{ priceBadge(option) }}</span>
          </li>
        </ul>

        <div
          v-if="feedbackByItem[item.item_def_id]"
          :class="[
            'mb-3 rounded-lg px-3 py-2 text-sm',
            feedbackByItem[item.item_def_id]?.kind === 'success' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900',
          ]"
          role="status"
        >
          <p class="m-0">{{ feedbackByItem[item.item_def_id]?.text }}</p>
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
