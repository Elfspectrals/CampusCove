<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import * as adminShopApi from '../../api/adminShop'
import type {
  AdminShopCatalogRow,
  AdminShopItemCreateBody,
  AdminShopListParams,
  ShopCurrency,
} from '../../api/adminShop'
const items = ref<AdminShopCatalogRow[]>([])
const listLoading = ref(true)
const listError = ref<string | null>(null)
const pageMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null)

const searchInput = ref('')
const filterCurrency = ref<'all' | ShopCurrency>('all')
const filterActive = ref<'all' | 'active' | 'inactive'>('all')

const panelOpen = ref(false)
const panelMode = ref<'create' | 'edit'>('create')
const editingRow = ref<AdminShopCatalogRow | null>(null)

const formCode = ref('')
const formName = ref('')
const formKind = ref<'furniture' | 'cosmetic' | 'consumable' | 'misc'>('misc')
const formCurrency = ref<ShopCurrency>('coins')
const formPrice = ref(0)
const formActive = ref(true)
const formStock = ref('') // empty => unlimited (null)
const formUnique = ref(false)
const formSubmitting = ref(false)
const formError = ref<string | null>(null)

const deleteTarget = ref<AdminShopCatalogRow | null>(null)
const deleteSubmitting = ref(false)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

/** null = unlimited; false = invalid */
function stockToPayload(raw: string): number | null | false {
  const t = raw.trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return false
  return n
}

function normalizeKind(
  raw: string
): 'furniture' | 'cosmetic' | 'consumable' | 'misc' {
  if (raw === 'furniture' || raw === 'cosmetic' || raw === 'consumable' || raw === 'misc') return raw
  return 'misc'
}

function openCreate() {
  panelMode.value = 'create'
  editingRow.value = null
  formCode.value = ''
  formName.value = ''
  formKind.value = 'misc'
  formCurrency.value = 'coins'
  formPrice.value = 0
  formActive.value = true
  formStock.value = ''
  formUnique.value = false
  formError.value = null
  panelOpen.value = true
}

function openEdit(row: AdminShopCatalogRow) {
  panelMode.value = 'edit'
  editingRow.value = row
  formCode.value = row.item.code
  formName.value = row.item.name
  formKind.value = normalizeKind(row.item.kind)
  formCurrency.value = row.currency
  formPrice.value = row.price
  formActive.value = row.is_active
  formStock.value = row.stock_remaining === null ? '' : String(row.stock_remaining)
  formUnique.value = row.is_unique_per_account
  formError.value = null
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
  editingRow.value = null
  formError.value = null
}

function closeDelete() {
  deleteTarget.value = null
}

function listParams(): AdminShopListParams {
  const p: AdminShopListParams = {}
  if (searchInput.value.trim() !== '') p.search = searchInput.value.trim()
  if (filterCurrency.value !== 'all') p.currency = filterCurrency.value
  if (filterActive.value === 'active') p.is_active = true
  if (filterActive.value === 'inactive') p.is_active = false
  return p
}

async function loadItems() {
  listLoading.value = true
  listError.value = null
  try {
    const res = await adminShopApi.fetchAdminShopItems(listParams())
    items.value = res.items
  } catch (e) {
    listError.value = e instanceof Error ? e.message : 'Could not load shop items'
    items.value = []
  } finally {
    listLoading.value = false
  }
}

async function submitForm() {
  formError.value = null
  const name = formName.value.trim()
  if (name === '') {
    formError.value = 'Name is required'
    return
  }
  const stock = stockToPayload(formStock.value)
  if (stock === false) {
    formError.value = 'Stock must be a non-negative integer or empty for unlimited'
    return
  }
  if (!Number.isFinite(formPrice.value) || formPrice.value < 1 || !Number.isInteger(formPrice.value)) {
    formError.value = 'Price must be a positive integer'
    return
  }

  formSubmitting.value = true
  try {
    if (panelMode.value === 'create') {
      const code = formCode.value.trim()
      if (code === '') {
        formError.value = 'Code is required for new items'
        formSubmitting.value = false
        return
      }
      const body: AdminShopItemCreateBody = {
        code,
        name,
        kind: formKind.value,
        prices: { [formCurrency.value]: formPrice.value },
        is_active: formActive.value,
        stock_remaining: stock,
        is_unique_per_account: formUnique.value,
      }
      await adminShopApi.createAdminShopItem(body)
      pageMessage.value = { kind: 'success', text: 'Item created' }
    } else if (editingRow.value) {
      await adminShopApi.updateAdminShopItem(editingRow.value.shop_catalog_item_id, {
        name,
        currency: formCurrency.value,
        price: formPrice.value,
        is_active: formActive.value,
        stock_remaining: stock,
        is_unique_per_account: formUnique.value,
      })
      pageMessage.value = { kind: 'success', text: 'Item updated' }
    }
    closePanel()
    await loadItems()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Request failed'
  } finally {
    formSubmitting.value = false
  }
}

async function confirmDelete() {
  const row = deleteTarget.value
  if (!row) return
  deleteSubmitting.value = true
  pageMessage.value = null
  try {
    await adminShopApi.deleteAdminShopItem(row.shop_catalog_item_id)
    pageMessage.value = { kind: 'success', text: 'Item deleted' }
    closeDelete()
    await loadItems()
  } catch (e) {
    pageMessage.value = {
      kind: 'error',
      text: e instanceof Error ? e.message : 'Delete failed',
    }
  } finally {
    deleteSubmitting.value = false
  }
}

function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

function priceLabel(row: AdminShopCatalogRow): string {
  if (row.currency === 'coins') return `🪙 ${row.price.toLocaleString()}`
  return `✨ ${row.price.toLocaleString()}`
}

onMounted(() => {
  void loadItems()
})

watch(searchInput, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    void loadItems()
  }, 400)
})

watch([filterCurrency, filterActive], () => {
  void loadItems()
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-6xl flex-col">
    <main class="w-full flex-1">
      <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="m-0 text-sm text-slate-600">
          Manage catalog listings, pricing in coins or premium, stock, and visibility.
        </p>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          @click="openCreate"
        >
          Create item
        </button>
      </div>

      <div
        v-if="pageMessage"
        :class="[
          'mb-4 rounded-xl border px-4 py-3 text-sm',
          pageMessage.kind === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-900',
        ]"
        role="status"
      >
        {{ pageMessage.text }}
      </div>

      <div class="mb-6 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:flex-wrap md:items-end">
        <div class="min-w-[200px] flex-1">
          <label for="admin-shop-search" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Search
          </label>
          <input
            id="admin-shop-search"
            v-model="searchInput"
            type="search"
            placeholder="Name or code"
            autocomplete="off"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          />
        </div>
        <div class="w-full min-w-[140px] md:w-40">
          <label for="admin-shop-currency" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Currency
          </label>
          <select
            id="admin-shop-currency"
            v-model="filterCurrency"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="all">All</option>
            <option value="coins">Coins</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div class="w-full min-w-[140px] md:w-40">
          <label for="admin-shop-active" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <select
            id="admin-shop-active"
            v-model="filterActive"
            class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
        </div>
      </div>

      <div v-if="listLoading" class="flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
        <span
          class="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600"
          aria-hidden="true"
        />
        <p class="m-0 text-sm font-medium">Loading items…</p>
      </div>

      <div
        v-else-if="listError"
        class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900"
        role="alert"
      >
        <p class="m-0 font-semibold">Could not load items</p>
        <p class="mt-1 text-sm">{{ listError }}</p>
        <button
          type="button"
          class="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
          @click="loadItems"
        >
          Try again
        </button>
      </div>

      <div
        v-else-if="items.length === 0"
        class="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-600"
      >
        <p class="m-0 text-lg font-semibold text-slate-800">No items match</p>
        <p class="mt-2 text-sm">Adjust filters or create a new shop listing.</p>
      </div>

      <div v-else class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table class="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th class="px-4 py-3">Name</th>
              <th class="px-4 py-3">Code</th>
              <th class="px-4 py-3">Currency</th>
              <th class="px-4 py-3">Price</th>
              <th class="px-4 py-3">Active</th>
              <th class="px-4 py-3">Stock</th>
              <th class="px-4 py-3">Unique</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in items"
              :key="row.shop_catalog_item_id"
              class="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
            >
              <td class="px-4 py-3 font-medium text-slate-900">{{ row.item.name }}</td>
              <td class="px-4 py-3 font-mono text-xs text-slate-600">{{ row.item.code }}</td>
              <td class="px-4 py-3">{{ currencyLabel(row.currency) }}</td>
              <td class="px-4 py-3 whitespace-nowrap">{{ priceLabel(row) }}</td>
              <td class="px-4 py-3">
                <span
                  :class="[
                    'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                    row.is_active ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
                  ]"
                >
                  {{ row.is_active ? 'Yes' : 'No' }}
                </span>
              </td>
              <td class="px-4 py-3 text-slate-700">
                {{ row.stock_remaining === null ? '∞' : row.stock_remaining.toLocaleString() }}
              </td>
              <td class="px-4 py-3">{{ row.is_unique_per_account ? 'Yes' : 'No' }}</td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  class="mr-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                  @click="openEdit(row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  @click="deleteTarget = row"
                >
                  Delete
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <!-- Create / Edit panel -->
    <div
      v-if="panelOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-shop-panel-title"
      @click.self="closePanel"
    >
      <div
        class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        @click.stop
      >
        <h2 id="admin-shop-panel-title" class="m-0 text-lg font-bold text-slate-900">
          {{ panelMode === 'create' ? 'Create shop item' : 'Edit shop item' }}
        </h2>
        <p class="mt-1 text-sm text-slate-500">
          Price applies to the selected currency (coins or premium).
        </p>

        <form class="mt-6 flex flex-col gap-4" @submit.prevent="submitForm">
          <div v-if="panelMode === 'create'">
            <label for="admin-form-code" class="mb-1 block text-sm font-medium text-slate-800">Code</label>
            <input
              id="admin-form-code"
              v-model="formCode"
              type="text"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="e.g. chair_campus_01"
            />
          </div>
          <div v-else>
            <p class="m-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Code</p>
            <p class="m-0 mt-1 font-mono text-sm text-slate-800">{{ formCode }}</p>
          </div>

          <div>
            <label for="admin-form-name" class="mb-1 block text-sm font-medium text-slate-800">Name</label>
            <input
              id="admin-form-name"
              v-model="formName"
              type="text"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div>
            <label for="admin-form-kind" class="mb-1 block text-sm font-medium text-slate-800">Kind</label>
            <select
              id="admin-form-kind"
              v-model="formKind"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="furniture">Furniture</option>
              <option value="cosmetic">Cosmetic</option>
              <option value="consumable">Consumable</option>
              <option value="misc">Misc</option>
            </select>
          </div>

          <div>
            <label for="admin-form-currency" class="mb-1 block text-sm font-medium text-slate-800">Currency</label>
            <select
              id="admin-form-currency"
              v-model="formCurrency"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="coins">Coins</option>
              <option value="premium">Premium</option>
            </select>
          </div>

          <div>
            <label for="admin-form-price" class="mb-1 block text-sm font-medium text-slate-800">Price</label>
            <input
              id="admin-form-price"
              v-model.number="formPrice"
              type="number"
              min="0"
              step="1"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div class="flex items-center gap-2">
            <input
              id="admin-form-active"
              v-model="formActive"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <label for="admin-form-active" class="text-sm font-medium text-slate-800">Active (visible in shop)</label>
          </div>

          <div>
            <label for="admin-form-stock" class="mb-1 block text-sm font-medium text-slate-800">Stock</label>
            <input
              id="admin-form-stock"
              v-model="formStock"
              type="text"
              inputmode="numeric"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="Empty = unlimited"
            />
            <p class="mt-1 text-xs text-slate-500">Leave blank for unlimited stock.</p>
          </div>

          <div class="flex items-center gap-2">
            <input
              id="admin-form-unique"
              v-model="formUnique"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <label for="admin-form-unique" class="text-sm font-medium text-slate-800">Unique per account</label>
          </div>

          <p v-if="formError" class="m-0 text-sm text-red-600" role="alert">{{ formError }}</p>

          <div class="mt-2 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              :disabled="formSubmitting"
              @click="closePanel"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="formSubmitting"
            >
              {{ formSubmitting ? 'Saving…' : panelMode === 'create' ? 'Create' : 'Save changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete confirmation -->
    <div
      v-if="deleteTarget"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-delete-title"
      @click.self="closeDelete"
    >
      <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl" @click.stop>
        <h2 id="admin-delete-title" class="m-0 text-lg font-bold text-slate-900">Delete item?</h2>
        <p class="mt-2 text-sm text-slate-600">
          This will remove
          <strong class="text-slate-900">{{ deleteTarget.item.name }}</strong>
          ({{ deleteTarget.item.code }}) from the catalog. This cannot be undone.
        </p>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            :disabled="deleteSubmitting"
            @click="closeDelete"
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="deleteSubmitting"
            @click="confirmDelete"
          >
            {{ deleteSubmitting ? 'Deleting…' : 'Delete' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
