<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDialogFocus } from '../../composables/useDialogFocus'
import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../../api/itemShop'
import { currencyLabel } from '../../utils/itemShopPresentation'
import UiIcon from '../ui/UiIcon.vue'
import UiCurrency from '../ui/UiCurrency.vue'

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
const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => emit('close') })
</script>

<template>
  <div
    ref="dialogEl"
    class="cc-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="purchase-confirm-title"
    @click.self="emit('close')"
  >
    <div class="cc-modal max-w-md">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="cc-eyebrow">Confirm purchase</p>
          <h2 id="purchase-confirm-title" class="cc-display m-0 mt-1 text-3xl leading-tight">{{ item.name }}</h2>
        </div>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" aria-label="Close" @click="emit('close')">
          <UiIcon name="x" :size="16" />
        </button>
      </div>

      <div class="mt-5">
        <p class="cc-label">Pay with</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="option in confirmOptions"
            :key="`confirm-option-${option.shop_catalog_item_id}`"
            :class="[
              'flex cursor-pointer items-center justify-between gap-2 rounded-xl border-2 px-3 py-3 transition',
              confirmCurrency === option.currency
                ? option.currency === 'coins' ? 'border-sun bg-sun/10' : 'border-grape bg-grape/10'
                : 'border-ink-600 bg-ink-950/50 hover:border-ink-500',
            ]"
          >
            <span class="flex items-center gap-2 text-sm font-extrabold">
              <input v-model="confirmCurrency" :value="option.currency" type="radio" class="cc-check" />
              {{ currencyLabel(option.currency) }}
            </span>
            <UiCurrency :currency="option.currency" :amount="option.price" :class="option.currency === 'coins' ? 'text-sun' : 'text-grape'" />
          </label>
        </div>
      </div>

      <dl class="mt-5 space-y-2 rounded-xl bg-ink-950/50 p-4 text-sm font-bold">
        <div class="flex justify-between gap-4">
          <dt class="text-mist">Current balance</dt>
          <dd class="m-0">{{ confirmCurrent === null ? '—' : confirmCurrent.toLocaleString() }}</dd>
        </div>
        <div class="flex justify-between gap-4">
          <dt class="text-mist">Item cost</dt>
          <dd class="m-0 text-coral">{{ confirmOption ? `−${confirmOption.price.toLocaleString()}` : '—' }}</dd>
        </div>
        <div class="flex justify-between gap-4 border-t-2 border-ink-700 pt-2">
          <dt class="text-mist">After purchase</dt>
          <dd :class="['cc-display m-0 text-lg', confirmAfter !== null && confirmAfter < 0 ? 'text-coral' : 'text-mint']">
            {{ confirmAfter === null ? '—' : confirmAfter.toLocaleString() }}
          </dd>
        </div>
      </dl>

      <div class="mt-6 grid grid-cols-2 gap-3">
        <button type="button" class="cc-btn cc-btn-ghost" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="cc-btn cc-btn-sun"
          :disabled="purchasingId !== null || !confirmOption"
          @click="emit('confirm')"
        >
          {{ purchasingId === confirmOption?.shop_catalog_item_id ? 'Processing…' : 'Confirm' }}
        </button>
      </div>
    </div>
  </div>
</template>
