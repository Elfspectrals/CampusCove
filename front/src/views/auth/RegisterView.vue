<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import * as authApi from '../../api/auth'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

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
  <UiAuthCard title="Create your player" subtitle="Free forever · takes 30 seconds">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div>
        <label for="reg-username" class="cc-label">Username</label>
        <input
          id="reg-username"
          v-model="username"
          type="text"
          placeholder="cove_runner"
          required
          minlength="3"
          maxlength="24"
          pattern="[a-zA-Z0-9_]+"
          autocomplete="username"
          title="Letters, numbers and underscore only (3–24 characters)"
          class="cc-input"
        />
        <p class="m-0 mt-1 text-xs font-semibold text-mist/80">3–24 characters · letters, numbers, underscore</p>
      </div>
      <div>
        <label for="reg-email" class="cc-label">Email</label>
        <input
          id="reg-email"
          v-model="email"
          type="email"
          placeholder="you@campus.com"
          required
          autocomplete="email"
          class="cc-input"
        />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="reg-password" class="cc-label">Password</label>
          <input
            id="reg-password"
            v-model="password"
            type="password"
            placeholder="8+ characters"
            required
            minlength="8"
            autocomplete="new-password"
            class="cc-input"
          />
        </div>
        <div>
          <label for="reg-confirm" class="cc-label">Confirm</label>
          <input
            id="reg-confirm"
            v-model="passwordConfirmation"
            type="password"
            placeholder="Repeat it"
            required
            autocomplete="new-password"
            class="cc-input"
          />
        </div>
      </div>

      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert">
        <UiIcon name="alert" :size="18" /> {{ error }}
      </p>

      <button type="submit" :disabled="loading" class="cc-btn cc-btn-sun cc-btn-lg mt-2 w-full">
        <UiIcon v-if="!loading" name="sparkles" :size="18" />
        {{ loading ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <template #footer>
      Already playing?
      <router-link :to="{ name: 'login' }" class="ml-1 font-extrabold text-sun hover:underline">Sign in</router-link>
    </template>
  </UiAuthCard>
</template>
