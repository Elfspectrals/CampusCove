<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AdminLogEntry } from '../../composables/game/useAdminWatch'
import {
  ADMIN_MAX_MARKET_MINUTES,
  ADMIN_MAX_MONEY,
  ADMIN_MAX_QUANTITY,
  adminResultMessage,
  adminTargets,
  filterAdminItems,
  wholeIn,
} from '../../game/admin/adminPanel.ts'
import { EVENT_ROWS, HOLD_MS, QUICK_AMOUNTS, eventStatus, isLive, placesWithRecentFirst, playersByDistance, type EventRow, type EventStatus } from '../../game/admin/adminWatch.ts'
import type { AdminItem, AdminMenuPayload, AdminResultPayload, AdminWallet } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  ownSessionId: string
  menu: AdminMenuPayload | null
  items: AdminItem[] | null
  result: AdminResultPayload | null
  log: AdminLogEntry[]
  recentPlace: string | null
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
  teleport: [key: string]
  goTo: [sessionId: string]
  summon: [sessionId: string]
  close: []
}>()

const { t } = useI18n()

const WALLETS: AdminWallet[] = ['cash', 'bank']
const TABS = ['give', 'players', 'places', 'events'] as const
type Tab = (typeof TABS)[number]
type HeldAction = 'taxes' | 'closeMarket'

const tab = ref<Tab>('give')
const targets = computed(() => adminTargets(props.ownSessionId, props.menu?.players ?? []))
const target = ref(props.ownSessionId)
const amountInput = ref('500')
const wallet = ref<AdminWallet>('cash')
const query = ref('')
const code = ref<string | null>(null)
const quantityInput = ref('1')
const minutesInput = ref('10')
const holding = ref<HeldAction | null>(null)
let holdTimer: number | undefined

const amount = computed(() => wholeIn(amountInput.value, 1, ADMIN_MAX_MONEY))
const quantity = computed(() => wholeIn(quantityInput.value, 1, ADMIN_MAX_QUANTITY))
const minutes = computed(() => wholeIn(minutesInput.value, 1, ADMIN_MAX_MARKET_MINUTES))
const shownItems = computed(() => filterAdminItems(props.items ?? [], query.value))
const targetIsHere = computed(() => targets.value.some((p) => p.sessionId === target.value))
const players = computed(() => playersByDistance(props.menu?.players ?? []))
const places = computed(() => placesWithRecentFirst(props.menu?.destinations ?? [], props.recentPlace))
const events = computed(() =>
  EVENT_ROWS.filter((row): row is Exclude<EventRow, 'taxes'> => row !== 'taxes').map((row) => {
    const status: EventStatus = props.menu ? eventStatus(row, props.menu.events) : { key: 'unknown' }
    return { row, status, live: isLive(status) }
  }),
)

const itemName = (itemCode: string) => props.items?.find((i) => i.code === itemCode)?.name ?? itemCode
const clockTime = (at: string | number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayTime = (at: string) => new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

function resultText(result: AdminResultPayload): string {
  const { key, params } = adminResultMessage(result, itemName, clockTime)
  return t(key, params)
}

const feedback = computed(() => {
  if (props.error) return { ok: false, text: props.error }
  if (!props.result) return null
  return { ok: props.result.ok, text: resultText(props.result) }
})

function statusText(status: EventStatus): string {
  switch (status.key) {
    case 'scheduled':
      return clockTime(status.time)
    case 'registration':
      return t('watch.admin.status.registration', { time: clockTime(status.time) })
    case 'running':
      return t('watch.admin.status.running')
    case 'box':
      return t('watch.admin.status.box', { n: status.n, count: status.count })
    case 'open':
      return t('watch.admin.status.open', { time: clockTime(status.time) })
    case 'closed':
      return t('watch.admin.status.closed', { time: dayTime(status.time) })
    default:
      return '—'
  }
}

function startEvent(row: Exclude<EventRow, 'taxes'>): void {
  if (row === 'quiz') emit('startQuiz')
  else if (row === 'storage') emit('startStorageSale')
  else openMarket()
}

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

function startHold(action: HeldAction): void {
  cancelHold()
  holding.value = action
  holdTimer = window.setTimeout(() => {
    holding.value = null
    if (action === 'taxes') emit('collectTaxes')
    else emit('closeMarket')
  }, HOLD_MS)
}

function cancelHold(): void {
  window.clearTimeout(holdTimer)
  holding.value = null
}

function giveTo(sessionId: string): void {
  target.value = sessionId
  tab.value = 'give'
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  window.clearTimeout(holdTimer)
})
</script>

<template>
  <section
    class="cc-hud absolute bottom-4 right-4 top-4 z-[40] flex w-[min(340px,94vw)] animate-cc-pop flex-col overflow-hidden p-0"
    :aria-label="t('adminPanel.title')"
  >
    <header class="flex items-center justify-between bg-coral px-4 py-1 text-ink-950">
      <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('adminPanel.title') }}</span>
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('adminPanel.close')" @click="emit('close')">
        <UiIcon name="x" :size="18" />
      </button>
    </header>

    <div class="flex gap-0.5 px-2.5 pt-2" role="tablist">
      <button
        v-for="name in TABS"
        :key="name"
        type="button"
        role="tab"
        :aria-selected="tab === name"
        :class="['min-h-11 flex-1 rounded-t-lg text-xs font-bold', tab === name ? 'bg-ink-800 text-fog shadow-[inset_0_-2px_0_rgb(var(--cc-sun))]' : 'text-mist hover:text-fog']"
        @click="tab = name"
      >
        {{ t(`adminPanel.tabs.${name}`) }}
      </button>
    </div>

    <div class="mx-2.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-b-lg bg-ink-800 p-3">
      <template v-if="tab === 'give'">
        <label class="flex flex-col gap-1 text-xs text-mist">
          {{ t('adminPanel.target') }}
          <select v-model="target" class="cc-input min-h-11">
            <option v-for="p in targets" :key="p.sessionId" :value="p.sessionId">{{ p.pseudo ?? t('adminPanel.me') }}</option>
          </select>
        </label>
        <p v-if="!targetIsHere" class="m-0 text-xs text-coral">{{ t('adminPanel.targetGone') }}</p>

        <form class="flex flex-col gap-2" @submit.prevent="giveMoney">
          <h3 class="m-0 text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.money') }}</h3>
          <div class="flex gap-1" role="radiogroup" :aria-label="t('adminPanel.wallet')">
            <button
              v-for="w in WALLETS"
              :key="w"
              type="button"
              role="radio"
              :aria-checked="wallet === w"
              class="cc-btn cc-btn-sm min-h-11 flex-1"
              :class="wallet === w ? '' : 'opacity-60'"
              @click="wallet = w"
            >
              {{ t(`adminPanel.wallets.${w}`) }}
            </button>
          </div>
          <label class="flex flex-col gap-1 text-xs text-mist">
            {{ t('adminPanel.amount', { max: ADMIN_MAX_MONEY }) }}
            <input v-model="amountInput" type="number" min="1" :max="ADMIN_MAX_MONEY" class="cc-input min-h-11" />
          </label>
          <div class="flex gap-1">
            <button
              v-for="quick in QUICK_AMOUNTS"
              :key="quick"
              type="button"
              :class="['min-h-11 flex-1 rounded-full text-xs font-bold', amount === quick ? 'bg-sun text-ink-950' : 'bg-ink-700 text-fog']"
              @click="amountInput = String(quick)"
            >
              {{ quick.toLocaleString() }}
            </button>
          </div>
          <button type="submit" class="cc-btn min-h-11" :disabled="amount === null || !targetIsHere">
            {{ amount === null ? t('adminPanel.give') : t('watch.admin.give', { amount: amount.toLocaleString(), wallet: t(`adminPanel.wallets.${wallet}`) }) }}
          </button>
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
      </template>

      <template v-else-if="tab === 'players'">
        <p v-if="players.length === 0" class="m-0 text-xs text-mist">{{ t('watch.admin.nobody') }}</p>
        <ul v-else class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="player in players" :key="player.sessionId" class="flex flex-col gap-1.5 rounded-lg bg-ink-900 p-2">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate font-bold text-fog">{{ player.pseudo }}<span v-if="player.stars > 0" class="text-coral"> {{ '★'.repeat(player.stars) }}</span></span>
              <span class="shrink-0 text-xs text-mist">{{ t('watch.meters', { d: player.distance.toFixed(0) }) }}</span>
            </div>
            <div class="grid grid-cols-3 gap-1">
              <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('goTo', player.sessionId)">{{ t('watch.admin.actions.goto') }}</button>
              <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('summon', player.sessionId)">{{ t('watch.admin.actions.bring') }}</button>
              <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="giveTo(player.sessionId)">{{ t('adminPanel.give') }}</button>
            </div>
          </li>
        </ul>
      </template>

      <ul v-else-if="tab === 'places'" class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="place in places" :key="place.key">
          <button type="button" class="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-ink-900 px-3 text-left text-sm font-bold text-fog hover:bg-ink-700" @click="emit('teleport', place.key)">
            {{ place.name }}
            <span v-if="place.key === recentPlace" class="text-xs font-semibold text-mist">{{ t('watch.admin.recent') }}</span>
          </button>
        </li>
      </ul>

      <template v-else>
        <div v-for="event in events" :key="event.row" class="flex flex-col gap-1.5 rounded-lg bg-ink-900 p-2">
          <div class="flex items-center justify-between gap-2 text-sm">
            <span class="font-bold text-fog">{{ t(`watch.admin.event.${event.row}`) }}</span>
            <span :class="['shrink-0 rounded-full px-2 text-[11px] font-bold', event.live ? 'bg-mint/20 text-mint' : event.status.key === 'scheduled' ? 'bg-sun/20 text-sun' : 'bg-line/10 text-mist']">
              {{ statusText(event.status) }}
            </span>
          </div>
          <label v-if="event.row === 'market'" class="flex flex-col gap-1 text-xs text-mist">
            {{ t('adminPanel.minutes', { max: ADMIN_MAX_MARKET_MINUTES }) }}
            <input v-model="minutesInput" type="number" min="1" :max="ADMIN_MAX_MARKET_MINUTES" class="cc-input min-h-11" />
          </label>
          <div :class="['grid gap-1', event.row === 'market' ? 'grid-cols-2' : 'grid-cols-1']">
            <button type="button" class="cc-btn cc-btn-sm min-h-11" :disabled="event.row === 'market' && minutes === null" @click="startEvent(event.row)">
              {{ t(`adminPanel.start.${event.row}`) }}
            </button>
            <button
              v-if="event.row === 'market'"
              type="button"
              class="cc-btn cc-btn-sm relative min-h-11 overflow-hidden"
              @pointerdown="startHold('closeMarket')"
              @pointerup="cancelHold"
              @pointerleave="cancelHold"
            >
              <span v-if="holding === 'closeMarket'" class="hold-fill absolute inset-y-0 left-0 bg-coral/40" aria-hidden="true" />
              <span class="relative">{{ t('adminPanel.holdTo', { action: t('adminPanel.closeMarket') }) }}</span>
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-1.5 rounded-lg bg-ink-900 p-2">
          <span class="text-sm font-bold text-fog">{{ t('watch.admin.event.taxes') }}</span>
          <p class="m-0 text-xs text-mist">{{ t('adminPanel.taxesWarning') }}</p>
          <button
            type="button"
            class="cc-btn cc-btn-sm relative min-h-11 overflow-hidden"
            @pointerdown="startHold('taxes')"
            @pointerup="cancelHold"
            @pointerleave="cancelHold"
          >
            <span v-if="holding === 'taxes'" class="hold-fill absolute inset-y-0 left-0 bg-coral/40" aria-hidden="true" />
            <span class="relative">{{ t('adminPanel.holdTo', { action: t('adminPanel.collectTaxes') }) }}</span>
          </button>
        </div>
      </template>
    </div>

    <p v-if="feedback" class="m-0 mx-2.5 mt-2 rounded-lg px-3 py-2 text-xs font-bold" :class="feedback.ok ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'" role="status">{{ feedback.text }}</p>

    <section class="px-4 pb-3 pt-2" :aria-label="t('adminPanel.log')">
      <h3 class="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.log') }}</h3>
      <p v-if="log.length === 0" class="m-0 text-[11px] text-mist">{{ t('adminPanel.logEmpty') }}</p>
      <ol v-else class="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-[11px] text-mist">
        <li v-for="(entry, index) in log" :key="index" class="truncate">
          <span :class="entry.result.ok ? 'text-mint' : 'text-coral'">{{ entry.result.ok ? '✓' : '✕' }}</span>
          {{ clockTime(entry.at) }} {{ resultText(entry.result) }}
        </li>
      </ol>
    </section>
  </section>
</template>

<style scoped>
.hold-fill {
  animation: cc-hold 1s linear forwards;
}

@keyframes cc-hold {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
</style>
