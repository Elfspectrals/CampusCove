<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { QuizBoard } from '../../composables/game/usePubQuiz'

defineProps<{ board: QuizBoard }>()

const { t } = useI18n()
</script>

<template>
  <section
    class="cc-hud pointer-events-none absolute z-10 w-48 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs"
    :style="{ left: `${board.x}px`, top: `${board.y}px` }"
    :aria-label="t('pubQuiz.title')"
  >
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-pool">
      {{ t('pubQuiz.title') }}<span class="text-mist"> · {{ board.progress }}</span>
    </p>
    <ol class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li v-for="(row, i) in board.ranking.slice(0, 5)" :key="row.sessionId" class="flex items-center gap-1.5 font-bold text-fog">
        <span class="w-4 text-sun">{{ i + 1 }}</span>
        <span class="min-w-0 flex-1 truncate">{{ row.pseudo }}</span>
        <span class="tabular-nums">{{ row.points }}</span>
      </li>
    </ol>
  </section>
</template>
