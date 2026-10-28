<script setup lang="ts">
/** Consent banner (only when a consent-requiring tracker is in use) and the "Manage cookies" dialog. */
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../../i18n/routes'
import type { Locale } from '../../seo/site'
import { CONSENT_CATEGORIES, saveConsent, useConsent } from '../../privacy/consent'

const { t, locale } = useI18n()
const { bannerVisible, dialogOpen, choices } = useConsent()
const analytics = ref(choices.value.analytics)

watch(dialogOpen, (open) => {
  if (open) analytics.value = choices.value.analytics
})

function acceptAll() {
  saveConsent({ analytics: true })
}
function rejectAll() {
  saveConsent({ analytics: false })
}
function saveChoices() {
  saveConsent({ analytics: analytics.value })
}
</script>

<template>
  <div
    v-if="bannerVisible || dialogOpen"
    class="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-3 sm:p-5"
    :class="dialogOpen ? 'inset-y-0 items-center bg-ink-950/70' : ''"
  >
    <section
      class="cc-panel w-full max-w-lg p-5"
      role="dialog"
      :aria-modal="dialogOpen ? 'true' : undefined"
      aria-labelledby="consent-title"
      @keydown.esc="dialogOpen = false"
    >
      <h2 id="consent-title" class="cc-display m-0 text-xl">{{ t('consent.title') }}</h2>
      <p class="m-0 mt-2 text-sm font-semibold text-mist">{{ t('consent.intro') }}</p>

      <div v-if="dialogOpen" class="mt-4 flex flex-col gap-3">
        <label class="cc-panel-flat flex items-start gap-3 px-3 py-2.5">
          <input type="checkbox" class="cc-check mt-1" checked disabled />
          <span>
            <span class="block font-extrabold">{{ t('consent.necessary') }}</span>
            <span class="block text-xs font-semibold text-mist">{{ t('consent.necessaryBody') }}</span>
          </span>
        </label>
        <label class="cc-panel-flat flex items-start gap-3 px-3 py-2.5">
          <input v-model="analytics" type="checkbox" class="cc-check mt-1" :disabled="!CONSENT_CATEGORIES.analytics.inUse" />
          <span>
            <span class="block font-extrabold">{{ t('consent.analytics') }}</span>
            <span class="block text-xs font-semibold text-mist">{{ t('consent.analyticsBody') }}</span>
          </span>
        </label>
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <!-- refusing must be as easy as accepting: same size, same prominence -->
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm flex-1" @click="rejectAll">{{ t('consent.rejectAll') }}</button>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm flex-1" @click="acceptAll">{{ t('consent.acceptAll') }}</button>
        <button v-if="dialogOpen" type="button" class="cc-btn cc-btn-sun cc-btn-sm w-full" @click="saveChoices">{{ t('consent.save') }}</button>
        <button v-else type="button" class="cc-btn cc-btn-ghost cc-btn-sm w-full" @click="dialogOpen = true">{{ t('consent.save') }}</button>
      </div>
      <RouterLink
        :to="localizedTo('legal-cookies', locale as Locale)"
        class="mt-3 inline-block text-xs font-extrabold text-sun hover:underline"
        @click="dialogOpen = false"
      >
        {{ t('consent.more') }}
      </RouterLink>
    </section>
  </div>
</template>
