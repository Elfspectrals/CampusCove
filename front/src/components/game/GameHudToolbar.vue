<script setup lang="ts">
defineProps<{
  currentRoomLabel: 'city' | 'apartment'
  apartmentObjectCount: number
  editorEnabled: boolean
}>()

const emit = defineEmits<{
  toggleEditor: []
  setTransformMode: [mode: 'translate' | 'rotate']
}>()
</script>

<template>
  <div class="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
    <span class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90">
      Room: {{ currentRoomLabel }}
    </span>
    <span
      v-if="currentRoomLabel === 'apartment'"
      class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90"
    >
      Objects: {{ apartmentObjectCount }}
    </span>
    <button
      v-if="currentRoomLabel === 'apartment'"
      type="button"
      class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
      @click="emit('toggleEditor')"
    >
      {{ editorEnabled ? 'Disable editor' : 'Enable editor' }}
    </button>
    <button
      v-if="currentRoomLabel === 'apartment' && editorEnabled"
      type="button"
      class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
      @click="emit('setTransformMode', 'translate')"
    >
      Move
    </button>
    <button
      v-if="currentRoomLabel === 'apartment' && editorEnabled"
      type="button"
      class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
      @click="emit('setTransformMode', 'rotate')"
    >
      Rotate
    </button>
  </div>
</template>
