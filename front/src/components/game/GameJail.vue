<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatJailTime } from '../../game/jail'
import { secondsLeft } from '../../game/pub/challenge'
import type { JailSentence } from '../../composables/game/useJail'
import type { JailErrorPayload } from '../../types/gameRealtime'

const props = defineProps<{
  sentence: JailSentence
  error: JailErrorPayload | null
  paying: boolean
}>()

const emit = defineEmits<{ pay: [] }>()

const { t } = useI18n()
const now = ref(Date.now())
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 250)
})
onUnmounted(() => window.clearInterval(timer))

const timeLeft = computed(() => formatJailTime(secondsLeft(props.sentence.endsAt, now.value)))
const errorText = computed(() => {
  if (!props.error) return null
  return props.error.code === 'jail_insufficient_funds' ? t('jail.notEnough', { fine: props.sentence.fine }) : props.error.message
})
</script>

<template>
  <section
    class="cc-hud absolute left-1/2 top-16 z-30 w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop px-4 py-3"
    role="status"
    aria-labelledby="cc-jail-title"
  >
    <p id="cc-jail-title" class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      {{ sentence.kind === 'officer' ? t('jail.heldTitle') : t('jail.title') }}
    </p>
    <p class="m-0 mt-1 text-sm font-bold text-fog">
      {{ t('jail.timeLeft') }} <span class="text-sun">{{ timeLeft }}</span>
    </p>
    <p v-if="sentence.kind === 'officer'" class="m-0 mt-0.5 text-xs text-mist">{{ t('jail.heldHint') }}</p>
    <p v-else class="m-0 mt-0.5 text-xs text-mist">{{ t('jail.fineHint', { fine: sentence.fine }) }}</p>
    <div v-if="sentence.kind === 'npc'" class="mt-2 flex items-center gap-2">
      <button type="button" class="cc-btn cc-btn-sm cc-btn-mint pointer-events-auto min-h-11" :disabled="paying" @click="emit('pay')">
        {{ paying ? t('jail.paying') : t('jail.pay', { fine: sentence.fine }) }}
      </button>
    </div>
    <p v-if="errorText" class="m-0 mt-2 text-xs font-bold text-coral" role="alert">{{ errorText }}</p>
  </section>
</template>
