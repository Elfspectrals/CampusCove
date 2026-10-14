<script setup lang="ts">
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  currentRoomLabel: 'city' | 'apartment'
  apartmentObjectCount: number
  positionLabel: string
}>()
</script>

<template>
  <div class="pointer-events-auto absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
    <span class="cc-hud inline-flex items-center gap-2 px-3 py-1.5 font-display text-sm tracking-wide">
      <UiIcon :name="currentRoomLabel === 'apartment' ? 'home' : 'map'" :size="16" class="text-sun" />
      {{ currentRoomLabel === 'apartment' ? 'Apartment' : 'Campus Town' }}
    </span>
    <span class="cc-hud px-2.5 py-1.5 font-mono text-[11px] text-mist" title="Player world coordinates">
      XYZ {{ positionLabel }}
    </span>
    <span
      v-if="currentRoomLabel === 'apartment'"
      class="cc-hud inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold"
    >
      <UiIcon name="chair" :size="14" class="text-pool" /> {{ apartmentObjectCount }} objects
    </span>
    <slot />
  </div>
</template>
