<script setup lang="ts">
import { ref, watch } from 'vue'
import type { UiIconName } from '../ui/icons'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{ src: string | null; icon: UiIconName; size: number }>()

// a missing preview.png falls back to the icon instead of a broken image
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <span class="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-950/60" :style="{ width: `${size}px`, height: `${size}px` }">
    <img v-if="src && !failed" :src="src" alt="" loading="lazy" decoding="async" class="size-full object-contain" @error="failed = true" />
    <UiIcon v-else :name="icon" :size="Math.round(size * 0.55)" class="text-mist" />
  </span>
</template>
