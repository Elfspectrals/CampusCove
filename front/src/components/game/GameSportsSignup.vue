<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SPORTS_TEAMS,
  canSignUp,
  choosableSettings,
  choosesSettings,
  kickoffSeconds,
  lobbyPlayer,
  teamRoster,
  type SettingSpec,
  type SettingValue,
  type SignupSpec,
  type SportsTeam,
  type VenueChoice,
} from '../../game/sports/sportsSignup'
import type { SportsLobbyPayload } from '../../types/gameRealtime'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  lobby: SportsLobbyPayload | null
  choices: VenueChoice[]
  canPickVenue: boolean
  spec: SignupSpec | null
  team: SportsTeam | null
  settings: Record<string, SettingValue>
  mySessionId: string | null
  pending: boolean
  error: string | null
  clientNow: number
  clockOffset: number
}>()

const emit = defineEmits<{
  pickVenue: [venue: string | null]
  pickTeam: [team: SportsTeam]
  setSetting: [key: string, value: SettingValue]
  signUp: []
  leave: []
  close: []
}>()

const { t, te } = useI18n()
const panel = ref<HTMLElement | null>(null)

const TEAM_TONE: Record<SportsTeam, string> = { red: 'bg-coral', blue: 'bg-pool' }

const me = computed(() => (props.lobby ? lobbyPlayer(props.lobby, props.mySessionId) : null))
const choosing = computed(() => props.lobby !== null && choosesSettings(props.lobby, props.mySessionId))
const settingRows = computed(() => (props.spec ? choosableSettings(props.spec) : []))
const roster = computed(() => (props.lobby ? teamRoster(props.lobby) : null))
const open = computed(() => props.lobby !== null && canSignUp(props.lobby, props.mySessionId))
const ready = computed(() => open.value && props.spec !== null && (!props.spec.teams || props.team !== null) && !props.pending)

function lobbyStatus(lobby: SportsLobbyPayload): string {
  if (lobby.phase === 'playing') return t('sports.signup.playing')
  const left = kickoffSeconds(lobby.kickoffAt, props.clientNow, props.clockOffset)
  if (lobby.phase === 'countdown' && left !== null) return t('sports.signup.kickoffIn', { s: left })
  return t('sports.signup.waiting', { min: lobby.min })
}

const status = computed(() => {
  if (props.lobby) return lobbyStatus(props.lobby)
  return props.choices.length > 0 ? t('sports.signup.choose') : t('sports.signup.loading')
})

function venueName(choice: VenueChoice): string {
  const sport = t(`sports.sports.${choice.sport}`)
  return choice.court === null ? sport : t('sports.signup.court', { sport, n: choice.court })
}

function settingLabel(setting: SettingSpec): string {
  const key = `sports.settings.${setting.key}`
  return te(key) ? t(key) : setting.label
}

function optionText(key: string, value: SettingValue): string {
  if (typeof value === 'number') {
    const unit = `sports.units.${key}`
    return te(unit) ? t(unit, { n: value, min: value / 60 }) : String(value)
  }
  const option = `sports.options.${value}`
  return te(option) ? t(option) : value
}

function chosenValue(setting: SettingSpec): SettingValue | undefined {
  return choosing.value ? props.settings[setting.key] : props.lobby?.settings[setting.key]
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  panel.value?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section
      ref="panel"
      tabindex="-1"
      class="cc-hud flex max-h-[92vh] w-[min(460px,92vw)] animate-cc-pop flex-col overflow-hidden p-0 outline-none"
      aria-labelledby="cc-sports-signup-title"
    >
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span id="cc-sports-signup-title" class="font-display text-sm uppercase tracking-[0.18em]">
          {{ lobby ? t(`sports.sports.${lobby.sport}`) : t('sports.signup.title') }}
        </span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('sports.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-col gap-4 overflow-y-auto px-4 py-4">
        <p class="m-0 flex items-center justify-between gap-2 text-sm font-bold text-fog" role="status" aria-live="polite">
          <span>{{ status }}</span>
          <span v-if="lobby" class="font-display text-sun">{{ t('sports.signup.count', { n: lobby.players.length, max: lobby.max }) }}</span>
        </p>

        <ul v-if="!lobby && choices.length > 0" class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="choice in choices" :key="choice.venue">
            <button type="button" class="cc-btn cc-btn-ghost flex min-h-11 w-full items-center justify-between gap-3 text-left" @click="emit('pickVenue', choice.venue)">
              <span class="font-bold">{{ venueName(choice) }}</span>
              <span class="text-xs text-mist">
                {{ choice.lobby.phase === 'open' ? t('sports.signup.venueOpen', { n: choice.lobby.players.length, max: choice.lobby.max }) : lobbyStatus(choice.lobby) }}
              </span>
            </button>
          </li>
        </ul>

        <button v-if="lobby && canPickVenue" type="button" class="cc-btn cc-btn-sm cc-btn-ghost min-h-11 self-start gap-1.5" :disabled="pending" @click="emit('pickVenue', null)">
          <UiIcon name="chevron-left" :size="16" />{{ t('sports.signup.back') }}
        </button>

        <div v-if="lobby && settingRows.length > 0" class="flex flex-col gap-2">
          <div v-for="setting in settingRows" :key="setting.key" class="flex flex-col gap-1">
            <span :id="`cc-sports-setting-${setting.key}`" class="text-xs font-bold uppercase tracking-[0.14em] text-mist">{{ settingLabel(setting) }}</span>
            <div v-if="choosing" class="flex flex-wrap gap-1.5" role="radiogroup" :aria-labelledby="`cc-sports-setting-${setting.key}`">
              <button
                v-for="option in setting.options"
                :key="String(option)"
                type="button"
                role="radio"
                :aria-checked="settings[setting.key] === option"
                class="cc-btn cc-btn-sm min-h-11"
                :class="settings[setting.key] === option ? 'cc-btn-sun' : 'cc-btn-ghost'"
                :disabled="pending"
                @click="emit('setSetting', setting.key, option)"
              >
                {{ optionText(setting.key, option) }}
              </button>
            </div>
            <span v-else class="text-sm text-fog">{{ chosenValue(setting) === undefined ? '—' : optionText(setting.key, chosenValue(setting)!) }}</span>
          </div>
          <p v-if="choosing" class="m-0 text-xs text-mist">{{ t('sports.signup.firstChooses') }}</p>
        </div>

        <div v-if="lobby && spec?.teams && roster" class="grid grid-cols-2 gap-2">
          <div v-for="side in SPORTS_TEAMS" :key="side" class="flex flex-col gap-1.5">
            <button
              v-if="open"
              type="button"
              role="radio"
              :aria-checked="team === side"
              class="flex min-h-11 items-center justify-center gap-2 rounded-md border-2 px-2 text-sm font-bold text-ink-950"
              :class="[TEAM_TONE[side], team === side ? 'border-sun' : 'border-transparent opacity-80']"
              :disabled="pending"
              @click="emit('pickTeam', side)"
            >
              {{ t(`sports.teams.${side}`) }}
            </button>
            <span v-else class="flex min-h-11 items-center justify-center rounded-md px-2 text-sm font-bold text-ink-950" :class="TEAM_TONE[side]">{{ t(`sports.teams.${side}`) }}</span>
            <ul class="m-0 flex list-none flex-col gap-0.5 p-0 text-sm text-fog">
              <li v-for="player in roster[side]" :key="player.sessionId" class="truncate" :class="player.sessionId === mySessionId ? 'font-bold text-sun' : ''">{{ player.name }}</li>
              <li v-if="roster[side].length === 0" class="text-xs text-mist">{{ t('sports.signup.nobody') }}</li>
            </ul>
          </div>
        </div>

        <ul v-else-if="lobby" class="m-0 flex list-none flex-col gap-0.5 p-0 text-sm text-fog">
          <li v-for="player in lobby.players" :key="player.sessionId" class="truncate" :class="player.sessionId === mySessionId ? 'font-bold text-sun' : ''">{{ player.name }}</li>
          <li v-if="lobby.players.length === 0" class="text-xs text-mist">{{ t('sports.signup.nobody') }}</li>
        </ul>

        <p v-if="lobby && !spec && !error" class="m-0 text-xs text-mist">{{ t('sports.signup.loading') }}</p>

        <div class="flex justify-end gap-2">
          <button v-if="me && lobby?.phase !== 'playing'" type="button" class="cc-btn cc-btn-sm cc-btn-coral min-h-11" :disabled="pending" @click="emit('leave')">
            {{ t('sports.signup.leave') }}
          </button>
          <button v-else-if="open" type="button" class="cc-btn cc-btn-sm cc-btn-sun min-h-11" :disabled="!ready" @click="emit('signUp')">
            {{ spec?.teams && team === null ? t('sports.signup.pickTeam') : t('sports.signup.join') }}
          </button>
        </div>
        <p v-if="error" class="m-0 text-xs font-bold text-coral" role="alert">{{ error }}</p>
      </div>
    </section>
  </div>
</template>
