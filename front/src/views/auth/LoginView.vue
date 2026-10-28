<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import * as authApi from '../../api/auth'
import { ApiError } from '../../api/http'
import { storeAuth } from '../../api/session'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import UiPasswordInput from '../../components/ui/UiPasswordInput.vue'

const router = useRouter()
const { t } = useI18n()
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
    // wrong credentials come back as a 422 on `email`; bans and suspensions keep the server's message
    error.value = e instanceof ApiError && e.status === 422 ? t('auth.login.failed') : e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard :title="t('auth.login.title')" :subtitle="t('auth.login.subtitle')">
    <form class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="login-email" class="cc-label">{{ t('auth.email') }}</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          inputmode="email"
          spellcheck="false"
          autocapitalize="off"
          required
          name="email"
          autocomplete="username"
          class="cc-input"
          :aria-invalid="!!error"
          @input="error = ''"
        />
      </div>
      <div>
        <label for="login-password" class="cc-label">{{ t('auth.password') }}</label>
        <UiPasswordInput id="login-password" v-model="password" required autocomplete="current-password" :aria-invalid="!!error" @input="error = ''" />
        <RouterLink :to="{ name: 'forgot-password' }" class="mt-2 inline-block text-xs font-extrabold text-pool hover:underline">{{ t('auth.login.forgot') }}</RouterLink>
      </div>

      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>

      <button type="submit" :disabled="loading" class="cc-btn cc-btn-sun cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="play" :size="18" fill />
        {{ loading ? t('auth.login.submitting') : t('auth.login.submit') }}
      </button>
    </form>

    <template #footer>
      {{ t('auth.login.newHere') }}
      <RouterLink :to="{ name: 'register' }" class="ml-1 font-extrabold text-sun hover:underline">{{ t('auth.login.create') }}</RouterLink>
    </template>
  </UiAuthCard>
</template>
