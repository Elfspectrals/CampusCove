<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../../i18n/routes'
import type { Locale } from '../../seo/site'
import UiLogo from './UiLogo.vue'
import UiIcon from './UiIcon.vue'
import townHero from '../../assets/landing/town-hero.webp'

defineProps<{
  title: string
  subtitle?: string
}>()
const { t, locale } = useI18n()
</script>

<template>
  <div class="flex min-h-screen w-full bg-ink-950 text-fog">
    <div class="flex w-full flex-col px-4 py-4 sm:px-8 lg:w-1/2 lg:max-w-[640px]">
      <header class="flex items-center justify-between">
        <UiLogo size="sm" />
        <RouterLink
          :to="localizedTo('landing', locale as Locale)"
          class="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-mist transition-colors hover:text-fog"
        >
          <UiIcon name="chevron-left" :size="16" :stroke-width="1.75" /> {{ t('auth.back') }}
        </RouterLink>
      </header>

      <main class="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-12">
        <h1 class="cc-title">{{ title }}</h1>
        <p v-if="subtitle" class="m-0 mt-2 text-mist">{{ subtitle }}</p>
        <div class="mt-8">
          <slot />
        </div>
        <p v-if="$slots.footer" class="m-0 mt-8 text-sm text-mist">
          <slot name="footer" />
        </p>
      </main>
    </div>

    <div class="relative hidden flex-1 lg:block">
      <img :src="townHero" alt="" width="2400" height="1350" class="absolute inset-0 h-full w-full object-cover object-right" />
    </div>
  </div>
</template>
