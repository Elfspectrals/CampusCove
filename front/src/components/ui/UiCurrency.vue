<script setup lang="ts">
import { computed } from 'vue'

/** Coin / gem glyph, optionally with an amount — the in-game currency look. */
const props = withDefaults(
  defineProps<{
    currency: 'coins' | 'premium'
    amount?: number | null
    size?: number
    pill?: boolean
  }>(),
  { amount: undefined, size: 18, pill: false },
)

const text = computed(() => {
  if (props.amount === undefined) return ''
  return props.amount === null ? '—' : props.amount.toLocaleString()
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center gap-1.5 font-display leading-none tracking-wide',
      pill
        ? currency === 'coins'
          ? 'rounded-full border-2 border-sun-edge/70 bg-ink-950/70 py-1 pl-1 pr-3 text-sun'
          : 'rounded-full border-2 border-grape-edge/70 bg-ink-950/70 py-1 pl-1 pr-3 text-grape'
        : '',
    ]"
  >
    <svg v-if="currency === 'coins'" :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
      <circle cx="12" cy="13" r="9.5" fill="rgb(201 120 14)" />
      <circle cx="12" cy="11.5" r="9.5" fill="rgb(255 202 58)" />
      <circle cx="12" cy="11.5" r="6.2" fill="none" stroke="rgb(201 120 14)" stroke-width="1.8" />
      <path d="M10.5 8.5h3v6h-3z" fill="rgb(201 120 14)" />
      <ellipse cx="8.5" cy="7" rx="2.4" ry="1.2" fill="white" opacity=".55" transform="rotate(-30 8.5 7)" />
    </svg>
    <svg v-else :width="size" :height="size" viewBox="0 0 24 24" aria-hidden="true" class="shrink-0">
      <path d="M12 22 2 9.5 6 3h12l4 6.5z" fill="rgb(104 56 196)" />
      <path d="M12 20 3.5 9.5 7 4h10l3.5 5.5z" fill="rgb(168 110 255)" />
      <path d="M3.5 9.5h17L12 20z" fill="rgb(140 80 230)" />
      <path d="M7 4l2 5.5L12 4l3 5.5L17 4" fill="none" stroke="white" stroke-opacity=".5" stroke-width="1.2" />
    </svg>
    <span v-if="text">{{ text }}</span>
  </span>
</template>
