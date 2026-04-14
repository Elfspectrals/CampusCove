<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import * as adminShopApi from '../../api/adminShop'
import type { AdminShopCatalogRow, AdminShopItemCreateBody, AdminShopListParams, ShopCurrency } from '../../api/adminShop'

type PricingMode = 'coins' | 'premium' | 'both'

const items = ref<AdminShopCatalogRow[]>([])
const listLoading = ref(true)
const listError = ref<string | null>(null)
const pageMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null)

const searchInput = ref('')
const filterCurrency = ref<'all' | ShopCurrency>('all')
const filterActive = ref<'all' | 'active' | 'inactive'>('all')

const panelOpen = ref(false)
const formSubmitting = ref(false)
const formError = ref<string | null>(null)

const formCode = ref('')
const formName = ref('')
const formKind = ref<'furniture' | 'cosmetic' | 'consumable' | 'misc'>('cosmetic')
const formPricingMode = ref<PricingMode>('coins')
const formCoinsPrice = ref<number | null>(null)
const formPremiumPrice = ref<number | null>(null)
const formActive = ref(true)
const formPublished = ref(false)
const formPreviewFile = ref<File | null>(null)
const formGlbFile = ref<File | null>(null)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

const groupedItems = computed(() => {
  const byDef = new Map<number, { item: AdminShopCatalogRow['item']; row: AdminShopCatalogRow }>()
  for (const row of items.value) {
    const key = row.item.item_def_id
    if (!byDef.has(key)) byDef.set(key, { item: row.item, row })
  }
  return Array.from(byDef.values())
})

function resetForm() {
  formCode.value = ''
  formName.value = ''
  formKind.value = 'cosmetic'
  formPricingMode.value = 'coins'
  formCoinsPrice.value = null
  formPremiumPrice.value = null
  formActive.value = true
  formPublished.value = false
  formPreviewFile.value = null
  formGlbFile.value = null
  formError.value = null
}

function openCreate() {
  resetForm()
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
}

function listParams(): AdminShopListParams {
  const p: AdminShopListParams = {}
  if (searchInput.value.trim() !== '') p.search = searchInput.value.trim()
  if (filterCurrency.value !== 'all') p.currency = filterCurrency.value
  if (filterActive.value === 'active') p.is_published = true
  if (filterActive.value === 'inactive') p.is_published = false
  return p
}

function currencyLabel(c: ShopCurrency): string {
  return c === 'coins' ? 'Coins' : 'Premium'
}

function pricingOptions(row: AdminShopCatalogRow): Array<{ currency: ShopCurrency; price: number }> {
  const options: Array<{ currency: ShopCurrency; price: number }> = []
  if (row.allow_coins && row.coins_price !== null) {
    options.push({ currency: 'coins', price: row.coins_price })
  }
  if (row.allow_premium && row.premium_price !== null) {
    options.push({ currency: 'premium', price: row.premium_price })
  }
  if (options.length === 0) {
    options.push({ currency: row.currency, price: row.price })
  }
  return options
}

function parsePrice(value: number | null): number | null {
  if (value === null) return null
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) return null
  return value
}

function onPreviewFileChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const file = target.files?.[0] ?? null
  formPreviewFile.value = file
}

function onGlbFileChange(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const file = target.files?.[0] ?? null
  formGlbFile.value = file
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
  const code = formCode.value.trim()
  const name = formName.value.trim()
  if (code === '') {
    formError.value = 'Code is required'
    return
  }
  if (name === '') {
    formError.value = 'Name is required'
    return
  }
  if (!formPreviewFile.value) {
    formError.value = 'Preview image is required'
    return
  }
  if (!formGlbFile.value) {
    formError.value = 'GLB file is required'
    return
  }
  const prices: Partial<Record<ShopCurrency, number>> = {}
  if (formPricingMode.value === 'coins' || formPricingMode.value === 'both') {
    const parsed = parsePrice(formCoinsPrice.value)
    if (parsed === null) {
      formError.value = 'Coins price must be a positive integer'
      return
    }
    prices.coins = parsed
  }
  if (formPricingMode.value === 'premium' || formPricingMode.value === 'both') {
    const parsed = parsePrice(formPremiumPrice.value)
    if (parsed === null) {
      formError.value = 'Premium price must be a positive integer'
      return
    }
    prices.premium = parsed
  }

  const body: AdminShopItemCreateBody = {
    code,
    name,
    kind: formKind.value,
    prices,
    previewImageFile: formPreviewFile.value,
    modelGlbFile: formGlbFile.value,
    is_active: formActive.value,
    is_published: formPublished.value,
    stock_remaining: null,
    is_unique_per_account: true,
  }

  formSubmitting.value = true
  try {
    await adminShopApi.createAdminShopItem(body)
    pageMessage.value = { kind: 'success', text: 'Skin created successfully.' }
    closePanel()
    await loadItems()
  } catch (e) {
    formError.value = e instanceof Error ? e.message : 'Could not create skin'
  } finally {
    formSubmitting.value = false
  }
}

async function togglePublish(row: AdminShopCatalogRow) {
  pageMessage.value = null
  try {
    await adminShopApi.updateAdminShopItem(row.shop_catalog_item_id, {
      name: row.item.name,
      is_published: !row.is_published,
      stock_remaining: row.stock_remaining,
      is_unique_per_account: row.is_unique_per_account,
    })
    pageMessage.value = {
      kind: 'success',
      text: `${row.item.name} is now ${row.is_published ? 'unpublished' : 'published'}.`,
    }
    await loadItems()
  } catch (e) {
    pageMessage.value = { kind: 'error', text: e instanceof Error ? e.message : 'Could not update publish state' }
  }
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
          Create and publish skins with uploaded preview images and GLB models.
        </p>
        <button
          type="button"
          class="inline-flex items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          @click="openCreate"
        >
          Create skin
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
            <option value="active">Published only</option>
            <option value="inactive">Unpublished only</option>
          </select>
        </div>
      </div>

      <div v-if="listLoading" class="flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
        <span class="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600" aria-hidden="true" />
        <p class="m-0 text-sm font-medium">Loading skins…</p>
      </div>

      <div v-else-if="listError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900" role="alert">
        <p class="m-0 font-semibold">Could not load skins</p>
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
        v-else-if="groupedItems.length === 0"
        class="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-600"
      >
        <p class="m-0 text-lg font-semibold text-slate-800">No skins match</p>
        <p class="mt-2 text-sm">Adjust filters or create a new skin listing.</p>
      </div>

      <ul v-else class="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
        <li v-for="entry in groupedItems" :key="entry.item.item_def_id" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div class="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 class="m-0 text-lg font-bold text-slate-900">{{ entry.item.name }}</h2>
              <p class="m-0 mt-1 font-mono text-xs text-slate-500">{{ entry.item.code }}</p>
            </div>
            <span
              :class="[
                'rounded-full px-2 py-1 text-xs font-semibold',
                entry.row.is_published ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-200 text-slate-700',
              ]"
            >
              {{ entry.row.is_published ? 'Published' : 'Unpublished' }}
            </span>
          </div>

          <img
            v-if="entry.item.preview_image"
            :src="entry.item.preview_image"
            :alt="`${entry.item.name} preview`"
            class="mb-3 h-36 w-full rounded-xl border border-slate-200 object-cover"
          />
          <div v-else class="mb-3 flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
            No preview image
          </div>

          <ul class="m-0 mb-4 list-none space-y-2 p-0 text-sm text-slate-700">
            <li v-for="option in pricingOptions(entry.row)" :key="`${entry.row.shop_catalog_item_id}-${option.currency}`" class="flex items-center justify-between">
              <span>{{ currencyLabel(option.currency) }}</span>
              <span class="font-semibold">{{ option.currency === 'coins' ? `🪙 ${option.price.toLocaleString()}` : `✨ ${option.price.toLocaleString()}` }}</span>
            </li>
          </ul>

          <div class="flex gap-2">
            <button
              type="button"
              class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              @click="togglePublish(entry.row)"
            >
              {{ entry.row.is_published ? 'Unpublish' : 'Publish' }}
            </button>
          </div>
        </li>
      </ul>
    </main>

    <div
      v-if="panelOpen"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-shop-panel-title"
      @click.self="closePanel"
    >
      <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="admin-shop-panel-title" class="m-0 text-lg font-bold text-slate-900">Create skin</h2>
        <p class="mt-1 text-sm text-slate-500">Upload files and set one or both currency prices.</p>

        <form class="mt-6 flex flex-col gap-4" @submit.prevent="submitForm">
          <div>
            <label for="admin-form-code" class="mb-1 block text-sm font-medium text-slate-800">Code</label>
            <input
              id="admin-form-code"
              v-model="formCode"
              type="text"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
              placeholder="e.g. campus_hero_skin"
            />
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
              <option value="cosmetic">Cosmetic</option>
              <option value="furniture">Furniture</option>
              <option value="consumable">Consumable</option>
              <option value="misc">Misc</option>
            </select>
          </div>

          <div>
            <label for="admin-form-pricing-mode" class="mb-1 block text-sm font-medium text-slate-800">Pricing mode</label>
            <select
              id="admin-form-pricing-mode"
              v-model="formPricingMode"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            >
              <option value="coins">Coins</option>
              <option value="premium">Premium</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div v-if="formPricingMode === 'coins' || formPricingMode === 'both'">
            <label for="admin-form-price-coins" class="mb-1 block text-sm font-medium text-slate-800">Coins price</label>
            <input
              id="admin-form-price-coins"
              v-model.number="formCoinsPrice"
              type="number"
              min="1"
              step="1"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div v-if="formPricingMode === 'premium' || formPricingMode === 'both'">
            <label for="admin-form-price-premium" class="mb-1 block text-sm font-medium text-slate-800">Premium price</label>
            <input
              id="admin-form-price-premium"
              v-model.number="formPremiumPrice"
              type="number"
              min="1"
              step="1"
              required
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
            />
          </div>

          <div>
            <label for="admin-form-preview" class="mb-1 block text-sm font-medium text-slate-800">Preview image</label>
            <input
              id="admin-form-preview"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              @change="onPreviewFileChange"
            />
            <p v-if="formPreviewFile" class="mt-1 text-xs text-slate-500">Selected: {{ formPreviewFile.name }}</p>
          </div>

          <div>
            <label for="admin-form-glb" class="mb-1 block text-sm font-medium text-slate-800">GLB model</label>
            <input
              id="admin-form-glb"
              type="file"
              accept=".glb,model/gltf-binary"
              class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
              @change="onGlbFileChange"
            />
            <p v-if="formGlbFile" class="mt-1 text-xs text-slate-500">Selected: {{ formGlbFile.name }}</p>
          </div>

          <label class="flex items-center gap-2">
            <input
              id="admin-form-active"
              v-model="formActive"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span class="text-sm font-medium text-slate-800">Active listing</span>
          </label>
          <label class="flex items-center gap-2">
            <input
              id="admin-form-published"
              v-model="formPublished"
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
            />
            <span class="text-sm font-medium text-slate-800">Visible in shop now</span>
          </label>

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
              {{ formSubmitting ? 'Creating…' : 'Create skin' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
