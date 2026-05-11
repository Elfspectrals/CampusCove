<script setup lang="ts">
defineProps<{
  message: string
}>()
</script>

<template>
  <div
    class="pointer-events-auto absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-lg border border-amber-400/50 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
    role="status"
  >
    {{ message }}
  </div>
</template>
