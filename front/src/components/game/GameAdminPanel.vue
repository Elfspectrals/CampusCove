<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../composables/game/useAdminWatch'
import { useHoldAction } from '../../composables/game/useHoldAction'
import { ADMIN_MAX_MARKET_MINUTES, POWER_ICON, adminResultMessage, adminTargets, wholeIn } from '../../game/admin/adminPanel.ts'
import { EVENT_ROWS, eventStatus, isLive, placesWithRecentFirst, type EventRow, type EventStatus } from '../../game/admin/adminConsole.ts'
import type { WorldMapImage } from '../../game/world/minimap'
import type { WorldZone } from '../../game/world/worldManifest'
import type { AdminResultPayload } from '../../types/gameRealtime'
import type { UiIconName } from '../ui/icons'
import UiIcon from '../ui/UiIcon.vue'
import AdminGiveTab from './admin/AdminGiveTab.vue'
import AdminHoldButton from './admin/AdminHoldButton.vue'
import AdminHouseTab from './admin/AdminHouseTab.vue'
import AdminPowersTab from './admin/AdminPowersTab.vue'

/** The admin console docked on the right, opened by the watch's Admin tile: who it acts on stays in view on top. */
const props = defineProps<{
  admin: ReturnType<typeof useAdminWatch>
  ownSessionId: string
  mapImage: WorldMapImage | null
  zones: readonly WorldZone[]
  /** The game holds the mouse (pointer lock): the console stays open, the watch key gives the mouse back. */
  gameHasMouse: boolean
  watchKey: string
}>()

const emit = defineEmits<{ summon: [sessionId: string]; close: [] }>()

const { t } = useI18n()
const hold = useHoldAction()

const TABS = ['give', 'powers', 'house', 'places', 'events'] as const
type Tab = (typeof TABS)[number]
const TAB_ICON: Record<Tab, UiIconName> = { give: 'backpack', powers: 'bolt', house: 'home', places: 'map', events: 'flag' }

const tab = ref<Tab>('give')
const menu = computed(() => props.admin.menu.value)
const targets = computed(() => adminTargets(props.ownSessionId, menu.value?.players ?? []))
const target = ref(props.ownSessionId)
const isMe = computed(() => target.value === props.ownSessionId)
const targetPlayer = computed(() => menu.value?.players.find((p) => p.sessionId === target.value) ?? null)
const targetIsHere = computed(() => targets.value.some((p) => p.sessionId === target.value))
const targetName = computed(() => (isMe.value ? t('adminPanel.me') : (targetPlayer.value?.pseudo ?? t('watch.admin.gone'))))
const sheet = computed(() => (props.admin.sheet.value?.sessionId === target.value ? props.admin.sheet.value : null))

const minutesInput = ref('10')
const minutes = computed(() => wholeIn(minutesInput.value, 1, ADMIN_MAX_MARKET_MINUTES))
const places = computed(() => placesWithRecentFirst(menu.value?.destinations ?? [], props.admin.recentPlace.value))
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
// a kicked or departed target falls back to the admin
watch(targetIsHere, (here) => {
  if (!here && menu.value) target.value = props.ownSessionId
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

function startEvent(row: Exclude<EventRow, 'taxes'>): void {
  if (row === 'quiz') props.admin.startQuiz()
  else if (row === 'storage') props.admin.startStorageSale()
  else if (minutes.value !== null) props.admin.openMarket(minutes.value)
}

/** Esc that only released the mouse from the game must not close the console too. */
let mouseReleasedAt = 0
watch(
  () => props.gameHasMouse,
  (has) => {
    if (!has) mouseReleasedAt = performance.now()
  },
)

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || props.gameHasMouse || performance.now() - mouseReleasedAt < 250) return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <section
    :class="['cc-hud absolute bottom-4 right-4 top-4 z-[40] flex w-[min(420px,calc(100vw-2rem))] animate-cc-pop flex-col overflow-hidden p-0 transition-opacity', gameHasMouse ? 'opacity-70' : '']"
    :aria-label="t('adminPanel.title')"
  >
    <header class="flex items-center justify-between bg-coral px-4 py-1 text-ink-950">
      <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('adminPanel.title') }}</span>
      <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('adminPanel.close')" @click="emit('close')">
        <UiIcon name="x" :size="18" />
      </button>
    </header>

    <p v-if="gameHasMouse" class="m-0 flex items-center gap-2 bg-ink-950 px-4 py-1.5 text-xs font-bold text-fog" role="status">
      <kbd class="rounded bg-sun px-1.5 text-[11px] font-extrabold text-ink-950">{{ watchKey }}</kbd>
      {{ t('adminPanel.backToConsole') }}
    </p>
    <p v-else class="m-0 bg-ink-950 px-4 py-1 text-[11px] text-mist">{{ t('adminPanel.playHint', { key: watchKey }) }}</p>

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
      <AdminGiveTab v-if="tab === 'give'" :admin="admin" :target="target" :target-name="targetName" :target-is-here="targetIsHere" :sheet="sheet" />
      <AdminPowersTab v-else-if="tab === 'powers'" :admin="admin" :target="target" :target-is-here="targetIsHere" :is-me="isMe" :sheet="sheet" />
      <AdminHouseTab
        v-else-if="tab === 'house'"
        :admin="admin"
        :map-image="mapImage"
        :zones="zones"
        :target="target"
        :target-name="targetName"
        :target-is-here="targetIsHere"
        :sheet="sheet"
      />

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
            <AdminHoldButton
              v-if="event.row === 'market'"
              :holding="hold.holding.value === 'closeMarket'"
              :label="t('adminPanel.holdTo', { action: t('adminPanel.closeMarket') })"
              @start="hold.start('closeMarket', admin.closeMarket)"
              @cancel="hold.cancel"
            />
          </div>
        </div>
        <div class="flex flex-col gap-1.5 rounded-lg bg-ink-900 p-2">
          <span class="text-sm font-bold text-fog">{{ t('watch.admin.event.taxes') }}</span>
          <p class="m-0 text-xs text-mist">{{ t('adminPanel.taxesWarning') }}</p>
          <AdminHoldButton
            :holding="hold.holding.value === 'taxes'"
            :label="t('adminPanel.holdTo', { action: t('adminPanel.collectTaxes') })"
            @start="hold.start('taxes', admin.collectTaxes)"
            @cancel="hold.cancel"
          />
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
