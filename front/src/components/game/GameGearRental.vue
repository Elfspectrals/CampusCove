<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels } from '../../config/keybindings'
import type { GearOffer } from '../../composables/game/useGearRental'

const props = defineProps<{ offer: GearOffer }>()
const { t } = useI18n()
const yes = computed(() => actionKeyLabels('acceptChallenge')[0] ?? 'Y')
const no = computed(() => actionKeyLabels('declineChallenge')[0] ?? 'N')
const gearName = computed(() => t(`sports.rental.gear.${props.offer.gear}`))
</script>

<template>
  <section
    class="cc-hud pointer-events-none absolute left-1/2 top-24 z-[42] w-[min(420px,92vw)] -translate-x-1/2 animate-cc-pop px-4 py-3"
    role="status"
    aria-live="polite"
  >
    <p class="m-0 font-display text-sm uppercase tracking-[0.18em] text-sun">{{ t('sports.rental.title', { gear: gearName }) }}</p>
    <p class="m-0 mt-1 text-sm text-fog">{{ t('sports.rental.offer', { price: offer.price, yes, no }) }}</p>
    <p class="m-0 mt-1 text-xs text-mist">{{ t('sports.rental.rule') }}</p>
  </section>
</template>
