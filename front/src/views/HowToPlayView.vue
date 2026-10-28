<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { marketing } from '../content/marketing'
import type { Locale } from '../seo/site'
import UiIcon from '../components/ui/UiIcon.vue'

const { t, locale } = useI18n()
const copy = computed(() => marketing[locale.value as Locale].howTo)
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <header class="mb-6">
      <h1 class="cc-display m-0 text-3xl sm:text-4xl">{{ copy.title }}</h1>
      <p class="m-0 mt-2 font-semibold text-mist">{{ copy.lead }}</p>
    </header>

    <ol class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="(step, i) in copy.steps" :key="step.title" class="cc-panel flex gap-4 p-5">
        <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sun font-display text-xl text-ink-950" aria-hidden="true">{{ i + 1 }}</span>
        <div>
          <h2 class="cc-display m-0 text-xl">{{ step.title }}</h2>
          <p class="m-0 mt-1 font-semibold text-fog/85">{{ step.body }}</p>
        </div>
      </li>
    </ol>

    <section class="cc-panel mt-6 p-5">
      <h2 class="cc-display m-0 text-xl">{{ copy.controlsTitle }}</h2>
      <ul class="m-0 mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
        <li v-for="c in copy.controls" :key="c" class="cc-panel-flat px-3 py-2 font-mono text-sm">{{ c }}</li>
      </ul>
    </section>

    <div class="mt-8 flex justify-center">
      <RouterLink :to="{ name: 'register' }" class="cc-btn cc-btn-sun cc-btn-lg">
        <UiIcon name="play" fill /> {{ t('landing.playFree') }}
      </RouterLink>
    </div>
  </div>
</template>
