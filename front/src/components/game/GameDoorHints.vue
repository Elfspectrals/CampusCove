<script setup lang="ts">
defineProps<{
  inventoryOpen: boolean
}>()
</script>

<template>
  <div
    v-if="!inventoryOpen"
    class="pointer-events-none absolute bottom-24 left-1/2 z-10 max-w-[min(22rem,calc(100vw-3rem))] -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-1.5 text-center text-[11px] text-white/85"
  >
    Press E to open inventory
  </div>
</template>
