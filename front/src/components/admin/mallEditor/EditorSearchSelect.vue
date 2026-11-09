<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'

export interface SelectOption {
  value: string
  label: string
  group?: string
  preview?: string | null
  swatch?: string | null
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: SelectOption[]
    placeholder?: string
    searchable?: boolean
    disabled?: boolean
  }>(),
  { placeholder: 'None', searchable: true, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open = ref(false)
const query = ref('')
const active = ref(0)
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const position = ref({ top: 0, left: 0, width: 0, maxHeight: 320 })
const POPOVER_HEIGHT = 320
const POPOVER_WIDTH = 288

const current = computed(() => props.options.find((o) => o.value === props.modelValue) ?? null)
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? props.options.filter((o) => o.label.toLowerCase().includes(q) || o.group?.toLowerCase().includes(q)) : props.options
})
const groups = computed(() => {
  const out: Array<{ name: string; items: SelectOption[] }> = []
  for (const option of filtered.value) {
    const name = option.group ?? ''
    let group = out.find((g) => g.name === name)
    if (!group) {
      group = { name, items: [] }
      out.push(group)
    }
    group.items.push(option)
  }
  let index = 0
  return out.map((g) => ({ name: g.name, items: g.items.map((option) => ({ ...option, index: index++ })) }))
})
const ordered = computed(() => groups.value.flatMap((g) => g.items))

function toggle(): void {
  if (props.disabled) return
  open.value = !open.value
}

function choose(option: SelectOption): void {
  emit('update:modelValue', option.value)
  open.value = false
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown') active.value = Math.min(filtered.value.length - 1, active.value + 1)
  else if (event.key === 'ArrowUp') active.value = Math.max(0, active.value - 1)
  else if (event.key === 'Enter' && ordered.value[active.value]) choose(ordered.value[active.value]!)
  else if (event.key === 'Escape') open.value = false
  else return
  event.preventDefault()
  void nextTick(() => listEl.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' }))
}

function onOutside(event: PointerEvent): void {
  const target = event.target as Node
  if (!root.value?.contains(target) && !popover.value?.contains(target)) open.value = false
}

function onScroll(event: Event): void {
  if (!popover.value?.contains(event.target as Node)) open.value = false
}

function close(): void {
  open.value = false
}

function place(): void {
  const rect = root.value!.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - 8
  const above = rect.top - 8
  const up = below < Math.min(POPOVER_HEIGHT, 200) && above > below
  const width = Math.max(rect.width, POPOVER_WIDTH)
  position.value = {
    top: up ? Math.max(8, rect.top - Math.min(POPOVER_HEIGHT, above) - 4) : rect.bottom + 4,
    left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
    width,
    maxHeight: Math.min(POPOVER_HEIGHT, up ? above : below),
  }
}

watch(open, async (isOpen) => {
  if (!isOpen) {
    document.removeEventListener('pointerdown', onOutside, true)
    document.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('resize', close)
    query.value = ''
    return
  }
  active.value = Math.max(0, ordered.value.findIndex((o) => o.value === props.modelValue))
  place()
  document.addEventListener('pointerdown', onOutside, true)
  document.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', close)
  await nextTick()
  if (props.searchable) searchInput.value?.focus()
  else listEl.value?.focus()
  listEl.value?.querySelector<HTMLElement>(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' })
})

watch(query, () => (active.value = 0))

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside, true)
  document.removeEventListener('scroll', onScroll, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div ref="root" class="relative min-w-0" @keydown.stop>
    <button
      type="button"
      class="flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border border-ink-600 bg-ink-950/80 px-1.5 text-left text-xs font-bold text-fog hover:border-ink-500 disabled:opacity-40"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="current?.label ?? placeholder"
      @click="toggle"
    >
      <img v-if="current?.preview" :src="current.preview" alt="" class="h-5 w-5 shrink-0 rounded bg-ink-800 object-cover" style="image-rendering: pixelated" />
      <span v-else-if="current?.swatch" class="h-4 w-4 shrink-0 rounded-sm border border-white/20" :style="{ background: current.swatch }" />
      <span class="min-w-0 flex-1 truncate" :class="current ? '' : 'text-mist'">{{ current?.label ?? placeholder }}</span>
      <UiIcon name="chevron-down" :size="12" class="shrink-0 text-mist" />
    </button>
    <Teleport to="body">
    <div
      v-if="open"
      ref="popover"
      class="fixed z-[300] flex flex-col overflow-hidden rounded-lg border border-ink-500 bg-ink-900 shadow-2xl"
      :style="{ top: `${position.top}px`, left: `${position.left}px`, width: `${position.width}px`, maxHeight: `${position.maxHeight}px` }"
      role="listbox"
      @keydown.stop="onKeyDown"
    >
      <div v-if="searchable" class="flex items-center gap-1.5 border-b border-ink-600 px-2 py-1.5">
        <UiIcon name="search" :size="13" class="text-mist" />
        <input ref="searchInput" v-model="query" type="text" placeholder="Search" aria-label="Search" class="min-w-0 flex-1 bg-transparent text-xs font-bold text-fog outline-none placeholder:text-mist/60" />
        <span class="text-[10px] font-bold text-mist">{{ filtered.length }}</span>
      </div>
      <div ref="listEl" tabindex="-1" class="min-h-0 flex-1 overflow-y-auto py-1 outline-none">
        <template v-for="group in groups" :key="group.name">
          <p v-if="group.name" class="m-0 px-2 pb-0.5 pt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-mist">{{ group.name }}</p>
          <button
            v-for="option in group.items"
            :key="option.value"
            type="button"
            role="option"
            :data-index="option.index"
            :aria-selected="option.value === modelValue"
            :class="[
              'flex w-full items-center gap-2 px-2 py-1 text-left text-xs font-bold',
              option.index === active ? 'bg-pool/30 text-fog' : 'text-mist hover:bg-white/5',
              option.value === modelValue ? 'text-sun' : '',
            ]"
            @mouseenter="active = option.index"
            @click="choose(option)"
          >
            <img v-if="option.preview" :src="option.preview" alt="" loading="lazy" class="h-7 w-7 shrink-0 rounded bg-ink-800 object-cover" style="image-rendering: pixelated" />
            <span v-else-if="option.swatch" class="h-5 w-5 shrink-0 rounded-sm border border-white/20" :style="{ background: option.swatch }" />
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
            <UiIcon v-if="option.value === modelValue" name="check" :size="12" />
          </button>
        </template>
        <p v-if="!filtered.length" class="m-0 px-2 py-2 text-xs text-mist">No match</p>
      </div>
    </div>
    </Teleport>
  </div>
</template>
