<script setup lang="ts">
/** Profile section for GDPR self-service: e-mail news consent, download my data, delete my account. */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { deleteMyAccount, downloadMyData, setMarketingOptIn } from '../../api/account'
import { clearAuth, getStoredAuth, mergeStoredUser } from '../../api/session'
import UiIcon from '../ui/UiIcon.vue'

const { t } = useI18n()
const router = useRouter()
const exporting = ref(false)
const confirming = ref(false)
const password = ref('')
const deleting = ref(false)
const error = ref('')
const marketing = ref(getStoredAuth()?.user.marketing_opt_in === true)
const marketingSaved = ref(false)

async function toggleMarketing() {
  error.value = ''
  marketingSaved.value = false
  try {
    await setMarketingOptIn(marketing.value)
    mergeStoredUser({ marketing_opt_in: marketing.value })
    marketingSaved.value = true
  } catch (e) {
    marketing.value = !marketing.value
    error.value = e instanceof Error ? e.message : 'Could not save'
  }
}

async function exportData() {
  exporting.value = true
  error.value = ''
  try {
    await downloadMyData()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    exporting.value = false
  }
}

async function confirmDelete() {
  deleting.value = true
  error.value = ''
  try {
    await deleteMyAccount(password.value)
    clearAuth()
    await router.push({ name: 'landing' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Deletion failed'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <section class="cc-panel p-5" aria-labelledby="privacy-title">
    <h2 id="privacy-title" class="cc-display m-0 text-xl">{{ t('privacy.title') }}</h2>
    <p class="m-0 mt-1 text-sm font-semibold text-mist">{{ t('privacy.body') }}</p>
    <label class="cc-panel-flat mt-4 flex items-start gap-3 px-3 py-2.5">
      <input v-model="marketing" type="checkbox" class="cc-check mt-1" @change="toggleMarketing" />
      <span>
        <span class="block font-extrabold">{{ t('privacy.marketing') }}</span>
        <span class="block text-xs font-semibold text-mist">{{ marketingSaved ? t('privacy.saved') : t('privacy.marketingBody') }}</span>
      </span>
    </label>
    <div class="mt-4 flex flex-col gap-2">
      <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" :disabled="exporting" @click="exportData">
        <UiIcon name="box" :size="16" /> {{ exporting ? t('privacy.exporting') : t('privacy.export') }}
      </button>
      <button v-if="!confirming" type="button" class="cc-btn cc-btn-coral cc-btn-sm" @click="confirming = true">
        <UiIcon name="trash" :size="16" /> {{ t('privacy.delete') }}
      </button>
    </div>

    <form v-if="confirming" class="cc-panel-flat mt-4 flex flex-col gap-3 p-4" @submit.prevent="confirmDelete">
      <p class="m-0 font-extrabold text-coral">{{ t('privacy.deleteTitle') }}</p>
      <p class="m-0 text-sm font-semibold text-mist">{{ t('privacy.deleteBody') }}</p>
      <div>
        <label for="delete-password" class="cc-label">{{ t('privacy.password') }}</label>
        <input id="delete-password" v-model="password" type="password" required autocomplete="current-password" class="cc-input" />
      </div>
      <div class="flex gap-2">
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm flex-1" @click="confirming = false">{{ t('privacy.cancel') }}</button>
        <button type="submit" :disabled="deleting || !password" class="cc-btn cc-btn-coral cc-btn-sm flex-1">{{ t('privacy.confirmDelete') }}</button>
      </div>
    </form>
    <p v-if="error" class="cc-alert cc-alert-error m-0 mt-3" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
  </section>
</template>
