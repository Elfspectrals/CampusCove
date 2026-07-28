<script setup lang="ts">
defineProps<{
  currentRoomLabel: 'city' | 'apartment'
  apartmentObjectCount: number
  positionLabel: string
}>()
</script>

<template>
  <div class="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
    <span class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90">
      Room: {{ currentRoomLabel }}
    </span>
    <span
      class="rounded-md border border-white/25 bg-black/45 px-2 py-1 font-mono text-xs text-white/90"
      title="Player world coordinates"
    >
      XYZ {{ positionLabel }}
    </span>
    <span
      v-if="currentRoomLabel === 'apartment'"
      class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90"
    >
      Objects: {{ apartmentObjectCount }}
    </span>
    <slot />
  </div>
</template>
