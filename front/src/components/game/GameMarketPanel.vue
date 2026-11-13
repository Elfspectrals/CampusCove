<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OfferableItem } from '../../api/trades'
import { firstFreeSlot } from '../../game/market/marketStalls.ts'
import type { MarketPanel } from '../../composables/game/useMarket'
import type { MarketLotContainer, MarketSnapshot } from '../../types/gameRealtime'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const CONTAINERS: MarketLotContainer[] = ['crate', 'basket', 'flat']
const MAX_UNIT_PRICE = 1_000_000

const props = defineProps<{
  panel: MarketPanel
  market: MarketSnapshot | null
  canopies: Record<string, string>
  offerable: OfferableItem[] | null
  pending: boolean
  feedback: { kind: 'success' | 'error'; text: string } | null
}>()

const emit = defineEmits<{
  claim: [stallNo: number, canopy: string]
  list: [slot: number, code: string, quantity: number, unitPrice: number, container: MarketLotContainer]
  withdraw: [lotId: number]
  buy: [lotId: number, quantity: number]
  close: []
}>()

const { t } = useI18n()

const stall = computed(() => props.market?.stalls.find((s) => s.stall_no === props.panel.stallNo) ?? null)
const lot = computed(() => (props.panel.kind === 'buy' ? (stall.value?.lots.find((l) => l.lot_id === (props.panel as { lotId: number }).lotId) ?? null) : null))
const freeSlot = computed(() => firstFreeSlot(stall.value?.lots ?? []))

const canopy = ref(Object.keys(props.canopies)[0] ?? 'red')
const code = ref('')
const quantity = ref(1)
const unitPrice = ref(5)
const container = ref<MarketLotContainer>('crate')
const buyQuantity = ref(1)

const chosen = computed(() => props.offerable?.find((i) => i.code === code.value) ?? null)
const canList = computed(() => !props.pending && freeSlot.value !== null && chosen.value !== null && quantity.value >= 1 && quantity.value <= chosen.value.quantity && unitPrice.value >= 1 && unitPrice.value <= MAX_UNIT_PRICE)

watch(
  () => props.offerable,
  (items) => {
    if (items && !items.some((i) => i.code === code.value)) code.value = items[0]?.code ?? ''
  },
  { immediate: true },
)
watch(chosen, (item) => (quantity.value = Math.min(Math.max(1, quantity.value), item?.quantity ?? 1)))
watch(
  () => lot.value?.quantity,
  (left) => (buyQuantity.value = Math.min(Math.max(1, buyQuantity.value), left ?? 1)),
)

function whole(value: unknown, min: number, max: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min
}

function list(): void {
  if (!canList.value || freeSlot.value === null) return
  emit('list', freeSlot.value, code.value, quantity.value, unitPrice.value, container.value)
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud max-h-[90vh] w-[min(460px,92vw)] animate-cc-pop overflow-y-auto p-0">
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">
          <template v-if="panel.kind === 'claim'">{{ t('market.claimTitle', { n: panel.stallNo }) }}</template>
          <template v-else-if="panel.kind === 'seller'">{{ t('market.stallTitle') }}</template>
          <template v-else>{{ t('market.buyTitle', { name: lot?.name ?? '' }) }}</template>
        </span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('market.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div v-if="panel.kind === 'claim'" class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 text-sm text-fog">{{ t('market.claimBody', { fee: market?.stall_fee ?? 0 }) }}</p>
        <p class="m-0 text-xs font-bold text-mist">{{ t('market.canopy') }}</p>
        <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="t('market.canopy')">
          <button
            v-for="(hex, key) in canopies"
            :key="key"
            type="button"
            role="radio"
            :aria-checked="canopy === key"
            :aria-label="t(`market.colours.${key}`)"
            class="h-11 w-11 rounded-md border-2"
            :class="canopy === key ? 'border-sun' : 'border-transparent'"
            :style="{ background: `repeating-linear-gradient(90deg, ${hex} 0 8px, #efe6d2 8px 16px)` }"
            @click="canopy = String(key)"
          />
        </div>
        <button type="button" class="cc-btn" :disabled="pending" @click="emit('claim', panel.stallNo, canopy)">{{ t('market.take') }}</button>
      </div>

      <div v-else-if="panel.kind === 'seller'" class="flex flex-col gap-3 px-4 py-4">
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-if="!stall || stall.lots.length === 0" class="text-sm text-mist">{{ t('market.noLots') }}</li>
          <li v-for="l in stall?.lots ?? []" :key="l.lot_id" class="flex items-center justify-between gap-2 text-sm text-fog">
            <span class="flex flex-wrap items-center gap-1.5">
              <span class="font-bold">{{ l.quantity }} × {{ l.name }}</span>
              <UiCurrency currency="coins" :amount="l.unit_price" :size="14" />
              <span class="text-xs text-mist">{{ t(`market.containers.${l.container}`) }}</span>
            </span>
            <button type="button" class="cc-btn cc-btn-sm" :disabled="pending" @click="emit('withdraw', l.lot_id)">{{ t('market.withdraw') }}</button>
          </li>
        </ul>
        <h3 class="m-0 text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ t('market.addLot') }}</h3>
        <p v-if="freeSlot === null" class="m-0 text-xs text-mist">{{ t('market.tableFull') }}</p>
        <p v-else-if="offerable === null" class="m-0 text-xs text-mist">{{ t('market.loading') }}</p>
        <p v-else-if="offerable.length === 0" class="m-0 text-xs text-mist">{{ t('market.nothingToSell') }}</p>
        <form v-else class="flex flex-col gap-2" @submit.prevent="list">
          <label class="flex flex-col gap-1 text-xs text-mist">
            {{ t('market.item') }}
            <select v-model="code" class="cc-input min-h-11">
              <option v-for="item in offerable" :key="item.code" :value="item.code">{{ item.name }} ({{ item.quantity }})</option>
            </select>
          </label>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1 text-xs text-mist">
              {{ t('market.quantity') }}
              <input :value="quantity" type="number" min="1" :max="chosen?.quantity ?? 1" class="cc-input min-h-11" @change="quantity = whole(($event.target as HTMLInputElement).value, 1, chosen?.quantity ?? 1)" />
            </label>
            <label class="flex flex-col gap-1 text-xs text-mist">
              {{ t('market.unitPrice') }}
              <input :value="unitPrice" type="number" min="1" :max="MAX_UNIT_PRICE" class="cc-input min-h-11" @change="unitPrice = whole(($event.target as HTMLInputElement).value, 1, MAX_UNIT_PRICE)" />
            </label>
          </div>
          <label class="flex flex-col gap-1 text-xs text-mist">
            {{ t('market.container') }}
            <select v-model="container" class="cc-input min-h-11">
              <option v-for="c in CONTAINERS" :key="c" :value="c">{{ t(`market.containers.${c}`) }}</option>
            </select>
          </label>
          <p class="m-0 text-xs text-mist">{{ t('market.taxNote') }}</p>
          <button type="submit" class="cc-btn" :disabled="!canList">{{ t('market.layOut') }}</button>
        </form>
      </div>

      <div v-else-if="lot" class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 text-sm text-fog">{{ t('market.each', { price: lot.unit_price, left: lot.quantity }) }}</p>
        <div class="flex items-center gap-2">
          <button type="button" class="cc-btn cc-btn-sm min-h-11 min-w-11" :aria-label="t('market.less')" :disabled="pending || buyQuantity <= 1" @click="buyQuantity -= 1">−</button>
          <span class="w-10 text-center font-display text-lg text-fog" aria-live="polite">{{ buyQuantity }}</span>
          <button type="button" class="cc-btn cc-btn-sm min-h-11 min-w-11" :aria-label="t('market.more')" :disabled="pending || buyQuantity >= lot.quantity" @click="buyQuantity += 1">+</button>
          <span class="ml-auto text-sm font-bold text-fog">{{ t('market.total', { total: buyQuantity * lot.unit_price }) }}</span>
        </div>
        <button type="button" class="cc-btn" :disabled="pending" @click="emit('buy', lot.lot_id, buyQuantity)">{{ t('market.buy') }}</button>
      </div>

      <p v-if="feedback" class="m-0 px-4 py-2 text-xs font-bold" :class="feedback.kind === 'success' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'" role="status">{{ feedback.text }}</p>
    </section>
  </div>
</template>
