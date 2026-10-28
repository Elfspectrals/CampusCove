<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../../i18n/routes'
import type { Locale } from '../../seo/site'
import UiTitleScreen from './UiTitleScreen.vue'
import UiLogo from './UiLogo.vue'
import UiIcon from './UiIcon.vue'

defineProps<{
  title: string
  subtitle?: string
}>()
const { t, locale } = useI18n()
</script>

<template>
  <UiTitleScreen>
    <div class="flex flex-1 items-center justify-center px-4 py-10">
      <div class="w-full max-w-[440px] animate-cc-pop">
        <div class="mb-6 flex items-center justify-between">
          <RouterLink :to="localizedTo('landing', locale as Locale)" class="cc-btn cc-btn-ghost cc-btn-sm">
            <UiIcon name="chevron-left" :size="16" /> {{ t('auth.back') }}
          </RouterLink>
          <UiLogo size="sm" />
        </div>
        <div class="cc-panel overflow-hidden">
          <div class="h-2 bg-[linear-gradient(90deg,rgb(var(--cc-sun)),rgb(var(--cc-coral)),rgb(var(--cc-grape)),rgb(var(--cc-pool)))]" />
          <div class="p-7 sm:p-8">
            <h1 class="cc-title text-center">{{ title }}</h1>
            <p v-if="subtitle" class="m-0 mt-1 text-center text-sm font-semibold text-mist">{{ subtitle }}</p>
            <div class="mt-7">
              <slot />
            </div>
          </div>
          <div v-if="$slots.footer" class="border-t-2 border-ink-600/50 bg-ink-950/40 px-7 py-4 text-center text-sm font-semibold text-mist">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </div>
  </UiTitleScreen>
</template>
