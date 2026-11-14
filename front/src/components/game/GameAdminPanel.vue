<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../composables/game/useAdminWatch'
import { SECTION_ICON, groupedItems, itemSection, quickQuantities, sectionsWithItems, type ItemSection } from '../../game/admin/adminItems.ts'
import {
  ADMIN_BOOSTS,
  ADMIN_MAX_MARKET_MINUTES,
  ADMIN_MAX_MONEY,
  ADMIN_MAX_QUANTITY,
  ADMIN_TOGGLES,
  POWER_ICON,
  adminResultMessage,
  adminTargets,
  wholeIn,
} from '../../game/admin/adminPanel.ts'
import { EVENT_ROWS, HOLD_MS, QUICK_AMOUNTS, eventStatus, isLive, placesWithRecentFirst, type EventRow, type EventStatus } from '../../game/admin/adminWatch.ts'
import type { AdminItem, AdminResultPayload, AdminToggle, AdminWallet } from '../../types/gameRealtime'
import type { UiIconName } from '../ui/icons'
import UiIcon from '../ui/UiIcon.vue'
import AdminThumb from './AdminThumb.vue'

const props = defineProps<{ admin: ReturnType<typeof useAdminWatch>; ownSessionId: string }>()

const emit = defineEmits<{ summon: [sessionId: string]; close: [] }>()

const { t } = useI18n()

const WALLETS: AdminWallet[] = ['cash', 'bank']
const TABS = ['give', 'powers', 'house', 'places', 'events'] as const
type Tab = (typeof TABS)[number]
const TAB_ICON: Record<Tab, UiIconName> = { give: 'backpack', powers: 'bolt', house: 'home', places: 'map', events: 'flag' }
type HeldAction = 'taxes' | 'closeMarket' | `house:${string}`

const tab = ref<Tab>('give')
const menu = computed(() => props.admin.menu.value)
const targets = computed(() => adminTargets(props.ownSessionId, menu.value?.players ?? []))
const target = ref(props.ownSessionId)
const isMe = computed(() => target.value === props.ownSessionId)
const targetPlayer = computed(() => menu.value?.players.find((p) => p.sessionId === target.value) ?? null)
const targetIsHere = computed(() => targets.value.some((p) => p.sessionId === target.value))
const targetName = computed(() => (isMe.value ? t('adminPanel.me') : (targetPlayer.value?.pseudo ?? t('watch.admin.gone'))))
const sheet = computed(() => (props.admin.sheet.value?.sessionId === target.value ? props.admin.sheet.value : null))

const amountInput = ref('500')
const wallet = ref<AdminWallet>('cash')
const query = ref('')
const section = ref<ItemSection>('food')
const picked = ref<AdminItem | null>(null)
const quantityInput = ref('1')
const minutesInput = ref('10')
const holding = ref<HeldAction | null>(null)
let holdTimer: number | undefined

const amount = computed(() => wholeIn(amountInput.value, 1, ADMIN_MAX_MONEY))
const quantity = computed(() => wholeIn(quantityInput.value, 1, ADMIN_MAX_QUANTITY))
const minutes = computed(() => wholeIn(minutesInput.value, 1, ADMIN_MAX_MARKET_MINUTES))
const allItems = computed(() => props.admin.items.value ?? [])
const sections = computed(() => sectionsWithItems(allItems.value))
const groups = computed(() => groupedItems(allItems.value, section.value, query.value))
const searching = computed(() => query.value.trim() !== '')
const showGroupTitles = computed(() => searching.value || groups.value.length > 1)
const pickedQuick = computed(() => (picked.value ? quickQuantities(itemSection(picked.value)) : []))
const places = computed(() => placesWithRecentFirst(menu.value?.destinations ?? [], props.admin.recentPlace.value))
const houses = computed(() => props.admin.houses.value)
const events = computed(() =>
  EVENT_ROWS.filter((row): row is Exclude<EventRow, 'taxes'> => row !== 'taxes').map((row) => {
    const status: EventStatus = menu.value ? eventStatus(row, menu.value.events) : { key: 'unknown' }
    return { row, status, live: isLive(status) }
  }),
)

const VITALS = [
  { key: 'health', icon: 'heart', bar: 'bg-coral' },
  { key: 'hunger', icon: 'apple', bar: 'bg-sun' },
  { key: 'thirst', icon: 'droplet', bar: 'bg-pool' },
] as const

watch(
  target,
  (sessionId) => {
    if (targetIsHere.value) props.admin.loadPlayer(sessionId)
  },
  { immediate: true },
)
watch(sections, (list) => {
  if (list.length > 0 && !list.some((s) => s.section === section.value)) section.value = list[0]!.section
})

const itemName = (itemCode: string) => props.admin.items.value?.find((i) => i.code === itemCode)?.name ?? itemCode
const clockTime = (at: string | number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayTime = (at: string) => new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })

function resultText(result: AdminResultPayload): string {
  const { key, params } = adminResultMessage(result, itemName, clockTime)
  return t(key, params)
}

const feedback = computed(() => {
  if (props.admin.error.value) return { ok: false, text: props.admin.error.value }
  const result = props.admin.result.value
  return result ? { ok: result.ok, text: resultText(result) } : null
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

function hasPower(toggle: AdminToggle): boolean {
  return sheet.value?.powers.includes(toggle) ?? false
}

function pick(item: AdminItem): void {
  picked.value = item
  quantityInput.value = '1'
}

function startEvent(row: Exclude<EventRow, 'taxes'>): void {
  if (row === 'quiz') props.admin.startQuiz()
  else if (row === 'storage') props.admin.startStorageSale()
  else if (minutes.value !== null) props.admin.openMarket(minutes.value)
}

function giveMoney(): void {
  if (amount.value === null || !targetIsHere.value) return
  props.admin.giveMoney(target.value, wallet.value, amount.value)
}

function giveItem(): void {
  if (picked.value === null || quantity.value === null || !targetIsHere.value) return
  props.admin.giveItem(target.value, picked.value.code, quantity.value)
}

function stepQuantity(delta: number): void {
  const next = Math.min(Math.max((quantity.value ?? 1) + delta, 1), ADMIN_MAX_QUANTITY)
  quantityInput.value = String(next)
}

function runHeld(action: HeldAction): void {
  if (action === 'taxes') props.admin.collectTaxes()
  else if (action === 'closeMarket') props.admin.closeMarket()
  else if (targetIsHere.value) props.admin.giveHouse(target.value, action.slice('house:'.length))
}

function startHold(action: HeldAction): void {
  cancelHold()
  holding.value = action
  holdTimer = window.setTimeout(() => {
    holding.value = null
    runHeld(action)
  }, HOLD_MS)
}

function cancelHold(): void {
  window.clearTimeout(holdTimer)
  holding.value = null
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
  <section class="cc-hud absolute bottom-4 right-4 top-4 z-[40] flex w-[min(420px,calc(100vw-2rem))] animate-cc-pop flex-col overflow-hidden p-0" :aria-label="t('adminPanel.title')">
    <header class="flex items-center justify-between bg-coral px-4 py-1 text-ink-950">
      <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('adminPanel.title') }}</span>
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('adminPanel.close')" @click="emit('close')">
        <UiIcon name="x" :size="18" />
      </button>
    </header>

    <!-- Target: always in view, so every action says who it lands on -->
    <section class="border-b border-line/10 px-2.5 pb-2 pt-2" :aria-label="t('adminPanel.target')">
      <div class="flex gap-1 overflow-x-auto pb-1" role="radiogroup" :aria-label="t('adminPanel.target')">
        <button
          v-for="p in targets"
          :key="p.sessionId"
          type="button"
          role="radio"
          :aria-checked="target === p.sessionId"
          :class="['flex min-h-11 shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-bold', target === p.sessionId ? 'bg-sun text-ink-950' : 'bg-ink-800 text-fog hover:bg-ink-700']"
          @click="target = p.sessionId"
        >
          <span :class="['grid size-7 place-items-center rounded-full text-[11px]', target === p.sessionId ? 'bg-ink-950/15' : 'bg-gradient-to-br from-grape to-pool text-ink-950']">
            {{ (p.pseudo ?? t('adminPanel.me')).slice(0, 1).toUpperCase() }}
          </span>
          {{ p.pseudo ?? t('adminPanel.me') }}
        </button>
      </div>

      <div class="mt-1 rounded-xl bg-ink-800 p-2.5">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <b class="block truncate font-display text-lg leading-tight text-fog">{{ targetName }}</b>
            <small class="text-[11px] text-mist">
              <template v-if="!targetIsHere">{{ t('adminPanel.targetGone') }}</template>
              <template v-else-if="sheet">
                {{ t('watch.admin.sheet', { cash: sheet.cash.toLocaleString(), bank: sheet.bank.toLocaleString() }) }}
                <span v-if="sheet.stars > 0" class="text-coral"> · {{ '★'.repeat(sheet.stars) }}</span>
              </template>
              <template v-else>{{ t('adminPanel.loading') }}</template>
            </small>
          </div>
          <div v-if="!isMe && targetIsHere" class="flex shrink-0 gap-1">
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="admin.goTo(target)">{{ t('watch.admin.actions.goto') }}</button>
            <button type="button" class="cc-btn cc-btn-sm min-h-11" @click="emit('summon', target)">{{ t('watch.admin.actions.bring') }}</button>
          </div>
        </div>
        <div v-if="sheet" class="mt-2 grid grid-cols-3 gap-2">
          <div v-for="vital in VITALS" :key="vital.key" class="flex items-center gap-1" :title="t(`adminPanel.vitals.${vital.key}`)">
            <UiIcon :name="vital.icon" :size="13" class="text-mist" />
            <span class="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-950">
              <span :class="['block h-full rounded-full', vital.bar]" :style="{ width: `${sheet.vitals[vital.key]}%` }" />
            </span>
            <span class="w-6 text-right text-[10px] tabular-nums text-mist">{{ sheet.vitals[vital.key] }}</span>
          </div>
        </div>
        <div v-if="sheet && sheet.powers.length > 0" class="mt-2 flex flex-wrap gap-1">
          <span v-for="power in sheet.powers" :key="power" class="inline-flex items-center gap-1 rounded-full bg-mint/20 px-2 py-0.5 text-[10px] font-bold text-mint">
            <UiIcon :name="POWER_ICON[power]" :size="11" />
            {{ t(`adminPanel.powers.${power}`) }}
          </span>
        </div>
      </div>
    </section>

    <div class="flex gap-0.5 px-2.5 pt-2" role="tablist">
      <button
        v-for="name in TABS"
        :key="name"
        type="button"
        role="tab"
        :aria-selected="tab === name"
        :class="['flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-t-lg text-[11px] font-bold', tab === name ? 'bg-ink-800 text-fog shadow-[inset_0_-2px_0_rgb(var(--cc-sun))]' : 'text-mist hover:text-fog']"
        @click="tab = name"
      >
        <UiIcon :name="TAB_ICON[name]" :size="15" />
        {{ t(`adminPanel.tabs.${name}`) }}
      </button>
    </div>

    <div class="relative mx-2.5 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-b-lg bg-ink-800 p-3">
      <template v-if="tab === 'give'">
        <form class="flex flex-col gap-2 rounded-lg bg-ink-900 p-2.5" @submit.prevent="giveMoney">
          <h3 class="m-0 flex items-center gap-1.5 text-xs font-bold text-fog"><UiIcon name="bank" :size="14" class="text-sun" />{{ t('adminPanel.money') }}</h3>
          <div class="flex gap-1" role="radiogroup" :aria-label="t('adminPanel.wallet')">
            <button
              v-for="w in WALLETS"
              :key="w"
              type="button"
              role="radio"
              :aria-checked="wallet === w"
              :class="['min-h-11 flex-1 rounded-lg text-xs font-bold', wallet === w ? 'bg-sun text-ink-950' : 'bg-ink-800 text-mist hover:text-fog']"
              @click="wallet = w"
            >
              {{ t(`adminPanel.wallets.${w}`) }}
            </button>
          </div>
          <div class="grid grid-cols-[1fr_auto] gap-1">
            <input v-model="amountInput" type="number" min="1" :max="ADMIN_MAX_MONEY" class="cc-input min-h-11" :aria-label="t('adminPanel.amount', { max: ADMIN_MAX_MONEY })" />
            <button type="submit" class="cc-btn min-h-11" :disabled="amount === null || !targetIsHere">{{ t('adminPanel.give') }}</button>
          </div>
          <div class="flex gap-1">
            <button
              v-for="quick in QUICK_AMOUNTS"
              :key="quick"
              type="button"
              :class="['min-h-11 flex-1 rounded-full text-xs font-bold', amount === quick ? 'bg-sun text-ink-950' : 'bg-ink-800 text-fog']"
              @click="amountInput = String(quick)"
            >
              {{ quick.toLocaleString() }}
            </button>
          </div>
        </form>

        <section class="flex flex-col gap-2" :aria-label="t('adminPanel.items')">
          <h3 class="m-0 flex items-center gap-1.5 text-xs font-bold text-fog"><UiIcon name="backpack" :size="14" class="text-mint" />{{ t('adminPanel.items') }}</h3>
          <input v-model="query" type="search" class="cc-input min-h-11" :placeholder="t('adminPanel.search')" :aria-label="t('adminPanel.search')" />
          <div v-if="!searching" class="flex flex-wrap gap-1" role="tablist" :aria-label="t('adminPanel.items')">
            <button
              v-for="s in sections"
              :key="s.section"
              type="button"
              role="tab"
              :aria-selected="section === s.section"
              :class="['inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold', section === s.section ? 'bg-mint text-ink-950' : 'bg-ink-900 text-mist hover:text-fog']"
              @click="section = s.section"
            >
              <UiIcon :name="SECTION_ICON[s.section]" :size="13" />
              {{ t(`adminPanel.sections.${s.section}`) }}
              <span class="opacity-70">{{ s.count }}</span>
            </button>
          </div>

          <p v-if="admin.items.value === null" class="m-0 text-xs text-mist">{{ t('adminPanel.loading') }}</p>
          <p v-else-if="groups.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.noItem') }}</p>
          <div v-for="group in groups" v-else :key="group.group" class="flex flex-col gap-1">
            <h4 v-if="showGroupTitles" class="m-0 text-[11px] font-bold text-mist">{{ t(searching ? `adminPanel.sections.${group.group}` : `adminPanel.groups.${group.group}`) }}</h4>
            <ul class="m-0 grid list-none grid-cols-3 gap-1.5 p-0" role="listbox" :aria-label="group.group">
              <li v-for="item in group.items" :key="item.code" role="option" :aria-selected="picked?.code === item.code">
                <button
                  type="button"
                  :class="['flex w-full flex-col items-center gap-1 rounded-lg p-1.5 text-center', picked?.code === item.code ? 'bg-sun/20 ring-2 ring-sun' : 'bg-ink-900 hover:bg-ink-700']"
                  :title="item.code"
                  @click="pick(item)"
                >
                  <AdminThumb :src="item.preview" :icon="SECTION_ICON[itemSection(item)]" :size="52" />
                  <span class="line-clamp-2 min-h-[2lh] text-[11px] font-bold leading-tight text-fog">{{ item.name }}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>

        <form v-if="picked" class="sticky -bottom-3 -mx-3 -mb-3 mt-auto flex flex-col gap-2 border-t border-line/10 bg-ink-900 p-2.5 shadow-[0_-8px_16px_rgb(0_0_0/0.25)]" @submit.prevent="giveItem">
          <div class="flex items-center gap-2">
            <AdminThumb :src="picked.preview" :icon="SECTION_ICON[itemSection(picked)]" :size="44" />
            <div class="min-w-0 flex-1">
              <b class="block truncate text-sm text-fog">{{ picked.name }}</b>
              <span v-if="picked.portion" class="flex gap-2 text-[11px] text-mist">
                <span v-if="picked.portion.hunger" class="inline-flex items-center gap-0.5"><UiIcon name="apple" :size="11" />+{{ picked.portion.hunger }}</span>
                <span v-if="picked.portion.thirst" class="inline-flex items-center gap-0.5"><UiIcon name="droplet" :size="11" />+{{ picked.portion.thirst }}</span>
                <span v-if="picked.portion.health" class="inline-flex items-center gap-0.5"><UiIcon name="heart" :size="11" />+{{ picked.portion.health }}</span>
              </span>
              <span v-else class="text-[11px] text-mist">{{ t(`adminPanel.sections.${itemSection(picked)}`) }}</span>
            </div>
            <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center text-mist hover:text-fog" :aria-label="t('adminPanel.unpick')" @click="picked = null">
              <UiIcon name="x" :size="16" />
            </button>
          </div>
          <div class="flex items-center gap-1">
            <button type="button" class="min-h-11 min-w-11 rounded-lg bg-ink-800 text-lg font-bold text-fog" :aria-label="t('adminPanel.less')" @click="stepQuantity(-1)">−</button>
            <input v-model="quantityInput" type="number" min="1" :max="ADMIN_MAX_QUANTITY" class="cc-input min-h-11 w-16 text-center" :aria-label="t('adminPanel.quantity', { max: ADMIN_MAX_QUANTITY })" />
            <button type="button" class="min-h-11 min-w-11 rounded-lg bg-ink-800 text-lg font-bold text-fog" :aria-label="t('adminPanel.more')" @click="stepQuantity(1)">+</button>
            <button
              v-for="quick in pickedQuick"
              :key="quick"
              type="button"
              :class="['min-h-11 flex-1 rounded-full text-xs font-bold', quantity === quick ? 'bg-mint text-ink-950' : 'bg-ink-800 text-fog']"
              @click="quantityInput = String(quick)"
            >
              ×{{ quick }}
            </button>
          </div>
          <button type="submit" class="cc-btn min-h-11" :disabled="quantity === null || !targetIsHere">
            {{ t('adminPanel.giveItem', { quantity: quantity ?? '?', item: picked.name, name: targetName }) }}
          </button>
        </form>
      </template>

      <template v-else-if="tab === 'powers'">
        <p v-if="!targetIsHere" class="m-0 text-xs text-coral">{{ t('adminPanel.targetGone') }}</p>
        <section class="flex flex-col gap-1.5" :aria-label="t('adminPanel.lasting')">
          <h3 class="m-0 text-xs font-bold text-fog">{{ t('adminPanel.lasting') }}</h3>
          <p class="m-0 text-[11px] text-mist">{{ t('adminPanel.lastingHint') }}</p>
          <button
            v-for="toggle in ADMIN_TOGGLES"
            :key="toggle"
            type="button"
            role="switch"
            :aria-checked="hasPower(toggle)"
            :disabled="!sheet"
            class="flex min-h-11 items-center gap-2.5 rounded-lg bg-ink-900 px-2.5 py-2 text-left hover:bg-ink-700 disabled:opacity-50"
            @click="admin.power(target, toggle, !hasPower(toggle))"
          >
            <span :class="['grid size-8 shrink-0 place-items-center rounded-lg', hasPower(toggle) ? 'bg-mint text-ink-950' : 'bg-ink-800 text-mist']">
              <UiIcon :name="POWER_ICON[toggle]" :size="16" />
            </span>
            <span class="min-w-0 flex-1">
              <b class="block text-sm text-fog">{{ t(`adminPanel.powers.${toggle}`) }}</b>
              <small class="block text-[11px] text-mist">{{ t(`adminPanel.powerHints.${toggle}`) }}</small>
            </span>
            <span :class="['relative h-6 w-10 shrink-0 rounded-full transition-colors', hasPower(toggle) ? 'bg-mint' : 'bg-ink-700']" aria-hidden="true">
              <span :class="['absolute top-0.5 size-5 rounded-full bg-fog transition-[left]', hasPower(toggle) ? 'left-[18px]' : 'left-0.5']" />
            </span>
          </button>
        </section>
        <section class="flex flex-col gap-1.5" :aria-label="t('adminPanel.instant')">
          <h3 class="m-0 text-xs font-bold text-fog">{{ t('adminPanel.instant') }}</h3>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="boost in ADMIN_BOOSTS"
              :key="boost"
              type="button"
              :disabled="!targetIsHere"
              class="flex min-h-11 items-center gap-2 rounded-lg bg-ink-900 px-2.5 py-2 text-left text-xs font-bold text-fog hover:bg-ink-700 disabled:opacity-50"
              @click="admin.power(target, boost)"
            >
              <UiIcon :name="POWER_ICON[boost]" :size="16" class="text-sun" />
              {{ t(`adminPanel.powers.${boost}`) }}
            </button>
          </div>
        </section>
      </template>

      <template v-else-if="tab === 'house'">
        <p class="m-0 text-[11px] text-mist">{{ t('adminPanel.houseHint', { name: targetName }) }}</p>
        <p v-if="houses.length === 0" class="m-0 text-xs text-mist">{{ t('adminPanel.noHouse') }}</p>
        <ul v-else class="m-0 flex list-none flex-col gap-1.5 p-0">
          <li v-for="house in houses" :key="house.unit" class="flex items-center gap-2.5 rounded-lg bg-ink-900 p-2">
            <AdminThumb :src="house.preview" icon="home" :size="56" />
            <div class="min-w-0 flex-1">
              <b class="block truncate text-sm text-fog">{{ house.name }}</b>
              <small class="text-[11px] text-mist">{{ t('adminPanel.houseWorth', { price: house.price.toLocaleString() }) }}</small>
            </div>
            <button
              type="button"
              class="cc-btn cc-btn-sm relative min-h-11 shrink-0 overflow-hidden"
              :disabled="!targetIsHere"
              @pointerdown="startHold(`house:${house.unit}`)"
              @pointerup="cancelHold"
              @pointerleave="cancelHold"
            >
              <span v-if="holding === `house:${house.unit}`" class="hold-fill absolute inset-y-0 left-0 bg-coral/40" aria-hidden="true" />
              <span class="relative">{{ t('adminPanel.give') }}</span>
            </button>
          </li>
        </ul>
      </template>

      <ul v-else-if="tab === 'places'" class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="place in places" :key="place.key">
          <button type="button" class="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-ink-900 px-3 text-left text-sm font-bold text-fog hover:bg-ink-700" @click="admin.teleport(place.key)">
            <span class="inline-flex items-center gap-2"><UiIcon name="map" :size="14" class="text-pool" />{{ place.name }}</span>
            <span v-if="place.key === admin.recentPlace.value" class="text-xs font-semibold text-mist">{{ t('watch.admin.recent') }}</span>
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
          <button type="button" class="cc-btn cc-btn-sm relative min-h-11 overflow-hidden" @pointerdown="startHold('taxes')" @pointerup="cancelHold" @pointerleave="cancelHold">
            <span v-if="holding === 'taxes'" class="hold-fill absolute inset-y-0 left-0 bg-coral/40" aria-hidden="true" />
            <span class="relative">{{ t('adminPanel.holdTo', { action: t('adminPanel.collectTaxes') }) }}</span>
          </button>
        </div>
      </template>
    </div>

    <p v-if="feedback" class="m-0 mx-2.5 mt-2 rounded-lg px-3 py-2 text-xs font-bold" :class="feedback.ok ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'" role="status">{{ feedback.text }}</p>

    <section class="px-4 pb-3 pt-2 [@media(max-height:640px)]:hidden" :aria-label="t('adminPanel.log')">
      <h3 class="m-0 mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-mist">{{ t('adminPanel.log') }}</h3>
      <p v-if="admin.log.value.length === 0" class="m-0 text-[11px] text-mist">{{ t('adminPanel.logEmpty') }}</p>
      <ol v-else class="m-0 flex list-none flex-col gap-0.5 p-0 font-mono text-[11px] text-mist">
        <li v-for="(entry, index) in admin.log.value.slice(0, 3)" :key="index" class="truncate">
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
