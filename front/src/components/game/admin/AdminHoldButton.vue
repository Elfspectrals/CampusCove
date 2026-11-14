<script setup lang="ts">
/** A button that runs its action only after being held for HOLD_MS (the fill shows the progress). */
defineProps<{ holding: boolean; label: string; disabled?: boolean; danger?: boolean }>()
const emit = defineEmits<{ start: []; cancel: [] }>()
</script>

<template>
  <button
    type="button"
    :class="['cc-btn cc-btn-sm relative min-h-11 overflow-hidden', danger ? 'bg-coral text-ink-950' : '']"
    :disabled="disabled"
    @pointerdown="emit('start')"
    @pointerup="emit('cancel')"
    @pointerleave="emit('cancel')"
  >
    <span v-if="holding" class="hold-fill absolute inset-y-0 left-0 bg-ink-950/30" aria-hidden="true" />
    <span class="relative">{{ label }}</span>
  </button>
</template>

<style scoped>
.hold-fill {
  animation: cc-hold 1s linear forwards;
}

@keyframes cc-hold {
  from {
    width: 0;
  }
  to {
    width: 100%;
  }
}
</style>
