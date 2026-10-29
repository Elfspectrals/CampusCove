<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { TradeNearbyPlayer, TradePendingPayload, TradeRequestedPayload } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

/** The watch's apps, opened with a tap on the watch key (holding it still raises the wrist). Trade is the first one. */
defineProps<{
  nearby: TradeNearbyPlayer[]
  incoming: TradeRequestedPayload | null
  outgoing: TradePendingPayload | null
  error: string | null
}>()

const emit = defineEmits<{
  request: [player: TradeNearbyPlayer]
  respond: [accept: boolean]
  cancel: []
  close: []
}>()

const app = ref<'home' | 'trade'>('home')

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (app.value === 'trade') app.value = 'home'
  else emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(400px,92vw)] animate-cc-pop overflow-hidden p-0" aria-label="Watch">
      <header class="flex items-center justify-between bg-pool px-4 py-2 text-ink-950">
        <button
          v-if="app !== 'home'"
          type="button"
          class="inline-flex items-center"
          aria-label="Back to the watch apps"
          @click="app = 'home'"
        >
          <UiIcon name="chevron-left" :size="18" />
        </button>
        <span class="font-display text-sm uppercase tracking-[0.18em]">Watch{{ app === 'trade' ? ' · Trade' : '' }}</span>
        <button type="button" class="inline-flex items-center" aria-label="Close the watch" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div v-if="incoming" class="flex items-center gap-2 border-b border-white/10 bg-sun/15 px-4 py-3">
        <UiIcon name="hand" :size="18" class="text-sun" />
        <p class="m-0 min-w-0 flex-1 text-sm font-bold text-fog">
          <span class="text-sun">{{ incoming.fromPseudo }}</span> wants to trade with you.
        </p>
        <button type="button" class="cc-btn cc-btn-sm" @click="emit('respond', true)">Accept</button>
        <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="emit('respond', false)">Decline</button>
      </div>

      <ul v-if="app === 'home'" class="m-0 grid list-none grid-cols-3 gap-2 p-4">
        <li>
          <button
            type="button"
            class="flex w-full flex-col items-center gap-1.5 rounded-xl bg-ink-950/40 px-2 py-3 text-fog transition hover:bg-pool/25"
            @click="app = 'trade'"
          >
            <UiIcon name="users" :size="26" class="text-pool" />
            <span class="text-xs font-extrabold uppercase tracking-wider">Trade</span>
          </button>
        </li>
      </ul>

      <div v-else class="p-3">
        <div v-if="outgoing" class="mb-2 flex items-center gap-2 rounded-xl bg-ink-950/40 px-3 py-2">
          <p class="m-0 min-w-0 flex-1 text-sm text-mist">
            Waiting for <span class="font-bold text-fog">{{ outgoing.toPseudo }}</span> to answer…
          </p>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="emit('cancel')">Cancel</button>
        </div>
        <p class="m-0 px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-mist">Players nearby</p>
        <p v-if="nearby.length === 0" class="m-0 px-1 py-4 text-center text-sm text-mist">
          Nobody around. Walk up to another player to trade.
        </p>
        <ul v-else class="m-0 max-h-[50vh] list-none overflow-y-auto p-0">
          <li v-for="player in nearby" :key="player.sessionId" class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-950/40">
            <UiIcon name="user" :size="18" class="text-pool" />
            <div class="min-w-0 flex-1">
              <p class="m-0 truncate font-display text-base text-fog">{{ player.pseudo }}</p>
              <p class="m-0 text-[11px] font-bold text-mist">
                {{ player.distance.toFixed(1) }} m<span v-if="outgoing?.toSessionId === player.sessionId"> · asked</span>
                <span v-else-if="player.busy"> · already trading</span>
                <span v-else-if="!player.inReach"> · get closer</span>
              </p>
            </div>
            <button
              type="button"
              class="cc-btn cc-btn-sm"
              :disabled="!player.inReach || player.busy || outgoing !== null || incoming !== null"
              @click="emit('request', player)"
            >
              Trade
            </button>
          </li>
        </ul>
      </div>

      <p v-if="error" class="m-0 bg-coral/20 px-4 py-2 text-xs font-bold text-coral">{{ error }}</p>
    </section>
  </div>
</template>
