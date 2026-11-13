<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels } from '../../config/keybindings'
import { cursorAt } from '../../game/police/pickpocket'
import type { PickpocketGameView, PickpocketLootView } from '../../composables/game/usePickpocket'

const props = defineProps<{
  game: PickpocketGameView | null
  loot: PickpocketLootView | null
}>()

const emit = defineEmits<{ take: [code: string] }>()

const { t } = useI18n()
const now = ref(performance.now())
let frame = 0

function tick(timestamp: number): void {
  now.value = timestamp
  frame = requestAnimationFrame(tick)
}

onMounted(() => {
  frame = requestAnimationFrame(tick)
})
onUnmounted(() => cancelAnimationFrame(frame))

const elapsed = computed(() => (props.game ? now.value - props.game.startedAt : 0))
const cursor = computed(() => (props.game ? cursorAt(elapsed.value, props.game.halfSweepMs) : 0))
const timeLeft = computed(() => (props.game ? Math.max(0, 1 - elapsed.value / props.game.durationMs) : 0))
const lootSeconds = computed(() => (props.loot ? Math.max(0, Math.ceil((props.loot.endsAt - now.value) / 1000)) : 0))
const stopKey = computed(() => actionKeyLabels('pickpocket')[0] ?? '')

function windowTone(index: number): string {
  if (!props.game) return ''
  if (index < props.game.stops) return 'bg-mint/40'
  if (index === props.game.stops) return 'bg-sun/60 shadow-[0_0_10px_rgb(var(--cc-sun)/0.6)]'
  return 'bg-line/10'
}
</script>

<template>
  <section
    v-if="game || loot"
    class="cc-hud absolute left-1/2 top-16 z-30 w-[min(420px,92vw)] -translate-x-1/2 animate-cc-pop overflow-hidden p-0"
    role="status"
    aria-labelledby="cc-pickpocket-title"
  >
    <header class="flex items-center justify-between bg-coral px-4 py-2 text-ink-950">
      <span id="cc-pickpocket-title" class="font-display text-sm uppercase tracking-[0.18em]">{{ game ? t('pickpocket.title') : t('pickpocket.lootTitle') }}</span>
      <span v-if="game" class="font-display text-sm tabular-nums">{{ t('pickpocket.stops', { n: game.stops }) }}</span>
      <span v-else-if="loot" class="font-display text-sm tabular-nums">{{ lootSeconds }}s</span>
    </header>

    <div v-if="game" class="flex flex-col gap-2 px-4 py-3" aria-hidden="true">
      <p class="m-0 text-sm font-bold text-fog">{{ game.victimPseudo }}</p>
      <div class="relative h-4 overflow-hidden rounded-full bg-ink-950/60">
        <div
          v-for="(target, index) in game.windows"
          :key="index"
          class="absolute inset-y-0"
          :class="windowTone(index)"
          :style="{ left: `${(target.center - target.width / 2) * 100}%`, width: `${target.width * 100}%` }"
        />
        <div class="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-fog" :style="{ left: `${cursor * 100}%` }" />
      </div>
      <div class="relative h-1.5 overflow-hidden rounded-full bg-ink-950/60">
        <div class="absolute inset-y-0 left-0 rounded-full" :class="timeLeft < 0.3 ? 'bg-coral' : 'bg-mist/60'" :style="{ width: `${timeLeft * 100}%` }" />
      </div>
      <p class="m-0 text-[11px] text-mist">{{ t('pickpocket.hint', { key: stopKey }) }}</p>
    </div>

    <div v-else-if="loot" class="flex flex-col gap-2 px-4 py-3">
      <p v-if="loot.items.length === 0" class="m-0 text-sm text-mist">{{ t('pickpocket.lootEmpty') }}</p>
      <ul v-else class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li v-for="(item, index) in loot.items.slice(0, 9)" :key="item.code">
          <button
            type="button"
            class="pointer-events-auto flex min-h-11 w-full items-center gap-3 rounded-xl bg-ink-950/40 px-3 py-1.5 text-left hover:bg-ink-950/60"
            @click="emit('take', item.code)"
          >
            <span class="w-5 text-center font-display text-sm text-sun">{{ index + 1 }}</span>
            <img v-if="item.previewImage" :src="item.previewImage" alt="" class="h-8 w-8 shrink-0 object-contain" />
            <span class="min-w-0 flex-1 truncate text-sm font-bold text-fog">{{ item.name }}</span>
            <span class="font-display text-sm tabular-nums text-mist">× {{ item.quantity }}</span>
          </button>
        </li>
      </ul>
      <p v-if="loot.items.length > 0" class="m-0 text-[11px] text-mist">{{ t('pickpocket.lootHint') }}</p>
    </div>
  </section>
</template>
