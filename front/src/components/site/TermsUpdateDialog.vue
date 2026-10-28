<script setup lang="ts">
/** Asks a logged-in player to accept the terms / privacy policy again after they changed (GET /user → terms_current). */
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { acceptCurrentTerms } from '../../api/account'
import { useDialogFocus } from '../../composables/useDialogFocus'
import { mergeStoredUser } from '../../api/session'
import { localizedTo } from '../../i18n/routes'
import type { Locale } from '../../seo/site'
import UiIcon from '../ui/UiIcon.vue'

const emit = defineEmits<{ logout: [] }>()
const { t, locale } = useI18n()
const saving = ref(false)
const error = ref('')
// no Escape: the player must accept or log out
const dialogEl = ref<HTMLElement | null>(null)
useDialogFocus(dialogEl)

async function accept() {
  saving.value = true
  error.value = ''
  try {
    await acceptCurrentTerms()
    mergeStoredUser({ terms_current: true })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[110] flex items-center justify-center bg-ink-950/70 p-3 sm:p-5">
    <section ref="dialogEl" class="cc-panel w-full max-w-lg p-5" role="dialog" aria-modal="true" aria-labelledby="terms-update-title">
      <h2 id="terms-update-title" class="cc-display m-0 text-xl">{{ t('termsUpdate.title') }}</h2>
      <i18n-t keypath="termsUpdate.body" tag="p" scope="global" class="m-0 mt-2 text-sm font-semibold text-mist">
        <template #terms>
          <RouterLink :to="localizedTo('legal-terms', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.terms') }}</RouterLink>
        </template>
        <template #privacy>
          <RouterLink :to="localizedTo('legal-privacy', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.privacy') }}</RouterLink>
        </template>
      </i18n-t>
      <div class="mt-4 flex gap-2">
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm flex-1" @click="emit('logout')">{{ t('termsUpdate.logout') }}</button>
        <button type="button" class="cc-btn cc-btn-sun cc-btn-sm flex-1" :disabled="saving" @click="accept">{{ t('termsUpdate.accept') }}</button>
      </div>
      <p v-if="error" class="cc-alert cc-alert-error m-0 mt-3" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
    </section>
  </div>
</template>
