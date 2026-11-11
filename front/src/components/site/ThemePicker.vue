<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { activeTheme, setTheme } from '../../composables/useTheme'
import { THEME_IDS } from '../../theme/themes'

const { t } = useI18n()
</script>

<template>
  <fieldset class="m-0 grid grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2">
    <legend class="sr-only">{{ t('settings.style') }}</legend>
    <label
      v-for="id in THEME_IDS"
      :key="id"
      :data-theme="id"
      class="cc-world group relative flex cursor-pointer flex-col gap-3 overflow-hidden border border-line/20 p-4 text-fog ring-offset-2 ring-offset-ink-950 has-[:checked]:ring-2 has-[:checked]:ring-sun has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sun"
      :style="{ borderRadius: 'var(--cc-panel-radius)' }"
    >
      <input
        class="sr-only"
        type="radio"
        name="theme"
        :value="id"
        :checked="activeTheme === id"
        @change="setTheme(id)"
      />
      <span class="flex items-start justify-between gap-3">
        <span class="font-display text-2xl leading-none">{{ t(`settings.themes.${id}.name`) }}</span>
        <span
          class="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-line/40 group-has-[:checked]:border-sun group-has-[:checked]:bg-sun"
          aria-hidden="true"
        >
          <span class="hidden h-2 w-2 rounded-full bg-ink-950 group-has-[:checked]:block" />
        </span>
      </span>
      <span class="text-sm text-mist">{{ t(`settings.themes.${id}.description`) }}</span>
      <span class="mt-auto flex flex-wrap items-center gap-3" aria-hidden="true">
        <span class="cc-btn cc-btn-sun cc-btn-sm pointer-events-none">{{ t('settings.stylePreview') }}</span>
        <span class="cc-btn cc-btn-ghost cc-btn-sm pointer-events-none">{{ t('settings.title') }}</span>
        <span class="ml-auto flex gap-1">
          <span class="h-4 w-4 bg-ink-800" />
          <span class="h-4 w-4 bg-sun" />
          <span class="h-4 w-4 bg-mint" />
        </span>
      </span>
    </label>
  </fieldset>
</template>
