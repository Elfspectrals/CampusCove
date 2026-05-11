<script setup lang="ts">
defineProps<{
  currentRoomLabel: 'city' | 'apartment'
  nearApartmentDoor: boolean
  nearCityDoor: boolean
  apartmentInventoryOpen: boolean
}>()
</script>

<template>
  <div
    v-if="currentRoomLabel === 'apartment' && nearApartmentDoor"
    class="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-2 text-xs text-white/95"
  >
    Press I near the door to exit apartment
  </div>
  <div
    v-if="currentRoomLabel === 'city' && nearCityDoor"
    class="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-2 text-xs text-white/95"
  >
    Press I near the building door to enter apartment
  </div>
  <div
    v-if="currentRoomLabel === 'apartment'"
    class="pointer-events-none absolute bottom-16 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-2 text-xs text-white/95"
  >
    Press E to {{ apartmentInventoryOpen ? 'close' : 'open' }} apartment inventory
  </div>
</template>
