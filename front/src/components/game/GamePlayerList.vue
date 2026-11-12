<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { matches } from '../../config/keybindings'
import { MAX_VOLUME } from '../../game/voice'

interface ListedPlayer {
  sessionId: string
  accountId: string
  pseudo: string
}

const props = defineProps<{
  players: () => ListedPlayer[]
  speaking: ReadonlySet<string>
  muted: readonly string[]
  volumes: Readonly<Record<string, number>>
}>()
const emit = defineEmits<{ toggleMute: [accountId: string]; setVolume: [accountId: string, volume: number]; close: [] }>()

const { t } = useI18n()
const REFRESH_MS = 500
const list = ref<ListedPlayer[]>(props.players())
let timer: ReturnType<typeof setInterval> | undefined

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && !matches('playerList', e.code)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  timer = setInterval(() => (list.value = props.players()), REFRESH_MS)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  clearInterval(timer)
})
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-start justify-center bg-black/40 p-4 pt-16" @mousedown.self="emit('close')">
    <section class="cc-panel w-[min(520px,100%)] animate-cc-pop overflow-hidden" :aria-label="t('playerList.title')">
      <header class="cc-panel-header bg-ink-950/40">
        <h2 class="cc-display m-0 text-xl leading-none">{{ t('playerList.title', { n: list.length }) }}</h2>
      </header>
      <p v-if="list.length === 0" class="m-0 p-5 text-sm font-semibold text-mist">{{ t('playerList.empty') }}</p>
      <ul v-else class="m-0 max-h-[60vh] list-none overflow-y-auto p-2">
        <li v-for="player in list" :key="player.sessionId" class="flex min-h-11 items-center gap-3 rounded-xl px-3 py-1.5 odd:bg-ink-950/40">
          <span
            :class="['size-2.5 shrink-0 rounded-full', speaking.has(player.sessionId) ? (muted.includes(player.accountId) ? 'bg-coral' : 'animate-pulse bg-mint') : 'bg-mist/30']"
            :aria-label="speaking.has(player.sessionId) ? t('playerList.speaking') : undefined"
          />
          <span class="min-w-0 flex-1 truncate font-bold text-fog">{{ player.pseudo }}</span>
          <input
            type="range"
            class="w-24 shrink-0 accent-sun sm:w-32"
            min="0"
            :max="MAX_VOLUME"
            step="0.05"
            :value="volumes[player.accountId] ?? 1"
            :disabled="muted.includes(player.accountId)"
            :aria-label="t('playerList.volume', { name: player.pseudo })"
            @input="emit('setVolume', player.accountId, Number(($event.target as HTMLInputElement).value))"
          />
          <span class="w-11 shrink-0 text-right font-mono text-xs text-mist">{{ Math.round((volumes[player.accountId] ?? 1) * 100) }} %</span>
          <button
            type="button"
            :class="['cc-btn cc-btn-sm', muted.includes(player.accountId) ? 'cc-btn-coral' : 'cc-btn-ghost']"
            :aria-pressed="muted.includes(player.accountId)"
            @click="emit('toggleMute', player.accountId)"
          >
            {{ muted.includes(player.accountId) ? t('playerList.unmute') : t('playerList.mute') }}
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>
