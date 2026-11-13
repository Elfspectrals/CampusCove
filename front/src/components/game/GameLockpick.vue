<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels, matches, mouseButtonCode } from '../../config/keybindings'
import { dialPosition, secondsUntilReady } from '../../game/town/lockpickDial'
import type { LockpickBoard } from '../../composables/game/useLockpick'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{ board: LockpickBoard }>()
const emit = defineEmits<{ press: []; close: [] }>()

const { t } = useI18n()
const DIAL_RADIUS = 80
const now = ref(performance.now())
let frame = 0

const needleTurn = computed(() => (props.board.pin ? dialPosition(props.board.pin, now.value) : 0))
const settling = computed(() => secondsUntilReady(props.board.readyAt, now.value))
const ready = computed(() => props.board.pin !== null && settling.value === 0)
const pressKey = computed(() => actionKeyLabels('interact')[0] ?? '')

const windowArc = computed(() => {
  const half = (props.board.window / 2) * Math.PI * 2
  const point = (angle: number) => `${Math.sin(angle) * DIAL_RADIUS} ${-Math.cos(angle) * DIAL_RADIUS}`
  return `M ${point(-half)} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 0 1 ${point(half)}`
})

const status = computed(() => {
  const { outcome, error, pin } = props.board
  if (error) return error
  if (outcome === 'open') return t('lockpick.open')
  if (outcome === 'broke') return t('lockpick.broke')
  if (outcome === 'abandoned') return t('lockpick.abandoned')
  if (!pin) return t('lockpick.starting')
  if (!ready.value) return t('lockpick.settling', { seconds: settling.value })
  return t('lockpick.ready', { key: pressKey.value })
})

const finished = computed(() => props.board.outcome === 'open' || props.board.outcome === 'broke' || props.board.outcome === 'abandoned')

function tick(timestamp: number): void {
  now.value = timestamp
  frame = requestAnimationFrame(tick)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
    e.preventDefault()
    return
  }
  if (!matches('interact', e.code) || e.repeat) return
  emit('press')
  e.preventDefault()
}

function onMouse(e: MouseEvent): void {
  if (!matches('interact', mouseButtonCode(e.button))) return
  emit('press')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @mousedown="onMouse" @contextmenu.prevent>
    <section class="cc-hud w-[min(420px,94vw)] animate-cc-pop overflow-hidden p-0" :aria-label="t('lockpick.title')">
      <header class="flex items-center justify-between bg-grape px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('lockpick.title') }}</span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('lockpick.leave')" @mousedown.stop @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-col items-center gap-4 px-5 py-4">
        <div class="flex gap-2" aria-hidden="true">
          <span
            v-for="index in board.pins"
            :key="index"
            class="h-3 w-8 rounded-full transition-colors"
            :class="index <= board.pinsSet ? 'bg-mint' : 'bg-line/25'"
          />
        </div>

        <svg viewBox="-100 -100 200 200" class="h-48 w-48" :class="ready ? '' : 'opacity-50'" aria-hidden="true">
          <circle r="80" fill="none" stroke="rgb(var(--cc-line) / 0.25)" stroke-width="10" />
          <path :d="windowArc" fill="none" stroke="rgb(var(--cc-sun))" stroke-width="12" stroke-linecap="round" />
          <line
            x1="0" y1="0" x2="0" y2="-74"
            stroke="rgb(var(--cc-fog))" stroke-width="4" stroke-linecap="round"
            :transform="`rotate(${needleTurn * 360})`"
          />
          <circle r="7" fill="rgb(var(--cc-fog))" />
        </svg>

        <p class="m-0 min-h-5 text-center text-sm font-bold text-fog" aria-live="polite">{{ status }}</p>
        <p v-if="!finished" class="m-0 text-center text-[11px] text-mist">{{ t('lockpick.hint') }}</p>
      </div>

      <footer v-if="finished" class="flex items-center justify-end border-t border-line/10 px-4 py-3">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-grape" @mousedown.stop @click="emit('close')">{{ t('lockpick.done') }}</button>
      </footer>
    </section>
  </div>
</template>
