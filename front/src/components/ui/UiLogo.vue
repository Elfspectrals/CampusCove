<script setup lang="ts">
withDefaults(defineProps<{ size?: 'sm' | 'md' | 'xl'; mark?: boolean }>(), { size: 'md', mark: false })
</script>

<template>
  <span class="inline-flex select-none items-center gap-2.5">
    <!-- isometric "cove" cube mark -->
    <svg
      :class="size === 'xl' ? 'h-20 w-20' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10'"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path d="M24 3 43 13.5v21L24 45 5 34.5v-21z" fill="rgb(8 10 32)" />
      <path d="M24 6 40.5 15 24 24 7.5 15z" fill="rgb(255 202 58)" />
      <path d="M7.5 15 24 24v18L7.5 33z" fill="rgb(64 214 245)" />
      <path d="M40.5 15 24 24v18l16.5-9z" fill="rgb(168 110 255)" />
      <path d="M16 19.5 24 24v8l-8-4.5z" fill="rgb(8 10 32)" opacity=".35" />
      <path d="M24 9.5 33 14.5" stroke="white" stroke-width="2" stroke-linecap="round" opacity=".6" />
    </svg>
    <span
      v-if="!mark"
      :class="[
        'cc-display leading-none text-fog',
        size === 'xl' ? 'text-6xl sm:text-7xl' : size === 'sm' ? 'text-lg' : 'text-2xl',
      ]"
    >
      Campus<span class="text-sun">Cove</span>
    </span>
  </span>
</template>
