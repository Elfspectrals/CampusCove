<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import * as authApi from '../../api/auth'
import { storeAuth } from '../../api/session'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    const res = await authApi.login(email.value, password.value)
    storeAuth(res.user, res.token)
    router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard title="Welcome back" subtitle="Sign in to jump back into the cove">
    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="login-email" class="cc-label">Email</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          spellcheck="false"
          placeholder="you@campus.com"
          required
          autocomplete="email"
          class="cc-input"
        />
      </div>
      <div>
        <div class="flex items-baseline justify-between">
          <label for="login-password" class="cc-label">Password</label>
          <router-link to="/forgot-password" class="text-xs font-extrabold text-pool hover:underline">Forgot?</router-link>
        </div>
        <input
          id="login-password"
          v-model="password"
          type="password"
          placeholder="••••••••"
          required
          autocomplete="current-password"
          class="cc-input"
        />
      </div>

      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert">
        <UiIcon name="alert" :size="18" /> {{ error }}
      </p>

      <button type="submit" :disabled="loading" class="cc-btn cc-btn-sun cc-btn-lg mt-1 w-full">
        <UiIcon v-if="!loading" name="play" :size="18" fill />
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <template #footer>
      New here?
      <router-link :to="{ name: 'register' }" class="ml-1 font-extrabold text-sun hover:underline">Create an account</router-link>
    </template>
  </UiAuthCard>
</template>
