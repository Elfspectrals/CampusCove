<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { marketing } from '../content/marketing'
import { localizedTo } from '../i18n/routes'
import type { Locale } from '../seo/site'
import UiTitleScreen from '../components/ui/UiTitleScreen.vue'
import UiLogo from '../components/ui/UiLogo.vue'
import UiIcon from '../components/ui/UiIcon.vue'

const router = useRouter()
const { t, locale } = useI18n()
const loc = computed(() => locale.value as Locale)
const copy = computed(() => marketing[loc.value])

const tones = ['text-pool', 'text-sun', 'text-grape', 'text-mint', 'text-coral', 'text-pool']

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}
</script>

<template>
  <UiTitleScreen>
    <div class="flex items-center justify-between px-4 py-4 sm:px-8">
      <UiLogo size="sm" />
      <nav class="flex items-center gap-2" :aria-label="t('nav.home')">
        <RouterLink :to="localizedTo('how-to-play', loc)" class="hidden font-display text-sm uppercase tracking-wide text-mist hover:text-fog sm:inline">
          {{ t('nav.howToPlay') }}
        </RouterLink>
        <RouterLink :to="localizedTo('shop-skin', loc)" class="hidden px-2 font-display text-sm uppercase tracking-wide text-mist hover:text-fog sm:inline">
          {{ t('nav.shop') }}
        </RouterLink>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="signIn">{{ t('nav.signIn') }}</button>
      </nav>
    </div>

    <section class="flex flex-1 flex-col items-center justify-center px-6 pb-16 pt-8 text-center">
      <span class="cc-chip cc-chip-sun mb-6 animate-cc-pop">
        <UiIcon name="sparkles" :size="14" /> {{ copy.heroBadge }}
      </span>
      <h1 class="m-0">
        <UiLogo size="xl" class="animate-cc-pop" aria-hidden="true" />
        <span class="sr-only">{{ copy.heroTitle }}</span>
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-lg font-semibold text-fog/85 sm:text-xl">
        {{ copy.heroLead }}
      </p>
      <div class="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine" @click="getStarted">
          <UiIcon name="play" :size="26" fill /> {{ t('landing.playFree') }}
        </button>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-lg" @click="signIn">
          {{ t('landing.haveAccount') }}
        </button>
      </div>

      <div class="mt-20 grid w-full max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="(f, i) in copy.features" :key="f.title" class="cc-panel-glass p-5 text-left">
          <span :class="['mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-950/70', tones[i % tones.length]]">
            <UiIcon :name="f.icon" :size="22" />
          </span>
          <h2 class="cc-display m-0 text-xl text-fog">{{ f.title }}</h2>
          <p class="m-0 mt-1 text-sm font-semibold text-mist">{{ f.body }}</p>
        </article>
      </div>

      <section class="mt-16 w-full max-w-3xl text-left" aria-labelledby="faq-title">
        <h2 id="faq-title" class="cc-display m-0 text-center text-3xl text-fog">{{ copy.faqTitle }}</h2>
        <div class="mt-6 flex flex-col gap-3">
          <details v-for="f in copy.faq" :key="f.q" class="cc-panel-glass group p-4">
            <summary class="cursor-pointer list-none font-extrabold text-fog marker:hidden">
              <span class="mr-2 inline-block text-sun transition-transform group-open:rotate-45" aria-hidden="true">+</span>{{ f.q }}
            </summary>
            <p class="m-0 mt-2 font-semibold text-mist">{{ f.a }}</p>
          </details>
        </div>
        <p class="mt-6 text-center">
          <RouterLink :to="localizedTo('how-to-play', loc)" class="font-extrabold text-sun hover:underline">{{ t('landing.howToPlay') }} →</RouterLink>
        </p>
      </section>
    </section>
  </UiTitleScreen>
</template>
