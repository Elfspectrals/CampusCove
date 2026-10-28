<script setup lang="ts">
/** Report a player to moderation (DSA notice-and-action): reason + optional details. */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { REPORT_REASONS, reportPlayer, type ReportReason } from '../../api/account'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{ accountId: number; name: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const reason = ref<ReportReason>('harassment')
const details = ref('')
const sending = ref(false)
const sent = ref(false)
const error = ref('')

async function send() {
  sending.value = true
  error.value = ''
  try {
    await reportPlayer(props.accountId, reason.value, details.value)
    sent.value = true
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Report failed'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-[90] grid place-items-center bg-ink-950/70 p-4" @click.self="emit('close')">
    <section class="cc-panel w-full max-w-md p-5" role="dialog" aria-modal="true" aria-labelledby="report-title" @keydown.esc="emit('close')">
      <h2 id="report-title" class="cc-display m-0 text-xl">{{ t('report.title', { name }) }}</h2>
      <p v-if="sent" class="cc-alert m-0 mt-4" role="status"><UiIcon name="check" :size="18" /> {{ t('report.sent') }}</p>
      <form v-else class="mt-4 flex flex-col gap-3" @submit.prevent="send">
        <div>
          <label for="report-reason" class="cc-label">{{ t('report.reason') }}</label>
          <select id="report-reason" v-model="reason" class="cc-input">
            <option v-for="r in REPORT_REASONS" :key="r" :value="r">{{ t(`report.reasons.${r}`) }}</option>
          </select>
        </div>
        <div>
          <label for="report-details" class="cc-label">{{ t('report.details') }}</label>
          <textarea id="report-details" v-model="details" maxlength="1000" rows="4" class="cc-input" />
        </div>
        <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ error }}</p>
        <div class="flex gap-2">
          <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm flex-1" @click="emit('close')">{{ t('privacy.cancel') }}</button>
          <button type="submit" :disabled="sending" class="cc-btn cc-btn-coral cc-btn-sm flex-1"><UiIcon name="flag" :size="16" /> {{ t('report.send') }}</button>
        </div>
      </form>
      <button v-if="sent" type="button" class="cc-btn cc-btn-ghost cc-btn-sm mt-4 w-full" @click="emit('close')">{{ t('consent.close') }}</button>
    </section>
  </div>
</template>
