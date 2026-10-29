<script setup lang="ts">
/** Settings opened from the pause screen, so the player can change keys without leaving the game. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KeybindingSettings from '../site/KeybindingSettings.vue'
import UiIcon from '../ui/UiIcon.vue'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { comfortSettings, setComfortFov, setReduceCameraMotion } from '../../composables/game/useComfortSettings'
import { MAX_FOV, MIN_FOV } from '../../game/comfort'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl, { onEscape: () => emit('close') })
</script>

<template>
  <div class="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-ink-950/75 p-4 backdrop-blur-sm" @click.self="emit('close')">
    <section
      ref="dialogEl"
      class="cc-panel max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto p-5 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-settings-title"
    >
      <div class="flex items-start justify-between gap-3">
        <h2 id="game-settings-title" class="cc-display m-0 text-2xl">{{ t('settings.title') }}</h2>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" :aria-label="t('settings.close')" @click="emit('close')">
          <UiIcon name="x" :size="16" />
        </button>
      </div>
      <section class="mt-3" aria-labelledby="game-comfort-title">
        <h3 id="game-comfort-title" class="m-0 mb-1 text-sm font-extrabold text-fog">{{ t('settings.comfort') }}</h3>
        <p class="m-0 text-sm font-semibold text-mist">{{ t('settings.comfortIntro') }}</p>
        <label class="mt-3 flex min-h-11 items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
          <span class="min-w-0 shrink-0 text-sm font-bold text-mist">{{ t('settings.fov') }}</span>
          <input
            type="range"
            class="min-w-0 flex-1 accent-sun"
            :min="MIN_FOV"
            :max="MAX_FOV"
            step="1"
            :value="comfortSettings.fov"
            @input="setComfortFov(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="w-10 shrink-0 text-right font-mono text-sm text-fog">{{ t('settings.fovValue', { n: comfortSettings.fov }) }}</span>
        </label>
        <label class="mt-1.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
          <input
            type="checkbox"
            class="size-4 shrink-0 accent-sun"
            :checked="comfortSettings.reduceCameraMotion"
            @change="setReduceCameraMotion(($event.target as HTMLInputElement).checked)"
          />
          <span class="min-w-0 text-sm font-bold text-mist">{{ t('settings.reduceCameraMotion') }}</span>
        </label>
      </section>
      <div class="mt-5">
        <h3 class="m-0 mb-1 text-sm font-extrabold text-fog">{{ t('settings.controls') }}</h3>
        <KeybindingSettings />
      </div>
    </section>
  </div>
</template>
