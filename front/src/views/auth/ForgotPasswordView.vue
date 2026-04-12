<script setup lang="ts">
import { ref } from 'vue'
import * as authApi from '../../api/auth'

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
  <div class="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[420px] flex-col justify-center px-4 py-10">
    <div class="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
      <h2 class="m-0 mb-1 text-2xl font-bold text-slate-900">Reset password</h2>
      <p class="mb-6 text-sm text-slate-600">We’ll email you a link if an account exists.</p>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <label for="forgot-email" class="mb-1.5 block text-sm font-medium text-slate-800">Email</label>
          <input
            id="forgot-email"
            v-model="email"
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
            class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-[15px] text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <p v-if="error" class="m-0 text-sm text-red-600">{{ error }}</p>
        <p v-if="success" class="m-0 text-sm text-emerald-700">{{ success }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="mt-1 w-full rounded-lg border-0 bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 py-3.5 text-[15px] font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ loading ? 'Sending…' : 'Send reset link' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-slate-600">
        <router-link :to="{ name: 'login' }" class="font-semibold text-purple-600 hover:underline">Back to sign in</router-link>
      </p>
    </div>
  </div>
</template>
