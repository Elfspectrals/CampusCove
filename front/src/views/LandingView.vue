<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import UiTitleScreen from '../components/ui/UiTitleScreen.vue'
import UiLogo from '../components/ui/UiLogo.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import type { UiIconName } from '../components/ui/icons'

const router = useRouter()

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}

const features: Array<{ icon: UiIconName; title: string; body: string; tone: string }> = [
  { icon: 'map', title: 'Explore the town', body: 'Roam a living campus town with friends in real time.', tone: 'text-pool' },
  { icon: 'home', title: 'Own your loft', body: 'Rent or buy an apartment and furnish it piece by piece.', tone: 'text-sun' },
  { icon: 'shirt', title: 'Dress to impress', body: 'Unlock skins and build a look nobody else has.', tone: 'text-grape' },
]
</script>

<template>
  <UiTitleScreen>
    <div class="flex items-center justify-between px-4 py-4 sm:px-8">
      <UiLogo size="sm" />
      <div class="flex items-center gap-2">
        <RouterLink :to="{ name: 'shop-skin' }" class="hidden font-display text-sm uppercase tracking-wide text-mist hover:text-fog sm:inline">Shop</RouterLink>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="signIn">Sign in</button>
      </div>
    </div>

    <section class="flex flex-1 flex-col items-center justify-center px-6 pb-24 pt-8 text-center">
      <span class="cc-chip cc-chip-sun mb-6 animate-cc-pop">
        <UiIcon name="sparkles" :size="14" /> Season 1 · New Nation is live
      </span>
      <UiLogo size="xl" class="animate-cc-pop" />
      <p class="mx-auto mt-6 max-w-xl text-lg font-semibold text-fog/85 sm:text-xl">
        Your virtual campus. Hang out, build your space and meet people — all in one cozy 3D town.
      </p>
      <div class="mt-10 flex flex-wrap items-center justify-center gap-4">
        <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine" @click="getStarted">
          <UiIcon name="play" :size="26" fill /> Play free
        </button>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-lg" @click="signIn">
          I have an account
        </button>
      </div>

      <div class="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        <article v-for="f in features" :key="f.title" class="cc-panel-glass p-5 text-left">
          <span :class="['mb-3 grid h-11 w-11 place-items-center rounded-xl bg-ink-950/70', f.tone]">
            <UiIcon :name="f.icon" :size="22" />
          </span>
          <h2 class="cc-display m-0 text-xl text-fog">{{ f.title }}</h2>
          <p class="m-0 mt-1 text-sm font-semibold text-mist">{{ f.body }}</p>
        </article>
      </div>
    </section>
  </UiTitleScreen>
</template>
