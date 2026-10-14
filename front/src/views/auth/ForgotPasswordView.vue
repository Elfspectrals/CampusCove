<script setup lang="ts">
import { ref } from 'vue'
import * as authApi from '../../api/auth'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

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
  <UiAuthCard title="Reset password" subtitle="We’ll email you a link if an account exists">
    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="forgot-email" class="cc-label">Email</label>
        <input
          id="forgot-email"
          v-model="email"
          type="email"
          placeholder="you@campus.com"
          required
          autocomplete="email"
          class="cc-input"
        />
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
      <p v-if="success" class="cc-alert cc-alert-success m-0" role="status"><UiIcon name="check" :size="18" /> {{ success }}</p>
      <button type="submit" :disabled="loading" class="cc-btn cc-btn-pool cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="key" :size="18" />
        {{ loading ? 'Sending…' : 'Send reset link' }}
      </button>
    </form>

    <template #footer>
      <router-link :to="{ name: 'login' }" class="font-extrabold text-sun hover:underline">Back to sign in</router-link>
    </template>
  </UiAuthCard>
</template>
