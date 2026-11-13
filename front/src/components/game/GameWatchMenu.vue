<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels, matches } from '../../config/keybindings'
import { WATCH_HOME, stepWatch, watchKeyOf, type WatchView } from '../../game/watch/watchNav'
import type { BankScreen } from '../../api/bank'
import type { GpsPlace, GpsPlaceAt } from '../../game/watch/gps'
import type { AdminMenuPayload, TradeNearbyPlayer, TradePendingPayload, TradeRequestedPayload } from '../../types/gameRealtime'
import type { UiIconName } from '../ui/icons'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'
import WatchAdminApp from './watch/WatchAdminApp.vue'
import WatchBankApp from './watch/WatchBankApp.vue'
import WatchGpsApp from './watch/WatchGpsApp.vue'
import WatchTradeApp from './watch/WatchTradeApp.vue'

/**
 * The watch's apps, opened with a tap on the watch key (holding it still raises the wrist). It sits in the bottom
 * left corner and is driven by the keyboard (watchNav.ts) so the player keeps walking and looking around.
 * Adding an app: docs/WATCH_APPS.md.
 */
const props = defineProps<{
  nearby: TradeNearbyPlayer[]
  incoming: TradeRequestedPayload | null
  outgoing: TradePendingPayload | null
  error: string | null
  isAdmin: boolean
  adminMenu: AdminMenuPayload | null
  adminError: string | null
  cash: number | null
  bankScreen: BankScreen | null
  bankError: string | null
  gpsPlaces: GpsPlaceAt[]
  gpsTargetId: string | null
  atmDistance: number | null
}>()

const emit = defineEmits<{
  request: [player: TradeNearbyPlayer]
  respond: [accept: boolean]
  cancel: []
  close: []
  adminOpen: []
  bankOpen: []
  gpsToggle: [place: GpsPlace]
  routeAtm: []
  teleport: [key: string]
  summon: [sessionId: string]
}>()

const { t } = useI18n()

type AppKey = 'gps' | 'bank' | 'trade' | 'admin'

interface WatchApp {
  key: AppKey
  icon: UiIconName
  tile: string
  badge: boolean
  enterLabel: string | null
}

const apps = computed<WatchApp[]>(() => [
  { key: 'gps', icon: 'map', tile: 'bg-sun', badge: false, enterLabel: t('watch.gps.enter') },
  { key: 'bank', icon: 'bank', tile: 'bg-mint', badge: false, enterLabel: t('watch.bank.enter') },
  { key: 'trade', icon: 'hand', tile: 'bg-grape', badge: props.incoming !== null, enterLabel: t('watch.trade.enter') },
  ...(props.isAdmin ? [{ key: 'admin', icon: 'shield', tile: 'bg-coral', badge: false, enterLabel: t('watch.admin.enter') } as const] : []),
])

const view = ref<WatchView>(WATCH_HOME)
const openApp = computed(() => (view.value.screen === 'app' ? apps.value[view.value.app] ?? null : null))
const selectedRow = computed(() => (view.value.screen === 'app' ? view.value.row : -1))

const appRef = ref<{ rowCount: number; activate: (row: number) => void } | null>(null)

const acceptKey = computed(() => actionKeyLabels('acceptChallenge')[0] ?? 'Y')
const declineKey = computed(() => actionKeyLabels('declineChallenge')[0] ?? 'N')

const clock = ref('')
function tickClock(): void {
  clock.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
let clockTimer: number | undefined

const errorText = computed(() => ({ gps: null, bank: props.bankError, trade: props.error, admin: props.adminError })[openApp.value?.key ?? 'trade'])
const enterHint = computed(() => (openApp.value ? openApp.value.enterLabel : t('watch.keys.open')))

const screenRef = ref<HTMLElement | null>(null)
watch(view, () => {
  void nextTick(() => screenRef.value?.querySelector('[data-watch-selected]')?.scrollIntoView({ block: 'nearest' }))
})

function onKey(e: KeyboardEvent): void {
  if (props.incoming && !e.repeat && (matches('acceptChallenge', e.code) || matches('declineChallenge', e.code))) {
    emit('respond', matches('acceptChallenge', e.code))
    e.preventDefault()
    e.stopPropagation()
    return
  }
  const key = watchKeyOf(e.code)
  if (!key) return
  e.preventDefault()
  e.stopPropagation()
  if (e.repeat && (key === 'enter' || key === 'back')) return
  const step = stepWatch(view.value, key, { apps: apps.value.length, rows: appRef.value?.rowCount ?? 0 })
  view.value = step.view
  if (step.effect?.kind === 'close') emit('close')
  else if (step.effect?.kind === 'open') openedApp(step.effect.app)
  else if (step.effect?.kind === 'activate') appRef.value?.activate(step.effect.row)
}

function openedApp(index: number): void {
  const key = apps.value[index]?.key
  if (key === 'admin') emit('adminOpen')
  else if (key === 'bank') emit('bankOpen')
}

onMounted(() => {
  tickClock()
  clockTimer = window.setInterval(tickClock, 10_000)
  window.addEventListener('keydown', onKey, true)
})
onUnmounted(() => {
  window.clearInterval(clockTimer)
  window.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <section class="absolute bottom-6 left-4 z-[40] w-[248px] animate-cc-pop" :aria-label="t('watch.label')">
    <span class="absolute -top-3 left-1/2 h-4 w-28 -translate-x-1/2 rounded-t-[10px] bg-ink-950" aria-hidden="true" />
    <span class="absolute -bottom-3 left-1/2 h-4 w-28 -translate-x-1/2 rounded-b-[10px] bg-ink-950" aria-hidden="true" />
    <span class="absolute -right-2 top-14 h-9 w-3 rounded bg-ink-950 ring-1 ring-line/10" aria-hidden="true" />
    <div class="relative rounded-[30px] bg-ink-950 p-2.5 shadow-[0_14px_30px_rgb(0_0_0/0.35)] ring-1 ring-line/10">
      <div class="flex h-[272px] flex-col overflow-hidden rounded-[18px] bg-ink-900 text-fog ring-1 ring-line/5">
        <div class="flex items-center justify-between px-3 pb-1 pt-2 text-xs font-bold text-mist">
          <span class="font-display text-base text-fog">{{ clock }}</span>
          <UiCurrency currency="coins" :amount="cash" :size="12" />
        </div>

        <div v-if="openApp" class="flex items-center gap-1.5 px-3 pb-2 font-display text-lg font-extrabold">
          <UiIcon name="chevron-left" :size="16" class="text-mist" />
          {{ t(`watch.apps.${openApp.key}`) }}
        </div>

        <div ref="screenRef" class="min-h-0 flex-1 overflow-y-auto px-2">
          <ul v-if="!openApp" class="m-0 grid list-none grid-cols-3 gap-2 px-1 py-1.5">
            <li
              v-for="(app, index) in apps"
              :key="app.key"
              :data-watch-selected="view.app === index || undefined"
              :class="[
                'relative flex flex-col items-center gap-1.5 rounded-[14px] pb-2 pt-2.5 text-[11px] font-bold',
                view.app === index ? 'bg-ink-700 ring-2 ring-sun' : '',
              ]"
            >
              <span v-if="app.badge" class="absolute right-3 top-1 size-4 rounded-full bg-coral text-center text-[10px] font-extrabold leading-4 text-white">1</span>
              <span :class="['grid size-10 place-items-center rounded-xl text-ink-950', app.tile]">
                <UiIcon :name="app.icon" :size="22" />
              </span>
              {{ t(`watch.apps.${app.key}`) }}
            </li>
          </ul>
          <WatchGpsApp
            v-else-if="openApp.key === 'gps'"
            ref="appRef"
            :places="gpsPlaces"
            :target-id="gpsTargetId"
            :selected="selectedRow"
            @toggle="(place) => emit('gpsToggle', place)"
          />
          <WatchBankApp
            v-else-if="openApp.key === 'bank'"
            ref="appRef"
            :screen="bankScreen"
            :atm-distance="atmDistance"
            :selected="selectedRow"
            @route-atm="emit('routeAtm')"
          />
          <WatchTradeApp
            v-else-if="openApp.key === 'trade'"
            ref="appRef"
            :nearby="nearby"
            :incoming="incoming"
            :outgoing="outgoing"
            :selected="selectedRow"
            :accept-key="acceptKey"
            :decline-key="declineKey"
            @request="(player) => emit('request', player)"
            @cancel="emit('cancel')"
          />
          <WatchAdminApp
            v-else
            ref="appRef"
            :menu="adminMenu"
            :selected="selectedRow"
            @teleport="(key) => emit('teleport', key)"
            @summon="(sessionId) => emit('summon', sessionId)"
          />
        </div>

        <p v-if="openApp && errorText" class="m-0 bg-coral/20 px-3 py-1.5 text-[11px] font-bold text-coral">{{ errorText }}</p>

        <div class="flex justify-center gap-2.5 border-t border-line/10 px-2 pb-2 pt-1.5 text-[11px] font-semibold text-mist">
          <span><kbd class="rounded bg-ink-700 px-1 text-[10px] font-bold text-fog">↑↓</kbd> {{ t('watch.keys.choose') }}</span>
          <span v-if="enterHint"><kbd class="rounded bg-ink-700 px-1 text-[10px] font-bold text-fog">↵</kbd> {{ enterHint }}</span>
          <span><kbd class="rounded bg-ink-700 px-1 text-[10px] font-bold text-fog">⌫</kbd> {{ openApp ? t('watch.keys.back') : t('watch.keys.close') }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
