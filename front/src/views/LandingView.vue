<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'

useHead({
  title: 'CampusCove | Ton Campus Virtuel 3D & Social',
  meta: [
    {
      name: 'description',
      content: `Découvre CampusCove, l'expérience immersive pour explorer ton campus en 3D, rencontrer des étudiants et personnaliser ton avatar. Rejoins la communauté !`,
    },
    {
      name: 'keywords',
      content: 'campus virtuel, 3D, jeu social, étudiant, avatar, multijoueur, ESGI',
    },
    {
      property: 'og:title',
      content: 'CampusCove | Ton Campus Virtuel 3D & Social',
    },
    {
      property: 'og:description',
      content: `Découvre CampusCove, l'expérience immersive pour explorer ton campus en 3D, rencontrer des étudiants et personnaliser ton avatar.`,
    },
    {
      property: 'og:type',
      content: 'website',
    },
    {
      property: 'og:image',
      content: '/mockups/locker-desktop.svg',
    },
    {
      name: 'twitter:card',
      content: 'summary_large_image',
    },
    {
      name: 'twitter:title',
      content: 'CampusCove | Ton Campus Virtuel 3D & Social',
    },
    {
      name: 'twitter:description',
      content: `Découvre CampusCove, l'expérience immersive pour explorer ton campus en 3D, rencontrer des étudiants et personnaliser ton avatar.`,
    },
    {
      name: 'twitter:image',
      content: '/mockups/locker-desktop.svg',
    },
  ],
})

const router = useRouter()

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}
</script>

<template>
  <main class="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 py-16 md:py-24">
    <section class="max-w-2xl text-center">
      <header class="space-y-6">
        <h1 class="m-0 text-4xl md:text-5xl font-bold text-gray-900 tracking-tight">
          Your virtual campus
        </h1>
        <p class="text-lg text-gray-600">
          Explore, meet others, and customize your space. Join CampusCove to get started.
        </p>
      </header>

      <div
        class="mt-8 flex flex-wrap items-center justify-center gap-4"
        role="group"
        aria-label="Actions de la page d'accueil"
      >
        <button
          type="button"
          class="rounded-full bg-purple-600 px-8 py-3 text-white font-semibold hover:bg-purple-500 transition-colors"
          @click="getStarted"
        >
          Get Started
        </button>
        <button
          type="button"
          class="rounded-full border-2 border-gray-300 px-8 py-3 text-gray-700 font-semibold hover:border-purple-600 hover:text-purple-600 transition-colors"
          @click="signIn"
        >
          Sign in
        </button>
      </div>
    </section>
  </main>
</template>
