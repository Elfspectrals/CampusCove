<script setup lang="ts">
/** Site footer: legal links (every page must reach them), cookie settings and language switch. */
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { legalEn } from '../../content/legal/en'
import { legalFr } from '../../content/legal/fr'
import { LEGAL_SLUGS } from '../../content/legal/types'
import { setLocale } from '../../i18n'
import { localizedName, localizedTo } from '../../i18n/routes'
import { openConsentDialog } from '../../privacy/consent'
import { SITE, type Locale } from '../../seo/site'
import UiLogo from '../ui/UiLogo.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

const loc = computed(() => locale.value as Locale)
const docs = computed(() => (loc.value === 'fr' ? legalFr : legalEn))
const year = new Date().getFullYear()

function switchLocale(next: Locale) {
  if (next === loc.value) return
  setLocale(next)
  const name = String(route.name ?? '')
  const target = localizedName(name, next)
  if (target !== name) router.push({ name: target })
}
</script>

<template>
  <footer class="border-t border-ink-700/60 bg-ink-950/80 px-4 py-8 text-sm sm:px-8">
    <div class="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:justify-between">
      <div class="max-w-xs">
        <UiLogo size="sm" />
        <p class="m-0 mt-2 font-semibold text-mist">{{ t('footer.tagline') }}</p>
        <p class="m-0 mt-2 text-xs font-semibold text-mist/70">© {{ year }} {{ SITE.name }}</p>
      </div>

      <nav :aria-label="t('footer.legal')">
        <h2 class="cc-eyebrow m-0 mb-2">{{ t('footer.legal') }}</h2>
        <ul class="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-1.5 p-0">
          <li v-for="slug in LEGAL_SLUGS" :key="slug">
            <RouterLink :to="localizedTo(`legal-${slug}`, loc)" class="font-semibold text-fog/85 hover:text-sun hover:underline">
              {{ docs[slug].title }}
            </RouterLink>
          </li>
          <li>
            <button type="button" class="p-0 font-semibold text-fog/85 hover:text-sun hover:underline" @click="openConsentDialog">
              {{ t('footer.manageCookies') }}
            </button>
          </li>
        </ul>
      </nav>

      <div>
        <h2 class="cc-eyebrow m-0 mb-2">{{ t('footer.language') }}</h2>
        <div class="flex gap-2" role="group" :aria-label="t('footer.language')">
          <button
            v-for="l in (['en', 'fr'] as const)"
            :key="l"
            type="button"
            :lang="l"
            :aria-pressed="loc === l"
            :class="['cc-btn cc-btn-sm', loc === l ? 'cc-btn-sun' : 'cc-btn-ghost']"
            @click="switchLocale(l)"
          >
            {{ l === 'en' ? 'English' : 'Français' }}
          </button>
        </div>
      </div>
    </div>
  </footer>
</template>
