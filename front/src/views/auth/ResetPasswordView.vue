<script setup lang="ts">
/** Landing page of the reset link e-mailed by POST /forgot-password: choose a new password. */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import * as authApi from '../../api/auth'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

const route = useRoute()
const token = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

onMounted(() => {
  token.value = typeof route.query.token === 'string' ? route.query.token : ''
  // keep the one-time token out of the address bar and history
  if (token.value) history.replaceState(history.state, '', route.path)
})

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await authApi.resetPassword(token.value, password.value, passwordConfirmation.value)
    success.value = 'Password updated. You can sign in with your new password.'
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard title="New password" subtitle="Choose a new password for your account">
    <p v-if="!token" class="cc-alert cc-alert-error m-0" role="alert">
      <UiIcon name="alert" :size="18" /> This reset link is incomplete. Ask for a new one.
    </p>
    <p v-else-if="success" class="cc-alert cc-alert-success m-0" role="status"><UiIcon name="check" :size="18" /> {{ success }}</p>
    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="reset-password" class="cc-label">New password</label>
        <input id="reset-password" v-model="password" type="password" required minlength="8" autocomplete="new-password" class="cc-input" />
      </div>
      <div>
        <label for="reset-password-confirm" class="cc-label">Confirm new password</label>
        <input id="reset-password-confirm" v-model="passwordConfirmation" type="password" required minlength="8" autocomplete="new-password" class="cc-input" />
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
      <button type="submit" :disabled="loading" class="cc-btn cc-btn-pool cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="key" :size="18" />
        {{ loading ? 'Saving…' : 'Save new password' }}
      </button>
    </form>

    <template #footer>
      <router-link v-if="!token" :to="{ name: 'forgot-password' }" class="font-extrabold text-sun hover:underline">Request a new link</router-link>
      <router-link v-else :to="{ name: 'login' }" class="font-extrabold text-sun hover:underline">Back to sign in</router-link>
    </template>
  </UiAuthCard>
</template>
