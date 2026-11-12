<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { marketing } from '../content/marketing'
import type { Locale } from '../seo/site'
import UiLogo from '../components/ui/UiLogo.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import { activeLayout } from '../composables/useTheme'
import townHero from '../assets/landing/town-hero.webp'

const router = useRouter()
const { t, locale } = useI18n()
const loc = computed(() => locale.value as Locale)
const copy = computed(() => marketing[loc.value])
const hero = computed(() => activeLayout.value.hero)
const fullBleed = computed(() => hero.value !== 'split')

const heroBodyClass = computed(() => ({
  left: 'items-start px-4 pt-[6vh] sm:px-8 sm:pt-[12vh] lg:px-16',
  center: 'items-center justify-center px-4 pb-[8vh] text-center sm:px-8',
  bottom: 'items-end px-4 pb-[10vh] sm:px-8 lg:px-16',
  split: 'items-center px-4 py-10 sm:px-8 lg:px-16',
})[hero.value])

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen w-full bg-ink-950 text-fog">
    <section class="relative isolate flex flex-col overflow-hidden" :class="fullBleed ? 'min-h-svh' : 'cc-world'">
      <template v-if="fullBleed">
        <img
          :src="townHero"
          alt=""
          width="2400"
          height="1350"
          fetchpriority="high"
          class="absolute inset-0 -z-10 h-full w-full object-cover"
          :class="hero === 'center' ? 'object-center' : 'object-[80%_center]'"
        />
        <div class="pointer-events-none absolute inset-0 -z-10 [background:var(--cc-world-pattern)]" />
        <div class="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-gradient-to-b from-ink-950/60 to-transparent" />
        <div
          v-if="hero === 'center'"
          class="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_55%_at_50%_50%,rgb(var(--cc-ink-950)/0.7),rgb(var(--cc-ink-950)/0.2)_75%)]"
        />
        <div
          v-else-if="hero === 'left'"
          class="pointer-events-none absolute inset-y-0 left-0 -z-10 w-3/4 bg-gradient-to-r from-ink-950/80 to-transparent"
        />
        <div
          class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 bg-gradient-to-b from-transparent to-ink-950"
          :class="hero === 'bottom' ? 'h-2/3' : 'h-1/3'"
        />
      </template>

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

      <div class="flex flex-1" :class="heroBodyClass">
        <div :class="hero === 'split' ? 'grid w-full items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14' : ''">
          <div class="max-w-2xl" :class="hero === 'center' ? 'mx-auto' : ''">
            <h1 class="m-0 font-display text-5xl leading-[0.95] text-fog text-balance sm:text-7xl">{{ copy.headline }}</h1>
            <p class="m-0 mt-5 max-w-md text-lg text-fog/85 sm:text-xl" :class="hero === 'center' ? 'mx-auto' : ''">{{ copy.heroLead }}</p>
            <div class="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4" :class="hero === 'center' ? 'justify-center' : ''">
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
          <div v-if="hero === 'split'" class="cc-panel overflow-hidden lg:rotate-1">
            <img
              :src="townHero"
              alt=""
              width="2400"
              height="1350"
              fetchpriority="high"
              class="aspect-[4/3] h-full w-full object-cover object-[80%_center] lg:aspect-auto lg:h-[480px]"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
      <div class="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="f in copy.features" :key="f.title" class="border-t border-line/10 pt-5">
          <UiIcon :name="f.icon" :size="18" :stroke-width="1.75" class="text-mist" />
          <h2 class="m-0 mt-3 text-lg font-semibold text-fog">{{ f.title }}</h2>
          <p class="m-0 mt-1 text-mist">{{ f.body }}</p>
        </article>
      </div>
    </section>

    <section class="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-8" aria-labelledby="faq-title">
      <h2 id="faq-title" class="m-0 font-display text-3xl text-fog sm:text-4xl">{{ copy.faqTitle }}</h2>
      <div class="mt-8 divide-y divide-line/10 border-y border-line/10">
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
