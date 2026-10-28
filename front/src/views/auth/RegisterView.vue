<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { localizedTo } from '../../i18n/routes'
import { SITE, type Locale } from '../../seo/site'
import * as authApi from '../../api/auth'
import { storeAuth } from '../../api/session'
import UiAuthCard from '../../components/ui/UiAuthCard.vue'
import UiIcon from '../../components/ui/UiIcon.vue'

const router = useRouter()
const route = useRoute()
const email = ref('')
const username = ref('')
const password = ref('')
const passwordConfirmation = ref('')
// invite links look like /register?ref=CODE
const referralCode = ref(typeof route.query.ref === 'string' ? route.query.ref : '')
const acceptedTerms = ref(false)
const ageConfirmed = ref(false)
const marketingOptIn = ref(false)
const error = ref('')
const loading = ref(false)
const { t, locale } = useI18n()

async function submit() {
  error.value = ''
  if (password.value !== passwordConfirmation.value) {
    error.value = 'Passwords do not match'
    return
  }
  if (!acceptedTerms.value || !ageConfirmed.value) {
    error.value = t('register.required')
    return
  }
  loading.value = true
  try {
    const res = await authApi.register(
      email.value,
      username.value,
      password.value,
      passwordConfirmation.value,
      referralCode.value.trim() || undefined,
      { accepted_terms: acceptedTerms.value, age_confirmed: ageConfirmed.value, marketing_opt_in: marketingOptIn.value },
    )
    storeAuth(res.user, res.token)
    router.push({ name: 'home' })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiAuthCard title="Create your player" subtitle="Free forever · takes 30 seconds">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div>
        <label for="reg-username" class="cc-label">Username</label>
        <input
          id="reg-username"
          v-model="username"
          type="text"
          placeholder="cove_runner"
          required
          minlength="3"
          maxlength="24"
          pattern="[a-zA-Z0-9_]+"
          autocomplete="username"
          title="Letters, numbers and underscore only (3–24 characters)"
          class="cc-input"
        />
        <p class="m-0 mt-1 text-xs font-semibold text-mist/80">3–24 characters · letters, numbers, underscore</p>
      </div>
      <div>
        <label for="reg-email" class="cc-label">Email</label>
        <input
          id="reg-email"
          v-model="email"
          type="email"
          placeholder="you@campus.com"
          required
          autocomplete="email"
          class="cc-input"
        />
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label for="reg-password" class="cc-label">Password</label>
          <input
            id="reg-password"
            v-model="password"
            type="password"
            placeholder="8+ characters"
            required
            minlength="8"
            autocomplete="new-password"
            class="cc-input"
          />
        </div>
        <div>
          <label for="reg-confirm" class="cc-label">Confirm</label>
          <input
            id="reg-confirm"
            v-model="passwordConfirmation"
            type="password"
            placeholder="Repeat it"
            required
            autocomplete="new-password"
            class="cc-input"
          />
        </div>
      </div>

      <div>
        <label for="reg-referral" class="cc-label">Invite code <span class="font-semibold text-mist/80">(optional)</span></label>
        <input
          id="reg-referral"
          v-model="referralCode"
          type="text"
          placeholder="AB12CD34"
          maxlength="12"
          autocomplete="off"
          class="cc-input font-mono uppercase"
        />
      </div>

      <fieldset class="m-0 flex flex-col gap-2.5 border-0 p-0">
        <label class="flex items-start gap-2.5 text-sm font-semibold text-fog/90">
          <input v-model="acceptedTerms" type="checkbox" required class="cc-check mt-0.5" />
          <i18n-t keypath="register.acceptTerms" tag="span" scope="global">
            <template #terms>
              <RouterLink :to="localizedTo('legal-terms', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.terms') }}</RouterLink>
            </template>
            <template #privacy>
              <RouterLink :to="localizedTo('legal-privacy', locale as Locale)" target="_blank" class="font-extrabold text-sun hover:underline">{{ t('register.privacy') }}</RouterLink>
            </template>
          </i18n-t>
        </label>
        <label class="flex items-start gap-2.5 text-sm font-semibold text-fog/90">
          <input v-model="ageConfirmed" type="checkbox" required class="cc-check mt-0.5" />
          <span>{{ t('register.age', { age: SITE.minimumAge }) }}</span>
        </label>
        <label class="flex items-start gap-2.5 text-sm font-semibold text-mist">
          <input v-model="marketingOptIn" type="checkbox" class="cc-check mt-0.5" />
          <span>{{ t('register.marketing') }}</span>
        </label>
      </fieldset>

      <p v-if="error" class="cc-alert cc-alert-error m-0" role="alert">
        <UiIcon name="alert" :size="18" /> {{ error }}
      </p>

      <button type="submit" :disabled="loading" class="cc-btn cc-btn-sun cc-btn-lg mt-2 w-full">
        <UiIcon v-if="!loading" name="sparkles" :size="18" />
        {{ loading ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <template #footer>
      Already playing?
      <router-link :to="{ name: 'login' }" class="ml-1 font-extrabold text-sun hover:underline">Sign in</router-link>
    </template>
  </UiAuthCard>
</template>
