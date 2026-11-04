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
  if (order.refund.status !== 'none') return 'cc-chip-coral'
  if (order.status === 'paid') return 'cc-chip-mint'
  if (order.status === 'open' || order.status === 'processing') return 'cc-chip-grape'
  return ''
}
</script>

<template>
  <section class="cc-panel-flat p-4 sm:p-5" aria-labelledby="gem-history-title">
    <h2 id="gem-history-title" class="cc-display m-0 text-xl">{{ t('gems.history') }}</h2>
    <p v-if="loading" class="m-0 mt-3 text-sm font-semibold text-mist">…</p>
    <p v-else-if="error" class="m-0 mt-3 text-sm font-semibold text-coral" role="alert">{{ error }}</p>
    <p v-else-if="orders.length === 0" class="m-0 mt-3 text-sm font-semibold text-mist">{{ t('gems.historyEmpty') }}</p>
    <ul v-else class="m-0 mt-3 list-none space-y-2 p-0">
      <li v-for="order in orders" :key="order.public_id" class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-ink-950/50 px-3 py-2.5 text-sm">
        <UiCurrency currency="premium" :amount="order.gems" :size="16" class="text-grape" />
        <span class="font-extrabold">{{ formatPrice(order.amount_cents, order.currency, locale) }}</span>
        <span class="text-xs font-semibold text-mist">{{ orderDate(order.paid_at ?? order.created_at) }}</span>
        <span class="ml-auto flex flex-wrap items-center gap-1.5">
          <span class="cc-chip">{{ t('gems.test') }}</span>
          <span v-if="order.disputed" class="cc-chip cc-chip-coral">{{ t('gems.disputed') }}</span>
          <span :class="['cc-chip', statusClass(order)]">
            <template v-if="order.refund.status === 'full'">{{ t('gems.refundFull', { n: order.refund.gems_reversed }) }}</template>
            <template v-else-if="order.refund.status === 'partial'">{{ t('gems.refundPartial', { n: order.refund.gems_reversed }) }}</template>
            <template v-else>{{ t(`gems.status.${order.status}`) }}</template>
          </span>
        </span>
      </li>
    </ul>
  </section>
</template>
