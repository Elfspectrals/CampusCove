<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { DARTBOARD_CM, DARTBOARD_SECTORS, SECTOR_DEG, aimSway, dartLabel, throwOffset, type DartPoint } from '../../game/pub/darts'
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

const emit = defineEmits<{ throw: [x: number, y: number]; close: [] }>()

const BOARD_RADIUS_CM = 22.5
const VIEW = BOARD_RADIUS_CM + 0.5
const NUMBER_RADIUS_CM = 19.8
const THROW_PENDING_MS = 1500
const ARROW_STEP_CM = 1

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

const swaySeed = Math.floor(Math.random() * 0x7fffffff)
let frame = 0
let startedAt = 0
let pendingTimer = 0

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
  if (!startedAt) startedAt = timestamp
  now.value = Date.now()
  sway.value = aimSway((timestamp - startedAt) / 1000, props.intoxication, swaySeed)
  frame = requestAnimationFrame(tick)
}

function aimAt(e: MouseEvent): void {
  const svg = board.value
  if (!svg) return
  const rect = svg.getBoundingClientRect()
  pointer.value = {
    x: ((e.clientX - rect.left) / rect.width) * 2 * VIEW - VIEW,
    y: VIEW - ((e.clientY - rect.top) / rect.height) * 2 * VIEW,
  }
}

function throwDart(): void {
  if (!canThrow.value) return
  const { x, y } = throwOffset(crosshair.value, props.intoxication)
  pending.value = true
  clearTimeout(pendingTimer)
  pendingTimer = window.setTimeout(() => (pending.value = false), THROW_PENDING_MS)
  emit('throw', x, y)
}

watch(
  () => [props.turn, props.throwsLeft],
  () => {
    pending.value = false
    clearTimeout(pendingTimer)
  },
)

function onBoardKey(e: KeyboardEvent): void {
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
    throwDart()
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
          :aria-label="canThrow ? 'Dartboard: click or press Space to throw' : 'Dartboard'"
          :aria-disabled="!canThrow"
          @mousemove="aimAt"
          @click="throwDart"
          @keydown="onBoardKey"
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

          <p v-if="!ranking" class="m-0 text-[11px] text-mist">
            <template v-if="canThrow">Aim with the mouse or the arrow keys, click or press Space to throw. The crosshair sways with every pint you had.</template>
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
