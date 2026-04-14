<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface LockerItemCardData {
  id: number
  name: string
  previewImageSrc: string
  fallbackImageUsed: boolean
}

const PLACEHOLDER_SKIN_IMAGE_SRC = new URL('../../assets/image/placeholderSkin.jpg', import.meta.url).href

const props = defineProps<{
  item?: LockerItemCardData
  selected: boolean
  equipped: boolean
  isNew: boolean
  isEmpty: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  (e: 'select'): void
  (e: 'equip'): void
}>()

const previewImageSrc = ref<string>(PLACEHOLDER_SKIN_IMAGE_SRC)
const imageFallbackUsed = ref<boolean>(true)

watch(
  () => props.item,
  (item) => {
    previewImageSrc.value = item?.previewImageSrc ?? PLACEHOLDER_SKIN_IMAGE_SRC
    imageFallbackUsed.value = item?.fallbackImageUsed ?? true
  },
  { immediate: true },
)

const cardAriaLabel = computed<string>(() => {
  if (props.isEmpty) return 'Empty locker slot'
  const itemName = props.item?.name ?? 'skin'
  return props.equipped ? `${itemName}, currently equipped` : `${itemName}, select skin`
})

function handleImageError(): void {
  if (previewImageSrc.value === PLACEHOLDER_SKIN_IMAGE_SRC) return
  previewImageSrc.value = PLACEHOLDER_SKIN_IMAGE_SRC
  imageFallbackUsed.value = true
}
</script>

<template>
  <article
    class="group relative overflow-hidden rounded-2xl border bg-gradient-to-b from-[#1b2f59] to-[#13223f] p-0 text-left shadow-[0_18px_34px_rgba(2,6,23,0.58)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(37,99,235,0.45)]"
    :class="
      props.equipped
        ? 'border-[#22d3ee] shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_0_24px_rgba(34,211,238,0.45)]'
        : props.selected
          ? 'border-[#fde047] shadow-[0_0_0_1px_rgba(253,224,71,0.45),0_0_22px_rgba(253,224,71,0.28)]'
          : props.isEmpty
          ? 'border-slate-600'
          : 'border-slate-700 hover:border-slate-300'
    "
  >
    <span
      v-if="props.isNew && !props.isEmpty"
      class="absolute right-3 top-3 z-20 rounded bg-[#facc15] px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black"
    >
      NEW
    </span>

    <button
      type="button"
      class="relative block w-full text-left"
      :disabled="props.busy || props.isEmpty"
      :aria-label="cardAriaLabel"
      @click="emit('select')"
    >
      <template v-if="props.isEmpty">
        <div class="flex aspect-[3/4] items-center justify-center bg-slate-800/60 text-slate-500">
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </div>
      </template>
      <template v-else>
        <div class="relative aspect-[3/4] overflow-hidden bg-slate-900/50">
          <img
            class="h-full w-full object-cover transition duration-300 group-hover:scale-[1.06]"
            :src="previewImageSrc"
            :alt="`${props.item?.name ?? 'Skin'} preview`"
            loading="lazy"
            @error="handleImageError"
          />
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020617]/95 via-[#020617]/25 to-transparent" />
        </div>
        <p
          v-if="props.equipped"
          class="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-cyan-400/90 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#042f2e]"
        >
          Equipped
        </p>
        <p
          v-else-if="props.selected"
          class="pointer-events-none absolute bottom-3 left-3 z-10 rounded bg-[#facc15] px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-black"
        >
          Selected
        </p>
        <p
          v-if="imageFallbackUsed"
          class="pointer-events-none absolute left-3 top-3 z-10 rounded bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-100"
        >
          Placeholder
        </p>
        <p
          v-if="props.busy"
          class="pointer-events-none absolute bottom-3 right-3 z-10 rounded bg-cyan-400/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100"
        >
          Equipping...
        </p>
      </template>
    </button>

    <div class="space-y-3 bg-gradient-to-b from-[#0f172a] to-[#111827] p-3">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="truncate text-sm font-black uppercase tracking-[0.12em] text-white">
            {{ props.item?.name ?? 'Unknown Skin' }}
          </p>
          <p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">Owned Outfit</p>
        </div>
        <span class="rounded bg-[#1e3a8a] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100">
          Epic
        </span>
      </div>
      <button
        v-if="!props.isEmpty"
        type="button"
        class="w-full rounded-lg border px-3 py-2.5 text-xs font-black uppercase tracking-[0.14em] transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        :class="
          props.equipped
            ? 'border-cyan-300/70 bg-cyan-500/25 text-cyan-100 hover:bg-cyan-500/30'
            : props.selected
              ? 'border-[#facc15] bg-[#facc15] text-black hover:bg-[#fde047]'
              : 'border-slate-500 bg-slate-800 text-slate-100 hover:border-slate-300 hover:bg-slate-700'
        "
        :disabled="props.busy"
        :aria-label="`Equip ${props.item?.name ?? 'skin'}`"
        @click="emit('equip')"
      >
        {{ props.busy ? 'Equipping...' : props.equipped ? 'Equipped' : 'Equip Outfit' }}
      </button>
    </div>
  </article>
</template>
