// Sorting of the admin give screen: each item lands in a section (food, tools, clothes...) and, inside it, a group
// (drinks, medical, tops, shoes...), so the console and the watch can show them by type instead of one long list.
import type { UiIconName } from '../../components/ui/icons.ts'
import type { AdminItem } from '../../types/gameRealtime.ts'
import { CONSUMABLE_FOLDERS } from '../assets/catalog.ts'
import { filterAdminItems } from './adminPanel.ts'

const ITEM_SECTIONS = ['food', 'tools', 'furniture', 'clothes', 'sports', 'other'] as const
export type ItemSection = (typeof ITEM_SECTIONS)[number]

export const SECTION_ICON: Record<ItemSection, UiIconName> = {
  food: 'apple',
  tools: 'wrench',
  furniture: 'chair',
  clothes: 'shirt',
  sports: 'trophy',
  other: 'box',
}

const SECTION_OF_KIND: Record<string, ItemSection> = {
  consumable: 'food',
  tool: 'tools',
  furniture: 'furniture',
  cosmetic: 'clothes',
  sports_gear: 'sports',
}

const WEAR_SLOTS = ['body', 'top', 'bottom', 'shoes', 'hair', 'head_accessory'] as const
const FOOD_GROUPS = CONSUMABLE_FOLDERS.map(([, folder]) => folder)
/** Display order of the groups inside a section; a section with one group shows no heading. */
const GROUP_ORDER: readonly string[] = [...FOOD_GROUPS, ...WEAR_SLOTS, 'emotes', 'all', 'other']

export interface ItemGroup {
  group: string
  items: AdminItem[]
}

export function itemSection(item: AdminItem): ItemSection {
  return SECTION_OF_KIND[item.kind] ?? 'other'
}

function clothesGroup(code: string): string {
  if (code.startsWith('emote_')) return 'emotes'
  const rest = code.startsWith('COS_WEAR_') ? code.slice('COS_WEAR_'.length).toLowerCase() : ''
  // longest first, so HEAD_ACCESSORY_ is not read as a HEAD_ slot
  return [...WEAR_SLOTS].sort((a, b) => b.length - a.length).find((slot) => rest.startsWith(`${slot}_`)) ?? 'other'
}

export function itemGroup(item: AdminItem): string {
  const section = itemSection(item)
  if (section === 'food') return CONSUMABLE_FOLDERS.find(([prefix]) => item.code.startsWith(prefix))?.[1] ?? 'other'
  if (section === 'clothes') return clothesGroup(item.code)
  return 'all'
}

/** The sections that hold at least one item, in display order, with their size. */
export function sectionsWithItems(items: readonly AdminItem[]): Array<{ section: ItemSection; count: number }> {
  return ITEM_SECTIONS.map((section) => ({ section, count: items.filter((i) => itemSection(i) === section).length })).filter((s) => s.count > 0)
}

/** Items of one section split into groups; a search looks through every section. */
export function groupedItems(items: AdminItem[], section: ItemSection, query: string): ItemGroup[] {
  const searching = query.trim() !== ''
  const shown = searching ? filterAdminItems(items, query) : items.filter((i) => itemSection(i) === section)
  const byGroup = new Map<string, AdminItem[]>()
  for (const item of shown) {
    const group = searching ? itemSection(item) : itemGroup(item)
    byGroup.set(group, [...(byGroup.get(group) ?? []), item])
  }
  const order = searching ? (ITEM_SECTIONS as readonly string[]) : GROUP_ORDER
  return [...byGroup].map(([group, list]) => ({ group, items: list })).sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
}

/** One-click quantities: food comes in stacks, a tool or a chair one at a time. */
export function quickQuantities(section: ItemSection): readonly number[] {
  return section === 'food' ? [1, 5, 10, 25] : [1, 2, 5]
}
