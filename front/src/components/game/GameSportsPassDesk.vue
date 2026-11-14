<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { SPORTS_PASS_KINDS, passValid, type SportsPassKind } from '../../game/sports/sportsPass'
import type { SportsPassStatePayload } from '../../types/gameRealtime'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  pass: SportsPassStatePayload
  buying: boolean
  error: string | null
}>()

const emit = defineEmits<{ buy: [kind: SportsPassKind]; close: [] }>()
const { t, locale } = useI18n()
const firstButton = ref<HTMLButtonElement[]>([])

const valid = computed(() => passValid(props.pass.validUntil, Date.now()))
const endText = computed(() =>
  props.pass.validUntil === null
    ? ''
    : new Date(props.pass.validUntil).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
)

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  firstButton.value[0]?.focus()
})
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(400px,92vw)] animate-cc-pop overflow-hidden p-0" aria-labelledby="cc-sports-pass-title">
      <header class="flex items-center justify-between bg-pool px-4 py-2 text-ink-950">
        <span id="cc-sports-pass-title" class="font-display text-sm uppercase tracking-[0.18em]">{{ t('sports.pass.title') }}</span>
        <button type="button" class="inline-flex min-h-11 min-w-11 items-center justify-center" :aria-label="t('sports.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <div class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 text-sm text-fog" role="status">
          {{ valid ? t('sports.pass.validUntil', { end: endText }) : t('sports.pass.none') }}
        </p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="kind in SPORTS_PASS_KINDS" :key="kind" class="flex items-center justify-between gap-3">
            <span class="flex flex-col">
              <span class="text-sm font-bold text-fog">{{ t(`sports.pass.kinds.${kind}`) }}</span>
              <span class="text-xs text-mist">{{ t(`sports.pass.lasts.${kind}`) }}</span>
            </span>
            <button
              ref="firstButton"
              type="button"
              class="cc-btn cc-btn-sm cc-btn-pool min-h-11 gap-1.5"
              :disabled="buying"
              :aria-label="t('sports.pass.buyLabel', { kind: t(`sports.pass.kinds.${kind}`), price: pass.prices[kind] })"
              @click="emit('buy', kind)"
            >
              {{ t('sports.pass.buy') }}
              <UiCurrency currency="coins" :amount="pass.prices[kind]" :size="14" />
            </button>
          </li>
        </ul>
        <p class="m-0 text-xs text-mist">{{ valid ? t('sports.pass.extends') : t('sports.pass.rules') }}</p>
        <p v-if="buying" class="m-0 text-xs text-mist" role="status">{{ t('sports.pass.buying') }}</p>
        <p v-if="error" class="m-0 text-xs font-bold text-coral" role="alert">{{ error }}</p>
      </div>
    </section>
  </div>
</template>
