<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import * as authApi from '../api/auth'
const router = useRouter()
const mode = ref<'login' | 'register'>('login')
const email = ref('')
const pseudo = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (mode.value === 'register') {
      if (password.value !== passwordConfirmation.value) {
        error.value = 'Passwords do not match'
        return
      }
      const res = await authApi.register(
        email.value,
        pseudo.value,
        password.value,
        passwordConfirmation.value
      )
      authApi.storeAuth(res.user, res.token)
    } else {
      const res = await authApi.login(email.value, password.value)
      authApi.storeAuth(res.user, res.token)
    }
    router.push({ name: 'game' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}

function toggleMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = ''
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-campus-dark via-campus-navy to-campus-blue">
    <div class="w-full max-w-[360px] rounded-2xl border border-white/10 bg-white/5 p-8">
      <h1 class="m-0 mb-1 text-[1.75rem] font-semibold text-campus-accent">CampusCove</h1>
      <p class="mb-6 text-sm text-white/60">
        {{ mode === 'login' ? 'Sign in' : 'Create account' }}
      </p>

      <form @submit.prevent="submit" class="flex flex-col gap-3">
        <input
          v-model="email"
          type="email"
          placeholder="Email"
          required
          autocomplete="email"
          class="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-campus-accent focus:outline-none"
        />
        <input
          v-if="mode === 'register'"
          v-model="pseudo"
          type="text"
          placeholder="Pseudo"
          required
          minlength="2"
          maxlength="50"
          autocomplete="username"
          class="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-campus-accent focus:outline-none"
        />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          required
          :minlength="mode === 'register' ? 8 : undefined"
          autocomplete="current-password"
          class="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-campus-accent focus:outline-none"
        />
        <input
          v-if="mode === 'register'"
          v-model="passwordConfirmation"
          type="password"
          placeholder="Confirm password"
          required
          autocomplete="new-password"
          class="rounded-lg border border-white/15 bg-black/20 px-4 py-3 text-base text-white placeholder:text-white/40 focus:border-campus-accent focus:outline-none"
        />

        <p v-if="error" class="m-0 text-sm text-red-400">{{ error }}</p>
        <button
          type="submit"
          :disabled="loading"
          class="mt-2 rounded-lg border-0 bg-campus-accent px-4 py-3 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {{ loading ? '...' : mode === 'login' ? 'Login' : 'Register' }}
        </button>
      </form>

      <button
        type="button"
        @click="toggleMode"
        class="mt-4 block border-0 bg-transparent text-sm text-white/70 underline cursor-pointer hover:text-campus-accent"
      >
        {{ mode === 'login' ? 'No account? Register' : 'Already have an account? Login' }}
      </button>
    </div>
  </div>
</template>
