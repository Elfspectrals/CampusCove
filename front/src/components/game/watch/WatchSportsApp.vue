<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { sportsWatchScreen, type SportsWatchLobby } from '../../../game/watch/sports'
import type { SportsLobbyPayload } from '../../../types/gameRealtime'
import WatchRow from './WatchRow.vue'

const props = defineProps<{
  passUntil: number | null
  lobbies: readonly SportsLobbyPayload[]
  sessionId: string
  clockOffset: number
  selected: number
}>()

const { t } = useI18n()

const now = ref(Date.now())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 1000)
})
onUnmounted(() => window.clearInterval(timer))

const screen = computed(() => sportsWatchScreen(props.passUntil, props.lobbies, props.sessionId, now.value + props.clockOffset))

function passEnd(at: number): string {
  return new Date(at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
}

function lobbyMeta(lobby: SportsWatchLobby): string {
  if (lobby.phase === 'playing') return t('watch.sports.playing')
  if (lobby.secondsLeft !== null) return t('watch.sports.kickoff', { s: lobby.secondsLeft })
  return t('watch.sports.players', { n: lobby.players, max: lobby.max })
}

defineExpose({
  rowKeys: computed(() => ['pass', ...screen.value.lobbies.map((lobby) => lobby.venue)]),
  activate: () => undefined,
})
</script>

<template>
  <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
    <WatchRow
      :selected="selected === 0"
      :dot="screen.passUntil === null ? 'mist' : 'mint'"
      :name="screen.passUntil === null ? t('watch.sports.noPass') : t('watch.sports.pass')"
      :meta="screen.passUntil === null ? t('watch.sports.atReception') : t('watch.sports.until', { end: passEnd(screen.passUntil) })"
    />
    <WatchRow
      v-for="(lobby, index) in screen.lobbies"
      :key="lobby.venue"
      :selected="selected === index + 1"
      :dot="lobby.team === 'red' ? 'coral' : lobby.team === 'blue' ? 'pool' : 'sun'"
      :name="t(`sports.sports.${lobby.sport}`)"
      :meta="lobbyMeta(lobby)"
    />
    <p v-if="screen.lobbies.length === 0" class="m-0 px-2 py-2 text-center text-xs text-mist">{{ t('watch.sports.noMatch') }}</p>
  </ul>
</template>
