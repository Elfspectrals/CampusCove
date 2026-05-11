<script setup lang="ts">
import { computed } from 'vue'
import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../../api/itemShop'
import { currencyLabel } from '../../utils/itemShopPresentation'

const props = defineProps<{
  item: ShopItem
  confirmCurrent: number | null
  confirmAfter: number | null
  confirmOption: ShopItemCurrencyOption | null
  purchasingId: number | null
}>()

const confirmCurrency = defineModel<ShopCurrency>('confirmCurrency', { required: true })

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const confirmOptions = computed(() => props.item.options ?? [])
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="purchase-confirm-title"
    @click.self="emit('close')"
  >
    <div class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl">
      <h2 id="purchase-confirm-title" class="m-0 text-lg font-bold text-slate-900">Confirm purchase</h2>
      <p class="mt-1 text-sm text-slate-600">{{ item.name }}</p>

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
          @click="emit('close')"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="purchasingId !== null || !confirmOption"
          @click="emit('confirm')"
        >
          {{ purchasingId === confirmOption?.shop_catalog_item_id ? 'Processing…' : 'Confirm purchase' }}
        </button>
      </div>
    </div>
  </div>
</template>
