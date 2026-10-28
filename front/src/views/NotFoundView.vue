<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../i18n/routes'
import type { Locale } from '../seo/site'

const { t, locale } = useI18n()
</script>

<template>
  <div class="mx-auto grid w-full max-w-lg place-items-center py-16 text-center">
    <p class="cc-display m-0 text-7xl text-sun" aria-hidden="true">404</p>
    <h1 class="cc-display m-0 mt-2 text-3xl">{{ t('notFound.title') }}</h1>
    <p class="m-0 mt-2 font-semibold text-mist">{{ t('notFound.body') }}</p>
    <RouterLink :to="localizedTo('landing', locale as Locale)" class="cc-btn cc-btn-sun cc-btn-lg mt-6">{{ t('notFound.back') }}</RouterLink>
  </div>
</template>
