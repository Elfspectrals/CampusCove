<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ADMIN_MAX_MARKET_MINUTES,
  ADMIN_MAX_MONEY,
  ADMIN_MAX_QUANTITY,
  adminResultMessage,
  adminTargets,
  filterAdminItems,
  wholeIn,
} from '../../game/admin/adminPanel.ts'
import type { AdminItem, AdminMenuPayload, AdminResultPayload, AdminWallet } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  ownSessionId: string
  menu: AdminMenuPayload | null
  items: AdminItem[] | null
  result: AdminResultPayload | null
  error: string | null
}>()

const emit = defineEmits<{
  giveMoney: [sessionId: string, wallet: AdminWallet, amount: number]
  giveItem: [sessionId: string, code: string, quantity: number]
  startQuiz: []
  startStorageSale: []
  openMarket: [minutes: number]
  closeMarket: []
  collectTaxes: []
  close: []
}>()

const { t } = useI18n()

const WALLETS: AdminWallet[] = ['cash', 'bank']

const targets = computed(() => adminTargets(props.ownSessionId, props.menu?.players ?? []))
const target = ref(props.ownSessionId)
const amountInput = ref('500')
const wallet = ref<AdminWallet>('cash')
const query = ref('')
const code = ref<string | null>(null)
const quantityInput = ref('1')
const minutesInput = ref('10')

const amount = computed(() => wholeIn(amountInput.value, 1, ADMIN_MAX_MONEY))
const quantity = computed(() => wholeIn(quantityInput.value, 1, ADMIN_MAX_QUANTITY))
const minutes = computed(() => wholeIn(minutesInput.value, 1, ADMIN_MAX_MARKET_MINUTES))
const shownItems = computed(() => filterAdminItems(props.items ?? [], query.value))
const targetIsHere = computed(() => targets.value.some((p) => p.sessionId === target.value))

const itemName = (itemCode: string) => props.items?.find((i) => i.code === itemCode)?.name ?? itemCode
const clockTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const feedback = computed(() => {
  if (props.error) return { ok: false, text: props.error }
  if (!props.result) return null
  const { key, params } = adminResultMessage(props.result, itemName, clockTime)
  return { ok: props.result.ok, text: t(key, params) }
})

function giveMoney(): void {
  if (amount.value === null || !targetIsHere.value) return
  emit('giveMoney', target.value, wallet.value, amount.value)
}

function giveItem(): void {
  if (code.value === null || quantity.value === null || !targetIsHere.value) return
  emit('giveItem', target.value, code.value, quantity.value)
}

function openMarket(): void {
  if (minutes.value === null) return
  emit('openMarket', minutes.value)
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
    <section class="cc-hud flex max-h-[90vh] w-[min(560px,94vw)] animate-cc-pop flex-col overflow-y-auto p-0" :aria-label="t('adminPanel.title')">
      <header class="flex items-center justify-between bg-coral px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('adminPanel.title') }}</span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('adminPanel.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-col gap-4 px-4 py-4">
        <label class="flex flex-col gap-1 text-xs text-mist">
          {{ t('adminPanel.target') }}
          <select v-model="target" class="cc-input min-h-11">
            <option v-for="p in targets" :key="p.sessionId" :value="p.sessionId">{{ p.pseudo ?? t('adminPanel.me') }}</option>
          </select>
        </label>
        <p v-if="!targetIsHere" class="m-0 text-xs text-coral">{{ t('adminPanel.targetGone') }}</p>

        <form class="flex flex-col gap-2" @submit.prevent="giveMoney">
          <h3 class="m-0 text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.money') }}</h3>
          <div class="grid grid-cols-[1fr_auto_auto] items-end gap-2">
            <label class="flex flex-col gap-1 text-xs text-mist">
              {{ t('adminPanel.amount', { max: ADMIN_MAX_MONEY }) }}
              <input v-model="amountInput" type="number" min="1" :max="ADMIN_MAX_MONEY" class="cc-input min-h-11" />
            </label>
            <div class="flex gap-1" role="radiogroup" :aria-label="t('adminPanel.wallet')">
              <button
                v-for="w in WALLETS"
                :key="w"
                type="button"
                role="radio"
                :aria-checked="wallet === w"
                class="cc-btn cc-btn-sm min-h-11"
                :class="wallet === w ? '' : 'opacity-60'"
                @click="wallet = w"
              >
                {{ t(`adminPanel.wallets.${w}`) }}
              </button>
            </div>
            <button type="submit" class="cc-btn min-h-11" :disabled="amount === null || !targetIsHere">{{ t('adminPanel.give') }}</button>
          </div>
        </form>

        <form class="flex flex-col gap-2" @submit.prevent="giveItem">
          <h3 class="m-0 text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.items') }}</h3>
          <input v-model="query" type="search" class="cc-input min-h-11" :placeholder="t('adminPanel.search')" :aria-label="t('adminPanel.search')" />
          <p v-if="items === null" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
          <p v-else-if="shownItems.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.noItem') }}</p>
          <ul v-else class="m-0 flex max-h-48 list-none flex-col gap-0.5 overflow-y-auto p-0" role="listbox" :aria-label="t('adminPanel.items')">
            <li v-for="item in shownItems" :key="item.code" role="option" :aria-selected="code === item.code">
              <button
                type="button"
                class="flex min-h-11 w-full items-center justify-between gap-2 rounded px-2 text-left text-sm text-fog"
                :class="code === item.code ? 'bg-sun/20' : 'hover:bg-white/5'"
                @click="code = item.code"
              >
                <span class="font-bold">{{ item.name }}</span>
                <span class="text-xs text-mist">{{ item.code }}</span>
              </button>
            </li>
          </ul>
          <div class="grid grid-cols-[1fr_auto] items-end gap-2">
            <label class="flex flex-col gap-1 text-xs text-mist">
              {{ t('adminPanel.quantity', { max: ADMIN_MAX_QUANTITY }) }}
              <input v-model="quantityInput" type="number" min="1" :max="ADMIN_MAX_QUANTITY" class="cc-input min-h-11" />
            </label>
            <button type="submit" class="cc-btn min-h-11" :disabled="code === null || quantity === null || !targetIsHere">{{ t('adminPanel.give') }}</button>
          </div>
        </form>

        <div class="flex flex-col gap-2">
          <h3 class="m-0 text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.events') }}</h3>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('startQuiz')">{{ t('adminPanel.startQuiz') }}</button>
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('startStorageSale')">{{ t('adminPanel.startStorageSale') }}</button>
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('collectTaxes')">{{ t('adminPanel.collectTaxes') }}</button>
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('closeMarket')">{{ t('adminPanel.closeMarket') }}</button>
          </div>
          <form class="grid grid-cols-[1fr_auto] items-end gap-2" @submit.prevent="openMarket">
            <label class="flex flex-col gap-1 text-xs text-mist">
              {{ t('adminPanel.minutes', { max: ADMIN_MAX_MARKET_MINUTES }) }}
              <input v-model="minutesInput" type="number" min="1" :max="ADMIN_MAX_MARKET_MINUTES" class="cc-input min-h-11" />
            </label>
            <button type="submit" class="cc-btn cc-btn-sm min-h-11" :disabled="minutes === null">{{ t('adminPanel.openMarket') }}</button>
          </form>
        </div>
      </div>

      <p v-if="feedback" class="m-0 px-4 py-2 text-xs font-bold" :class="feedback.ok ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'" role="status">{{ feedback.text }}</p>
    </section>
  </div>
</template>
