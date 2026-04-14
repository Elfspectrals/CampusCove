<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  bulkAdminShopAction,
  createAdminShopItem,
  deleteAdminShopItem,
  fetchAdminShopItems,
  restoreAdminShopItem,
  updateAdminShopItem,
  type AdminShopCatalogRow,
  type AdminShopItemCreateBody,
  type AdminShopItemUpdateBody,
  type AdminShopListMeta,
  type AdminShopListParams,
  type ShopCurrency,
} from '../../api/adminShop'

type ItemKind = 'furniture' | 'cosmetic' | 'consumable' | 'misc'
type CosmeticSlot = 'body' | 'hair' | 'top' | 'bottom' | 'shoes' | 'head_accessory'
type BindMode = 'none' | 'bind_on_equip' | 'bind_on_place' | 'bound'
type DeletedFilter = 'all' | 'active' | 'deleted'
type BulkAction = 'publish' | 'unpublish' | 'activate' | 'deactivate' | 'soft_delete' | 'restore'
type SortBy = 'name' | 'code' | 'kind' | 'price' | 'is_active' | 'is_published' | 'sort_order'

interface ShopFormState {
  code: string
  name: string
  kind: ItemKind
  cosmetic_slot: CosmeticSlot | null
  rarity: number
  tradable: boolean
  premium_only: boolean
  bind: BindMode
  max_stack: number
  preview_image: string
  model_glb: string
  coins_price: number | null
  premium_price: number | null
  is_active: boolean
  is_published: boolean
  is_unique_per_account: boolean
  stock_remaining: number | null
  sort_order: number
  previewImageFile: File | null
  modelGlbFile: File | null
}

const rows = ref<AdminShopCatalogRow[]>([])
const selectedIds = ref<number[]>([])
const loading = ref(false)
const actionLoading = ref<number | null>(null)
const bulkLoading = ref(false)
const listError = ref<string | null>(null)
const pageMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
const meta = ref<AdminShopListMeta>({ current_page: 1, last_page: 1, per_page: 20, total: 0 })

const searchInput = ref('')
const filterPublished = ref<'all' | 'yes' | 'no'>('all')
const filterActive = ref<'all' | 'yes' | 'no'>('all')
const filterKind = ref<'all' | ItemKind>('all')
const filterCurrency = ref<'all' | ShopCurrency>('all')
const filterDeleted = ref<DeletedFilter>('all')
const page = ref(1)
const perPage = ref(20)
const sortBy = ref<SortBy>('sort_order')
const sortDir = ref<'asc' | 'desc'>('asc')

const panelOpen = ref(false)
const editingId = ref<number | null>(null)
const formSubmitting = ref(false)
const formError = ref<string | null>(null)
const formState = ref<ShopFormState>(newFormState())

let searchDebounce: ReturnType<typeof setTimeout> | null = null

const allSelected = computed(() => rows.value.length > 0 && selectedIds.value.length === rows.value.length)
const selectedCount = computed(() => selectedIds.value.length)

function newFormState(): ShopFormState {
  return {
    code: '',
    name: '',
    kind: 'cosmetic',
    cosmetic_slot: 'body',
    rarity: 0,
    tradable: true,
    premium_only: false,
    bind: 'none',
    max_stack: 1,
    preview_image: '',
    model_glb: '',
    coins_price: null,
    premium_price: null,
    is_active: true,
    is_published: false,
    is_unique_per_account: false,
    stock_remaining: null,
    sort_order: 0,
    previewImageFile: null,
    modelGlbFile: null,
  }
}

function rowPriceText(row: AdminShopCatalogRow): string {
  const parts: string[] = []
  if (row.allow_coins && row.coins_price !== null) parts.push(`Coins ${row.coins_price.toLocaleString()}`)
  if (row.allow_premium && row.premium_price !== null) parts.push(`Premium ${row.premium_price.toLocaleString()}`)
  if (parts.length === 0) parts.push(`${row.currency} ${row.price.toLocaleString()}`)
  return parts.join(' / ')
}

function statusLabel(row: AdminShopCatalogRow): string {
  if (row.deleted_at) return 'Deleted'
  if (!row.is_active) return 'Inactive'
  if (!row.is_published) return 'Draft'
  return 'Live'
}

function statusClass(row: AdminShopCatalogRow): string {
  if (row.deleted_at) return 'bg-slate-300 text-slate-800'
  if (!row.is_active) return 'bg-amber-100 text-amber-900'
  if (!row.is_published) return 'bg-violet-100 text-violet-900'
  return 'bg-emerald-100 text-emerald-900'
}

function setSort(next: SortBy): void {
  if (sortBy.value === next) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = next
    sortDir.value = 'asc'
  }
  page.value = 1
  void loadRows()
}

function toggleSelectAll(): void {
  if (allSelected.value) {
    selectedIds.value = []
    return
  }
  selectedIds.value = rows.value.map((row) => row.shop_catalog_item_id)
}

function toggleRowSelection(id: number): void {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((entry) => entry !== id)
    return
  }
  selectedIds.value = [...selectedIds.value, id]
}

function toListParams(): AdminShopListParams {
  return {
    search: searchInput.value.trim() === '' ? undefined : searchInput.value.trim(),
    currency: filterCurrency.value,
    kind: filterKind.value,
    is_active: filterActive.value === 'all' ? 'all' : filterActive.value === 'yes',
    is_published: filterPublished.value === 'all' ? 'all' : filterPublished.value === 'yes',
    with_deleted: filterDeleted.value !== 'active',
    only_deleted: filterDeleted.value === 'deleted',
    sort_by: sortBy.value,
    sort_dir: sortDir.value,
    page: page.value,
    per_page: perPage.value,
  }
}

async function loadRows(): Promise<void> {
  loading.value = true
  listError.value = null
  try {
    const response = await fetchAdminShopItems(toListParams())
    rows.value = response.items
    meta.value = response.meta
    selectedIds.value = selectedIds.value.filter((id) => rows.value.some((row) => row.shop_catalog_item_id === id))
  } catch (caught) {
    listError.value = caught instanceof Error ? caught.message : 'Could not load shop items'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  formState.value = newFormState()
  formError.value = null
  panelOpen.value = true
}

function openEdit(row: AdminShopCatalogRow): void {
  editingId.value = row.shop_catalog_item_id
  formState.value = {
    code: row.item.code,
    name: row.item.name,
    kind: (row.item.kind as ItemKind) ?? 'misc',
    cosmetic_slot: row.item.cosmetic_slot ? (row.item.cosmetic_slot as CosmeticSlot) : null,
    rarity: row.item.rarity,
    tradable: row.item.tradable,
    premium_only: row.item.premium_only,
    bind: (row.item.bind as BindMode) ?? 'none',
    max_stack: row.item.max_stack,
    preview_image: row.item.preview_image ?? '',
    model_glb: row.item.model_glb ?? '',
    coins_price: row.coins_price,
    premium_price: row.premium_price,
    is_active: row.is_active,
    is_published: row.is_published,
    is_unique_per_account: row.is_unique_per_account,
    stock_remaining: row.stock_remaining,
    sort_order: row.sort_order,
    previewImageFile: null,
    modelGlbFile: null,
  }
  formError.value = null
  panelOpen.value = true
}

function closePanel(): void {
  panelOpen.value = false
}

function onPreviewFileChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  formState.value.previewImageFile = target.files?.[0] ?? null
}

function onGlbFileChange(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  formState.value.modelGlbFile = target.files?.[0] ?? null
}

function parsePositiveInt(value: number | null): number | null {
  if (value === null) return null
  if (!Number.isInteger(value) || value < 1) return null
  return value
}

async function submitForm(): Promise<void> {
  formError.value = null
  const form = formState.value
  if (form.code.trim() === '') {
    formError.value = 'Code is required'
    return
  }
  if (form.name.trim() === '') {
    formError.value = 'Name is required'
    return
  }
  if (form.kind === 'cosmetic' && !form.cosmetic_slot) {
    formError.value = 'Cosmetic slot is required for cosmetic items'
    return
  }
  const coinsPrice = parsePositiveInt(form.coins_price)
  const premiumPrice = parsePositiveInt(form.premium_price)
  if (coinsPrice === null && premiumPrice === null) {
    formError.value = 'At least one currency price is required'
    return
  }
  if (form.coins_price !== null && coinsPrice === null) {
    formError.value = 'Coins price must be a positive integer'
    return
  }
  if (form.premium_price !== null && premiumPrice === null) {
    formError.value = 'Premium price must be a positive integer'
    return
  }

  const prices: Partial<Record<ShopCurrency, number>> = {}
  if (coinsPrice !== null) prices.coins = coinsPrice
  if (premiumPrice !== null) prices.premium = premiumPrice

  formSubmitting.value = true
  try {
    if (editingId.value === null) {
      const createBody: AdminShopItemCreateBody = {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        rarity: form.rarity,
        tradable: form.tradable,
        premium_only: form.premium_only,
        bind: form.bind,
        max_stack: form.max_stack,
        cosmetic_slot: form.kind === 'cosmetic' ? form.cosmetic_slot : null,
        preview_image: form.preview_image.trim() || null,
        model_glb: form.model_glb.trim() || null,
        prices,
        previewImageFile: form.previewImageFile,
        modelGlbFile: form.modelGlbFile,
        is_active: form.is_active,
        is_published: form.is_published,
        is_unique_per_account: form.is_unique_per_account,
        stock_remaining: form.stock_remaining,
        sort_order: form.sort_order,
      }
      await createAdminShopItem(createBody)
      pageMessage.value = { kind: 'success', text: 'Item created.' }
    } else {
      const updateBody: AdminShopItemUpdateBody = {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        rarity: form.rarity,
        tradable: form.tradable,
        premium_only: form.premium_only,
        bind: form.bind,
        max_stack: form.max_stack,
        cosmetic_slot: form.kind === 'cosmetic' ? form.cosmetic_slot : null,
        preview_image: form.preview_image.trim() || null,
        model_glb: form.model_glb.trim() || null,
        prices,
        is_active: form.is_active,
        is_published: form.is_published,
        is_unique_per_account: form.is_unique_per_account,
        stock_remaining: form.stock_remaining,
        sort_order: form.sort_order,
      }
      if (form.previewImageFile) updateBody.previewImageFile = form.previewImageFile
      if (form.modelGlbFile) updateBody.modelGlbFile = form.modelGlbFile
      await updateAdminShopItem(editingId.value, updateBody)
      pageMessage.value = { kind: 'success', text: 'Item updated.' }
    }
    closePanel()
    await loadRows()
  } catch (caught) {
    formError.value = caught instanceof Error ? caught.message : 'Could not save item'
  } finally {
    formSubmitting.value = false
  }
}

async function publishToggle(row: AdminShopCatalogRow): Promise<void> {
  actionLoading.value = row.shop_catalog_item_id
  try {
    await updateAdminShopItem(row.shop_catalog_item_id, { is_published: !row.is_published })
    pageMessage.value = { kind: 'success', text: `${row.item.name} ${row.is_published ? 'unpublished' : 'published'}.` }
    await loadRows()
  } catch (caught) {
    pageMessage.value = { kind: 'error', text: caught instanceof Error ? caught.message : 'Could not update publish state' }
  } finally {
    actionLoading.value = null
  }
}

async function activeToggle(row: AdminShopCatalogRow): Promise<void> {
  actionLoading.value = row.shop_catalog_item_id
  try {
    await updateAdminShopItem(row.shop_catalog_item_id, { is_active: !row.is_active })
    pageMessage.value = { kind: 'success', text: `${row.item.name} ${row.is_active ? 'deactivated' : 'activated'}.` }
    await loadRows()
  } catch (caught) {
    pageMessage.value = { kind: 'error', text: caught instanceof Error ? caught.message : 'Could not update active state' }
  } finally {
    actionLoading.value = null
  }
}

async function softDeleteRow(row: AdminShopCatalogRow): Promise<void> {
  if (!window.confirm(`Soft-delete ${row.item.name}?`)) return
  actionLoading.value = row.shop_catalog_item_id
  try {
    await deleteAdminShopItem(row.shop_catalog_item_id)
    pageMessage.value = { kind: 'success', text: `${row.item.name} deleted.` }
    await loadRows()
  } catch (caught) {
    pageMessage.value = { kind: 'error', text: caught instanceof Error ? caught.message : 'Could not delete item' }
  } finally {
    actionLoading.value = null
  }
}

async function restoreRow(row: AdminShopCatalogRow): Promise<void> {
  actionLoading.value = row.shop_catalog_item_id
  try {
    await restoreAdminShopItem(row.shop_catalog_item_id)
    pageMessage.value = { kind: 'success', text: `${row.item.name} restored.` }
    await loadRows()
  } catch (caught) {
    pageMessage.value = { kind: 'error', text: caught instanceof Error ? caught.message : 'Could not restore item' }
  } finally {
    actionLoading.value = null
  }
}

async function fallbackBulkAction(action: BulkAction, ids: number[]): Promise<void> {
  for (const id of ids) {
    const row = rows.value.find((entry) => entry.shop_catalog_item_id === id)
    if (!row) continue
    if (action === 'publish') await updateAdminShopItem(id, { is_published: true })
    if (action === 'unpublish') await updateAdminShopItem(id, { is_published: false })
    if (action === 'activate') await updateAdminShopItem(id, { is_active: true })
    if (action === 'deactivate') await updateAdminShopItem(id, { is_active: false })
    if (action === 'soft_delete') await deleteAdminShopItem(id)
    if (action === 'restore') await restoreAdminShopItem(id)
  }
}

async function runBulkAction(action: BulkAction): Promise<void> {
  const ids = [...selectedIds.value]
  if (ids.length === 0) return
  bulkLoading.value = true
  try {
    try {
      await bulkAdminShopAction({ action, ids })
    } catch {
      await fallbackBulkAction(action, ids)
    }
    selectedIds.value = []
    pageMessage.value = { kind: 'success', text: `Bulk action "${action}" applied to ${ids.length} item(s).` }
    await loadRows()
  } catch (caught) {
    pageMessage.value = { kind: 'error', text: caught instanceof Error ? caught.message : 'Bulk action failed' }
  } finally {
    bulkLoading.value = false
  }
}

function goToPage(nextPage: number): void {
  if (nextPage < 1 || nextPage > meta.value.last_page || nextPage === page.value) return
  page.value = nextPage
  void loadRows()
}

onMounted(() => {
  void loadRows()
})

watch(searchInput, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    page.value = 1
    void loadRows()
  }, 350)
})

watch([filterPublished, filterActive, filterKind, filterCurrency, filterDeleted, perPage], () => {
  page.value = 1
  void loadRows()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-2xl font-bold text-slate-900">Admin shop</h1>
        <p class="mt-1 text-sm text-slate-600">Manage catalog items, publication, availability, and pricing.</p>
      </div>
      <button
        type="button"
        class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500"
        @click="openCreate"
      >
        New item
      </button>
    </div>

    <p
      v-if="pageMessage"
      class="mb-4 rounded-lg border px-3 py-2 text-sm"
      :class="pageMessage.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'"
    >
      {{ pageMessage.text }}
    </p>

    <section class="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div class="grid gap-3 md:grid-cols-6">
        <input
          v-model="searchInput"
          type="search"
          class="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2"
          placeholder="Search code or name"
        />
        <select v-model="filterPublished" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Published: All</option>
          <option value="yes">Published only</option>
          <option value="no">Unpublished only</option>
        </select>
        <select v-model="filterActive" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Active: All</option>
          <option value="yes">Active only</option>
          <option value="no">Inactive only</option>
        </select>
        <select v-model="filterKind" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Kind: All</option>
          <option value="cosmetic">Cosmetic</option>
          <option value="furniture">Furniture</option>
          <option value="consumable">Consumable</option>
          <option value="misc">Misc</option>
        </select>
        <select v-model="filterCurrency" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Currency: All</option>
          <option value="coins">Coins</option>
          <option value="premium">Premium</option>
        </select>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <select v-model="filterDeleted" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="all">Deleted state: All</option>
          <option value="active">Active records only</option>
          <option value="deleted">Deleted only</option>
        </select>
        <select v-model.number="perPage" class="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option :value="10">10 / page</option>
          <option :value="20">20 / page</option>
          <option :value="50">50 / page</option>
        </select>
      </div>
    </section>

    <section v-if="selectedCount > 0" class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm">
      <span class="font-semibold text-purple-900">{{ selectedCount }} selected</span>
      <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800" :disabled="bulkLoading" @click="runBulkAction('publish')">Publish</button>
      <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800" :disabled="bulkLoading" @click="runBulkAction('unpublish')">Unpublish</button>
      <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800" :disabled="bulkLoading" @click="runBulkAction('activate')">Activate</button>
      <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800" :disabled="bulkLoading" @click="runBulkAction('deactivate')">Deactivate</button>
      <button type="button" class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 font-semibold text-red-900" :disabled="bulkLoading" @click="runBulkAction('soft_delete')">Soft-delete</button>
      <button type="button" class="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-900" :disabled="bulkLoading" @click="runBulkAction('restore')">Restore</button>
    </section>

    <div v-if="loading" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">Loading items...</div>
    <div v-else-if="listError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900">
      <p class="m-0 font-semibold">Could not load items</p>
      <p class="m-0 mt-1 text-sm">{{ listError }}</p>
      <button type="button" class="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600" @click="loadRows">Try again</button>
    </div>
    <div v-else-if="rows.length === 0" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">
      No items found.
    </div>
    <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-3 text-left"><input type="checkbox" :checked="allSelected" class="h-4 w-4 rounded border-slate-300" @change="toggleSelectAll" /></th>
              <th class="px-3 py-3 text-left font-semibold text-slate-700"><button type="button" class="hover:text-slate-900" @click="setSort('name')">Name</button></th>
              <th class="px-3 py-3 text-left font-semibold text-slate-700"><button type="button" class="hover:text-slate-900" @click="setSort('code')">Code</button></th>
              <th class="px-3 py-3 text-left font-semibold text-slate-700"><button type="button" class="hover:text-slate-900" @click="setSort('kind')">Kind</button></th>
              <th class="px-3 py-3 text-left font-semibold text-slate-700"><button type="button" class="hover:text-slate-900" @click="setSort('price')">Price</button></th>
              <th class="px-3 py-3 text-left font-semibold text-slate-700">Status</th>
              <th class="px-3 py-3 text-right font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="row in rows" :key="row.shop_catalog_item_id">
              <td class="px-3 py-3"><input type="checkbox" :checked="selectedIds.includes(row.shop_catalog_item_id)" class="h-4 w-4 rounded border-slate-300" @change="toggleRowSelection(row.shop_catalog_item_id)" /></td>
              <td class="px-3 py-3">
                <p class="m-0 font-semibold text-slate-900">{{ row.item.name }}</p>
                <p class="m-0 text-xs text-slate-500">#{{ row.shop_catalog_item_id }}</p>
              </td>
              <td class="px-3 py-3 font-mono text-xs text-slate-700">{{ row.item.code }}</td>
              <td class="px-3 py-3 text-slate-700">{{ row.item.kind }}<span v-if="row.item.cosmetic_slot" class="text-xs text-slate-500"> / {{ row.item.cosmetic_slot }}</span></td>
              <td class="px-3 py-3 text-slate-700">{{ rowPriceText(row) }}</td>
              <td class="px-3 py-3">
                <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="statusClass(row)">{{ statusLabel(row) }}</span>
              </td>
              <td class="px-3 py-3">
                <div class="flex flex-wrap justify-end gap-2">
                  <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50" :disabled="actionLoading === row.shop_catalog_item_id" @click="openEdit(row)">Edit</button>
                  <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50" :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at" @click="publishToggle(row)">{{ row.is_published ? 'Unpublish' : 'Publish' }}</button>
                  <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50" :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at" @click="activeToggle(row)">{{ row.is_active ? 'Deactivate' : 'Activate' }}</button>
                  <button v-if="!row.deleted_at" type="button" class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100" :disabled="actionLoading === row.shop_catalog_item_id" @click="softDeleteRow(row)">Soft-delete</button>
                  <button v-else type="button" class="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100" :disabled="actionLoading === row.shop_catalog_item_id" @click="restoreRow(row)">Restore</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm text-slate-600">
      <p class="m-0">Showing page {{ meta.current_page }} of {{ meta.last_page }} ({{ meta.total }} total)</p>
      <div class="flex gap-2">
        <button type="button" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 disabled:opacity-50" :disabled="meta.current_page <= 1" @click="goToPage(meta.current_page - 1)">Previous</button>
        <button type="button" class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 disabled:opacity-50" :disabled="meta.current_page >= meta.last_page" @click="goToPage(meta.current_page + 1)">Next</button>
      </div>
    </div>

    <div v-if="panelOpen" class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" @click.self="closePanel">
      <div class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 class="m-0 text-lg font-bold text-slate-900">{{ editingId === null ? 'Create item' : 'Edit item' }}</h2>
        <form class="mt-4 grid gap-3 md:grid-cols-2" @submit.prevent="submitForm">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Code</label>
            <input v-model="formState.code" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Name</label>
            <input v-model="formState.name" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Kind</label>
            <select v-model="formState.kind" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="cosmetic">Cosmetic</option>
              <option value="furniture">Furniture</option>
              <option value="consumable">Consumable</option>
              <option value="misc">Misc</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Cosmetic slot</label>
            <select v-model="formState.cosmetic_slot" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" :disabled="formState.kind !== 'cosmetic'">
              <option :value="null">None</option>
              <option value="body">body</option>
              <option value="hair">hair</option>
              <option value="top">top</option>
              <option value="bottom">bottom</option>
              <option value="shoes">shoes</option>
              <option value="head_accessory">head_accessory</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Rarity</label>
            <input v-model.number="formState.rarity" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Max stack</label>
            <input v-model.number="formState.max_stack" type="number" min="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Bind</label>
            <select v-model="formState.bind" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="none">none</option>
              <option value="bind_on_equip">bind_on_equip</option>
              <option value="bind_on_place">bind_on_place</option>
              <option value="bound">bound</option>
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Sort order</label>
            <input v-model.number="formState.sort_order" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Coins price</label>
            <input v-model.number="formState.coins_price" type="number" min="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Premium price</label>
            <input v-model.number="formState.premium_price" type="number" min="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Preview image URL</label>
            <input v-model="formState.preview_image" type="url" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="/assets/skins/example-preview.png" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Model GLB URL</label>
            <input v-model="formState.model_glb" type="url" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="/assets/skins/example.glb" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Preview image file</label>
            <input type="file" accept="image/png,image/jpeg,image/webp" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" @change="onPreviewFileChange" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">GLB file</label>
            <input type="file" accept=".glb,model/gltf-binary" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" @change="onGlbFileChange" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700">Stock remaining</label>
            <input v-model.number="formState.stock_remaining" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div class="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
            <label class="flex items-center gap-2 text-sm text-slate-800"><input v-model="formState.tradable" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Tradable</label>
            <label class="flex items-center gap-2 text-sm text-slate-800"><input v-model="formState.premium_only" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Premium only</label>
            <label class="flex items-center gap-2 text-sm text-slate-800"><input v-model="formState.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Active</label>
            <label class="flex items-center gap-2 text-sm text-slate-800"><input v-model="formState.is_published" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Published</label>
            <label class="flex items-center gap-2 text-sm text-slate-800"><input v-model="formState.is_unique_per_account" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Unique per account</label>
          </div>
          <p v-if="formError" class="m-0 text-sm text-red-600 md:col-span-2">{{ formError }}</p>
          <div class="flex justify-end gap-2 md:col-span-2">
            <button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800" :disabled="formSubmitting" @click="closePanel">Cancel</button>
            <button type="submit" class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60" :disabled="formSubmitting">
              {{ formSubmitting ? 'Saving...' : editingId === null ? 'Create item' : 'Save changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
