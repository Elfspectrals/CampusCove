<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { useAdminWatch } from '../../../composables/game/useAdminWatch'
import { ADMIN_MAX_QUANTITY, adminResultMessage, filterAdminItems } from '../../../game/admin/adminPanel'
import {
  ADMIN_HOME,
  EVENT_ROWS,
  HOLD_MS,
  HOME_TILES,
  MARKET_MINUTE_STEPS,
  MARKET_ROWS,
  MONEY_ROWS,
  MONEY_STEPS,
  QUICK_AMOUNTS,
  editsSearch,
  eventStatus,
  isHoldRow,
  isLive,
  moveOnHome,
  parentPage,
  placesWithRecentFirst,
  playerActions,
  playersByDistance,
  stepQuantity,
  stepThrough,
  typedQuery,
  type AdminPage,
  type EventStatus,
  type HomeTile,
} from '../../../game/admin/adminWatch'
import type { WatchKey } from '../../../game/watch/watchNav'
import type { AdminWallet } from '../../../types/gameRealtime'
import type { UiIconName } from '../../ui/icons'
import UiIcon from '../../ui/UiIcon.vue'
import WatchRow from './WatchRow.vue'

const props = defineProps<{ admin: ReturnType<typeof useAdminWatch>; ownSessionId: string; selected: number }>()

const emit = defineEmits<{ teleport: [key: string]; summon: [sessionId: string]; goTo: [sessionId: string]; storageSale: []; panel: [] }>()

const { t } = useI18n()

const TILE_LOOK: Record<HomeTile, { icon: UiIconName; tile: string }> = {
  players: { icon: 'users', tile: 'bg-mint' },
  places: { icon: 'map', tile: 'bg-pool' },
  events: { icon: 'flag', tile: 'bg-coral' },
  console: { icon: 'monitor', tile: 'bg-sun' },
}

const page = ref<AdminPage>(ADMIN_HOME)
const wallet = ref<AdminWallet>('cash')
const amount = ref(500)
const quantity = ref(1)
const query = ref('')
const marketMinutes = ref(10)
const holdingRow = ref<number | null>(null)
let holdTimer: number | undefined

const menu = computed(() => props.admin.menu.value)
const players = computed(() => playersByDistance(menu.value?.players ?? []))
const places = computed(() => placesWithRecentFirst(menu.value?.destinations ?? [], props.admin.recentPlace.value))
const items = computed(() => filterAdminItems(props.admin.items.value ?? [], query.value))
const targetId = computed(() => ('sessionId' in page.value ? page.value.sessionId : null))
const isMe = computed(() => targetId.value === props.ownSessionId)
const targetName = computed(() => {
  if (isMe.value) return t('adminPanel.me')
  return players.value.find((p) => p.sessionId === targetId.value)?.pseudo ?? t('watch.admin.gone')
})
const sheet = computed(() => (props.admin.sheet.value?.sessionId === targetId.value ? props.admin.sheet.value : null))
const actions = computed(() => playerActions(isMe.value))

const rowKeys = computed<string[]>(() => {
  const p = page.value
  switch (p.kind) {
    case 'home':
      return HOME_TILES.map((tile) => `home-${tile}`)
    case 'players':
      return [`players-${props.ownSessionId}`, ...players.value.map((pl) => `players-${pl.sessionId}`)]
    case 'player':
      return actions.value.map((a) => `player-${a}`)
    case 'money':
      return MONEY_ROWS.map((r) => `money-${r}`)
    case 'item':
      return items.value.map((i) => `item-${i.code}`)
    case 'places':
      return places.value.map((d) => `places-${d.key}`)
    case 'events':
      return EVENT_ROWS.map((r) => `events-${r}`)
    case 'market':
      return MARKET_ROWS.map((r) => `market-${r}`)
  }
})

const feedback = computed(() => {
  const result = props.admin.result.value
  if (!result) return null
  const itemName = (code: string) => props.admin.items.value?.find((i) => i.code === code)?.name ?? code
  const { key, params } = adminResultMessage(result, itemName, clockTime)
  return { ok: result.ok, text: t(key, params) }
})

function clockTime(at: string | number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function dayTime(at: string): string {
  return new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

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
    case 'unknown':
      return '—'
    case 'none':
      return t('watch.admin.status.hold')
  }
}

const eventRows = computed(() =>
  EVENT_ROWS.map((row) => {
    const status = menu.value ? eventStatus(row, menu.value.events) : ({ key: 'unknown' } as const)
    return { row, status, live: isLive(status) }
  }),
)

function goPage(next: AdminPage): number {
  page.value = next
  if (next.kind === 'player') props.admin.loadPlayer(next.sessionId)
  if (next.kind === 'item') {
    query.value = ''
    quantity.value = 1
    props.admin.loadItems()
  }
  return 0
}

function enter(row: number): number {
  const p = page.value
  switch (p.kind) {
    case 'home': {
      const tile = HOME_TILES[row]
      if (tile === 'console') {
        emit('panel')
        return row
      }
      return tile ? goPage({ kind: tile }) : row
    }
    case 'players': {
      const sessionId = row === 0 ? props.ownSessionId : players.value[row - 1]?.sessionId
      return sessionId ? goPage({ kind: 'player', sessionId }) : row
    }
    case 'player': {
      const action = actions.value[row]
      if (action === 'goto') emit('goTo', p.sessionId)
      else if (action === 'bring') emit('summon', p.sessionId)
      else if (action) return goPage({ kind: action, sessionId: p.sessionId })
      return row
    }
    case 'money': {
      const moneyRow = MONEY_ROWS[row]
      if (moneyRow === 'wallet') wallet.value = wallet.value === 'cash' ? 'bank' : 'cash'
      if (moneyRow === 'give') props.admin.giveMoney(p.sessionId, wallet.value, amount.value)
      return row
    }
    case 'item': {
      const item = items.value[row]
      if (item) props.admin.giveItem(p.sessionId, item.code, quantity.value)
      return row
    }
    case 'places': {
      const place = places.value[row]
      if (place) emit('teleport', place.key)
      return row
    }
    case 'events': {
      const eventRow = EVENT_ROWS[row]
      if (eventRow === 'quiz') props.admin.startQuiz()
      if (eventRow === 'storage') emit('storageSale')
      if (eventRow === 'market') return goPage({ kind: 'market' })
      return row
    }
    case 'market':
      if (MARKET_ROWS[row] === 'open') props.admin.openMarket(marketMinutes.value)
      return row
  }
}

function runHeld(row: number): void {
  if (page.value.kind === 'events' && EVENT_ROWS[row] === 'taxes') props.admin.collectTaxes()
  if (page.value.kind === 'market' && MARKET_ROWS[row] === 'close') props.admin.closeMarket()
}

function startHold(row: number): void {
  if (holdingRow.value !== null) return
  holdingRow.value = row
  holdTimer = window.setTimeout(() => {
    holdingRow.value = null
    runHeld(row)
  }, HOLD_MS)
}

function cancelHold(): void {
  window.clearTimeout(holdTimer)
  holdingRow.value = null
}

function back(): number | null {
  const p = page.value
  const parent = parentPage(p)
  if (!parent) return null
  page.value = parent
  if (p.kind === 'player') return Math.max(players.value.findIndex((pl) => pl.sessionId === p.sessionId) + 1, 0)
  if (p.kind === 'money' || p.kind === 'item') return actions.value.indexOf(p.kind)
  if (p.kind === 'market') return EVENT_ROWS.indexOf('market')
  return Math.max(HOME_TILES.indexOf(p.kind as HomeTile), 0)
}

function side(direction: -1 | 1, row: number): void {
  const p = page.value
  if (p.kind === 'money' && MONEY_ROWS[row] === 'wallet') wallet.value = wallet.value === 'cash' ? 'bank' : 'cash'
  if (p.kind === 'money' && MONEY_ROWS[row] === 'amount') amount.value = stepThrough(MONEY_STEPS, amount.value, direction)
  if (p.kind === 'item') quantity.value = stepQuantity(quantity.value, direction, ADMIN_MAX_QUANTITY)
  if (p.kind === 'market' && MARKET_ROWS[row] === 'minutes') marketMinutes.value = stepThrough(MARKET_MINUTE_STEPS, marketMinutes.value, direction)
}

function key(watchKey: WatchKey, row: number): number | null {
  if (holdingRow.value !== null) return row
  if (watchKey === 'back') return back()
  if (watchKey === 'enter') {
    if (isHoldRow(page.value, row)) {
      startHold(row)
      return row
    }
    return enter(row)
  }
  if (page.value.kind === 'home') return moveOnHome(row, watchKey)
  if (watchKey === 'left' || watchKey === 'right') {
    side(watchKey === 'left' ? -1 : 1, row)
    return row
  }
  return null
}

function text(e: KeyboardEvent): boolean {
  if (page.value.kind !== 'item' || !editsSearch(e.key, query.value)) return false
  query.value = typedQuery(query.value, e.key)
  return true
}

function onKeyUp(e: KeyboardEvent): void {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') cancelHold()
}

onMounted(() => window.addEventListener('keyup', onKeyUp, true))
onUnmounted(() => {
  window.removeEventListener('keyup', onKeyUp, true)
  window.clearTimeout(holdTimer)
})

const TITLE_OF: Record<AdminPage['kind'], string> = {
  home: 'watch.apps.admin',
  players: 'watch.admin.tiles.players',
  player: 'watch.admin.tiles.players',
  money: 'watch.admin.giveMoney',
  item: 'watch.admin.giveItem',
  places: 'watch.admin.tiles.places',
  events: 'watch.admin.tiles.events',
  market: 'watch.admin.market',
}
const title = computed(() => t(TITLE_OF[page.value.kind]))
const keyHint = computed(() => {
  if (page.value.kind === 'item') return t('watch.admin.hints.item')
  if (page.value.kind === 'money' || page.value.kind === 'market') return t('watch.admin.hints.stepper')
  return null
})

defineExpose({ rowKeys, activate: enter, key, text, title, keyHint })
</script>

<template>
  <div>
    <p v-if="!menu" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.admin.loading') }}</p>

    <ul v-else-if="page.kind === 'home'" class="m-0 grid list-none grid-cols-2 gap-1.5 p-1">
      <li
        v-for="(tile, index) in HOME_TILES"
        :key="tile"
        :data-watch-selected="index === selected || undefined"
        :class="['flex flex-col items-center gap-1.5 rounded-[14px] bg-ink-800 pb-2 pt-3 text-xs font-bold', index === selected ? 'bg-ink-700 ring-2 ring-sun' : '']"
      >
        <span :class="['grid size-10 place-items-center rounded-xl text-ink-950', TILE_LOOK[tile].tile]">
          <UiIcon :name="TILE_LOOK[tile].icon" :size="20" />
        </span>
        {{ t(`watch.admin.tiles.${tile}`) }}
      </li>
    </ul>

    <ul v-else-if="page.kind === 'players'" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <WatchRow :selected="selected === 0" dot="sun" :name="t('adminPanel.me')" :meta="t('watch.admin.here')" />
      <WatchRow
        v-for="(player, index) in players"
        :key="player.sessionId"
        :selected="selected === index + 1"
        :dot="player.stars > 0 ? 'coral' : 'mint'"
        :name="player.stars > 0 ? `${player.pseudo} ${'★'.repeat(player.stars)}` : player.pseudo"
        :meta="t('watch.meters', { d: player.distance.toFixed(0) })"
      />
      <li v-if="players.length === 0" class="px-2 py-2 text-center text-xs text-mist">{{ t('watch.admin.nobody') }}</li>
    </ul>

    <template v-else-if="page.kind === 'player'">
      <div class="mx-1 mb-1.5 flex items-center gap-2.5 rounded-xl bg-ink-800 px-2.5 py-2">
        <span class="size-8 shrink-0 rounded-full bg-gradient-to-br from-grape to-pool" aria-hidden="true" />
        <div class="min-w-0">
          <b class="block truncate font-display text-base leading-none">{{ targetName }}</b>
          <small class="text-[11px] text-mist">
            <template v-if="sheet">{{ t('watch.admin.sheet', { cash: sheet.cash, bank: sheet.bank }) }}<template v-if="sheet.stars > 0"> · {{ '★'.repeat(sheet.stars) }}</template></template>
            <template v-else>{{ t('watch.admin.loading') }}</template>
          </small>
        </div>
      </div>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow
          v-for="(action, index) in actions"
          :key="action"
          :selected="selected === index"
          :dot="action === 'goto' || action === 'bring' ? 'pool' : action === 'money' ? 'sun' : 'mint'"
          :name="t(`watch.admin.actions.${action}`)"
          :meta="action === 'money' || action === 'item' ? '›' : ''"
        />
      </ul>
    </template>

    <template v-else-if="page.kind === 'money'">
      <p class="m-0 px-2 pb-1 text-[11px] text-mist">{{ t('watch.admin.to', { name: targetName }) }}</p>
      <div class="mx-1 mb-1 rounded-xl bg-ink-800 px-2 py-1.5 text-center">
        <b class="font-display text-3xl">{{ amount.toLocaleString() }}</b>
        <div class="mt-1 flex justify-center gap-1">
          <span v-for="quick in QUICK_AMOUNTS" :key="quick" :class="['rounded-full px-1.5 text-[10px] font-bold', quick === amount ? 'bg-sun text-ink-950' : 'bg-ink-700 text-mist']">{{ quick.toLocaleString() }}</span>
        </div>
      </div>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow :selected="selected === 0" dot="sun" :name="t('adminPanel.wallet')" :meta="`◀ ${t(`adminPanel.wallets.${wallet}`)} ▶`" />
        <WatchRow :selected="selected === 1" dot="sun" :name="t('watch.admin.amount')" :meta="`◀ ${amount.toLocaleString()} ▶`" />
        <WatchRow :selected="selected === 2" dot="mint" :name="t('watch.admin.give', { amount: amount.toLocaleString(), wallet: t(`adminPanel.wallets.${wallet}`) })" meta="" />
      </ul>
    </template>

    <template v-else-if="page.kind === 'item'">
      <div class="mx-1 mb-1 flex items-center gap-1.5 rounded-lg bg-ink-950 px-2 py-1 text-[13px] font-semibold">
        <UiIcon name="search" :size="12" class="text-mist" />
        <span :class="query ? 'text-sun' : 'text-mist'">{{ query || t('watch.admin.typeToSearch') }}</span>
        <span class="ml-auto text-[11px] text-mist">◀ ×{{ quantity }} ▶</span>
      </div>
      <p v-if="admin.items.value === null" class="m-0 px-2 py-2 text-center text-xs text-mist">{{ t('watch.admin.loading') }}</p>
      <p v-else-if="items.length === 0" class="m-0 px-2 py-2 text-center text-xs text-mist">{{ t('adminPanel.noItem') }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow v-for="(item, index) in items" :key="item.code" :selected="selected === index" dot="mint" :name="item.name" :meta="item.kind" />
      </ul>
    </template>

    <ul v-else-if="page.kind === 'places'" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <WatchRow
        v-for="(place, index) in places"
        :key="place.key"
        :selected="selected === index"
        dot="pool"
        :name="place.name"
        :meta="place.key === admin.recentPlace.value ? t('watch.admin.recent') : ''"
      />
    </ul>

    <ul v-else-if="page.kind === 'events'" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li
        v-for="(event, index) in eventRows"
        :key="event.row"
        :data-watch-selected="selected === index || undefined"
        :class="['relative flex items-center gap-2 overflow-hidden rounded-[10px] px-2 py-1.5 text-[13px]', selected === index ? 'bg-ink-700 shadow-[inset_3px_0_0_rgb(var(--cc-sun))]' : '']"
      >
        <span v-if="holdingRow === index" class="hold-fill absolute inset-y-0 left-0 bg-coral/30" aria-hidden="true" />
        <span class="relative min-w-0 flex-1 truncate font-bold text-fog">{{ t(`watch.admin.event.${event.row}`) }}</span>
        <span :class="['relative shrink-0 rounded-full px-1.5 text-[10px] font-bold', event.live ? 'bg-mint/20 text-mint' : event.status.key === 'scheduled' ? 'bg-sun/20 text-sun' : 'bg-line/10 text-mist']">
          {{ statusText(event.status) }}
        </span>
      </li>
    </ul>

    <template v-else-if="page.kind === 'market'">
      <div class="mx-1 mb-1 rounded-xl bg-ink-800 px-2 py-1.5 text-center">
        <b class="font-display text-3xl">{{ t('watch.admin.minutes', { n: marketMinutes }) }}</b>
        <small class="block text-[11px] text-mist">{{ t('watch.admin.openFor') }}</small>
      </div>
      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <WatchRow :selected="selected === 0" dot="sun" :name="t('watch.admin.duration')" :meta="`◀ ${t('watch.admin.minutes', { n: marketMinutes })} ▶`" />
        <WatchRow :selected="selected === 1" dot="mint" :name="t('adminPanel.openMarket')" meta="" />
        <li
          :data-watch-selected="selected === 2 || undefined"
          :class="['relative flex items-center gap-2 overflow-hidden rounded-[10px] px-2 py-1.5 text-[13px]', selected === 2 ? 'bg-ink-700 shadow-[inset_3px_0_0_rgb(var(--cc-sun))]' : '']"
        >
          <span v-if="holdingRow === 2" class="hold-fill absolute inset-y-0 left-0 bg-coral/30" aria-hidden="true" />
          <span class="relative size-2 shrink-0 rounded-full bg-coral" />
          <span class="relative min-w-0 flex-1 truncate font-bold text-fog">{{ t('adminPanel.closeMarket') }}</span>
          <span class="relative text-[11px] text-mist">{{ t('watch.admin.status.hold') }}</span>
        </li>
      </ul>
    </template>

    <p v-if="feedback && page.kind !== 'home'" :class="['mx-1 mt-1.5 rounded-lg px-2 py-1 text-[11px] font-bold', feedback.ok ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral']" role="status">
      {{ feedback.text }}
    </p>
  </div>
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
