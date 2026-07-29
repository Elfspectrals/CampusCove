<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type {
  CoveRushErrorState,
  CoveRushQueueState,
  CoveRushRunState,
} from '../../game/lobbyActivities'

const props = defineProps<{
  open: boolean
  checkpointCount: number
  queueState: CoveRushQueueState | null
  runState: CoveRushRunState | null
  error: CoveRushErrorState | null
}>()

const emit = defineEmits<{
  close: []
  startSolo: []
  queueDuel: []
  cancel: []
}>()

const dialog = ref<HTMLElement | null>(null)
let previouslyFocused: HTMLElement | null = null

function close(): void {
  emit('close')
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return

  const focusable = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.value.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (typeof document === 'undefined') return
      previouslyFocused =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      void nextTick(() => dialog.value?.focus())
    } else {
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  previouslyFocused?.focus()
})
</script>

<template>
  <div
    v-if="open"
    class="pointer-events-auto fixed inset-0 z-40 flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center sm:p-6"
    @pointerdown.self="close"
  >
    <section
      id="cove-rush-dialog"
      ref="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cove-rush-title"
      aria-describedby="cove-rush-description"
      tabindex="-1"
      class="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-cyan-300/35 bg-gradient-to-b from-[#0b1930]/98 to-[#050b18]/98 text-slate-100 shadow-[0_0_3rem_rgba(34,211,238,0.2)] outline-none sm:max-h-[calc(100dvh-3rem)]"
      @keydown="onKeydown"
    >
      <div
        class="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent"
        aria-hidden="true"
      />

      <header class="flex items-start justify-between gap-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <div>
          <p class="text-[0.68rem] font-bold uppercase tracking-[0.28em] text-cyan-300">
            Campus Cove activity
          </p>
          <h2
            id="cove-rush-title"
            class="mt-1 text-2xl font-black uppercase italic tracking-tight text-white sm:text-3xl"
          >
            Cove <span class="text-fuchsia-300">Rush</span>
          </h2>
          <p id="cove-rush-description" class="mt-2 max-w-prose text-sm leading-relaxed text-slate-300">
            Sprint through {{ checkpointCount }} neon orbs in order. The server validates every
            checkpoint, time, and finish.
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:border-fuchsia-300/70 hover:bg-fuchsia-300/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
          aria-label="Close Cove Rush"
          @click="close"
        >
          ✕
        </button>
      </header>

      <div class="border-y border-white/10 bg-white/[0.025] px-5 py-4 sm:px-6">
        <ol class="grid gap-3 text-sm sm:grid-cols-3">
          <li class="flex items-center gap-2.5">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-xs font-black text-cyan-200"
              >1</span
            >
            <span class="text-slate-300">Choose a run</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-fuchsia-300/40 bg-fuchsia-300/10 text-xs font-black text-fuchsia-200"
              >2</span
            >
            <span class="text-slate-300">Follow the live orb</span>
          </li>
          <li class="flex items-center gap-2.5">
            <span
              class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-300/10 text-xs font-black text-cyan-200"
              >3</span
            >
            <span class="text-slate-300">Beat the clock</span>
          </li>
        </ol>
      </div>

      <div class="space-y-3 px-5 py-5 sm:px-6">
        <div
          v-if="queueState?.status === 'queued'"
          class="rounded-xl border border-cyan-300/35 bg-cyan-300/[0.07] p-4"
          role="status"
          aria-live="polite"
        >
          <div class="flex items-center gap-3">
            <span class="relative flex h-3 w-3" aria-hidden="true">
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-60 motion-reduce:animate-none" />
              <span class="relative inline-flex h-3 w-3 rounded-full bg-cyan-300" />
            </span>
            <div>
              <p class="font-bold text-cyan-100">Finding a challenger…</p>
              <p class="mt-0.5 text-xs text-slate-400">You can cancel while matchmaking.</p>
            </div>
          </div>
          <button
            type="button"
            class="mt-4 w-full rounded-lg border border-white/20 bg-slate-950/45 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-fuchsia-300/60 hover:text-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
            @click="emit('cancel')"
          >
            Cancel search
          </button>
        </div>

        <div
          v-else-if="queueState?.status === 'matched'"
          class="rounded-xl border border-fuchsia-300/40 bg-fuchsia-300/[0.08] p-4"
          role="status"
          aria-live="polite"
        >
          <p class="text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">Match found</p>
          <p class="mt-1 text-lg font-black text-white">
            {{ queueState.opponent?.pseudo ?? 'Challenger' }}
          </p>
          <p class="mt-1 text-sm text-slate-300">Get ready—the server countdown is starting.</p>
          <button
            type="button"
            class="mt-4 w-full rounded-lg border border-white/20 bg-slate-950/45 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:border-fuchsia-300/60 hover:text-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
            @click="emit('cancel')"
          >
            Leave match
          </button>
        </div>

        <div
          v-else-if="runState"
          class="rounded-xl border border-cyan-300/30 bg-cyan-300/[0.06] p-4 text-sm text-slate-200"
          role="status"
        >
          Your {{ runState.mode === 'duel' ? '1v1' : 'solo' }} run is already in progress.
          Close this panel and chase the highlighted orb.
        </div>

        <div v-else class="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            class="group rounded-xl border border-cyan-300/35 bg-gradient-to-br from-cyan-300/15 to-cyan-300/[0.03] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-[0_0_1.5rem_rgba(34,211,238,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transform-none"
            @click="emit('startSolo')"
          >
            <span class="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-cyan-300">
              Timed practice
            </span>
            <span class="mt-1 block text-lg font-black text-white">Solo Orb Rush</span>
            <span class="mt-1.5 block text-xs leading-relaxed text-slate-400">
              Learn the route and chase a session best.
            </span>
            <span class="mt-4 block text-sm font-bold text-cyan-200 group-hover:text-white">
              Start solo →
            </span>
          </button>

          <button
            type="button"
            class="group rounded-xl border border-fuchsia-300/35 bg-gradient-to-br from-fuchsia-300/15 to-fuchsia-300/[0.03] p-4 text-left transition hover:-translate-y-0.5 hover:border-fuchsia-200 hover:shadow-[0_0_1.5rem_rgba(232,121,249,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 motion-reduce:transform-none"
            @click="emit('queueDuel')"
          >
            <span class="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-fuchsia-300">
              Live matchmaking
            </span>
            <span class="mt-1 block text-lg font-black text-white">Find a 1v1</span>
            <span class="mt-1.5 block text-xs leading-relaxed text-slate-400">
              Same route, shared countdown, first clean finish wins.
            </span>
            <span class="mt-4 block text-sm font-bold text-fuchsia-200 group-hover:text-white">
              Find challenger →
            </span>
          </button>
        </div>

        <p
          v-if="error"
          class="rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2.5 text-sm text-rose-100"
          role="alert"
        >
          {{ error.message }}
        </p>
      </div>

      <footer class="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 text-xs text-slate-500 sm:px-6">
        <span>Checkpoint order is server-verified.</span>
        <span class="hidden sm:inline">Esc to close</span>
      </footer>
    </section>
  </div>
</template>
