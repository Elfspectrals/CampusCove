<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AdminShopBulkActionsBar from '../../components/admin/AdminShopBulkActionsBar.vue'
import AdminShopCatalogTable from '../../components/admin/AdminShopCatalogTable.vue'
import AdminShopItemEditorModal from '../../components/admin/AdminShopItemEditorModal.vue'
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
import {
  type BulkAction,
  type BindMode,
  type CosmeticSlot,
  type DeletedFilter,
  type ItemKind,
  type SortBy,
  type ShopFormState,
  RARITY_PRESET_OPTIONS,
  newShopFormState,
} from '../../types/adminShopUi'

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
const route = useRoute()
const formState = ref<ShopFormState>(newShopFormState(route.name === 'admin-shop-skin'))

let searchDebounce: ReturnType<typeof setTimeout> | null = null

const isSkinSection = computed(() => route.name === 'admin-shop-skin')
const displayedRows = computed(() => {
  if (isSkinSection.value) {
    return rows.value.filter((row) => row.item.kind === 'cosmetic')
  }
  return rows.value.filter((row) => row.item.kind !== 'cosmetic')
})
const allSelected = computed(
  () => displayedRows.value.length > 0 && selectedIds.value.length === displayedRows.value.length,
)
const selectedCount = computed(() => selectedIds.value.length)

const raritySelectOptions = computed(() => {
  const r = formState.value.rarity
  const presets = RARITY_PRESET_OPTIONS
  if (presets.some((o) => o.value === r)) return presets
  return [...presets, { value: r, label: `Other (rarity ${r})` }]
})

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
  selectedIds.value = displayedRows.value.map((row) => row.shop_catalog_item_id)
}

function toggleRowSelection(id: number): void {
  if (selectedIds.value.includes(id)) {
    selectedIds.value = selectedIds.value.filter((entry) => entry !== id)
    return
  }
  selectedIds.value = [...selectedIds.value, id]
}

function toListParams(): AdminShopListParams {
  const kindFilter: 'all' | ItemKind = isSkinSection.value ? 'cosmetic' : filterKind.value
  return {
    search: searchInput.value.trim() === '' ? undefined : searchInput.value.trim(),
    currency: filterCurrency.value,
    kind: kindFilter,
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
    selectedIds.value = selectedIds.value.filter((id) => displayedRows.value.some((row) => row.shop_catalog_item_id === id))
  } catch (caught) {
    listError.value = caught instanceof Error ? caught.message : 'Could not load shop items'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  editingId.value = null
  formState.value = newShopFormState(isSkinSection.value)
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
  if (isSkinSection.value) {
    form.kind = 'cosmetic'
    if (form.cosmetic_slot === null) {
      formError.value = 'Cosmetic slot is required for skins'
      return
    }
  } else if (form.kind === 'cosmetic') {
    formError.value = 'Cosmetic items must be created in Admin Shop Skins'
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
        kind: isSkinSection.value ? 'cosmetic' : form.kind,
        rarity: form.rarity,
        tradable: form.tradable,
        premium_only: form.premium_only,
        bind: form.bind,
        max_stack: form.max_stack,
        cosmetic_slot: isSkinSection.value ? form.cosmetic_slot : null,
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
      pageMessage.value = { kind: 'success', text: isSkinSection.value ? 'Skin created.' : 'Item created.' }
    } else {
      const updateBody: AdminShopItemUpdateBody = {
        code: form.code.trim(),
        name: form.name.trim(),
        kind: isSkinSection.value ? 'cosmetic' : form.kind,
        rarity: form.rarity,
        tradable: form.tradable,
        premium_only: form.premium_only,
        bind: form.bind,
        max_stack: form.max_stack,
        cosmetic_slot: isSkinSection.value ? form.cosmetic_slot : null,
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
      pageMessage.value = { kind: 'success', text: isSkinSection.value ? 'Skin updated.' : 'Item updated.' }
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
    pageMessage.value = { kind: 'success', text: `Bulk action "${action}" applied to ${ids.length} ${isSkinSection.value ? 'skin(s)' : 'item(s)'}.` }
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

watch(isSkinSection, () => {
  selectedIds.value = []
  filterKind.value = 'all'
  page.value = 1
  void loadRows()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="m-0 text-2xl font-bold text-slate-900">{{ isSkinSection ? 'Admin shop skins' : 'Admin shop items' }}</h1>
        <p class="mt-1 text-sm text-slate-600">
          {{
            isSkinSection
              ? 'Manage permanent cosmetic skins sold in the skin shop.'
              : 'Manage in-game placeable/item catalog entries sold in the item shop.'
          }}
        </p>
      </div>
      <button type="button" class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500" @click="openCreate">
        {{ isSkinSection ? 'New skin' : 'New item' }}
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
          <option value="all">Kind: {{ isSkinSection ? 'Cosmetic only' : 'All non-cosmetic' }}</option>
          <option v-if="isSkinSection" value="cosmetic">Cosmetic</option>
          <option v-else value="apartment_asset">Apartment asset</option>
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

    <AdminShopBulkActionsBar :selected-count="selectedCount" :bulk-loading="bulkLoading" @bulk="runBulkAction" />

    <AdminShopCatalogTable
      :displayed-rows="displayedRows"
      :is-skin-section="isSkinSection"
      :selected-ids="selectedIds"
      :all-selected="allSelected"
      :loading="loading"
      :list-error="listError"
      :action-loading="actionLoading"
      @toggle-select-all="toggleSelectAll"
      @toggle-row-selection="toggleRowSelection"
      @set-sort="setSort"
      @open-edit="openEdit"
      @publish-toggle="publishToggle"
      @active-toggle="activeToggle"
      @soft-delete-row="softDeleteRow"
      @restore-row="restoreRow"
      @retry-load="loadRows"
    />

    <div class="mt-4 flex items-center justify-between text-sm text-slate-600">
      <p class="m-0">Showing page {{ meta.current_page }} of {{ meta.last_page }} ({{ meta.total }} total)</p>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 disabled:opacity-50"
          :disabled="meta.current_page <= 1"
          @click="goToPage(meta.current_page - 1)"
        >
          Previous
        </button>
        <button
          type="button"
          class="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-800 disabled:opacity-50"
          :disabled="meta.current_page >= meta.last_page"
          @click="goToPage(meta.current_page + 1)"
        >
          Next
        </button>
      </div>
    </div>

    <AdminShopItemEditorModal
      v-model:open="panelOpen"
      v-model:form-state="formState"
      :is-skin-section="isSkinSection"
      :editing-id="editingId"
      :form-submitting="formSubmitting"
      :form-error="formError"
      :rarity-options="raritySelectOptions"
      @submit="submitForm"
      @preview-file-change="onPreviewFileChange"
      @glb-file-change="onGlbFileChange"
    />
  </div>
</template>
