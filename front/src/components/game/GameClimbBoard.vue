<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoardRow } from '../../game/sports/climbing'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{ week: string | null; rows: BoardRow[]; loading: boolean; error: string | null }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @contextmenu.prevent>
    <section class="cc-hud flex max-h-[86vh] w-[min(680px,94vw)] animate-cc-pop flex-col overflow-hidden p-0" :aria-label="t('climbing.board.title')">
      <header class="flex items-center justify-between bg-mint px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('climbing.board.title') }}<template v-if="week"> · {{ week }}</template></span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('sports.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <p v-if="loading" class="m-0 px-5 py-4 text-sm text-mist">{{ t('climbing.board.loading') }}</p>
      <p v-else-if="error" class="m-0 px-5 py-4 text-sm text-coral">{{ error }}</p>
      <ul v-else class="m-0 grid list-none grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
        <li v-for="row in rows" :key="row.id" class="rounded-lg bg-ink-950/50 p-2">
          <p class="m-0 mb-1 flex items-center gap-2 text-xs font-bold text-fog">
            <span class="inline-block h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: row.hex }" />
            <span class="min-w-0 flex-1 truncate">{{ row.name ?? t('climbing.board.duel') }}</span>
          </p>
          <ol class="m-0 flex list-none flex-col gap-0.5 p-0">
            <li v-for="(entry, i) in row.entries" :key="entry.name" class="flex items-center gap-1.5 text-xs font-bold" :class="i === 0 ? 'text-sun' : 'text-fog'">
              <span class="w-4">{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
              <span>{{ seconds(entry.timeMs) }}</span>
            </li>
            <li v-if="row.entries.length === 0" class="text-xs text-mist">{{ t('climbing.board.empty') }}</li>
          </ol>
          <p v-if="row.champion" class="m-0 mt-1 flex items-center gap-1 text-[11px] text-mist">
            <UiIcon name="crown" :size="12" />
            {{ t('climbing.board.champion', { name: row.champion.name, time: seconds(row.champion.timeMs) }) }}
          </p>
        </li>
      </ul>
      <p class="m-0 border-t border-line/10 px-4 py-2 text-[11px] text-mist">{{ t('climbing.board.rules') }}</p>
    </section>
  </div>
</template>
