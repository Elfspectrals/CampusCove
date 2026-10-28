<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { legalEn } from '../content/legal/en'
import { legalFr } from '../content/legal/fr'
import { LEGAL_SLUGS, type LegalSlug } from '../content/legal/types'
import { localizedTo } from '../i18n/routes'
import { SITE, type Locale } from '../seo/site'

const props = defineProps<{ slug: LegalSlug }>()
const { t, locale } = useI18n()

const loc = computed(() => locale.value as Locale)
const docs = computed(() => (loc.value === 'fr' ? legalFr : legalEn))
const doc = computed(() => docs.value[props.slug])
const others = computed(() => LEGAL_SLUGS.filter((s) => s !== props.slug))
</script>

<template>
  <div class="mx-auto w-full max-w-3xl">
    <article class="cc-panel p-6 sm:p-8">
      <h1 class="cc-display m-0 text-3xl sm:text-4xl">{{ doc.title }}</h1>
      <p class="m-0 mt-2 text-xs font-extrabold uppercase tracking-wider text-mist">
        {{ t('legal.updated') }} : <time :datetime="SITE.legalVersion">{{ SITE.legalVersion }}</time>
      </p>
      <p class="m-0 mt-4 font-semibold text-fog/90">{{ doc.description }}</p>

      <section v-for="s in doc.sections" :key="s.heading" class="mt-7">
        <h2 class="cc-display m-0 text-xl text-sun">{{ s.heading }}</h2>
        <p v-for="(p, i) in s.paragraphs" :key="i" class="m-0 mt-2 font-semibold leading-relaxed text-fog/85">{{ p }}</p>
        <ul v-if="s.items?.length" class="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 font-semibold leading-relaxed text-fog/85">
          <li v-for="(item, i) in s.items" :key="i">{{ item }}</li>
        </ul>
      </section>
    </article>

    <nav class="mt-6" :aria-label="t('legal.otherPages')">
      <h2 class="cc-eyebrow m-0 mb-2">{{ t('legal.otherPages') }}</h2>
      <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
        <li v-for="s in others" :key="s">
          <RouterLink :to="localizedTo(`legal-${s}`, loc)" class="cc-chip hover:text-sun">{{ docs[s].title }}</RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
