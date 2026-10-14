<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type UiIconName } from './icons'

const props = withDefaults(
  defineProps<{
    name: UiIconName
    size?: number | string
    strokeWidth?: number
    fill?: boolean
  }>(),
  { size: 20, strokeWidth: 2.25, fill: false },
)

const d = computed(() => ICONS[props.name])
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size))
</script>

<template>
  <svg
    :width="px"
    :height="px"
    viewBox="0 0 24 24"
    :fill="fill ? 'currentColor' : 'none'"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    class="shrink-0"
  >
    <path :d="d" />
  </svg>
</template>
