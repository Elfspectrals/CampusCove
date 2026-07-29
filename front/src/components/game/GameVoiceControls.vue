<script setup lang="ts">
import type { VoicePeerView } from '../../composables/game/useProximityVoice'

defineProps<{
  supported: boolean
  enabled: boolean
  requesting: boolean
  micMuted: boolean
  deafened: boolean
  transmitting: boolean
  statusLabel: string
  pushToTalkLabel: string
  peers: VoicePeerView[]
  error: string | null
  expanded: boolean
}>()

const emit = defineEmits<{
  enable: []
  disable: []
  toggleMic: []
  toggleDeafen: []
  togglePeerMute: [sessionId: string]
  refreshPolicy: []
}>()
</script>

<template>
  <aside
    class="pointer-events-auto absolute bottom-3 right-3 z-20 w-[min(22rem,90vw)] rounded-2xl border border-cyan-300/25 bg-[#081126]/90 p-3 text-white shadow-[0_1rem_3rem_rgba(0,0,0,0.35)] backdrop-blur-xl"
    aria-label="Proximity voice controls"
  >
    <div class="flex items-center gap-2">
      <span
        class="h-2.5 w-2.5 shrink-0 rounded-full"
        :class="
          transmitting
            ? 'animate-pulse bg-emerald-400 shadow-[0_0_0.9rem_rgba(52,211,153,0.9)]'
            : enabled
              ? 'bg-cyan-300'
              : 'bg-white/30'
        "
      />
      <div class="min-w-0 flex-1">
        <p class="m-0 truncate text-xs font-bold uppercase tracking-[0.16em] text-cyan-100">
          Proximity voice
        </p>
        <p class="m-0 truncate text-[0.68rem] text-white/60">{{ statusLabel }}</p>
      </div>
      <button
        v-if="!enabled"
        type="button"
        class="rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-bold text-[#071226] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="!supported || requesting"
        @click="emit('enable')"
      >
        {{ requesting ? 'Allowing…' : 'Enable' }}
      </button>
      <button
        v-else
        type="button"
        class="rounded-lg border border-white/20 px-2.5 py-1.5 text-xs text-white/75 hover:border-rose-300/60 hover:text-rose-100"
        @click="emit('disable')"
      >
        Leave
      </button>
    </div>

    <template v-if="enabled && expanded">
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          class="rounded-xl border px-3 py-2 text-left text-xs transition"
          :class="
            micMuted
              ? 'border-rose-300/50 bg-rose-400/10 text-rose-100'
              : 'border-white/15 bg-white/5 text-white/80 hover:border-cyan-300/40'
          "
          @click="emit('toggleMic')"
        >
          <span class="block font-semibold">{{ micMuted ? 'Mic muted' : 'Mic ready' }}</span>
          <span class="mt-0.5 block text-[0.65rem] opacity-65">Hold {{ pushToTalkLabel }} to talk</span>
        </button>
        <button
          type="button"
          class="rounded-xl border px-3 py-2 text-left text-xs transition"
          :class="
            deafened
              ? 'border-amber-300/50 bg-amber-300/10 text-amber-100'
              : 'border-white/15 bg-white/5 text-white/80 hover:border-cyan-300/40'
          "
          @click="emit('toggleDeafen')"
        >
          <span class="block font-semibold">{{ deafened ? 'Sound paused' : 'Sound on' }}</span>
          <span class="mt-0.5 block text-[0.65rem] opacity-65">Nearby players only</span>
        </button>
      </div>

      <div v-if="peers.length" class="mt-3 border-t border-white/10 pt-2">
        <div
          v-for="peer in peers"
          :key="peer.sessionId"
          class="flex items-center gap-2 rounded-lg px-1 py-1.5"
        >
          <span
            class="h-2 w-2 rounded-full"
            :class="peer.speaking && !peer.muted ? 'bg-emerald-400' : 'bg-white/25'"
          />
          <span class="min-w-0 flex-1 truncate text-xs text-white/75">{{ peer.pseudo }}</span>
          <button
            type="button"
            class="rounded-md border border-white/15 px-2 py-1 text-[0.65rem] text-white/60 hover:border-cyan-300/40 hover:text-white"
            @click="emit('togglePeerMute', peer.sessionId)"
          >
            {{ peer.muted ? 'Unmute' : 'Mute' }}
          </button>
        </div>
      </div>
      <p v-else class="mb-0 mt-3 text-[0.68rem] text-white/50">
        Walk near another opted-in player to connect.
      </p>

      <div class="mt-2 flex items-center justify-between gap-3 border-t border-white/10 pt-2">
        <p class="m-0 text-[0.62rem] leading-snug text-white/40">
          WebRTC audio · not recorded by CampusCove
        </p>
        <button
          type="button"
          class="shrink-0 text-[0.62rem] font-semibold text-cyan-200/70 hover:text-cyan-100"
          @click="emit('refreshPolicy')"
        >
          Refresh safety
        </button>
      </div>
    </template>

    <p v-if="error && expanded" class="mb-0 mt-2 text-[0.68rem] leading-snug text-rose-200">
      {{ error }}
    </p>
  </aside>
</template>
