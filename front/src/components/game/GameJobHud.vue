<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import UiCurrency from '../ui/UiCurrency.vue'
import { formatClock, shiftDisplay } from '../../game/jobs/stations'
import type { DeskTag, WorkShift } from '../../composables/game/useJobs'

const props = defineProps<{
  shift: WorkShift | null
  deskTag: DeskTag | null
  leaveKey: string
}>()
defineEmits<{ leave: [] }>()

const { t } = useI18n()

// Display clock only: the time and the countdown run between two server messages, the coins never do.
const now = ref(performance.now())
let timer: number | undefined
watch(
  () => props.shift !== null,
  (working) => {
    window.clearInterval(timer)
    timer = working ? window.setInterval(() => (now.value = performance.now()), 250) : undefined
  },
  { immediate: true },
)
onUnmounted(() => window.clearInterval(timer))

const clock = computed(() => (props.shift ? shiftDisplay(props.shift.clock, now.value) : null))
</script>

<template>
  <p
    v-if="deskTag"
    class="cc-hud pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 px-3 py-1 text-xs font-bold text-coral"
    :style="{ left: `${deskTag.x}px`, top: `${deskTag.y}px` }"
  >
    {{ deskTag.label }}
  </p>
  <!-- above the pause overlay (z-20) so the button stays reachable once Esc frees the mouse -->
  <section
    v-if="shift && clock"
    class="cc-hud pointer-events-none absolute left-3 top-16 z-30 w-64 px-3 py-2.5 text-xs"
    :aria-label="shift.jobName"
    role="status"
  >
    <p class="m-0 flex items-center justify-between font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      <span>{{ shift.jobName }}</span>
      <span
        v-if="shift.lastPaid"
        :key="shift.lastPaid.period"
        class="animate-cc-pop font-bold normal-case tracking-normal text-sun"
      >
        {{ t('jobs.paid', { coins: shift.lastPaid.coins }) }}
      </span>
    </p>
    <dl class="m-0 mt-1.5 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 font-bold text-fog">
      <dt class="text-mist">{{ t('jobs.salary') }}</dt>
      <dd class="m-0 flex items-center gap-1">
        <UiCurrency currency="coins" :amount="shift.salaryPerMinute" :size="14" />
        <span class="text-mist">{{ t('jobs.perMinute') }}</span>
      </dd>
      <dt class="text-mist">{{ t('jobs.worked') }}</dt>
      <dd class="m-0 font-mono">{{ formatClock(clock.workedMs) }}</dd>
      <dt class="text-mist">{{ t('jobs.nextPay') }}</dt>
      <dd class="m-0 font-mono" :class="shift.paymentDelayed ? 'text-coral' : ''">
        {{ shift.paymentDelayed ? '…' : formatClock(clock.nextPaymentInMs) }}
      </dd>
      <dt class="text-mist">{{ t('jobs.earned') }}</dt>
      <dd class="m-0"><UiCurrency currency="coins" :amount="shift.earned" :size="14" /></dd>
    </dl>
    <p v-if="shift.paymentDelayed" class="m-0 mt-1.5 text-[11px] font-bold text-coral">{{ t('jobs.paymentDelayed') }}</p>
    <button
      type="button"
      class="pointer-events-auto mt-2 w-full rounded-lg border-2 border-coral/60 px-2 py-1 text-[11px] font-extrabold text-coral transition hover:bg-coral/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sun"
      @click="$emit('leave')"
    >
      {{ t('jobs.leaveKey', { key: leaveKey }) }}
    </button>
  </section>
</template>
