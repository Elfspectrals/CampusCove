<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ShopCurrency, ShopItem, ShopItemCurrencyOption } from '../../api/itemShop'
import { currencyLabel, optionAvailable } from '../../utils/itemShopPresentation'

const props = defineProps<{
  item: ShopItem
  confirmCurrent: number | null
  confirmAfter: number | null
  confirmOption: ShopItemCurrencyOption | null
  purchasingId: number | null
  canAfford: boolean
  soldOut: boolean
}>()

const confirmCurrency = defineModel<ShopCurrency>('confirmCurrency', { required: true })

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const confirmOptions = computed(() => props.item.options ?? [])
const dialogRef = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null
let previousBodyOverflow = ''

function close() {
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    close()
    return
  }
  if (event.key !== 'Tab' || !dialogRef.value) return

  const focusable = Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'))
  if (focusable.length === 0) {
    event.preventDefault()
    dialogRef.value.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

onMounted(async () => {
  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
  previousBodyOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  await nextTick()
  dialogRef.value?.focus()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = previousBodyOverflow
  previouslyFocused?.focus()
})
</script>

<template>
  <div
    class="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
    @click.self="close"
  >
    <div
      ref="dialogRef"
      class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-confirm-title"
      tabindex="-1"
    >
      <div class="flex items-start justify-between gap-4">
        <h2 id="purchase-confirm-title" class="m-0 text-lg font-bold text-slate-900">Confirm purchase</h2>
        <button
          type="button"
          class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          aria-label="Close purchase dialog"
          @click="close"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p class="mt-1 text-sm text-slate-600">{{ item.name }}</p>

      <div class="mt-4">
        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Choose currency</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="option in confirmOptions"
            :key="`confirm-option-${option.shop_catalog_item_id}-${option.currency}`"
            :class="[
              'flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2 text-sm',
              optionAvailable(option) ? 'cursor-pointer' : 'cursor-not-allowed bg-slate-50 text-slate-400',
            ]"
          >
            <span class="flex items-center gap-2">
              <input
                v-model="confirmCurrency"
                :value="option.currency"
                :disabled="!optionAvailable(option)"
                type="radio"
                class="h-4 w-4 border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <span>{{ currencyLabel(option.currency) }}</span>
            </span>
            <span :class="['font-semibold', optionAvailable(option) ? 'text-slate-900' : 'text-rose-600']">
              {{ optionAvailable(option) ? option.price.toLocaleString() : 'Sold out' }}
            </span>
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
          <dd :class="['font-semibold', canAfford ? 'text-slate-900' : 'text-rose-600']">
            {{ confirmAfter === null ? '—' : confirmAfter.toLocaleString() }}
          </dd>
        </div>
      </dl>

      <p v-if="!canAfford" class="m-0 mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700" role="alert">
        You do not have enough {{ confirmOption ? currencyLabel(confirmOption.currency).toLowerCase() : 'funds' }} for this purchase.
      </p>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          @click="close"
        >
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="purchasingId !== null || !confirmOption || !canAfford || soldOut"
          @click="emit('confirm')"
        >
          {{
            purchasingId === confirmOption?.shop_catalog_item_id
              ? 'Processing…'
              : soldOut
                ? 'Sold out'
                : 'Confirm purchase'
          }}
        </button>
      </div>
    </div>
  </div>
</template>
