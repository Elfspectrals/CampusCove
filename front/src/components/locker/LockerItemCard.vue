<script setup lang="ts">
interface LockerItemCardData {
  id: number
  name: string
  slot: string
  quantity: number
  previewImageSrc: string
  fallbackImageUsed: boolean
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
  (e: 'equip'): void
}>()
</script>

<template>
  <article
    class="group relative min-h-[220px] overflow-hidden rounded-lg border bg-[#1E293B] p-0 text-left shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(59,130,246,0.35)]"
    :class="
      props.selected
        ? 'border-[#3B82F6] shadow-[0_0_16px_rgba(59,130,246,0.55)]'
        : props.isEmpty
          ? 'border-slate-600'
          : 'border-slate-700 hover:border-slate-300'
    "
  >
    <span
      v-if="props.isNew && !props.isEmpty"
      class="absolute right-2 top-2 rounded bg-[#FFD700] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-black"
    >
      NEW
    </span>

    <button
      type="button"
      class="relative block w-full border-b border-slate-700/60 text-left"
      :disabled="props.busy || props.isEmpty"
      @click="emit('select')"
    >
      <template v-if="props.isEmpty">
        <div class="flex aspect-square items-center justify-center bg-slate-800/60 text-slate-500">
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
      </template>
      <template v-else>
        <div class="aspect-square overflow-hidden bg-slate-900/40">
          <img
            class="h-full w-full object-cover transition duration-200 group-hover:scale-[1.03]"
            :src="props.item?.previewImageSrc"
            :alt="`${props.item?.name ?? 'Skin'} preview`"
            loading="lazy"
          />
        </div>
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/85 to-transparent" />
        <p
          v-if="props.item?.fallbackImageUsed"
          class="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-100"
        >
          Placeholder
        </p>
        <p
          v-if="props.busy"
          class="pointer-events-none absolute bottom-2 right-2 rounded bg-cyan-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100"
        >
          Equipping...
        </p>
      </template>
    </button>

    <div class="space-y-2 p-2.5">
      <p class="truncate text-sm font-bold uppercase tracking-[0.08em] text-white">
        {{ props.item?.name ?? 'Empty Slot' }}
      </p>
      <p class="text-xs font-semibold text-slate-300">
        {{ props.item?.slot ?? 'Add item' }}<span v-if="props.item"> · Qty {{ props.item.quantity }}</span>
      </p>
      <button
        v-if="!props.isEmpty"
        type="button"
        class="w-full rounded-md border px-2 py-1.5 text-xs font-bold uppercase tracking-[0.1em] transition duration-150"
        :class="
          props.selected
            ? 'border-cyan-300/70 bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30'
            : 'border-slate-500 bg-slate-800 text-slate-100 hover:border-cyan-300/70 hover:bg-cyan-500/20 hover:text-cyan-50'
        "
        :disabled="props.busy"
        @click="emit('equip')"
      >
        {{ props.selected ? 'Equipped' : 'Equip' }}
      </button>
    </div>
  </article>
</template>
