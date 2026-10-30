<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { DARTS_POWER_DEAD_ZONE, DARTS_POWER_IDEAL } from '../../game/gameRoomConstants'
import {
  DARTBOARD_CM,
  DARTBOARD_SECTORS,
  FULL_BREATH,
  SECTOR_DEG,
  aimDrift,
  breathStep,
  dartLabel,
  meterPeriodS,
  meterPower,
  type BreathState,
  type DartPoint,
} from '../../game/pub/darts'
import UiIcon from '../ui/UiIcon.vue'

type DartsPlayer = { sessionId: string; pseudo: string; darts: { x: number; y: number; score: number }[]; total: number; me: boolean }

const props = defineProps<{
  players: DartsPlayer[]
  turn: string | null
  mySessionId: string
  throwsLeft: number
  turnEndsAt: number
  intoxication: number
  ranking: { sessionId: string; total: number }[] | null
}>()

const emit = defineEmits<{ throw: [x: number, y: number, power: number]; close: [] }>()

const BOARD_RADIUS_CM = 22.5
const VIEW = BOARD_RADIUS_CM + 0.5
const NUMBER_RADIUS_CM = 19.8
const THROW_PENDING_MS = 1500
const ARROW_STEP_CM = 1
const MAX_FRAME_S = 0.1
const HIT_POP_MS = 1100

const PLAYER_TONES = [
  { dot: 'bg-sun', text: 'text-sun', fill: 'rgb(var(--cc-sun))' },
  { dot: 'bg-pool', text: 'text-pool', fill: 'rgb(var(--cc-pool))' },
  { dot: 'bg-mint', text: 'text-mint', fill: 'rgb(var(--cc-mint))' },
  { dot: 'bg-grape', text: 'text-grape', fill: 'rgb(var(--cc-grape))' },
] as const

function polar(r: number, clockwiseDeg: number): { x: number; y: number } {
  const rad = (clockwiseDeg * Math.PI) / 180
  return { x: r * Math.sin(rad), y: -r * Math.cos(rad) }
}

function annularSector(r0: number, r1: number, a0: number, a1: number): string {
  const p0 = polar(r1, a0)
  const p1 = polar(r1, a1)
  const p2 = polar(r0, a1)
  const p3 = polar(r0, a0)
  return `M${p0.x} ${p0.y} A${r1} ${r1} 0 0 1 ${p1.x} ${p1.y} L${p2.x} ${p2.y} A${r0} ${r0} 0 0 0 ${p3.x} ${p3.y} Z`
}

const SECTORS = DARTBOARD_SECTORS.map((number, i) => {
  const a0 = i * SECTOR_DEG - SECTOR_DEG / 2
  const a1 = a0 + SECTOR_DEG
  const dark = i % 2 === 0
  const label = polar(NUMBER_RADIUS_CM, i * SECTOR_DEG)
  return {
    number,
    label,
    single: dark ? '#1f1b19' : '#eadfc4',
    ring: dark ? '#c9332c' : '#2b8e4c',
    innerSingle: annularSector(DARTBOARD_CM.outerBull, DARTBOARD_CM.tripleInner, a0, a1),
    triple: annularSector(DARTBOARD_CM.tripleInner, DARTBOARD_CM.tripleOuter, a0, a1),
    outerSingle: annularSector(DARTBOARD_CM.tripleOuter, DARTBOARD_CM.doubleInner, a0, a1),
    double: annularSector(DARTBOARD_CM.doubleInner, DARTBOARD_CM.doubleOuter, a0, a1),
  }
})

const board = ref<SVGSVGElement | null>(null)
const pointer = ref<DartPoint>({ x: 0, y: 0 })
const now = ref(Date.now())
const sway = ref<DartPoint>({ x: 0, y: 0 })
const pending = ref(false)
const charging = ref(false)
const power = ref(0)
const holdingBreath = ref(false)
const breath = ref<BreathState & { factor: number }>({ ...FULL_BREATH, factor: 1 })
const hit = ref<{ x: number; y: number; label: string; key: number } | null>(null)

const swaySeed = Math.floor(Math.random() * 0x7fffffff)
let frame = 0
let startedAt = 0
let lastFrameAt = 0
let pendingTimer = 0
let hitTimer = 0
let aimedS = 0
let chargeStartedAt = 0
let meterPeriod = meterPeriodS(Math.random, props.intoxication)
const sweetZone = { from: DARTS_POWER_IDEAL - DARTS_POWER_DEAD_ZONE, to: DARTS_POWER_IDEAL + DARTS_POWER_DEAD_ZONE }

const myTurn = computed(() => props.turn !== null && props.turn === props.mySessionId)
const canThrow = computed(() => myTurn.value && props.throwsLeft > 0 && !pending.value && props.ranking === null)
const turnSecondsLeft = computed(() => Math.max(0, Math.ceil((props.turnEndsAt - now.value) / 1000)))
const crosshair = computed(() => ({
  x: Math.max(-VIEW, Math.min(VIEW, pointer.value.x + sway.value.x)),
  y: Math.max(-VIEW, Math.min(VIEW, pointer.value.y + sway.value.y)),
}))

function toneOf(index: number) {
  return PLAYER_TONES[index % PLAYER_TONES.length]!
}

function pseudoOf(sessionId: string): string {
  return props.players.find((player) => player.sessionId === sessionId)?.pseudo ?? sessionId
}

const currentPlayer = computed(() => (props.turn ? pseudoOf(props.turn) : null))

const status = computed(() => {
  if (props.ranking) return 'Game over.'
  if (props.turn === null) return 'Chalking up… waiting for the first throw.'
  if (myTurn.value) return `Your turn · ${props.throwsLeft} ${props.throwsLeft === 1 ? 'dart' : 'darts'} left`
  return `${currentPlayer.value}'s turn`
})

const podium = computed(() =>
  (props.ranking ?? []).map((entry, rank) => ({
    ...entry,
    rank: rank + 1,
    pseudo: pseudoOf(entry.sessionId),
    me: entry.sessionId === props.mySessionId,
    tone: toneOf(props.players.findIndex((player) => player.sessionId === entry.sessionId)),
  })),
)

function tick(timestamp: number): void {
  if (!startedAt) startedAt = lastFrameAt = timestamp
  const dt = Math.min(MAX_FRAME_S, (timestamp - lastFrameAt) / 1000)
  lastFrameAt = timestamp
  now.value = Date.now()
  if (canThrow.value) aimedS += dt
  breath.value = breathStep(breath.value, holdingBreath.value && canThrow.value, dt, props.intoxication)
  sway.value = aimDrift({ t: (timestamp - startedAt) / 1000, aimedS, intoxication: props.intoxication, seed: swaySeed, breathFactor: breath.value.factor })
  if (charging.value) power.value = meterPower((timestamp - chargeStartedAt) / 1000, meterPeriod)
  frame = requestAnimationFrame(tick)
}

function aimAt(e: MouseEvent): void {
  const svg = board.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  holdingBreath.value = e.shiftKey
  pointer.value = {
    x: ((e.clientX - rect.left) / rect.width) * 2 * VIEW - VIEW,
    y: VIEW - ((e.clientY - rect.top) / rect.height) * 2 * VIEW,
  }
}

function startCharge(): void {
  if (!canThrow.value || charging.value) return
  charging.value = true
  power.value = 0
  chargeStartedAt = performance.now()
}

/** Release: the crosshair (drift included) and the meter power go to the server, which adds the hand scatter. */
function releaseDart(): void {
  if (!charging.value) return
  charging.value = false
  if (!canThrow.value) return
  const { x, y } = crosshair.value
  pending.value = true
  clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => (pending.value = false), THROW_PENDING_MS)
  emit('throw', x, y, power.value)
}

function cancelCharge(): void {
  charging.value = false
  power.value = 0
}

function onBoardMouseDown(e: MouseEvent): void {
  if (e.button !== 0) return
  holdingBreath.value = e.shiftKey
  startCharge()
}

function onBoardMouseUp(e: MouseEvent): void {
  if (e.button === 0) releaseDart()
}

function focusBoard(e: MouseEvent): void {
  ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
}

function onBoardBlur(): void {
  holdingBreath.value = false
  cancelCharge()
}

function onBoardKeyUp(e: KeyboardEvent): void {
  if (e.key === 'Shift') holdingBreath.value = false
  if (e.key === ' ' || e.key === 'Enter') {
    releaseDart()
    e.preventDefault()
  }
}

watch(
  () => [props.turn, props.throwsLeft],
  () => {
    pending.value = false
    clearTimeout(pendingTimer)
    cancelCharge()
    aimedS = 0
    meterPeriod = meterPeriodS(Math.random, props.intoxication)
  },
)

const dartCounts = new Map<string, number>()
watch(
  () => props.players.map((player) => `${player.sessionId}:${player.darts.length}`).join(','),
  () => {
    for (const player of props.players) {
      const before = dartCounts.get(player.sessionId) ?? 0
      dartCounts.set(player.sessionId, player.darts.length)
      const dart = player.darts[player.darts.length - 1]
      if (player.darts.length <= before || !dart) continue
      hit.value = { x: dart.x, y: dart.y, label: dartLabel(dart.x, dart.y), key: Date.now() }
      clearTimeout(hitTimer)
      hitTimer = window.setTimeout(() => (hit.value = null), HIT_POP_MS)
    }
  },
)

function onBoardKey(e: KeyboardEvent): void {
  if (e.key === 'Shift') {
    holdingBreath.value = true
    return
  }
  const moves: Record<string, DartPoint> = {
    ArrowUp: { x: 0, y: ARROW_STEP_CM },
    ArrowDown: { x: 0, y: -ARROW_STEP_CM },
    ArrowLeft: { x: -ARROW_STEP_CM, y: 0 },
    ArrowRight: { x: ARROW_STEP_CM, y: 0 },
  }
  const move = moves[e.key]
  if (move) {
    pointer.value = { x: pointer.value.x + move.x, y: pointer.value.y + move.y }
    e.preventDefault()
    return
  }
  if (e.key === ' ' || e.key === 'Enter') {
    if (!e.repeat) startCharge()
    e.preventDefault()
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  cancelAnimationFrame(frame)
  clearTimeout(pendingTimer)
  clearTimeout(hitTimer)
})
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(760px,94vw)] animate-cc-pop overflow-hidden p-0" aria-label="Darts">
      <header class="flex items-center justify-between bg-coral px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Darts</span>
        <button type="button" class="inline-flex items-center" aria-label="Leave the darts corner" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-wrap items-start gap-5 px-5 py-4">
        <div
          class="relative w-[min(340px,80vw)] shrink-0 rounded-full outline-none focus-visible:ring-4 focus-visible:ring-pool/60"
          :class="canThrow ? 'cursor-none' : 'cursor-default'"
          role="button"
          tabindex="0"
          :aria-label="canThrow ? 'Dartboard: hold the mouse button or Space and release to throw, hold Shift to steady' : 'Dartboard'"
          :aria-disabled="!canThrow"
          @mousemove="aimAt"
          @mouseenter="focusBoard"
          @mousedown="onBoardMouseDown"
          @mouseup="onBoardMouseUp"
          @mouseleave="cancelCharge"
          @keydown="onBoardKey"
          @keyup="onBoardKeyUp"
          @blur="onBoardBlur"
        >
          <svg ref="board" :viewBox="`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`" class="block h-auto w-full" aria-hidden="true">
            <circle :r="BOARD_RADIUS_CM" fill="#141210" />
            <g v-for="sector in SECTORS" :key="sector.number" stroke="#c7c2b8" stroke-width="0.08">
              <path :d="sector.innerSingle" :fill="sector.single" />
              <path :d="sector.triple" :fill="sector.ring" />
              <path :d="sector.outerSingle" :fill="sector.single" />
              <path :d="sector.double" :fill="sector.ring" />
            </g>
            <circle :r="DARTBOARD_CM.outerBull" fill="#2b8e4c" stroke="#c7c2b8" stroke-width="0.08" />
            <circle :r="DARTBOARD_CM.bull" fill="#c9332c" stroke="#c7c2b8" stroke-width="0.08" />
            <text
              v-for="sector in SECTORS"
              :key="`n${sector.number}`"
              :x="sector.label.x"
              :y="sector.label.y"
              fill="#eadfc4"
              font-size="2.6"
              font-weight="700"
              font-family="Nunito, system-ui, sans-serif"
              text-anchor="middle"
              dominant-baseline="central"
            >
              {{ sector.number }}
            </text>

            <g v-for="(player, index) in players" :key="player.sessionId">
              <g v-for="(dart, i) in player.darts" :key="i" :transform="`translate(${dart.x} ${-dart.y})`">
                <line x1="0" y1="0" x2="1.6" y2="-1.6" stroke="#e8e8e8" stroke-width="0.25" stroke-linecap="round" />
                <path d="M1.3 -1.3 l0.9 -0.9 l0.4 1.4 l-1.4 -0.4 z" :fill="toneOf(index).fill" stroke="#141210" stroke-width="0.1" />
                <circle r="0.45" :fill="toneOf(index).fill" stroke="#fff" stroke-width="0.15" />
              </g>
            </g>

            <g v-if="hit" :key="hit.key" :transform="`translate(${hit.x} ${-hit.y - 2.6})`">
              <text
                class="animate-cc-pop"
                fill="#fff"
                stroke="#141210"
                stroke-width="0.5"
                paint-order="stroke"
                font-size="3.4"
                font-weight="800"
                font-family="Nunito, system-ui, sans-serif"
                text-anchor="middle"
                dominant-baseline="central"
              >
                {{ hit.label }}
              </text>
            </g>

            <g v-if="canThrow" :transform="`translate(${crosshair.x} ${-crosshair.y})`" stroke="#fff" stroke-width="0.3" stroke-linecap="round">
              <circle r="1.6" fill="none" />
              <line x1="-2.6" y1="0" x2="-1" y2="0" />
              <line x1="1" y1="0" x2="2.6" y2="0" />
              <line x1="0" y1="-2.6" x2="0" y2="-1" />
              <line x1="0" y1="1" x2="0" y2="2.6" />
              <circle r="0.25" fill="#fff" stroke="none" />
            </g>
          </svg>
        </div>

        <div class="flex min-w-[220px] flex-1 flex-col gap-3">
          <div class="flex items-baseline justify-between gap-3">
            <p class="m-0 font-display text-lg text-fog" aria-live="polite">{{ status }}</p>
            <p v-if="turn !== null && !ranking" class="m-0 font-display text-2xl tabular-nums" :class="turnSecondsLeft <= 5 ? 'text-coral' : 'text-mist'">
              {{ turnSecondsLeft }}s
            </p>
          </div>

          <ul v-if="!ranking" class="m-0 flex list-none flex-col gap-2 p-0">
            <li
              v-for="(player, index) in players"
              :key="player.sessionId"
              class="flex items-center gap-3 rounded-xl bg-ink-950/40 px-3 py-2"
              :class="player.sessionId === turn ? 'ring-2 ring-white/40' : ''"
            >
              <span class="h-3 w-3 shrink-0 rounded-full" :class="toneOf(index).dot" />
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate text-sm font-bold" :class="player.me ? 'text-sun' : 'text-fog'">
                  {{ player.pseudo }}<span v-if="player.me" class="text-mist"> (you)</span>
                </p>
                <p class="m-0 text-[11px] text-mist">
                  <template v-if="player.darts.length === 0">No darts yet</template>
                  <template v-else>{{ player.darts.map((dart) => dartLabel(dart.x, dart.y)).join(' · ') }}</template>
                </p>
              </div>
              <span class="font-display text-xl tabular-nums text-fog">{{ player.total }}</span>
            </li>
          </ul>

          <ol v-else class="m-0 flex list-none flex-col gap-2 p-0">
            <li
              v-for="entry in podium"
              :key="entry.sessionId"
              class="flex items-center gap-3 rounded-xl px-3 py-2"
              :class="entry.rank === 1 ? 'bg-sun/15 ring-2 ring-sun/60' : 'bg-ink-950/40'"
            >
              <span class="w-6 text-center font-display text-lg" :class="entry.rank === 1 ? 'text-sun' : 'text-mist'">
                <UiIcon v-if="entry.rank === 1" name="crown" :size="18" />
                <template v-else>{{ entry.rank }}</template>
              </span>
              <span class="h-3 w-3 shrink-0 rounded-full" :class="entry.tone.dot" />
              <p class="m-0 min-w-0 flex-1 truncate text-sm font-bold" :class="entry.me ? 'text-sun' : 'text-fog'">
                {{ entry.pseudo }}<span v-if="entry.me" class="text-mist"> (you)</span>
              </p>
              <span class="font-display text-xl tabular-nums text-fog">{{ entry.total }}</span>
            </li>
          </ol>

          <div v-if="canThrow" class="flex flex-col gap-2" aria-hidden="true">
            <div class="flex items-center gap-2">
              <span class="w-12 text-[11px] uppercase tracking-wider text-mist">Power</span>
              <div class="relative h-3 flex-1 overflow-hidden rounded-full bg-ink-950/60">
                <div class="absolute inset-y-0 bg-mint/50" :style="{ left: `${sweetZone.from * 100}%`, width: `${(sweetZone.to - sweetZone.from) * 100}%` }" />
                <div class="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-sun" :style="{ left: `${power * 100}%` }" />
              </div>
            </div>
            <div class="flex items-center gap-2">
              <span class="w-12 text-[11px] uppercase tracking-wider text-mist">Breath</span>
              <div class="relative h-2 flex-1 overflow-hidden rounded-full bg-ink-950/60">
                <div
                  class="absolute inset-y-0 left-0 rounded-full"
                  :class="breath.gasp > 0 ? 'bg-coral' : breath.factor < 1 ? 'bg-pool' : 'bg-mist/60'"
                  :style="{ width: `${breath.air * 100}%` }"
                />
              </div>
            </div>
          </div>

          <p v-if="!ranking" class="m-0 text-[11px] text-mist">
            <template v-if="canThrow">
              Aim with the mouse or the arrow keys. Hold the mouse button or Space and let go in the green band: too soft drops low, too hard flies
              high. Hold Shift to hold your breath, not for too long. The longer you aim and the more pints you had, the more your hand drifts.
            </template>
            <template v-else-if="pending">Dart in the air…</template>
            <template v-else>Three darts each, best total wins.</template>
          </p>
        </div>
      </div>

      <footer v-if="ranking" class="flex items-center justify-end border-t border-white/10 px-4 py-3">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-coral" @click="emit('close')">Back to the bar</button>
      </footer>
    </section>
  </div>
</template>
