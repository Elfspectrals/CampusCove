<script setup lang="ts">
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  message: string
}>()
</script>

<template>
  <div
    class="cc-hud pointer-events-auto absolute left-1/2 top-4 z-10 flex max-w-md -translate-x-1/2 animate-cc-pop items-center gap-2 border-sun/60 px-4 py-2 text-sm font-bold text-sun"
    role="status"
  >
    <UiIcon name="info" :size="18" />
    {{ message }}
  </div>
</template>
