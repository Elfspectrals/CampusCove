<script setup lang="ts">
import {
  computed,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import type {
  CoveRushErrorState,
  CoveRushFinishedState,
  CoveRushQueueState,
  CoveRushResultKind,
  CoveRushRunState,
} from '../../game/lobbyActivities'

const props = defineProps<{
  state: CoveRushRunState | null
  queueState: CoveRushQueueState | null
  result: CoveRushFinishedState | null
  error: CoveRushErrorState | null
}>()

const emit = defineEmits<{
  cancel: []
  leave: []
  dismiss: []
}>()

const clientNow = ref(Date.now())
const clockAnchor = ref({
  clientAt: Date.now(),
  serverAt: Date.now(),
})
let clockTimer: ReturnType<typeof setInterval> | null = null

const latestServerNow = computed(
  () =>
    props.state?.serverNow ??
    props.queueState?.serverNow ??
    props.result?.serverNow ??
    null,
)

const needsClock = computed(
  () =>
    props.state !== null ||
    props.queueState?.status === 'queued' ||
    props.queueState?.status === 'matched',
)

watch(
  latestServerNow,
  (serverNow) => {
    if (serverNow === null) return
    const now = Date.now()
    clientNow.value = now
    clockAnchor.value = { clientAt: now, serverAt: serverNow }
  },
  { immediate: true },
)

const estimatedServerNow = computed(
  () =>
    clockAnchor.value.serverAt +
    (clientNow.value - clockAnchor.value.clientAt),
)

const countdownSeconds = computed(() => {
  if (!props.state) return 0
  return Math.max(
    0,
    Math.ceil((props.state.startsAt - estimatedServerNow.value) / 1_000),
  )
})

const elapsedMs = computed(() => {
  if (!props.state || estimatedServerNow.value < props.state.startsAt) return 0
  return Math.min(
    props.state.endsAt - props.state.startsAt,
    estimatedServerNow.value - props.state.startsAt,
  )
})

const remainingMs = computed(() => {
  if (!props.state) return 0
  return Math.max(0, props.state.endsAt - estimatedServerNow.value)
})

const progressPercent = computed(() => {
  if (!props.state || props.state.checkpointCount <= 0) return 0
  return Math.min(
    100,
    Math.max(
      0,
      (props.state.checkpointIndex / props.state.checkpointCount) * 100,
    ),
  )
})

const opponentProgressPercent = computed(() => {
  if (!props.state?.opponent || props.state.checkpointCount <= 0) return 0
  return Math.min(
    100,
    Math.max(
      0,
      (props.state.opponent.checkpointIndex / props.state.checkpointCount) *
        100,
    ),
  )
})

const queueSeconds = computed(() => {
  const queuedAt = props.queueState?.queuedAt
  if (
    props.queueState?.status !== 'queued' ||
    queuedAt === null ||
    queuedAt === undefined
  ) {
    return 0
  }
  return Math.max(
    0,
    Math.floor((estimatedServerNow.value - queuedAt) / 1_000),
  )
})

function formatDuration(milliseconds: number | null): string {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return '—'
  const safeMilliseconds = Math.max(0, milliseconds)
  const minutes = Math.floor(safeMilliseconds / 60_000)
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000)
  const hundredths = Math.floor((safeMilliseconds % 1_000) / 10)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`
}

function resultTitle(result: CoveRushResultKind): string {
  const titles: Record<CoveRushResultKind, string> = {
    completed: 'Run complete',
    win: 'Victory',
    loss: 'Good race',
    forfeit: 'Run forfeited',
    cancelled: 'Run cancelled',
    timeout: 'Time expired',
  }
  return titles[result]
}

function resultMessage(result: CoveRushResultKind): string {
  const messages: Record<CoveRushResultKind, string> = {
    completed: 'You cleared every orb.',
    win: 'You reached the final orb first.',
    loss: 'Your challenger reached the finish first.',
    forfeit: 'The duel ended by forfeit.',
    cancelled: 'The activity ended before the finish.',
    timeout: 'The server timer reached zero.',
  }
  return messages[result]
}

function startClock(): void {
  if (clockTimer !== null || typeof window === 'undefined') return
  clockTimer = window.setInterval(() => {
    clientNow.value = Date.now()
  }, 100)
}

function stopClock(): void {
  if (clockTimer === null || typeof window === 'undefined') return
  window.clearInterval(clockTimer)
  clockTimer = null
}

watch(
  needsClock,
  (shouldRun) => {
    if (shouldRun) {
      startClock()
    } else {
      stopClock()
    }
  },
  { immediate: true },
)

onUnmounted(stopClock)
</script>

<template>
  <div
    v-if="state || queueState?.status === 'queued' || queueState?.status === 'matched' || result || error"
    class="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-col items-center gap-3 p-3 sm:p-5"
  >
    <div
      v-if="state"
      class="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-300/30 bg-[#071326]/90 text-white shadow-[0_1rem_3rem_rgba(0,0,0,0.45),0_0_2rem_rgba(34,211,238,0.12)] backdrop-blur-md"
    >
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-5">
        <div class="flex items-center gap-3">
          <span
            class="rounded-full border border-cyan-300/35 bg-cyan-300/10 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-[0.18em] text-cyan-200"
          >
            {{ state.mode === 'duel' ? '1v1' : 'Solo' }}
          </span>
          <div>
            <p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Cove Rush</p>
            <p class="text-sm font-black text-white">
              Orb {{ Math.min(state.checkpointIndex + 1, state.checkpointCount) }} of
              {{ state.checkpointCount }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-3 sm:gap-5">
          <div class="text-right">
            <p class="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Time</p>
            <p class="font-mono text-lg font-black tabular-nums text-cyan-100">
              {{ formatDuration(elapsedMs) }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Left</p>
            <p class="font-mono text-sm font-bold tabular-nums text-fuchsia-200">
              {{ formatDuration(remainingMs) }}
            </p>
          </div>
          <button
            type="button"
            class="pointer-events-auto rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-rose-300/60 hover:bg-rose-300/10 hover:text-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            @click="emit('leave')"
          >
            Leave
          </button>
        </div>
      </div>

      <div class="space-y-3 px-4 py-3 sm:px-5">
        <div>
          <div class="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span class="font-bold text-cyan-100">You</span>
            <span class="tabular-nums text-slate-400">
              {{ state.checkpointIndex }}/{{ state.checkpointCount }}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Your Cove Rush progress"
            :aria-valuenow="state.checkpointIndex"
            aria-valuemin="0"
            :aria-valuemax="state.checkpointCount"
            class="h-2 overflow-hidden rounded-full bg-slate-950/80"
          >
            <div
              class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-200 shadow-[0_0_0.8rem_rgba(34,211,238,0.65)] transition-[width] duration-300 motion-reduce:transition-none"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <div v-if="state.opponent">
          <div class="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span class="truncate font-bold text-fuchsia-200">
              {{ state.opponent.pseudo }}
            </span>
            <span class="tabular-nums text-slate-400">
              {{ state.opponent.checkpointIndex }}/{{ state.checkpointCount }}
            </span>
          </div>
          <div
            role="progressbar"
            :aria-label="`${state.opponent.pseudo}'s Cove Rush progress`"
            :aria-valuenow="state.opponent.checkpointIndex"
            aria-valuemin="0"
            :aria-valuemax="state.checkpointCount"
            class="h-1.5 overflow-hidden rounded-full bg-slate-950/80"
          >
            <div
              class="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-300 transition-[width] duration-300 motion-reduce:transition-none"
              :style="{ width: `${opponentProgressPercent}%` }"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="state && countdownSeconds > 0"
      class="mt-[min(16vh,8rem)] rounded-2xl border border-cyan-200/40 bg-[#071326]/90 px-8 py-5 text-center shadow-[0_0_3rem_rgba(34,211,238,0.3)] backdrop-blur-md"
      role="status"
      aria-live="assertive"
      aria-atomic="true"
    >
      <p class="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Get ready</p>
      <p class="mt-1 text-6xl font-black italic tabular-nums text-white sm:text-7xl">
        {{ countdownSeconds }}
      </p>
    </div>

    <div
      v-else-if="queueState?.status === 'queued'"
      class="pointer-events-auto w-full max-w-sm rounded-2xl border border-cyan-300/35 bg-[#071326]/92 px-4 py-3 text-white shadow-[0_0_2rem_rgba(34,211,238,0.16)] backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <div class="flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="relative flex h-3 w-3 shrink-0" aria-hidden="true">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60 motion-reduce:animate-none" />
            <span class="relative inline-flex h-3 w-3 rounded-full bg-cyan-300" />
          </span>
          <div class="min-w-0">
            <p class="truncate text-sm font-black text-cyan-100">Finding a 1v1</p>
            <p class="text-xs tabular-nums text-slate-400">Searching · {{ queueSeconds }}s</p>
          </div>
        </div>
        <button
          type="button"
          class="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition hover:border-fuchsia-300/60 hover:text-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>

    <div
      v-else-if="queueState?.status === 'matched' && !state"
      class="w-full max-w-sm rounded-2xl border border-fuchsia-300/40 bg-[#071326]/92 px-5 py-4 text-center text-white shadow-[0_0_2rem_rgba(232,121,249,0.18)] backdrop-blur-md"
      role="status"
      aria-live="assertive"
    >
      <p class="text-[0.65rem] font-black uppercase tracking-[0.22em] text-fuchsia-300">
        Challenger found
      </p>
      <p class="mt-1 text-xl font-black">{{ queueState.opponent?.pseudo ?? 'Opponent' }}</p>
      <p class="mt-1 text-xs text-slate-400">Syncing the start…</p>
    </div>

    <section
      v-if="result"
      class="pointer-events-auto mt-[min(14vh,7rem)] w-full max-w-md rounded-2xl border border-fuchsia-300/40 bg-gradient-to-b from-[#101a35]/98 to-[#050b18]/98 p-5 text-center text-white shadow-[0_0_3rem_rgba(232,121,249,0.24)] backdrop-blur-md sm:p-6"
      role="status"
      aria-live="assertive"
      aria-labelledby="cove-rush-result-title"
      aria-describedby="cove-rush-result-message"
    >
      <p class="text-[0.65rem] font-black uppercase tracking-[0.25em] text-cyan-300">
        Cove Rush
      </p>
      <h2 id="cove-rush-result-title" class="mt-1 text-3xl font-black italic text-white">
        {{ resultTitle(result.result) }}
      </h2>
      <p id="cove-rush-result-message" class="mt-2 text-sm text-slate-300">
        {{ resultMessage(result.result) }}
      </p>

      <div class="mt-5 grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-white/10 bg-white/5 p-3">
          <p class="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Time</p>
          <p class="mt-1 font-mono text-lg font-black tabular-nums text-cyan-100">
            {{ formatDuration(result.durationMs) }}
          </p>
        </div>
        <div class="rounded-xl border border-white/10 bg-white/5 p-3">
          <p class="text-[0.62rem] font-bold uppercase tracking-[0.16em] text-slate-500">Orbs</p>
          <p class="mt-1 text-lg font-black tabular-nums text-fuchsia-100">
            {{ result.checkpointIndex }}/{{ result.checkpointCount }}
          </p>
        </div>
      </div>

      <p
        v-if="result.isNewBest"
        class="mt-3 rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-sm font-black text-cyan-100"
      >
        ✦ New session best
        <span v-if="result.bestMs !== null" class="font-mono tabular-nums">
          · {{ formatDuration(result.bestMs) }}
        </span>
      </p>
      <p v-else-if="result.bestMs !== null" class="mt-3 text-xs text-slate-400">
        Session best ·
        <span class="font-mono tabular-nums">{{ formatDuration(result.bestMs) }}</span>
      </p>

      <button
        type="button"
        class="mt-5 w-full rounded-lg bg-gradient-to-r from-cyan-400 to-fuchsia-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#071326]"
        @click="emit('dismiss')"
      >
        Back to the Cove
      </button>
    </section>

    <p
      v-if="error && !result"
      class="pointer-events-auto max-w-md rounded-xl border border-rose-300/35 bg-rose-950/90 px-4 py-3 text-center text-sm text-rose-100 shadow-lg backdrop-blur-md"
      role="alert"
    >
      {{ error.message }}
    </p>
  </div>
</template>
