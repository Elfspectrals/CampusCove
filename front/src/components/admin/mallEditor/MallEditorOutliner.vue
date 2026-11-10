<script setup lang="ts">
import { computed, ref } from 'vue'
import UiCurrency from '../../ui/UiCurrency.vue'
import UiIcon from '../../ui/UiIcon.vue'
import type { TemplateProp } from '../../../game/mallTemplates/mallTemplate.ts'
import type { SelectHow } from '../../../game/mallEditor/MallEditorScene.ts'

const outliner = defineProps<{
  props: TemplateProp[]
  selectedIds: readonly string[]
  hidden: string[]
  collapsed: boolean
  saleCodes: Record<string, string>
  prices: Record<string, number>
  roles?: Record<string, string>
}>()

const emit = defineEmits<{ select: [id: string, how: SelectHow]; toggleHidden: [id: string]; remove: [id: string]; toggle: []; sell: [id: string, on: boolean] }>()

function saleCode(prop: TemplateProp): string | undefined {
  if (prop.kind === 'item') return prop.code
  return prop.kind === 'decor' ? outliner.saleCodes[prop.key] : undefined
}

function canSell(prop: TemplateProp): boolean {
  return prop.kind === 'item' || (prop.kind === 'decor' && !!outliner.saleCodes[prop.key] && !prop.materials)
}

const hasVendor = computed(() => outliner.props.some((p) => p.kind === 'npc' && p.vendor))
const sold = computed(() => outliner.props.filter((p) => p.kind === 'item' && p.forSale).length)

function label(prop: TemplateProp): string {
  if (prop.kind === 'npc') return outliner.roles?.[prop.id] ?? (prop.vendor ? 'Cashier' : 'Extra')
  if (prop.kind === 'field') return `${prop.crop} field`
  if (prop.kind === 'animal') return prop.animal
  if (prop.kind === 'building') return prop.id
  if (prop.kind === 'shelf') return `${prop.shelf} shelf`
  if (prop.kind === 'mannequin') return 'Mannequin'
  if (prop.kind === 'light') return prop.light === 'spot' ? 'Spot light' : 'Point light'
  if (prop.kind === 'item') return prop.code
  return prop.key
}

function typeOf(prop: TemplateProp): string {
  if (prop.kind === 'item') return prop.forSale ? 'For sale' : 'Prop'
  return { decor: 'Decor', npc: 'NPC', mannequin: 'Mannequin', light: 'Light', field: 'Field', animal: 'Animal', building: 'Building', shelf: 'Shelf' }[prop.kind]
}

type SortColumn = 'label' | 'type' | 'sale'

const COLUMNS: Array<{ key: SortColumn; title: string }> = [
  { key: 'label', title: 'Label' },
  { key: 'type', title: 'Type' },
  { key: 'sale', title: 'For sale' },
]

const search = ref('')
const sort = ref<{ column: SortColumn; descending: boolean } | null>(null)

function saleRank(prop: TemplateProp): number {
  if (prop.kind === 'item' && prop.forSale) return 2
  return saleCode(prop) ? 1 : 0
}

function compare(a: TemplateProp, b: TemplateProp, column: SortColumn): number {
  if (column === 'label') return label(a).localeCompare(label(b))
  if (column === 'type') return typeOf(a).localeCompare(typeOf(b)) || label(a).localeCompare(label(b))
  return saleRank(b) - saleRank(a) || label(a).localeCompare(label(b))
}

function sortBy(column: SortColumn): void {
  if (sort.value?.column !== column) sort.value = { column, descending: false }
  else if (!sort.value.descending) sort.value = { column, descending: true }
  else sort.value = null
}

const shown = computed(() => {
  const query = search.value.trim().toLowerCase()
  const found = query ? outliner.props.filter((p) => [label(p), typeOf(p), p.id].some((text) => text.toLowerCase().includes(query))) : outliner.props
  const order = sort.value
  if (!order) return found
  return [...found].sort((a, b) => compare(a, b, order.column) * (order.descending ? -1 : 1))
})
</script>

<template>
  <section class="cc-panel-flat flex min-h-0 flex-col overflow-hidden">
    <button type="button" class="flex items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2 text-left" :aria-expanded="!collapsed" @click="emit('toggle')">
      <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="14" class="text-mist" />
      <span class="cc-eyebrow m-0 flex-1 text-mist">Outliner</span>
      <span class="text-xs font-bold text-mist">{{ props.length }}</span>
    </button>
    <template v-if="!collapsed">
    <div class="flex items-center gap-2 border-b border-ink-600/50 px-3 py-1.5">
      <UiIcon name="search" :size="14" class="text-mist" />
      <input v-model="search" type="search" placeholder="Search" aria-label="Search the outliner" class="cc-input py-1 text-sm" />
    </div>
    <div class="grid grid-cols-[24px_1fr_64px_88px_20px] gap-x-2 border-b border-ink-600/50 px-3 py-1 text-[11px] font-extrabold uppercase text-mist">
      <span />
      <button
        v-for="column in COLUMNS"
        :key="column.key"
        type="button"
        class="flex min-w-0 items-center gap-1 text-left uppercase hover:text-fog"
        @click="sortBy(column.key)"
      >
        <span class="truncate">{{ column.title }}</span>
        <UiIcon v-if="sort?.column === column.key" name="chevron-down" :size="12" :class="sort.descending ? '' : 'rotate-180'" />
      </button>
      <span />
    </div>
    <ul class="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
      <li
        v-for="prop in shown"
        :key="prop.id"
        :class="['grid cursor-pointer grid-cols-[24px_1fr_64px_88px_20px] items-center gap-x-2 px-3 py-1 text-sm', selectedIds.includes(prop.id) ? 'bg-pool/25 text-fog' : 'text-mist hover:bg-white/5']"
        @click="emit('select', prop.id, $event.shiftKey ? 'toggle' : $event.altKey ? 'member' : 'replace')"
      >
        <button type="button" :title="hidden.includes(prop.id) ? 'Show' : 'Hide'" :class="hidden.includes(prop.id) ? 'opacity-30' : ''" @click.stop="emit('toggleHidden', prop.id)">
          <UiIcon name="eye" :size="14" />
        </button>
        <span class="flex min-w-0 items-center gap-1.5">
          <span class="truncate font-bold">{{ label(prop) }}</span>
          <span v-if="prop.group" class="shrink-0 rounded bg-white/10 px-1 text-[10px] font-bold text-mist" :title="`In ${prop.group}: a click selects the group, Alt-click this prop alone`">{{ prop.group }}</span>
        </span>
        <span class="truncate text-xs">{{ typeOf(prop) }}</span>
        <label v-if="saleCode(prop)" class="flex items-center gap-1.5 text-xs" @click.stop>
          <input
            type="checkbox"
            :checked="prop.kind === 'item' && prop.forSale"
            :disabled="!canSell(prop)"
            :title="canSell(prop) ? 'For sale' : 'Reset the materials to sell it'"
            :aria-label="`Sell ${label(prop)}`"
            @change="emit('sell', prop.id, ($event.target as HTMLInputElement).checked)"
          />
          <UiCurrency currency="coins" :amount="prop.kind === 'item' && prop.price !== undefined ? prop.price : (prices[saleCode(prop)!] ?? null)" :size="12" />
        </label>
        <span v-else />
        <button type="button" title="Delete" aria-label="Delete" class="text-mist hover:text-red-400" @click.stop="emit('remove', prop.id)">
          <UiIcon name="trash" :size="14" />
        </button>
      </li>
    </ul>
    <footer class="border-t-2 border-ink-600/50 px-3 py-1.5 text-xs font-bold text-mist">
      <template v-if="shown.length !== props.length">{{ shown.length }} of </template>{{ props.length }} props<template v-if="selectedIds.length"> ({{ selectedIds.length }} selected)</template>
      <template v-if="sold"> · {{ sold }} for sale, {{ hasVendor ? 'paid at the vendor' : 'click to buy (no vendor)' }}</template>
    </footer>
    </template>
  </section>
</template>
