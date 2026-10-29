<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { MAX_STAMINA, isTired } from '../../game/stamina'
import { GAUGE_COLORS, isLow } from '../../game/survival'

/** Health and stamina above the hotbar, always shown (hunger and thirst stay on the watch). */
const props = defineProps<{ health: number | null; healUntil: number; stamina: number; reducedEffects: boolean }>()

const now = ref(Date.now())
const clock = window.setInterval(() => (now.value = Date.now()), 250)
onBeforeUnmount(() => window.clearInterval(clock))

const tired = computed(() => isTired(props.stamina))
const lowHealth = computed(() => props.health !== null && isLow(props.health))
const healingS = computed(() => (props.healUntil > now.value ? Math.ceil((props.healUntil - now.value) / 1000) : 0))
const blink = computed(() => !props.reducedEffects)
</script>

<template>
  <div class="cc-hud pointer-events-none absolute bottom-[92px] left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 px-3 py-2">
    <div v-if="health !== null" class="flex items-center gap-2">
      <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 drop-shadow" :fill="GAUGE_COLORS.health" aria-hidden="true">
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.2 0 3.6 1.2 5.3 3.2 1.7-2 3.1-3.2 5.3-3.2 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z" />
      </svg>
      <div
        class="cc-vital-track"
        :class="lowHealth && blink ? 'cc-vital-blink' : ''"
        role="progressbar"
        aria-label="Health"
        :aria-valuenow="Math.round(health)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div
          class="cc-vital-fill"
          :class="healingS > 0 && blink ? 'cc-vital-healing' : ''"
          :style="{ width: `${Math.max(0, Math.min(100, health))}%`, background: GAUGE_COLORS.health }"
        />
      </div>
      <span class="cc-vital-value">{{ Math.round(health) }}</span>
      <span v-if="healingS > 0" class="cc-vital-value text-mint">+{{ healingS }}s</span>
    </div>

    <div class="flex items-center gap-2">
      <svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 drop-shadow" :class="tired ? 'fill-coral' : 'fill-mint'" aria-hidden="true">
        <path d="M13.5 2 4 13.5h6.5L9 22l10-12.5h-6.6L13.5 2z" />
      </svg>
      <div
        class="cc-vital-track"
        :class="tired && blink ? 'cc-vital-blink' : ''"
        role="progressbar"
        aria-label="Stamina"
        :aria-valuenow="Math.round(stamina)"
        aria-valuemin="0"
        :aria-valuemax="MAX_STAMINA"
      >
        <div class="cc-vital-fill" :class="tired ? 'bg-coral' : 'bg-mint'" :style="{ width: `${(stamina / MAX_STAMINA) * 100}%` }" />
      </div>
      <span class="cc-vital-value">{{ Math.round(stamina) }}</span>
    </div>
  </div>
</template>

<style scoped>
.cc-vital-track {
  height: 14px;
  width: min(170px, 28vw);
  overflow: hidden;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.6);
  box-shadow: 0 0 0 2px rgb(255 255 255 / 0.25), inset 0 2px 3px rgb(0 0 0 / 0.5);
}
.cc-vital-fill {
  height: 100%;
  border-radius: 9999px;
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / 0.2), inset 0 2px 0 rgb(255 255 255 / 0.3);
  transition: width 120ms linear;
}
.cc-vital-value {
  min-width: 2ch;
  font-size: 0.85rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #f1efe8;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.8);
}
.cc-vital-blink {
  animation: cc-vital-pulse 0.5s ease-in-out infinite alternate;
}
.cc-vital-healing {
  animation: cc-vital-heal 0.8s ease-in-out infinite alternate;
}
@keyframes cc-vital-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.4;
  }
}
@keyframes cc-vital-heal {
  from {
    filter: brightness(1);
  }
  to {
    filter: brightness(1.45);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cc-vital-blink,
  .cc-vital-healing {
    animation: none;
  }
}
</style>
