<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { actionKeyLabels, matches, mouseButtonCode } from '../../config/keybindings'
import { RACE_SPILL_PENALTY_MS } from '../../game/gameRoomConstants'
import { DRINK_FAST_BANDS, SPILL_ABOVE, createDrinkFastSim, type DrinkFastZone } from '../../game/pub/drinkFast'
import { formatSeconds, ordinal, readBestTime, recordBestTime, spillPenaltyLabel, type RaceResultRow } from '../../game/pub/raceBoard'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  seed: number
  players: { sessionId: string; pseudo: string; progress: number; spills: number; me: boolean }[]
  startsAt: number
  finished: boolean
  /** The server's final order (ms include the spill penalty), once the race is over. */
  results: RaceResultRow[] | null
  reducedEffects: boolean
}>()

const emit = defineEmits<{ progress: [value: number, spills: number]; close: [] }>()

const PROGRESS_EMIT_MS = 250
const MAX_FRAME_S = 0.05
/** Pint outline in its 80×160 viewBox, and the liquid's top at full / empty. */
const GLASS_POINTS = '14,8 66,8 62,152 18,152'
const LIQUID_FULL_Y = 14
const LIQUID_RANGE = 134

const BAND_CLASS: Record<Exclude<DrinkFastZone, 'slippery'>, string> = {
  sweet: 'bg-mint',
  fair: 'bg-mint/45',
  poor: 'bg-coral/40',
}

const holding = ref(false)
const y = ref(0.5)
const zone = ref<DrinkFastZone>('sweet')
const progress = ref(0)
const spills = ref(0)
const SPILL_PENALTY_S = RACE_SPILL_PENALTY_MS / 1000
const now = ref(Date.now())
/** Spill splashes played per glass: bumping it re-mounts the glass, which replays the splash animation. */
const splashes = reactive<Record<string, number>>({})
const best = ref<number | null>(readBestTime())
const newBest = ref(false)

let sim = createDrinkFastSim(props.seed)
let frame = 0
let lastFrameAt = 0
let lastEmitAt = 0
let emittedProgress = 0
let emittedSpills = 0

const countdown = computed(() => Math.max(0, Math.ceil((props.startsAt - now.value) / 1000)))
const pintDown = computed(() => progress.value >= 1)
const racing = computed(() => now.value >= props.startsAt && !props.finished && !pintDown.value)
const keyLabels = computed(() => ['Space', 'L-Click', ...actionKeyLabels('interact').filter((label) => label !== 'L-Click')])
const solo = computed(() => props.players.length <= 1)

/** One glass per racer: mine first (big, with the local simulation's level), then the others. */
const glasses = computed(() => {
  const mine = props.players.find((player) => player.me)
  const others = props.players.filter((player) => !player.me)
  const me = mine ? [{ ...mine, progress: Math.max(mine.progress, progress.value), spills: Math.max(mine.spills, spills.value) }] : []
  return [...me, ...others].map((player) => ({ ...player, penalty: spillPenaltyLabel(player.spills) }))
})

const resultRows = computed(() =>
  (props.results ?? []).map((row) => ({ ...row, pseudo: props.players.find((p) => p.sessionId === row.sessionId)?.pseudo ?? '…' })),
)
const myResult = computed(() => props.results?.find((row) => row.me) ?? null)

const status = computed(() => {
  if (props.finished) {
    const mine = myResult.value
    if (!mine) return 'Race over.'
    return solo.value ? `Pint down in ${mine.time}!` : `You finished ${ordinal(mine.place)}!`
  }
  if (pintDown.value) return solo.value ? 'Pint down!' : 'Pint down! Waiting for the others…'
  if (countdown.value > 0) return `Pints up in ${countdown.value}…`
  if (y.value > SPILL_ABOVE) return `Spilled! +${SPILL_PENALTY_S} s`
  if (zone.value === 'slippery') return 'Whoa, steady! The glass is slipping.'
  return 'Drink!'
})

function liquidTop(level: number): number {
  return LIQUID_FULL_Y + Math.min(1, Math.max(0, level)) * LIQUID_RANGE
}

function splash(sessionId: string): void {
  splashes[sessionId] = (splashes[sessionId] ?? 0) + 1
}

function reset(): void {
  sim = createDrinkFastSim(props.seed)
  y.value = 0.5
  zone.value = 'sweet'
  progress.value = 0
  spills.value = 0
  emittedProgress = 0
  emittedSpills = 0
  newBest.value = false
  for (const key of Object.keys(splashes)) delete splashes[key]
}

watch(() => props.seed, reset)

// my own spills come from the local simulation; the others' from `pub_race_state` (sent right away on a spill)
watch(spills, (next, previous) => {
  const mine = props.players.find((player) => player.me)
  if (mine && next > previous) splash(mine.sessionId)
})
watch(
  () => props.players.filter((player) => !player.me).map((player) => [player.sessionId, player.spills] as const),
  (next, previous) => {
    const before = new Map(previous)
    for (const [sessionId, count] of next) if (count > (before.get(sessionId) ?? 0)) splash(sessionId)
  },
)

// a solo pint (no one to beat): keep the personal best in this browser
watch(
  () => props.results,
  (results) => {
    const mine = results?.find((row) => row.me)
    if (!mine || !solo.value) return
    const record = recordBestTime(mine.ms)
    best.value = record.best
    newBest.value = record.isNew
  },
)

function tick(timestamp: number): void {
  now.value = Date.now()
  const dt = lastFrameAt ? Math.min(MAX_FRAME_S, (timestamp - lastFrameAt) / 1000) : 0
  lastFrameAt = timestamp
  if (racing.value) {
    const state = sim.step(dt, holding.value)
    y.value = state.y
    zone.value = state.zone
    progress.value = state.progress
    spills.value = state.spills
  }
  const pintStillCounted = progress.value >= 1 && !props.finished
  const changed = progress.value !== emittedProgress || spills.value !== emittedSpills
  if (!props.finished && (changed || pintStillCounted) && timestamp - lastEmitAt >= PROGRESS_EMIT_MS) {
    lastEmitAt = timestamp
    emittedProgress = progress.value
    emittedSpills = spills.value
    emit('progress', progress.value, spills.value)
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
    <section class="cc-hud w-[min(680px,94vw)] animate-cc-pop overflow-hidden p-0" aria-label="Drink Fast">
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

        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <p class="m-0 font-display text-lg text-fog" aria-live="polite">{{ status }}</p>

          <!-- the pints side by side: mine big, the others smaller with their name -->
          <ul class="m-0 flex list-none flex-wrap items-end gap-3 p-0" aria-label="Pints">
            <li
              v-for="glass in glasses"
              :key="`${glass.sessionId}-${splashes[glass.sessionId] ?? 0}`"
              class="relative flex flex-col items-center gap-1"
              :class="[(splashes[glass.sessionId] ?? 0) > 0 && (reducedEffects ? 'cc-spill-soft' : 'cc-spill'), glass.me ? 'w-28' : 'w-16']"
            >
              <svg
                viewBox="0 0 80 160"
                class="overflow-visible"
                :class="glass.me ? 'h-52 w-24' : 'h-28 w-14'"
                role="img"
                :aria-label="`${glass.pseudo}: pint ${Math.round((1 - glass.progress) * 100)}% full`"
              >
                <defs>
                  <clipPath :id="`cc-pint-${glass.sessionId}`">
                    <polygon :points="GLASS_POINTS" />
                  </clipPath>
                </defs>
                <polygon :points="GLASS_POINTS" fill="rgb(255 255 255 / 0.08)" />
                <g :clip-path="`url(#cc-pint-${glass.sessionId})`">
                  <rect x="0" :y="liquidTop(glass.progress)" width="80" :height="160 - liquidTop(glass.progress)" fill="#1a0f0a" />
                  <rect v-if="glass.progress < 1" x="0" :y="liquidTop(glass.progress)" width="80" height="7" fill="#f3e9d2" />
                </g>
                <polygon
                  :points="GLASS_POINTS"
                  fill="none"
                  :stroke="glass.me ? 'rgb(var(--cc-sun))' : 'rgb(255 255 255 / 0.55)'"
                  stroke-width="2.5"
                  stroke-linejoin="round"
                />
                <line x1="20" y1="20" x2="24" y2="140" stroke="rgb(255 255 255 / 0.25)" stroke-width="2" stroke-linecap="round" />
                <g v-if="(splashes[glass.sessionId] ?? 0) > 0" class="cc-splash" fill="#f3e9d2">
                  <circle cx="22" cy="6" r="4" style="--dx: -14px; --dy: -16px" />
                  <circle cx="40" cy="2" r="3.5" style="--dx: 0px; --dy: -22px" />
                  <circle cx="58" cy="6" r="4" style="--dx: 14px; --dy: -16px" />
                  <circle cx="68" cy="12" r="3" style="--dx: 18px; --dy: -6px" />
                </g>
              </svg>
              <span class="w-full truncate text-center text-[11px] font-bold" :class="glass.me ? 'text-sun' : 'text-fog'">
                {{ glass.pseudo }}<span v-if="glass.me" class="text-mist"> (you)</span>
              </span>
              <span class="text-[10px] font-bold" :class="glass.spills > 0 ? 'text-coral' : 'text-mist'">
                {{ glass.progress >= 1 ? 'Done' : `${Math.round(glass.progress * 100)}%` }} · {{ glass.spills }} spill{{ glass.spills === 1 ? '' : 's' }}
                <template v-if="glass.penalty"> {{ glass.penalty }}</template>
              </span>
            </li>
          </ul>

          <ol v-if="finished && results" class="m-0 flex list-none flex-col gap-1 rounded-lg bg-ink-950/50 p-2">
            <li v-for="row in resultRows" :key="row.sessionId" class="flex items-center gap-2 text-xs font-bold" :class="row.me ? 'text-sun' : 'text-fog'">
              <span class="w-8">{{ ordinal(row.place) }}</span>
              <span class="min-w-0 flex-1 truncate">{{ row.pseudo }}<span v-if="row.me" class="text-mist"> (you)</span></span>
              <span>{{ row.time }}</span>
              <span v-if="row.penalty" class="text-coral">({{ row.penalty }})</span>
            </li>
            <li v-if="resultRows.length === 0" class="text-xs text-mist">Nobody finished their pint.</li>
          </ol>

          <p v-if="solo && (best !== null || newBest)" class="m-0 text-sm font-bold" :class="newBest ? 'text-mint' : 'text-mist'">
            <template v-if="newBest">New best! </template>Best: {{ best !== null ? formatSeconds(best) : '—' }}
          </p>

          <p class="m-0 flex flex-wrap items-center gap-1 text-[11px] text-mist">
            Hold
            <kbd v-for="label in keyLabels" :key="label" class="cc-keycap">{{ label }}</kbd>
            to lift the glass
          </p>
          <p class="m-0 text-[11px] text-mist">
            Keep the cursor in the bright green to drink fastest. Too high and you spill: +{{ SPILL_PENALTY_S }} s each.
          </p>
        </div>
      </div>

      <footer v-if="finished" class="flex items-center justify-end border-t border-white/10 px-4 py-3">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-mint" @click="emit('close')">Back to the bar</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* a spill: the glass jolts and froth flies off the rim, then everything is back at rest */
.cc-spill svg {
  animation: cc-spill-shake 0.42s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
.cc-spill-soft svg {
  animation: cc-spill-tint 0.5s ease-out both;
}
.cc-splash circle {
  transform-box: fill-box;
  transform-origin: center;
  animation: cc-splash-fly 0.55s ease-out both;
}
.cc-spill-soft .cc-splash circle {
  animation: cc-splash-fade 0.5s ease-out both;
}
@keyframes cc-spill-shake {
  0%,
  100% {
    transform: translateX(0) rotate(0);
  }
  20% {
    transform: translateX(-3px) rotate(-6deg);
  }
  40% {
    transform: translateX(3px) rotate(5deg);
  }
  60% {
    transform: translateX(-2px) rotate(-3deg);
  }
  80% {
    transform: translateX(1px) rotate(1deg);
  }
}
@keyframes cc-spill-tint {
  0% {
    filter: drop-shadow(0 0 6px rgb(var(--cc-coral)));
  }
  100% {
    filter: none;
  }
}
@keyframes cc-splash-fly {
  0% {
    transform: translate(0, 0) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(var(--dx), var(--dy)) scale(0.4);
    opacity: 0;
  }
}
@keyframes cc-splash-fade {
  0% {
    opacity: 0.8;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cc-spill svg {
    animation: cc-spill-tint 0.5s ease-out both;
  }
  .cc-splash circle {
    animation: cc-splash-fade 0.5s ease-out both;
  }
}
</style>
