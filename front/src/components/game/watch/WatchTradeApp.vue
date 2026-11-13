<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TradeNearbyPlayer, TradePendingPayload, TradeRequestedPayload } from '../../../types/gameRealtime'
import WatchRow from './WatchRow.vue'

const props = defineProps<{
  nearby: TradeNearbyPlayer[]
  incoming: TradeRequestedPayload | null
  outgoing: TradePendingPayload | null
  selected: number
  acceptKey: string
  declineKey: string
}>()

const emit = defineEmits<{ request: [player: TradeNearbyPlayer]; cancel: [] }>()

const { t } = useI18n()

type Row = { kind: 'cancel' } | { kind: 'player'; player: TradeNearbyPlayer }

const rows = computed<Row[]>(() => [
  ...(props.outgoing ? [{ kind: 'cancel' } as const] : []),
  ...props.nearby.map((player) => ({ kind: 'player', player }) as const),
])

function canAsk(player: TradeNearbyPlayer): boolean {
  return player.inReach && !player.busy && !props.outgoing && !props.incoming
}

function playerMeta(player: TradeNearbyPlayer): string {
  const distance = t('watch.meters', { d: player.distance.toFixed(1) })
  if (props.outgoing?.toSessionId === player.sessionId) return `${distance} · ${t('watch.trade.asked')}`
  if (player.busy) return `${distance} · ${t('watch.trade.busy')}`
  if (!player.inReach) return `${distance} · ${t('watch.trade.closer')}`
  return distance
}

function activate(index: number): void {
  const row = rows.value[index]
  if (!row) throw new Error(`[WatchTradeApp] no row ${index}`)
  if (row.kind === 'cancel') emit('cancel')
  else if (canAsk(row.player)) emit('request', row.player)
}

defineExpose({ rowCount: computed(() => rows.value.length), activate })
</script>

<template>
  <div>
    <p v-if="incoming" class="mx-1 mb-1.5 rounded-xl bg-sun/20 px-2.5 py-2 text-xs font-bold text-fog">
      {{ t('watch.trade.wants', { name: incoming.fromPseudo }) }}
      <span class="block pt-0.5 text-mist">{{ t('watch.trade.answer', { yes: acceptKey, no: declineKey }) }}</span>
    </p>
    <p class="m-0 px-2 pb-1 pt-1 text-[11px] font-bold text-mist">{{ t('watch.trade.nearby') }}</p>
    <p v-if="rows.length === 0" class="m-0 px-2 py-3 text-center text-xs text-mist">{{ t('watch.trade.empty') }}</p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <template v-for="(row, index) in rows" :key="row.kind === 'cancel' ? 'cancel' : row.player.sessionId">
        <WatchRow
          v-if="row.kind === 'cancel'"
          :selected="index === selected"
          dot="coral"
          :name="t('watch.trade.cancel')"
          :meta="t('watch.trade.waiting', { name: outgoing?.toPseudo ?? '' })"
        />
        <WatchRow
          v-else
          :selected="index === selected"
          :dot="canAsk(row.player) ? 'mint' : 'mist'"
          :name="row.player.pseudo"
          :meta="playerMeta(row.player)"
        />
      </template>
    </ul>
  </div>
</template>
