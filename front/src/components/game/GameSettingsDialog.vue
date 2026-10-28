<script setup lang="ts">
/** Settings opened from the pause screen, so the player can change keys without leaving the game. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KeybindingSettings from '../site/KeybindingSettings.vue'
import UiIcon from '../ui/UiIcon.vue'
import { useDialogFocus } from '../../composables/useDialogFocus'

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
        <h2 id="game-settings-title" class="cc-display m-0 text-2xl">{{ t('settings.controls') }}</h2>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" :aria-label="t('settings.close')" @click="emit('close')">
          <UiIcon name="x" :size="16" />
        </button>
      </div>
      <div class="mt-2">
        <KeybindingSettings />
      </div>
    </section>
  </div>
</template>
