<script setup lang="ts">
import { computed } from 'vue'
import UiCurrency from '../../ui/UiCurrency.vue'
import UiIcon from '../../ui/UiIcon.vue'
import type { TemplateProp } from '../../../game/mallTemplates/mallTemplate.ts'

const outliner = defineProps<{
  props: TemplateProp[]
  selectedId: string | null
  hidden: string[]
  collapsed: boolean
  saleCodes: Record<string, string>
  prices: Record<string, number>
}>()

const emit = defineEmits<{ select: [id: string]; toggleHidden: [id: string]; remove: [id: string]; toggle: []; sell: [id: string, on: boolean] }>()

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
  if (prop.kind === 'npc') return prop.vendor ? 'Vendor' : 'Extra'
  if (prop.kind === 'mannequin') return 'Mannequin'
  if (prop.kind === 'light') return prop.light === 'spot' ? 'Spot light' : 'Point light'
  if (prop.kind === 'item') return prop.code
  return prop.key
}

function typeOf(prop: TemplateProp): string {
  if (prop.kind === 'item') return prop.forSale ? 'For sale' : 'Prop'
  return { decor: 'Decor', npc: 'NPC', mannequin: 'Mannequin', light: 'Light' }[prop.kind]
}
</script>

<template>
  <section class="cc-panel-flat flex min-h-0 flex-col overflow-hidden">
    <button type="button" class="flex items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2 text-left" :aria-expanded="!collapsed" @click="emit('toggle')">
      <UiIcon :name="collapsed ? 'chevron-right' : 'chevron-down'" :size="14" class="text-mist" />
      <span class="cc-eyebrow m-0 flex-1 text-mist">Outliner</span>
      <span class="text-xs font-bold text-mist">{{ props.length }}</span>
    </button>
    <template v-if="!collapsed">
    <div class="grid grid-cols-[24px_1fr_64px_88px_20px] gap-x-2 border-b border-ink-600/50 px-3 py-1 text-[11px] font-extrabold uppercase text-mist">
      <span />
      <span>Label</span>
      <span>Type</span>
      <span>For sale</span>
      <span />
    </div>
    <ul class="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
      <li
        v-for="prop in props"
        :key="prop.id"
        :class="['grid cursor-pointer grid-cols-[24px_1fr_64px_88px_20px] items-center gap-x-2 px-3 py-1 text-sm', prop.id === selectedId ? 'bg-pool/25 text-fog' : 'text-mist hover:bg-white/5']"
        @click="emit('select', prop.id)"
      >
        <button type="button" :title="hidden.includes(prop.id) ? 'Show' : 'Hide'" :class="hidden.includes(prop.id) ? 'opacity-30' : ''" @click.stop="emit('toggleHidden', prop.id)">
          <UiIcon name="eye" :size="14" />
        </button>
        <span class="truncate font-bold">{{ label(prop) }}</span>
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
          <UiCurrency currency="coins" :amount="prices[saleCode(prop)!] ?? null" :size="12" />
        </label>
        <span v-else />
        <button type="button" title="Delete" aria-label="Delete" class="text-mist hover:text-red-400" @click.stop="emit('remove', prop.id)">
          <UiIcon name="trash" :size="14" />
        </button>
      </li>
    </ul>
    <footer class="border-t-2 border-ink-600/50 px-3 py-1.5 text-xs font-bold text-mist">
      {{ props.length }} props<template v-if="selectedId"> (1 selected)</template>
      <template v-if="sold"> · {{ sold }} for sale, {{ hasVendor ? 'paid at the vendor' : 'click to buy (no vendor)' }}</template>
    </footer>
    </template>
  </section>
</template>
