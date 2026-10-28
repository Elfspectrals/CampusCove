<script setup lang="ts">
/** Landing page of the reset link e-mailed by POST /forgot-password: choose a new password. */
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import * as authApi from '../../api/auth'
import { ApiError } from '../../api/http'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import UiPasswordInput from '../../components/ui/UiPasswordInput.vue'

const route = useRoute()
const { t } = useI18n()
const token = ref('')
const password = ref('')
const error = ref('')
const done = ref(false)
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
    await authApi.resetPassword(token.value, password.value)
    done.value = true
  } catch (e) {
    error.value = e instanceof ApiError && e.fieldErrors.token ? t('auth.reset.invalid') : e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard :title="t('auth.reset.title')" :subtitle="t('auth.reset.subtitle')">
    <p v-if="!token" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ t('auth.reset.incomplete') }}</p>
    <p v-else-if="done" class="cc-alert cc-alert-success m-0" role="status"><UiIcon name="check" :size="18" /> {{ t('auth.reset.done') }}</p>
    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="reset-password" class="cc-label">{{ t('auth.reset.newPassword') }}</label>
        <UiPasswordInput id="reset-password" v-model="password" required minlength="8" autocomplete="new-password" aria-describedby="reset-password-help" />
        <p id="reset-password-help" class="m-0 mt-1.5 text-xs font-semibold text-mist">{{ t('auth.register.passwordHint') }}</p>
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
      <button type="submit" :disabled="loading" class="cc-btn cc-btn-pool cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="key" :size="18" />
        {{ loading ? t('auth.reset.submitting') : t('auth.reset.submit') }}
      </button>
    </form>

    <template #footer>
      <RouterLink v-if="!token || (error && !done)" :to="{ name: 'forgot-password' }" class="font-extrabold text-sun hover:underline">{{ t('auth.reset.requestNew') }}</RouterLink>
      <RouterLink v-else :to="{ name: 'login' }" class="font-extrabold text-sun hover:underline">{{ t('auth.reset.signIn') }}</RouterLink>
    </template>
  </UiAuthCard>
</template>
