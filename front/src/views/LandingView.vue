<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { marketing } from '../content/marketing'
import type { Locale } from '../seo/site'
import UiLogo from '../components/ui/UiLogo.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import townHero from '../assets/landing/town-hero.webp'

const router = useRouter()
const { t, locale } = useI18n()
const loc = computed(() => locale.value as Locale)
const copy = computed(() => marketing[loc.value])

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen w-full bg-ink-950 text-fog">
    <section class="relative isolate flex min-h-svh flex-col overflow-hidden">
      <img
        :src="townHero"
        alt=""
        width="2400"
        height="1350"
        fetchpriority="high"
        class="absolute inset-0 -z-10 h-full w-full object-cover object-[80%_center]"
      />
      <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-ink-950/60 to-transparent" />
      <div class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/3 bg-gradient-to-b from-transparent to-ink-950" />

      <header class="flex items-center justify-between px-4 py-4 sm:px-8">
        <UiLogo size="sm" />
        <nav :aria-label="t('nav.home')">
          <button
            type="button"
            class="min-h-11 px-2 text-sm font-semibold text-fog transition-colors hover:text-sun"
            @click="signIn"
          >
            {{ t('nav.signIn') }}
          </button>
        </nav>
      </header>

      <div class="flex flex-1 items-start px-4 pt-[6vh] sm:px-8 sm:pt-[12vh] lg:px-16">
        <div class="max-w-xl">
          <h1 class="m-0 font-display text-4xl leading-[1.05] text-fog sm:text-6xl">{{ copy.headline }}</h1>
          <p class="m-0 mt-5 max-w-md text-lg text-fog/85 sm:text-xl">{{ copy.heroLead }}</p>
          <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <button type="button" class="cc-btn cc-btn-sun cc-btn-lg" @click="getStarted">
              <UiIcon name="play" :size="20" fill /> {{ t('landing.playFree') }}
            </button>
            <button
              type="button"
              class="min-h-11 text-base font-semibold text-fog underline-offset-4 transition-colors hover:text-sun hover:underline"
              @click="signIn"
            >
              {{ t('landing.haveAccount') }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
      <div class="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="f in copy.features" :key="f.title" class="border-t border-white/10 pt-5">
          <UiIcon :name="f.icon" :size="18" :stroke-width="1.75" class="text-mist" />
          <h2 class="m-0 mt-3 text-lg font-semibold text-fog">{{ f.title }}</h2>
          <p class="m-0 mt-1 text-mist">{{ f.body }}</p>
        </article>
      </div>
    </section>

    <section class="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-8" aria-labelledby="faq-title">
      <h2 id="faq-title" class="m-0 font-display text-3xl text-fog sm:text-4xl">{{ copy.faqTitle }}</h2>
      <div class="mt-8 divide-y divide-white/10 border-y border-white/10">
        <details v-for="f in copy.faq" :key="f.q" class="group py-4">
          <summary
            class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-semibold text-fog [&::-webkit-details-marker]:hidden"
          >
            {{ f.q }}
            <UiIcon
              name="chevron-down"
              :size="18"
              :stroke-width="1.75"
              class="shrink-0 text-mist transition-transform group-open:rotate-180"
            />
          </summary>
          <p class="m-0 mt-2 max-w-prose text-mist">{{ f.a }}</p>
        </details>
      </div>
    </section>
  </div>
</template>
