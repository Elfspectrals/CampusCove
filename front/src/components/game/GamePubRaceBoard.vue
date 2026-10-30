<script setup lang="ts">
import { spillPenaltyLabel } from '../../game/pub/raceBoard'
import type { RaceBoard } from '../../composables/game/usePubGames'

defineProps<{ board: RaceBoard }>()
</script>

<template>
  <!-- the spectators' scoreboard, projected over the bar's taps -->
  <section
    class="cc-hud pointer-events-none absolute z-10 w-48 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs"
    :style="{ left: `${board.x}px`, top: `${board.y}px` }"
    aria-label="Drink Fast scoreboard"
  >
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      Drink Fast<span v-if="board.countdown > 0" class="text-mist"> · in {{ board.countdown }}</span>
    </p>
    <ol v-if="board.results" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li v-for="row in board.results" :key="row.sessionId" class="flex items-center gap-1.5 font-bold text-fog">
        <span class="w-4 text-sun">{{ row.place }}</span>
        <span class="min-w-0 flex-1 truncate">{{ row.pseudo }}</span>
        <span>{{ row.time }}</span>
        <span v-if="row.penalty" class="text-coral">{{ row.penalty }}</span>
      </li>
      <li v-if="board.results.length === 0" class="text-mist">Nobody finished.</li>
    </ol>
    <ul v-else class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="racer in board.racers" :key="racer.sessionId" class="flex flex-col gap-0.5">
        <span class="flex items-center gap-1.5 font-bold text-fog">
          <span class="min-w-0 flex-1 truncate">{{ racer.pseudo }}</span>
          <span v-if="racer.spills > 0" class="text-coral">{{ spillPenaltyLabel(racer.spills) }}</span>
          <span>{{ racer.percent }}%</span>
        </span>
        <span class="block h-1 overflow-hidden rounded-full bg-ink-950/70">
          <span class="block h-full rounded-full bg-sun transition-[width] duration-200" :style="{ width: `${racer.percent}%` }" />
        </span>
      </li>
    </ul>
  </section>
</template>
