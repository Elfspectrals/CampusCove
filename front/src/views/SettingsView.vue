<script setup lang="ts">
/** Player settings for this browser. Today: the game controls. */
import { useI18n } from 'vue-i18n'
import KeybindingSettings from '../components/site/KeybindingSettings.vue'
import ThemePicker from '../components/site/ThemePicker.vue'

const { t } = useI18n()
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <h1 class="cc-title">{{ t('settings.title') }}</h1>
    <section class="mt-6" aria-labelledby="settings-style">
      <h2 id="settings-style" class="m-0 text-lg font-semibold">{{ t('settings.style') }}</h2>
      <p class="m-0 mt-1 text-sm text-mist">{{ t('settings.styleIntro') }}</p>
      <div class="mt-4">
        <ThemePicker />
      </div>
    </section>
    <section class="mt-6 cc-panel p-5 sm:p-6" aria-labelledby="settings-controls">
      <h2 id="settings-controls" class="m-0 text-lg font-semibold">{{ t('settings.controls') }}</h2>
      <div class="mt-2">
        <KeybindingSettings />
      </div>
    </section>
  </div>
</template>
