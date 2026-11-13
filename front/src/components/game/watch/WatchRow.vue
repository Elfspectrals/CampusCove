<script setup lang="ts">
defineProps<{
  selected: boolean
  dot: 'sun' | 'mint' | 'pool' | 'grape' | 'coral' | 'mist'
  name: string
  meta: string
}>()

const DOT_CLASSES = { sun: 'bg-sun', mint: 'bg-mint', pool: 'bg-pool', grape: 'bg-grape', coral: 'bg-coral', mist: 'bg-mist/40' } as const
</script>

<template>
  <li
    :data-watch-selected="selected || undefined"
    :class="[
      'flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px]',
      selected ? 'bg-ink-700 shadow-[inset_3px_0_0_rgb(var(--cc-sun))]' : '',
    ]"
  >
    <span :class="['size-2 shrink-0 rounded-full', DOT_CLASSES[dot]]" />
    <span class="min-w-0 flex-1 truncate font-bold text-fog">{{ name }}</span>
    <span class="min-w-0 max-w-[50%] truncate text-[11px] text-mist">{{ meta }}</span>
  </li>
</template>
