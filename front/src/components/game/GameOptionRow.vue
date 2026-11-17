<script setup lang="ts">
defineProps<{ label: string; help: string }>()
const emit = defineEmits<{ describe: [help: string] }>()
</script>

<template>
  <label class="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-ink-950/50 px-4 py-2" @mouseenter="emit('describe', help)" @focusin="emit('describe', help)">
    <span class="min-w-40 flex-1 text-sm font-bold text-fog">{{ label }}</span>
    <span class="flex min-w-0 flex-[2] items-center justify-end gap-3"><slot /></span>
  </label>
</template>
