<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import * as authApi from '../../api/auth'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

const { t } = useI18n()
const email = ref('')
const error = ref('')
const sent = ref(false)
const loading = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await authApi.forgotPassword(email.value)
    sent.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard :title="t('auth.forgot.title')" :subtitle="t('auth.forgot.subtitle')">
    <p v-if="sent" class="cc-alert cc-alert-success m-0" role="status"><UiIcon name="check" :size="18" /> {{ t('auth.forgot.sent') }}</p>
    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <div>
        <label for="forgot-email" class="cc-label">{{ t('auth.email') }}</label>
        <input
          id="forgot-email"
          v-model="email"
          type="email"
          inputmode="email"
          spellcheck="false"
          autocapitalize="off"
          required
          autocomplete="email"
          class="cc-input"
        />
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
      <button type="submit" :disabled="loading" class="cc-btn cc-btn-pool cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="key" :size="18" />
        {{ loading ? t('auth.forgot.submitting') : t('auth.forgot.submit') }}
      </button>
    </form>

    <template #footer>
      <RouterLink :to="{ name: 'login' }" class="font-extrabold text-sun hover:underline">{{ t('auth.forgot.backToSignIn') }}</RouterLink>
    </template>
  </UiAuthCard>
</template>
