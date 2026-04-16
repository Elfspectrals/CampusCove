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
  item: LockerItemCardData
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
    previewImageSrc.value = item.previewImageSrc ?? PLACEHOLDER_SKIN_IMAGE_SRC
    imageFallbackUsed.value = item.fallbackImageUsed ?? true
  },
  { immediate: true },
)

const cardAriaLabel = computed<string>(() => {
  if (props.isEmpty) return 'Empty locker slot'
  const itemName = props.item.name
  return props.equipped ? `${itemName}, currently equipped` : `${itemName}, select skin`
})

const dotToneClass = computed<string>(() => {
  if (props.equipped) return 'bg-[#a855f7]'
  if (props.isNew) return 'bg-[#fbbf24]'
  return 'bg-[#3b82f6]'
})

function handleImageError(): void {
  if (previewImageSrc.value === PLACEHOLDER_SKIN_IMAGE_SRC) return
  previewImageSrc.value = PLACEHOLDER_SKIN_IMAGE_SRC
  imageFallbackUsed.value = true
}
</script>

<template>
  <article
    class="group relative overflow-hidden rounded-xl border bg-[#050b18] p-0 text-left shadow-[0_12px_24px_rgba(2,6,23,0.65)] transition duration-150"
    :class="
      props.selected
        ? 'border-[#00d4ff] shadow-[0_0_0_1px_rgba(0,212,255,0.6),0_0_20px_rgba(0,212,255,0.38)]'
        : 'border-[#243348] hover:border-[#3c5f8b]'
    "
  >
    <button
      type="button"
      class="relative block w-full text-left"
      :disabled="props.busy || props.isEmpty"
      :aria-label="cardAriaLabel"
      @click="emit('select')"
    >
      <div class="relative aspect-square overflow-hidden">
        <img
          class="h-full w-full object-cover transition duration-200 group-hover:scale-[1.04]"
          :class="props.busy ? 'opacity-60' : ''"
          :src="previewImageSrc"
          :alt="`${props.item.name} preview`"
          loading="lazy"
          @error="handleImageError"
        />
        <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
        <span
          class="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-black/35"
          :class="dotToneClass"
          :title="props.equipped ? 'Equipped' : props.isNew ? 'New' : 'Owned'"
        />
        <span
          v-if="imageFallbackUsed"
          class="absolute left-2 top-2 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-100"
        >
          Placeholder
        </span>
        <p class="absolute inset-x-2 bottom-2 truncate text-[11px] font-black uppercase tracking-[0.08em] text-white">
          {{ props.item.name }}
        </p>
      </div>
    </button>
  </article>
</template>
