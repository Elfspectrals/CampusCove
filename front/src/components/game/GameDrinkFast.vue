<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { actionKeyLabels, matches, mouseButtonCode } from '../../config/keybindings'
import { DRINK_FAST_BANDS, createDrinkFastSim, type DrinkFastZone } from '../../game/pub/drinkFast'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  seed: number
  players: { sessionId: string; pseudo: string; progress: number; me: boolean }[]
  startsAt: number
  finished: boolean
}>()

const emit = defineEmits<{ progress: [value: number]; close: [] }>()

const PROGRESS_EMIT_MS = 250
const MAX_FRAME_S = 0.05

const BAND_CLASS: Record<Exclude<DrinkFastZone, 'slippery'>, string> = {
  sweet: 'bg-mint',
  fair: 'bg-mint/45',
  poor: 'bg-coral/40',
}

const holding = ref(false)
const y = ref(0.5)
const zone = ref<DrinkFastZone>('sweet')
const progress = ref(0)
const now = ref(Date.now())

let sim = createDrinkFastSim(props.seed)
let frame = 0
let lastFrameAt = 0
let lastEmitAt = 0
let emittedProgress = 0

const countdown = computed(() => Math.max(0, Math.ceil((props.startsAt - now.value) / 1000)))
const pintDown = computed(() => progress.value >= 1)
const racing = computed(() => now.value >= props.startsAt && !props.finished && !pintDown.value)
const liquidTop = computed(() => 14 + progress.value * 134)
const keyLabels = computed(() => ['Space', 'L-Click', ...actionKeyLabels('interact').filter((label) => label !== 'L-Click')])

const standings = computed(() =>
  [...props.players]
    .map((player) => ({ ...player, progress: player.me ? Math.max(player.progress, progress.value) : player.progress }))
    .sort((a, b) => b.progress - a.progress),
)

const status = computed(() => {
  if (props.finished) return 'Race over.'
  if (pintDown.value) return 'Pint down! Waiting for the others…'
  if (countdown.value > 0) return `Pints up in ${countdown.value}…`
  if (zone.value === 'slippery') return 'Whoa, steady! The glass is slipping.'
  return 'Drink!'
})

function reset(): void {
  sim = createDrinkFastSim(props.seed)
  y.value = 0.5
  zone.value = 'sweet'
  progress.value = 0
  emittedProgress = 0
}

watch(() => props.seed, reset)

function tick(timestamp: number): void {
  now.value = Date.now()
  const dt = lastFrameAt ? Math.min(MAX_FRAME_S, (timestamp - lastFrameAt) / 1000) : 0
  lastFrameAt = timestamp
  if (racing.value) {
    const state = sim.step(dt, holding.value)
    y.value = state.y
    zone.value = state.zone
    progress.value = state.progress
  }
  const pintStillCounted = progress.value >= 1 && !props.finished
  if (!props.finished && (progress.value !== emittedProgress || pintStillCounted) && timestamp - lastEmitAt >= PROGRESS_EMIT_MS) {
    lastEmitAt = timestamp
    emittedProgress = progress.value
    emit('progress', progress.value)
  }
  frame = requestAnimationFrame(tick)
}

function isDrinkInput(code: string): boolean {
  return code === 'Space' || matches('interact', code)
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    emit('close')
    e.preventDefault()
    return
  }
  if (!isDrinkInput(e.code)) return
  holding.value = true
  e.preventDefault()
}

function onKeyUp(e: KeyboardEvent): void {
  if (isDrinkInput(e.code)) holding.value = false
}

function isDrinkButton(e: MouseEvent): boolean {
  return e.button === 0 || matches('interact', mouseButtonCode(e.button))
}

function onMouseDown(e: MouseEvent): void {
  if (isDrinkButton(e)) holding.value = true
}

function onMouseUp(e: MouseEvent): void {
  if (isDrinkButton(e)) holding.value = false
}

function release(): void {
  holding.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('keyup', onKeyUp, true)
  window.addEventListener('mousedown', onMouseDown, true)
  window.addEventListener('mouseup', onMouseUp, true)
  window.addEventListener('blur', release)
  frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
  window.removeEventListener('keyup', onKeyUp, true)
  window.removeEventListener('mousedown', onMouseDown, true)
  window.removeEventListener('mouseup', onMouseUp, true)
  window.removeEventListener('blur', release)
  cancelAnimationFrame(frame)
})
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @contextmenu.prevent>
    <section class="cc-hud w-[min(600px,94vw)] animate-cc-pop overflow-hidden p-0" aria-label="Drink Fast">
      <header class="flex items-center justify-between bg-mint px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Drink Fast</span>
        <button type="button" class="inline-flex items-center" aria-label="Leave the race" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-wrap items-stretch gap-5 px-5 py-4">
        <div
          class="relative h-64 w-9 shrink-0 overflow-hidden rounded-lg border-2 border-white/15 bg-ink-950/80"
          role="img"
          :aria-label="`Balance ${Math.round(y * 100)}%, ${zone}`"
        >
          <div
            v-for="band in [...DRINK_FAST_BANDS].reverse()"
            :key="band.zone"
            class="absolute inset-x-0"
            :class="BAND_CLASS[band.zone]"
            :style="{ bottom: `${band.from * 100}%`, height: `${(band.to - band.from) * 100}%` }"
          />
          <div
            class="absolute inset-x-0 h-1.5 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_0_8px_rgb(255_255_255/0.6)] transition-colors"
            :class="zone === 'slippery' ? 'animate-pulse bg-coral' : 'bg-white'"
            :style="{ bottom: `calc(${y * 100}% - 3px)` }"
          />
        </div>

        <div class="flex shrink-0 flex-col items-center gap-2">
          <svg viewBox="0 0 80 160" class="h-64 w-32" role="img" :aria-label="`Pint ${Math.round((1 - progress) * 100)}% full`">
            <defs>
              <clipPath id="cc-pint-glass">
                <polygon points="14,8 66,8 62,152 18,152" />
              </clipPath>
            </defs>
            <polygon points="14,8 66,8 62,152 18,152" fill="rgb(255 255 255 / 0.08)" />
            <g clip-path="url(#cc-pint-glass)">
              <rect x="0" :y="liquidTop" width="80" :height="160 - liquidTop" fill="#1a0f0a" />
              <rect v-if="progress < 1" x="0" :y="liquidTop" width="80" height="7" fill="#f3e9d2" />
            </g>
            <polygon points="14,8 66,8 62,152 18,152" fill="none" stroke="rgb(255 255 255 / 0.55)" stroke-width="2.5" stroke-linejoin="round" />
            <line x1="20" y1="20" x2="24" y2="140" stroke="rgb(255 255 255 / 0.25)" stroke-width="2" stroke-linecap="round" />
          </svg>
          <p class="m-0 flex flex-wrap items-center justify-center gap-1 text-center text-[11px] text-mist">
            Hold
            <kbd v-for="label in keyLabels" :key="label" class="cc-keycap">{{ label }}</kbd>
            to lift the glass
          </p>
          <p class="m-0 text-center text-[11px] text-mist">Keep the cursor in the bright green to drink fastest.</p>
        </div>

        <div class="flex min-w-[180px] flex-1 flex-col gap-3">
          <p class="m-0 font-display text-lg text-fog" aria-live="polite">{{ status }}</p>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="player in standings" :key="player.sessionId" class="flex flex-col gap-1">
              <span class="flex items-center justify-between text-xs font-bold" :class="player.me ? 'text-sun' : 'text-fog'">
                <span class="truncate">{{ player.pseudo }}<span v-if="player.me" class="text-mist"> (you)</span></span>
                <span>{{ Math.round(player.progress * 100) }}%</span>
              </span>
              <span class="block h-2 overflow-hidden rounded-full bg-ink-950/70">
                <span
                  class="block h-full rounded-full transition-[width] duration-200"
                  :class="player.progress >= 1 ? 'bg-mint' : player.me ? 'bg-sun' : 'bg-pool'"
                  :style="{ width: `${Math.min(100, player.progress * 100)}%` }"
                />
              </span>
            </li>
          </ul>
        </div>
      </div>

      <footer v-if="finished" class="flex items-center justify-end border-t border-white/10 px-4 py-3">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-mint" @click="emit('close')">Back to the bar</button>
      </footer>
    </section>
  </div>
</template>
