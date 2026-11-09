<script setup lang="ts">
import { computed, ref } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'
import type { UiIconName } from '../../ui/icons'

export interface ContentEntry {
  id: string
  folder: ContentFolder
  group: string
  label: string
  preview: string | null
}

type ContentFolder = 'decor' | 'sellable' | 'npc' | 'mannequin' | 'light'

const props = defineProps<{
  entries: ContentEntry[]
  armedId: string | null
  notice: string | null
  collapsed: boolean
}>()

const emit = defineEmits<{ pick: [entry: ContentEntry]; toggle: [] }>()

const FOLDERS: Array<{ key: ContentFolder; label: string; icon: UiIconName }> = [
  { key: 'decor', label: 'Decor', icon: 'chair' },
  { key: 'sellable', label: 'Sellable', icon: 'shop' },
  { key: 'npc', label: 'NPC', icon: 'user' },
  { key: 'mannequin', label: 'Mannequin', icon: 'shirt' },
  { key: 'light', label: 'Lights', icon: 'bolt' },
]

const folder = ref<ContentFolder>('decor')
const expanded = ref<ContentFolder | null>('decor')
const group = ref<string | null>(null)
const search = ref('')

const groups = computed(() => [...new Set(props.entries.filter((e) => e.folder === folder.value).map((e) => e.group))])

const visible = computed(() => {
  const query = search.value.trim().toLowerCase()
  return props.entries.filter(
    (e) => e.folder === folder.value && (group.value === null || e.group === group.value) && (!query || e.label.toLowerCase().includes(query)),
  )
})

function openFolder(key: ContentFolder): void {
  if (folder.value === key && group.value === null) {
    expanded.value = expanded.value === key ? null : key
    return
  }
  folder.value = key
  group.value = null
  expanded.value = key
}

function countInGroup(name: string): number {
  return props.entries.filter((e) => e.folder === folder.value && e.group === name).length
}

function countIn(key: ContentFolder): number {
  return props.entries.filter((e) => e.folder === key).length
}
</script>

<template>
  <section v-if="collapsed" class="cc-panel-flat">
    <button type="button" class="flex w-full items-center gap-2 px-3 py-2 text-left" aria-expanded="false" @click="emit('toggle')">
      <UiIcon name="chevron-right" :size="14" class="text-mist" />
      <span class="cc-eyebrow m-0 text-mist">Content</span>
    </button>
  </section>
  <section v-else class="cc-panel-flat flex min-h-0 overflow-hidden">
    <nav class="flex w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r-2 border-ink-600/50 p-2">
      <button type="button" class="flex items-center gap-2 px-2 pb-1 text-left" aria-expanded="true" @click="emit('toggle')">
        <UiIcon name="chevron-down" :size="14" class="text-mist" />
        <span class="cc-eyebrow m-0 text-mist">Content</span>
      </button>
      <template v-for="f in FOLDERS" :key="f.key">
        <button
          type="button"
          :class="['flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm font-bold', folder === f.key && group === null ? 'bg-pool/20 text-fog' : 'text-mist hover:bg-white/5']"
          @click="openFolder(f.key)"
        >
          <UiIcon :name="expanded === f.key ? 'chevron-down' : 'chevron-right'" :size="14" />
          <UiIcon :name="f.icon" :size="16" />
          <span class="flex-1">{{ f.label }}</span>
          <span class="text-xs opacity-60">{{ countIn(f.key) }}</span>
        </button>
        <template v-if="expanded === f.key && groups.length > 1">
          <button
            v-for="g in groups"
            :key="g"
            type="button"
            :class="['flex items-center gap-2 rounded-lg py-1 pl-9 pr-2 text-left text-xs font-bold', group === g ? 'bg-pool/20 text-fog' : 'text-mist hover:bg-white/5']"
            @click="group = g"
          >
            <span class="flex-1 truncate">{{ g }}</span>
            <span class="opacity-60">{{ countInGroup(g) }}</span>
          </button>
        </template>
      </template>
    </nav>
    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2">
        <UiIcon name="search" :size="16" class="text-mist" />
        <input v-model="search" type="search" placeholder="Search" class="cc-input py-1 text-sm" />
      </div>
      <p v-if="notice" class="m-0 px-3 pt-2 text-xs font-bold text-sun">{{ notice }}</p>
      <div class="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2 overflow-y-auto p-3">
        <button
          v-for="entry in visible"
          :key="entry.id"
          type="button"
          :title="entry.label"
          :class="['flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 text-[11px] font-bold', armedId === entry.id ? 'border-sun bg-sun/10' : 'border-transparent bg-ink-950/50 hover:border-ink-500']"
          @click="emit('pick', entry)"
        >
          <img v-if="entry.preview" :src="entry.preview" alt="" class="aspect-square w-full rounded-lg bg-ink-800 object-contain" loading="lazy" />
          <span v-else class="flex aspect-square w-full items-center justify-center rounded-lg bg-ink-800 text-mist"><UiIcon :name="FOLDERS.find((f) => f.key === entry.folder)!.icon" :size="32" /></span>
          <span class="w-full truncate">{{ entry.label }}</span>
        </button>
      </div>
    </div>
  </section>
</template>
