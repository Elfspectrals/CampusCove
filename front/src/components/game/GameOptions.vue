<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KeybindingSettings from '../site/KeybindingSettings.vue'
import ThemePicker from '../site/ThemePicker.vue'
import GameOptionRow from './GameOptionRow.vue'
import GameVoiceSettings from './GameVoiceSettings.vue'
import { comfortSettings, setComfortFov, setReduceCameraMotion } from '../../composables/game/useComfortSettings'
import { gameOptions, setMouseSensitivity, setOptionFlag, setVolume } from '../../composables/game/useGameOptions'
import { resumeTheTutorial, tutorial } from '../../composables/game/useTutorial'
import { actionKeyLabels, type BindableAction } from '../../config/keybindings'
import { MAX_FOV, MIN_FOV } from '../../game/comfort'
import { type GraphicsQuality, getGraphicsQuality, getRenderOverrides, setGraphicsQuality, setRenderOverride } from '../../game/graphicsQuality'
import { RENDER_KEYS, SENSITIVITY, isCustomRender, renderSettingsOf, type RenderKey } from '../../game/options'
import { setLocale } from '../../i18n'
import { LOCALES, type Locale } from '../../seo/site'

defineProps<{ reducedEffects: boolean }>()
const emit = defineEmits<{ toggleReducedEffects: [] }>()

const TABS = ['mouse', 'audio', 'graphics', 'interface', 'controls', 'voice'] as const
const QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high']
const VOLUMES = ['masterVolume', 'effectsVolume', 'musicVolume'] as const
const SPORT_HELP = ['football', 'basketball', 'tennis', 'tennisCove', 'boxing', 'boxingBag', 'skating', 'running', 'climbing'] as const

const { t, locale } = useI18n()
const tab = ref<(typeof TABS)[number]>('mouse')
const help = ref('')
const quality = ref(getGraphicsQuality())
const overrides = ref(getRenderOverrides())
const applied = JSON.stringify([quality.value, overrides.value])
const render = computed(() => renderSettingsOf(quality.value, overrides.value))
const custom = computed(() => isCustomRender(quality.value, overrides.value))
const graphicsChanged = computed(() => JSON.stringify([quality.value, overrides.value]) !== applied)
const resumeError = ref<string | null>(null)

function pickTab(next: (typeof TABS)[number]): void {
  tab.value = next
  help.value = ''
}

function pickQuality(next: GraphicsQuality): void {
  setGraphicsQuality(next)
  quality.value = next
  overrides.value = {}
}

function setRender(key: RenderKey, value: boolean): void {
  setRenderOverride(key, value)
  overrides.value = getRenderOverrides()
}

function reload(): void {
  window.location.reload()
}

async function resume(): Promise<void> {
  resumeError.value = null
  try {
    await resumeTheTutorial()
  } catch (error) {
    resumeError.value = error instanceof Error ? error.message : String(error)
  }
}

function keyOf(action: BindableAction): string {
  return actionKeyLabels(action)[0] ?? ''
}

const sportHelp = computed(() =>
  SPORT_HELP.map((sport) => ({
    sport,
    text: t(`options.sports.${sport}`, { tackle: actionKeyLabels('sportsTackle').join(' / '), through: keyOf('sportsThrough'), jockey: keyOf('sportsJockey'), view: keyOf('cameraView'), guard: keyOf('cook'), jump: keyOf('jump') }),
  })),
)
</script>

<template>
  <section class="flex min-h-0 flex-col gap-4 p-4 sm:p-8" :aria-label="t('options.title')">
    <div class="flex flex-wrap gap-2" role="tablist">
      <button
        v-for="name in TABS"
        :key="name"
        type="button"
        role="tab"
        class="cc-btn cc-btn-sm min-h-11"
        :class="tab === name ? 'cc-btn-sun' : 'cc-btn-ghost'"
        :aria-selected="tab === name"
        @click="pickTab(name)"
      >
        {{ t(`options.tabs.${name}`) }}
      </button>
    </div>

    <div class="cc-panel flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-5" role="tabpanel">
      <template v-if="tab === 'mouse'">
        <GameOptionRow :label="t('options.mouse.sensitivity')" :help="t('options.mouse.sensitivityHelp')" @describe="help = $event">
          <input type="range" class="min-w-0 flex-1 accent-sun" :min="SENSITIVITY.min" :max="SENSITIVITY.max" :step="SENSITIVITY.step" :value="gameOptions.mouseSensitivity" @input="setMouseSensitivity(Number(($event.target as HTMLInputElement).value))" />
          <span class="w-12 shrink-0 text-right font-mono text-sm text-fog">{{ gameOptions.mouseSensitivity.toFixed(1) }}</span>
        </GameOptionRow>
        <GameOptionRow :label="t('options.mouse.invertY')" :help="t('options.mouse.invertYHelp')" @describe="help = $event">
          <input type="checkbox" class="size-5 accent-sun" :checked="gameOptions.invertY" @change="setOptionFlag('invertY', ($event.target as HTMLInputElement).checked)" />
        </GameOptionRow>
        <GameOptionRow :label="t('settings.fov')" :help="t('options.mouse.fovHelp')" @describe="help = $event">
          <input type="range" class="min-w-0 flex-1 accent-sun" :min="MIN_FOV" :max="MAX_FOV" step="1" :value="comfortSettings.fov" @input="setComfortFov(Number(($event.target as HTMLInputElement).value))" />
          <span class="w-12 shrink-0 text-right font-mono text-sm text-fog">{{ t('settings.fovValue', { n: comfortSettings.fov }) }}</span>
        </GameOptionRow>
        <GameOptionRow :label="t('settings.reduceCameraMotion')" :help="t('options.mouse.cameraMotionHelp')" @describe="help = $event">
          <input type="checkbox" class="size-5 accent-sun" :checked="comfortSettings.reduceCameraMotion" @change="setReduceCameraMotion(($event.target as HTMLInputElement).checked)" />
        </GameOptionRow>
      </template>

      <template v-else-if="tab === 'audio'">
        <GameOptionRow v-for="key in VOLUMES" :key="key" :label="t(`options.audio.${key}`)" :help="t(`options.audio.${key}Help`)" @describe="help = $event">
          <input type="range" class="min-w-0 flex-1 accent-sun" min="0" max="1" step="0.05" :value="gameOptions[key]" @input="setVolume(key, Number(($event.target as HTMLInputElement).value))" />
          <span class="w-12 shrink-0 text-right font-mono text-sm text-fog">{{ Math.round(gameOptions[key] * 100) }} %</span>
        </GameOptionRow>
        <p class="m-0 px-1 text-xs text-mist">{{ t('options.audio.voiceNote') }}</p>
      </template>

      <template v-else-if="tab === 'graphics'">
        <GameOptionRow :label="t('options.graphics.quality')" :help="t('options.graphics.qualityHelp')" @describe="help = $event">
          <span class="flex flex-wrap justify-end gap-2">
            <button v-for="q in QUALITIES" :key="q" type="button" class="cc-btn cc-btn-sm min-h-11" :class="quality === q && !custom ? 'cc-btn-sun' : 'cc-btn-ghost'" :aria-pressed="quality === q && !custom" @click="pickQuality(q)">
              {{ t(`options.graphics.qualities.${q}`) }}
            </button>
            <span v-if="custom" class="self-center text-xs font-bold text-sun">{{ t('options.graphics.custom') }}</span>
          </span>
        </GameOptionRow>
        <GameOptionRow v-for="key in RENDER_KEYS" :key="key" :label="t(`options.graphics.${key}`)" :help="t(`options.graphics.${key}Help`)" @describe="help = $event">
          <input type="checkbox" class="size-5 accent-sun" :checked="render[key]" @change="setRender(key, ($event.target as HTMLInputElement).checked)" />
        </GameOptionRow>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-3 px-1">
          <p class="m-0 text-xs text-mist">{{ t('options.graphics.reloadNote') }}</p>
          <button type="button" class="cc-btn cc-btn-sun cc-btn-sm min-h-11" :disabled="!graphicsChanged" @click="reload">{{ t('options.graphics.apply') }}</button>
        </div>
      </template>

      <template v-else-if="tab === 'interface'">
        <GameOptionRow :label="t('options.interface.language')" :help="t('options.interface.languageHelp')" @describe="help = $event">
          <span class="flex gap-2">
            <button v-for="code in LOCALES" :key="code" type="button" class="cc-btn cc-btn-sm min-h-11 uppercase" :class="locale === code ? 'cc-btn-sun' : 'cc-btn-ghost'" :aria-pressed="locale === code" @click="setLocale(code as Locale)">
              {{ code }}
            </button>
          </span>
        </GameOptionRow>
        <GameOptionRow :label="t('options.interface.coordinates')" :help="t('options.interface.coordinatesHelp')" @describe="help = $event">
          <input type="checkbox" class="size-5 accent-sun" :checked="gameOptions.showCoordinates" @change="setOptionFlag('showCoordinates', ($event.target as HTMLInputElement).checked)" />
        </GameOptionRow>
        <GameOptionRow :label="t('options.interface.reducedEffects')" :help="t('options.interface.reducedEffectsHelp')" @describe="help = $event">
          <input type="checkbox" class="size-5 accent-sun" :checked="reducedEffects" @change="emit('toggleReducedEffects')" />
        </GameOptionRow>
        <div class="mt-3">
          <h3 class="m-0 mb-1 text-sm font-extrabold text-fog">{{ t('settings.style') }}</h3>
          <p class="m-0 mb-3 text-sm font-semibold text-mist">{{ t('settings.styleIntro') }}</p>
          <ThemePicker />
        </div>
        <div v-if="tutorial?.status === 'skipped'" class="mt-3">
          <h3 class="m-0 mb-1 text-sm font-extrabold text-fog">{{ t('tutorial.settingsTitle') }}</h3>
          <p class="m-0 text-sm font-semibold text-mist">{{ t('tutorial.settingsIntro') }}</p>
          <button type="button" class="cc-btn cc-btn-sm mt-3 min-h-11" @click="resume">{{ t('tutorial.resume') }}</button>
          <p v-if="resumeError" class="m-0 mt-2 text-sm font-bold text-coral" role="alert">{{ resumeError }}</p>
        </div>
      </template>

      <template v-else-if="tab === 'controls'">
        <KeybindingSettings />
        <h3 class="m-0 mt-4 text-sm font-extrabold text-fog">{{ t('options.sports.title') }}</h3>
        <dl class="m-0 flex flex-col gap-2">
          <div v-for="row in sportHelp" :key="row.sport" class="rounded-xl bg-ink-950/50 px-4 py-2">
            <dt class="text-sm font-bold text-fog">{{ t(`options.sports.names.${row.sport}`) }}</dt>
            <dd class="m-0 text-sm text-mist">{{ row.text }}</dd>
          </div>
        </dl>
      </template>

      <GameVoiceSettings v-else />
    </div>

    <p class="m-0 min-h-5 px-1 text-sm text-mist" aria-live="polite">{{ help }}</p>
  </section>
</template>
