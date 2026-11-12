<script setup lang="ts">
/** The player's gem orders, newest first: pack, price, status and refunds (GET /api/gems/orders). */
import { useI18n } from 'vue-i18n'
import type { GemOrder } from '../../api/gems'
import { formatPrice } from '../../utils/gemCheckout'
import UiCurrency from '../ui/UiCurrency.vue'

defineProps<{
  orders: GemOrder[]
  loading: boolean
  error: string | null
}>()

const { t, locale } = useI18n()

function orderDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''
}

function statusClass(order: GemOrder): string {
  if (order.refund.status !== 'none') return 'text-coral'
  if (order.status === 'paid') return 'text-mint'
  return 'text-mist'
}
</script>

<template>
  <section class="cc-panel p-4 sm:p-5" aria-labelledby="gem-history-title">
    <h2 id="gem-history-title" class="m-0 text-base font-semibold">{{ t('gems.history') }}</h2>
    <p v-if="loading" class="m-0 mt-3 text-sm text-mist">…</p>
    <p v-else-if="error" class="m-0 mt-3 text-sm text-coral" role="alert">{{ error }}</p>
    <p v-else-if="orders.length === 0" class="m-0 mt-3 text-sm text-mist">{{ t('gems.historyEmpty') }}</p>
    <ul v-else class="m-0 mt-3 list-none divide-y divide-line/10 border-t border-line/10 p-0">
      <li v-for="order in orders" :key="order.public_id" class="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
        <UiCurrency currency="premium" :amount="order.gems" :size="16" />
        <span class="font-semibold tabular-nums">{{ formatPrice(order.amount_cents, order.currency, locale) }}</span>
        <span class="font-mono text-xs text-mist">{{ orderDate(order.paid_at ?? order.created_at) }}</span>
        <span class="ml-auto flex flex-wrap items-center gap-3">
          <span class="font-mono text-xs text-mist">{{ t('gems.test') }}</span>
          <span v-if="order.disputed" class="font-mono text-xs text-coral">{{ t('gems.disputed') }}</span>
          <span :class="['font-mono text-xs', statusClass(order)]">
            <template v-if="order.refund.status === 'full'">{{ t('gems.refundFull', { n: order.refund.gems_reversed }) }}</template>
            <template v-else-if="order.refund.status === 'partial'">{{ t('gems.refundPartial', { n: order.refund.gems_reversed }) }}</template>
            <template v-else>{{ t(`gems.status.${order.status}`) }}</template>
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
