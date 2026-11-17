<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { GymSport } from '../../types/gameRealtime'

const props = withDefaults(defineProps<{ myBall: GymSport | null; sports?: readonly GymSport[] }>(), { sports: () => ['football', 'basketball'] })
const emit = defineEmits<{ borrow: [sport: GymSport]; giveBack: [] }>()

const { t } = useI18n()
</script>

<template>
  <section
    class="cc-hud absolute bottom-6 left-1/2 z-[41] flex w-[min(460px,92vw)] -translate-x-1/2 animate-cc-pop flex-col gap-2 px-4 py-3"
    :aria-label="t('sports.gym.free.title')"
  >
    <p class="m-0 font-display text-sm uppercase tracking-[0.18em] text-sun">{{ t('sports.gym.free.title') }}</p>
    <p class="m-0 text-xs text-mist">{{ t('sports.gym.free.rules') }}</p>
    <div class="flex flex-wrap gap-2">
      <button
        v-for="sport in props.sports"
        :key="sport"
        type="button"
        class="cc-btn cc-btn-sm min-h-11"
        :class="myBall === sport ? 'cc-btn-sun' : 'cc-btn-ghost'"
        :aria-pressed="myBall === sport"
        @click="emit('borrow', sport)"
      >
        {{ t('sports.gym.free.borrow', { sport: t(`sports.sports.${sport}`) }) }}
      </button>
      <button v-if="myBall" type="button" class="cc-btn cc-btn-sm cc-btn-coral min-h-11" @click="emit('giveBack')">
        {{ t('sports.gym.free.giveBack') }}
      </button>
    </div>
  </section>
</template>
