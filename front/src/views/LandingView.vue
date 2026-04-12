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
  <div class="flex min-h-[calc(100dvh-8rem)] flex-col items-center justify-center px-6 py-16 md:py-24">
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
  </div>
</template>
