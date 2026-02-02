<script setup lang="ts">
import { ref } from 'vue'
import * as authApi from '../api/auth'

const email = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  success.value = ''
  loading.value = true
  try {
    await authApi.forgotPassword(email.value)
    success.value = 'If an account exists with that email, you’ll receive a reset link.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col md:flex-row">
    <div class="min-h-[220px] md:min-h-screen md:w-1/2 flex flex-col justify-center px-8 py-12 md:px-14 md:py-16 bg-gradient-to-br from-campus-dark via-campus-navy to-campus-blue">
      <h1 class="m-0 text-3xl md:text-4xl font-bold text-campus-accent tracking-tight">CampusCove</h1>
      <p class="mt-3 text-base text-white/70 max-w-sm">Reset your password to get back into your account.</p>
    </div>
    <div class="min-h-screen flex flex-col justify-center px-6 py-10 md:px-14 md:py-16 bg-campus-dark md:bg-campus-navy/60">
      <div class="w-full max-w-[400px] mx-auto">
        <h2 class="m-0 mb-1 text-2xl font-bold text-campus-accent tracking-tight">Reset password</h2>
        <p class="mb-6 text-sm text-white/60">Reset your password</p>

        <form @submit.prevent="submit" class="flex flex-col gap-4">
          <label for="forgot-email" class="block text-sm font-medium text-white/80 mb-1">Email</label>
          <input
            id="forgot-email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
            class="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3.5 text-base text-white placeholder:text-white/40 focus:border-campus-accent focus:outline-none focus:ring-2 focus:ring-campus-accent/30"
          />
          <p v-if="error" class="m-0 text-sm text-red-400">{{ error }}</p>
          <p v-if="success" class="m-0 text-sm text-emerald-400">{{ success }}</p>
          <button
            type="submit"
            :disabled="loading"
            class="mt-1 w-full rounded-xl border-0 px-4 py-3.5 text-base font-semibold bg-campus-accent text-white hover:opacity-90 hover:shadow-lg hover:shadow-campus-accent/20 transition-all disabled:cursor-not-allowed disabled:opacity-70"
          >
            {{ loading ? 'Sending…' : 'Send reset link' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-white/70">
          <router-link :to="{ name: 'login' }" class="text-campus-accent font-medium hover:underline">Back to sign in</router-link>
        </p>
      </div>
    </div>
  </div>
</template>
