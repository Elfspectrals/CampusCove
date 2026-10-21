<script setup lang="ts">
import type { ShowroomApartment } from '../../game/newNation/showroomLayout'
import UiIcon from '../ui/UiIcon.vue'

/** Buttons to jump to each model apartment of the showroom, plus previous / next. */
defineProps<{
  apartments: ShowroomApartment[]
  currentApartmentId: string | null
}>()

const emit = defineEmits<{
  visit: [id: string]
  step: [delta: 1 | -1]
}>()
</script>

<template>
  <div class="cc-panel-glass pointer-events-auto flex max-w-full flex-wrap items-center gap-1 p-1.5">
    <button
      type="button"
      class="rounded-md px-2 py-1.5 text-xs font-bold hover:bg-white/10"
      aria-label="Previous apartment"
      @click="emit('step', -1)"
    >
      <UiIcon name="chevron-left" :size="16" />
    </button>
    <button
      v-for="apt in apartments"
      :key="apt.id"
      type="button"
      :class="[
        'rounded-xl px-2.5 py-1.5 font-display text-xs tracking-wide transition',
        currentApartmentId === apt.id ? 'bg-sun text-ink-950 shadow-[inset_0_-3px_0_rgb(var(--cc-sun-edge))]' : 'text-fog hover:bg-white/10',
      ]"
      @click="emit('visit', apt.id)"
    >
      <UiIcon name="home" :size="14" class="mr-1 inline align-[-2px]" />{{ apt.name }}
    </button>
    <button
      type="button"
      class="rounded-md px-2 py-1.5 text-xs font-bold hover:bg-white/10"
      aria-label="Next apartment"
      @click="emit('step', 1)"
    >
      <UiIcon name="chevron-right" :size="16" />
    </button>
  </div>
</template>
