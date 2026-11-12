<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  /** Items in the cart (sum of the quantities); the button is only shown when it is above 0. */
  count: number
  /** Key that opens the cart (L by default, rebindable). */
  keyLabel: string
}>()

const emit = defineEmits<{ open: [] }>()
const { t } = useI18n()
</script>

<template>
  <!-- While the mouse is captured the cursor is hidden and clicks go to the game, so the key is shown too;
       the button itself is clickable whenever the cursor is free (pause, inventory, a shop screen). -->
  <button
    type="button"
    class="cc-hud relative inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 text-xs font-extrabold text-fog transition hover:text-sun"
    :aria-label="t('cart.button', { n: count, key: keyLabel })"
    @click="emit('open')"
  >
    <UiIcon name="cart" :size="16" />
    <span class="text-mist">{{ keyLabel }}</span>
    <span
      class="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1 font-display text-[11px] leading-none text-ink-950"
      aria-hidden="true"
    >
      {{ count > 99 ? '99+' : count }}
    </span>
  </button>
</template>
