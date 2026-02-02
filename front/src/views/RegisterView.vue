<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import * as authApi from '../api/auth'

const router = useRouter()
const email = ref('')
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  if (password.value !== passwordConfirmation.value) {
    error.value = 'Passwords do not match'
    return
  }
  loading.value = true
  try {
    const res = await authApi.register(
      email.value,
      username.value,
      password.value,
      passwordConfirmation.value
    )
    authApi.storeAuth(res.user, res.token)
    router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-orange-500">
    <div class="w-full max-w-[420px] rounded-2xl bg-white shadow-xl p-8">
      <router-link
        :to="{ name: 'landing' }"
        class="inline-flex items-center gap-1 text-gray-700 hover:text-gray-900 text-sm font-medium mb-6"
      >
        <span aria-hidden="true">←</span> Back
      </router-link>

      <div class="flex flex-col items-center mb-6">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-12 h-12 rounded-xl bg-purple-600 flex items-center justify-center">
            <svg class="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4zm0 12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h4zm8-8a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2zm0 12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h2z" />
            </svg>
          </div>
          <span class="text-xl font-bold text-gray-900">CampusCove</span>
        </div>
        <h1 class="m-0 text-2xl font-bold text-gray-900">Create Your Account</h1>
        <p class="m-0 mt-1 text-sm text-gray-500">Join the virtual campus</p>
      </div>

      <form @submit.prevent="submit" class="flex flex-col gap-4">
        <div>
          <label for="reg-username" class="block text-sm font-medium text-gray-800 mb-1.5">Username</label>
          <input
            id="reg-username"
            v-model="username"
            type="text"
            placeholder="Enter username"
            required
            minlength="3"
            maxlength="24"
            pattern="[a-zA-Z0-9_]+"
            autocomplete="username"
            title="Letters, numbers and underscore only (3–24 characters)"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <div>
          <label for="reg-email" class="block text-sm font-medium text-gray-800 mb-1.5">Email</label>
          <input
            id="reg-email"
            v-model="email"
            type="email"
            placeholder="Enter email"
            required
            autocomplete="email"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <div>
          <label for="reg-password" class="block text-sm font-medium text-gray-800 mb-1.5">Password</label>
          <input
            id="reg-password"
            v-model="password"
            type="password"
            placeholder="Enter password"
            required
            minlength="8"
            autocomplete="new-password"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <div>
          <label for="reg-confirm" class="block text-sm font-medium text-gray-800 mb-1.5">Confirm password</label>
          <input
            id="reg-confirm"
            v-model="passwordConfirmation"
            type="password"
            placeholder="Confirm password"
            required
            autocomplete="new-password"
            class="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-[15px] text-gray-900 placeholder:text-gray-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>

        <p v-if="error" class="m-0 text-sm text-red-600">{{ error }}</p>

        <button
          type="submit"
          :disabled="loading"
          class="mt-1 w-full rounded-lg border-0 px-4 py-3.5 text-[15px] font-semibold text-white bg-gradient-to-r from-purple-600 to-fuchsia-500 hover:opacity-95 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 transition-opacity"
        >
          {{ loading ? 'Creating account…' : 'Create Account' }}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-700">
        Already have an account?
        <router-link :to="{ name: 'login' }" class="text-purple-600 font-semibold hover:underline ml-1">Sign in</router-link>
      </p>
    </div>
  </div>
</template>
