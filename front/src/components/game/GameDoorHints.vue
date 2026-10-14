<script setup lang="ts">
defineProps<{
  inventoryOpen: boolean
}>()
</script>

<template>
  <div
    v-if="!inventoryOpen"
    class="cc-hud pointer-events-none absolute bottom-[5.75rem] left-1/2 z-10 flex max-w-[min(26rem,calc(100vw-3rem))] -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-mist"
  >
    <span class="cc-keycap">E</span> Inventory
    <span class="mx-1 h-3 w-0.5 bg-white/15" />
    <span class="cc-keycap">C</span> Collision
  </div>
</template>
