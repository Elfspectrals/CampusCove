<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

function getStarted() {
  router.push({ name: 'register' })
}

function signIn() {
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-white">
    <!-- Header (Figma node 2-3): white bar, logo left, Get Started right, bottom border -->
    <header class="flex items-center justify-between px-6 py-4 md:px-8 md:py-5 border-b border-gray-200">
      <router-link to="/" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shrink-0">
          <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4zm0 12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4zm8-8a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2zm0 12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h2z" />
          </svg>
        </div>
        <span class="text-xl font-bold text-gray-900 tracking-tight">CampusCove</span>
      </router-link>
      <div class="flex items-center gap-4">
        <button
          type="button"
          class="text-gray-600 hover:text-gray-900 font-medium text-sm"
          @click="signIn"
        >
          Sign in
        </button>
        <button
          type="button"
          class="rounded-full bg-purple-600 px-5 py-2.5 text-white font-semibold text-sm hover:bg-purple-500 transition-colors"
          @click="getStarted"
        >
          Get Started
        </button>
      </div>
    </header>

    <!-- Hero: optional content below header so page isn’t empty -->
    <main class="flex-1 flex flex-col items-center justify-center px-6 py-16 md:py-24">
      <h1 class="m-0 text-4xl md:text-5xl font-bold text-gray-900 text-center tracking-tight max-w-2xl">
        Your virtual campus
      </h1>
      <p class="mt-4 text-lg text-gray-600 text-center max-w-xl">
        Explore, meet others, and customize your space. Join CampusCove to get started.
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-4">
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
    </main>
  </div>
</template>
