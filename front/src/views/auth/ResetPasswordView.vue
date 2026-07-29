<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { resetPassword } from '../../api/auth'

const route = useRoute()

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

const email = ref(queryString(route.query.email))
const token = ref(queryString(route.query.token))
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

const validLink = computed(() => email.value.length > 0 && token.value.length === 64)

async function submit() {
  if (!validLink.value || loading.value) return
  error.value = ''
  success.value = ''
  if (password.value !== passwordConfirmation.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    const response = await resetPassword(
      email.value,
      token.value,
      password.value,
      passwordConfirmation.value,
    )
    success.value = response.message
    password.value = ''
    passwordConfirmation.value = ''
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not reset your password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-[#11162b] to-violet-950 px-4 py-10">
    <div class="w-full max-w-md rounded-2xl border border-white/15 bg-white p-6 shadow-2xl shadow-black/40 sm:p-8">
      <p class="m-0 text-xs font-bold uppercase tracking-[0.18em] text-purple-600">Account recovery</p>
      <h1 class="m-0 mt-2 text-2xl font-bold text-slate-900">Choose a new password</h1>
      <p class="mb-6 mt-2 text-sm text-slate-600">Use at least eight characters and keep it unique to CampusCove.</p>

      <div
        v-if="!validLink"
        class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        role="alert"
      >
        <p class="m-0 font-semibold">This reset link is incomplete.</p>
        <router-link
          :to="{ name: 'forgot-password' }"
          class="mt-2 inline-flex font-bold text-rose-800 underline underline-offset-2"
        >
          Request a new link
        </router-link>
      </div>

      <div
        v-else-if="success"
        class="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
        role="status"
      >
        <p class="m-0">{{ success }}</p>
        <router-link
          :to="{ name: 'login' }"
          class="mt-3 inline-flex rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
        >
          Continue to sign in
        </router-link>
      </div>

      <form v-else class="flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <label for="reset-password" class="mb-1.5 block text-sm font-medium text-slate-800">New password</label>
          <input
            id="reset-password"
            v-model="password"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
            class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <div>
          <label for="reset-password-confirmation" class="mb-1.5 block text-sm font-medium text-slate-800">
            Confirm new password
          </label>
          <input
            id="reset-password-confirmation"
            v-model="passwordConfirmation"
            type="password"
            minlength="8"
            required
            autocomplete="new-password"
            class="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <p v-if="error" class="m-0 text-sm text-rose-600" role="alert">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="mt-1 w-full rounded-lg border-0 bg-gradient-to-r from-purple-600 to-fuchsia-500 px-4 py-3.5 text-base font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ loading ? 'Updating…' : 'Update password' }}
        </button>
      </form>

      <p class="mb-0 mt-6 text-center text-sm text-slate-600">
        <router-link :to="{ name: 'login' }" class="font-semibold text-purple-600 hover:underline">
          Back to sign in
        </router-link>
      </p>
    </div>
  </div>
</template>
