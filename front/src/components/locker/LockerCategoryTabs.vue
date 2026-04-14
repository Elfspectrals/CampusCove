<script setup lang="ts">
interface LockerCategory {
  id: string
  label: string
}

const props = defineProps<{
  categories: LockerCategory[]
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

function selectCategory(categoryId: string): void {
  emit('update:modelValue', categoryId)
}

function iconForCategory(categoryId: string): string {
  switch (categoryId) {
    case 'outfit':
      return 'M12 3.5l6 2.8v5.4c0 4.2-2.5 8-6 9.8-3.5-1.8-6-5.6-6-9.8V6.3l6-2.8z'
    case 'backbling':
      return 'M7 4h10l2 3v11H5V7l2-3zm5 4v5'
    case 'pickaxe':
      return 'M7 6l10 10M10 4c3 0 5 2 5 5'
    case 'glider':
      return 'M4 9h16M12 9v8M7 9l5-5 5 5'
    case 'emote':
      return 'M8 10h.01M16 10h.01M8 16c1.1 1.1 2.5 1.7 4 1.7s2.9-.6 4-1.7M4 12a8 8 0 1016 0 8 8 0 10-16 0z'
    default:
      return 'M5 7h14M7 12h10M9 17h6'
  }
}
</script>

<template>
  <div class="inline-flex flex-wrap gap-2 rounded-2xl border border-white/15 bg-[#070f1f]/70 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
    <button
      v-for="category in props.categories"
      :key="category.id"
      type="button"
      :class="
        props.modelValue === category.id
          ? 'border-[#facc15] bg-[#facc15] text-black shadow-[0_0_0_1px_rgba(250,204,21,0.5),0_10px_22px_rgba(250,204,21,0.28)]'
          : 'border-white/25 bg-[#0b152b]/70 text-white hover:border-cyan-200/70 hover:bg-[#122342]'
      "
      class="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-black uppercase tracking-[0.12em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/65"
      @click="selectCategory(category.id)"
    >
      <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path :d="iconForCategory(category.id)" />
      </svg>
      <span>{{ category.label }}</span>
    </button>
  </div>
</template>
