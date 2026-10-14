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
  if (props.equipped) return 'bg-grape text-white'
  if (props.isNew) return 'bg-sun text-ink-950'
  return 'bg-pool text-ink-950'
})

function handleImageError(): void {
  if (previewImageSrc.value === PLACEHOLDER_SKIN_IMAGE_SRC) return
  previewImageSrc.value = PLACEHOLDER_SKIN_IMAGE_SRC
  imageFallbackUsed.value = true
}
</script>

<template>
  <article
    :class="[
      'cc-slot group aspect-square p-0 text-left',
      props.selected ? 'cc-slot-active' : '',
      props.equipped && !props.selected ? 'border-grape' : '',
    ]"
  >
    <button
      type="button"
      class="relative block h-full w-full text-left"
      :disabled="props.busy || props.isEmpty"
      :aria-label="cardAriaLabel"
      :aria-pressed="props.selected"
      @click="emit('select')"
    >
      <img
        class="h-full w-full object-cover transition duration-200 group-hover:scale-[1.06]"
        :class="props.busy ? 'opacity-60' : ''"
        :src="previewImageSrc"
        :alt="`${props.item.name} preview`"
        loading="lazy"
        @error="handleImageError"
      />
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/10 to-transparent" />
      <span
        v-if="props.equipped || props.isNew"
        class="absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
        :class="dotToneClass"
      >
        {{ props.equipped ? 'On' : 'New' }}
      </span>
      <span
        v-if="imageFallbackUsed"
        class="absolute left-1.5 top-1.5 rounded-md bg-ink-950/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-mist"
      >
        Preview
      </span>
      <p class="absolute inset-x-2 bottom-1.5 m-0 truncate font-display text-[13px] tracking-wide text-fog">
        {{ props.item.name }}
      </p>
    </button>
  </article>
</template>
