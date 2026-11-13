<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { useStorageAuction } from '../../composables/game/useStorageAuction'

type Board = NonNullable<ReturnType<typeof useStorageAuction>['board']['value']>

defineProps<{ board: Board }>()
const { t } = useI18n()
</script>

<template>
  <section class="cc-hud pointer-events-none absolute left-1/2 top-16 z-10 w-64 -translate-x-1/2 px-3 py-2 text-xs" :aria-label="t('storage.box', { index: board.index, count: board.count })">
    <p class="m-0 mb-1 flex items-center gap-2 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      <span>{{ t('storage.box', { index: board.index, count: board.count }) }}</span>
      <span class="min-w-0 flex-1 truncate text-mist">{{ board.formerOwnerName ? t('storage.seized', { owner: board.formerOwnerName }) : t('storage.generated') }}</span>
    </p>
    <template v-if="board.phase === 'result' && board.result">
      <p v-if="board.result.status === 'sold' && board.leader" class="m-0 font-bold text-sun">{{ t('storage.sold', { pseudo: board.leader.pseudo, price: board.result.price }) }}</p>
      <p v-else class="m-0 font-bold text-coral">{{ t(board.result.status === 'destroyed' ? 'storage.destroyed' : 'storage.listed') }}</p>
    </template>
    <template v-else>
      <p class="m-0 flex items-center gap-1.5 font-bold text-fog">
        <span class="min-w-0 flex-1 truncate">{{ t(`storage.${board.phase}`) }}</span>
        <span v-if="board.phase !== 'walking' && board.phase !== 'hammering'" class="tabular-nums text-sun">{{ board.seconds }} s</span>
      </p>
      <p class="m-0 mt-0.5 truncate text-fog">
        {{ board.leader ? t('storage.best', { amount: board.leader.amount, pseudo: board.leader.pseudo }) : t('storage.opening', { amount: board.nextBid }) }}
      </p>
      <p v-if="board.phase === 'bidding'" class="m-0 mt-0.5 flex items-center gap-1.5 text-mist">
        <span class="min-w-0 flex-1">{{ t('storage.next', { amount: board.nextBid }) }}</span>
        <span v-if="board.call" class="font-display uppercase tracking-wider text-coral">{{ t(`storage.${board.call}`) }}</span>
      </p>
    </template>
  </section>
</template>
