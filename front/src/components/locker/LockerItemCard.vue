<script setup lang="ts">
interface LockerItemCardData {
  id: number
  name: string
  slot: string
  quantity: number
}

const props = defineProps<{
  item?: LockerItemCardData
  selected: boolean
  isNew: boolean
  isEmpty: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
}>()

function itemInitial(name: string | undefined): string {
  if (!name) return '+'
  const trimmed = name.trim()
  if (trimmed.length === 0) return '+'
  return trimmed.charAt(0).toUpperCase()
}
</script>

<template>
  <button
    type="button"
    class="group relative min-h-[152px] overflow-hidden rounded-lg border bg-[#1E293B] p-0 text-left shadow-[0_6px_16px_rgba(0,0,0,0.3)] transition duration-200 hover:scale-105 hover:shadow-[0_0_16px_rgba(59,130,246,0.35)]"
    :class="
      props.selected
        ? 'border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.55)]'
        : props.isEmpty
          ? 'border-slate-600'
          : 'border-slate-700 hover:border-slate-300'
    "
    :disabled="props.busy || props.isEmpty"
    @click="emit('select')"
  >
    <span
      v-if="props.isNew && !props.isEmpty"
      class="absolute right-2 top-2 rounded bg-[#FFD700] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black"
    >
      NEW
    </span>

    <div
      class="flex aspect-square items-center justify-center border-b border-slate-700/60 text-5xl font-black"
      :class="props.isEmpty ? 'bg-slate-800/60 text-slate-500' : 'bg-slate-900/40 text-slate-100'"
    >
      <template v-if="props.isEmpty">
        <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </template>
      <template v-else>
        {{ itemInitial(props.item?.name) }}
      </template>
    </div>

    <div class="space-y-1 p-2">
      <p class="truncate text-sm font-semibold text-white">
        {{ props.item?.name ?? 'Empty Slot' }}
      </p>
      <p class="text-xs font-semibold text-slate-300">
        {{ props.item?.slot ?? 'Add item' }}<span v-if="props.item"> · Qty {{ props.item.quantity }}</span>
      </p>
    </div>
  </button>
</template>
