<script setup lang="ts">
import { computed } from 'vue'
import { portionSegments } from '../../game/survival'

const props = defineProps<{ portions?: number | null; portionsLeft?: number | null }>()

const segments = computed(() => portionSegments(props.portions, props.portionsLeft))
</script>

<template>
  <!-- bites left on the food being eaten, like a durability bar: 4/4 -> 3/4 -> ... -->
  <div
    v-if="segments"
    class="pointer-events-none absolute inset-x-1.5 bottom-1 z-[1] flex gap-[2px]"
    :title="`${segments.filled}/${segments.total}`"
  >
    <span
      v-for="i in segments.total"
      :key="i"
      class="h-[4px] flex-1 rounded-[1px] shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
      :class="i <= segments.filled ? (segments.filled === 1 ? 'bg-coral' : 'bg-mint') : 'bg-black/50'"
    />
  </div>
</template>
