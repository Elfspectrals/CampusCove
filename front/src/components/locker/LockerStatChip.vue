<script setup lang="ts">
interface StatChipProps {
  label: string
  value: string
  tone: 'success' | 'warning'
}

const props = defineProps<StatChipProps>()

const toneClass = {
  success: 'text-[#22C55E]',
  warning: 'text-[#F97316]',
}
</script>

<template>
  <div class="inline-flex items-center gap-2 rounded-md bg-black/25 px-2 py-1">
    <span class="font-mono text-[12px] text-slate-200">{{ props.label }}</span>
    <span class="font-mono text-[12px]" :class="toneClass[props.tone]">{{ props.value }}</span>
  </div>
</template>
