<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../../i18n/routes'
import { SITE, type Locale } from '../../seo/site'
import * as authApi from '../../api/auth'
import { ApiError } from '../../api/http'
import { storeAuth } from '../../api/session'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import UiPasswordInput from '../../components/ui/UiPasswordInput.vue'

const PASSWORD_MIN = 8

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const email = ref('')
const username = ref('')
const password = ref('')
// invite links look like /register?ref=CODE
const referralCode = ref(typeof route.query.ref === 'string' ? route.query.ref : '')
const inviteOpen = ref(referralCode.value !== '')
const acceptedTerms = ref(false)
const ageConfirmed = ref(false)
const loading = ref(false)
const formError = ref('')
/** Errors are shown once a field was left or the form submitted, never while typing the first characters. */
const touched = ref<Record<string, boolean>>({})
const serverErrors = ref<Record<string, string>>({})

/** Same cleaning as the server (AccountHandle::cleanUsername): trimmed, inner spaces collapsed. */
const cleanName = computed(() => username.value.trim().replace(/\s+/gu, ' '))
const nameLength = computed(() => [...cleanName.value].length)
const passwordMissing = computed(() => Math.max(0, PASSWORD_MIN - [...password.value].length))

const errors = computed<Record<string, string>>(() => {
  const e: Record<string, string> = { ...serverErrors.value }
  if (!e.username && nameLength.value < 3) e.username = t('auth.register.usernameShort')
  if (!e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) e.email = t('auth.register.emailInvalid')
  if (!e.password && passwordMissing.value > 0) e.password = t('auth.register.passwordHint')
  if (!e.consents && !(acceptedTerms.value && ageConfirmed.value)) e.consents = t('auth.register.consentsMissing')
  return e
})
const shown = (field: string) => (touched.value[field] ? errors.value[field] : undefined)

// known server messages in the page language; anything else is shown as sent
const SERVER_MESSAGES: Record<string, string> = {
  'This username is already taken.': 'auth.register.usernameTaken',
  'An account already uses this e-mail. Sign in instead.': 'auth.register.emailTaken',
}
const translateServer = (m: string) => (SERVER_MESSAGES[m] ? t(SERVER_MESSAGES[m]) : m)

function clearServerError(field: string) {
  if (serverErrors.value[field]) serverErrors.value = { ...serverErrors.value, [field]: '' }
}

async function submit() {
  formError.value = ''
  touched.value = { username: true, email: true, password: true, consents: true }
  const firstInvalid = ['username', 'email', 'password', 'consents'].find((f) => errors.value[f])
  if (firstInvalid) {
    focusField(firstInvalid)
    return
  }
  loading.value = true
  try {
    const res = await authApi.register(email.value, cleanName.value, password.value, referralCode.value.trim() || undefined, {
      accepted_terms: acceptedTerms.value,
      age_confirmed: ageConfirmed.value,
    })
    storeAuth(res.user, res.token)
    router.push({ name: 'home' })
  } catch (e) {
    if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
      const f = e.fieldErrors
      serverErrors.value = {
        username: f.username ? translateServer(f.username) : '',
        email: f.email ? translateServer(f.email) : '',
        password: f.password ?? '',
        referral: f.referral_code ?? '',
        consents: f.accepted_terms || f.age_confirmed ? t('auth.register.consentsMissing') : '',
      }
      const first = ['username', 'email', 'password', 'referral'].find((k) => serverErrors.value[k])
      if (first === 'referral') inviteOpen.value = true
      if (first) focusField(first)
    } else {
      formError.value = e instanceof Error ? e.message : 'Something went wrong'
    }
  } finally {
    loading.value = false
  }
}

async function focusField(field: string) {
  await nextTick()
  document.getElementById(field === 'consents' ? 'reg-terms' : `reg-${field}`)?.focus()
}
</script>

<template>
  <UiAuthCard :title="t('auth.register.title')" :subtitle="t('auth.register.subtitle')">
    <!-- the e-mail is the sign-in identifier ("username" for browsers and password managers); the in-game name is a nickname -->
    <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
      <div>
        <label for="reg-username" class="cc-label">{{ t('auth.register.username') }}</label>
        <input
          id="reg-username"
          v-model="username"
          type="text"
          name="nickname"
          autocomplete="nickname"
          data-1p-ignore
          data-bwignore
          data-lpignore="true"
          spellcheck="false"
          autocapitalize="off"
          class="cc-input"
          :aria-invalid="!!shown('username')"
          :aria-describedby="shown('username') ? 'reg-username-error' : undefined"
          @input="clearServerError('username')"
          @blur="touched.username = true"
        />
        <p v-if="shown('username')" id="reg-username-error" class="m-0 mt-1.5 text-xs font-bold text-coral" role="alert">{{ shown('username') }}</p>
      </div>

      <div>
        <label for="reg-email" class="cc-label">{{ t('auth.email') }}</label>
        <input
          id="reg-email"
          v-model="email"
          type="email"
          inputmode="email"
          spellcheck="false"
          autocapitalize="off"
          name="email"
          autocomplete="username"
          class="cc-input"
          :aria-invalid="!!shown('email')"
          :aria-describedby="shown('email') ? 'reg-email-error' : undefined"
          @input="clearServerError('email')"
          @blur="touched.email = true"
        />
        <p v-if="shown('email')" id="reg-email-error" class="m-0 mt-1.5 text-xs font-bold text-coral" role="alert">
          {{ shown('email') }}
          <RouterLink v-if="serverErrors.email" :to="{ name: 'login' }" class="ml-1 text-sun underline">{{ t('auth.register.signIn') }}</RouterLink>
        </p>
      </div>

      <div>
        <label for="reg-password" class="cc-label">{{ t('auth.password') }}</label>
        <UiPasswordInput
          id="reg-password"
          v-model="password"
          autocomplete="new-password"
          :aria-invalid="!!shown('password')"
          aria-describedby="reg-password-help"
          @input="clearServerError('password')"
          @blur="touched.password = true"
        />
        <p
          id="reg-password-help"
          class="m-0 mt-1.5 text-xs font-bold"
          :class="shown('password') ? 'text-coral' : passwordMissing === 0 ? 'text-mint' : 'text-mist'"
          aria-live="polite"
        >
          <template v-if="passwordMissing === 0"><UiIcon name="check" :size="14" class="-mt-0.5 inline" /> {{ t('auth.register.passwordOk') }}</template>
          <template v-else-if="password">{{ t('auth.register.passwordShort', { n: passwordMissing }, passwordMissing) }}</template>
          <template v-else>{{ shown('password') || t('auth.register.passwordHint') }}</template>
        </p>
      </div>

      <div v-if="!inviteOpen">
        <button type="button" class="inline-flex items-center gap-1.5 text-sm font-extrabold text-pool hover:underline" @click="inviteOpen = true; focusField('referral')">
          <UiIcon name="plus" :size="16" /> {{ t('auth.register.inviteToggle') }}
        </button>
      </div>
      <div v-else>
        <label for="reg-referral" class="cc-label">{{ t('auth.register.invite') }}</label>
        <input
          id="reg-referral"
          v-model="referralCode"
          type="text"
          maxlength="12"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="characters"
          class="cc-input font-mono uppercase tracking-widest"
          :aria-invalid="!!serverErrors.referral"
          aria-describedby="reg-referral-help"
          @input="clearServerError('referral')"
        />
        <p id="reg-referral-help" class="m-0 mt-1.5 text-xs font-semibold" :class="serverErrors.referral ? 'font-bold text-coral' : 'text-mist'">
          {{ serverErrors.referral || t('auth.register.inviteHint') }}
        </p>
      </div>

      <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0" :aria-describedby="shown('consents') ? 'reg-consents-error' : undefined">
        <label class="flex cursor-pointer items-start gap-2.5 text-sm font-semibold text-fog/90">
          <input id="reg-terms" v-model="acceptedTerms" type="checkbox" class="cc-check mt-0.5" @change="clearServerError('consents')" />
          <i18n-t keypath="register.acceptTerms" tag="span" scope="global">
            <template #terms>
              <RouterLink :to="localizedTo('legal-terms', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.terms') }}</RouterLink>
            </template>
            <template #privacy>
              <RouterLink :to="localizedTo('legal-privacy', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.privacy') }}</RouterLink>
            </template>
          </i18n-t>
        </label>
        <label class="flex cursor-pointer items-start gap-2.5 text-sm font-semibold text-fog/90">
          <input v-model="ageConfirmed" type="checkbox" class="cc-check mt-0.5" @change="clearServerError('consents')" />
          <span>{{ t('register.age', { age: SITE.minimumAge }) }}</span>
        </label>
        <p v-if="shown('consents')" id="reg-consents-error" class="m-0 text-xs font-bold text-coral" role="alert">{{ shown('consents') }}</p>
      </fieldset>

      <p v-if="formError" class="cc-alert cc-alert-error m-0" role="alert"><UiIcon name="alert" :size="18" /> {{ formError }}</p>

      <button type="submit" :disabled="loading" class="cc-btn cc-btn-sun cc-btn-lg w-full">
        <UiIcon v-if="!loading" name="sparkles" :size="18" />
        {{ loading ? t('auth.register.submitting') : t('auth.register.submit') }}
      </button>
    </form>

    <template #footer>
      {{ t('auth.register.haveAccount') }}
      <RouterLink :to="{ name: 'login' }" class="ml-1 font-extrabold text-sun hover:underline">{{ t('auth.register.signIn') }}</RouterLink>
    </template>
  </UiAuthCard>
</template>
