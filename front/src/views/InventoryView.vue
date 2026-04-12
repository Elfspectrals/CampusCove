<script setup lang="ts">
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import * as inventoryApi from '../api/inventory'
import type { AccountInventoryRow, InventoryKindFilter } from '../api/inventory'

const items = ref<AccountInventoryRow[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

const kindFilter = ref<InventoryKindFilter>('')
const searchInput = ref('')
const debouncedQ = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(searchInput, (v) => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQ.value = v.trim()
    debounceTimer = null
  }, 350)
})

watch([kindFilter, debouncedQ], () => {
  void loadInventory()
}, { immediate: true })

async function loadInventory() {
  loading.value = true
  loadError.value = null
  try {
    const res = await inventoryApi.fetchAccountInventory({
      kind: kindFilter.value,
      q: debouncedQ.value === '' ? undefined : debouncedQ.value,
    })
    items.value = res.items
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : 'Could not load inventory'
    items.value = []
  } finally {
    loading.value = false
  }
}

function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ')
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <p class="m-0 mb-2 text-slate-600">
      Everything you own on your account. Purchases from the Item Shop show up here.
    </p>
    <p class="m-0 mb-6 text-sm text-slate-500">
      <RouterLink to="/item-shop" class="font-semibold text-purple-700 underline decoration-purple-300 underline-offset-2 hover:text-purple-600">
        Browse the Item Shop
      </RouterLink>
      to add more.
    </p>

    <div class="mb-6 flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
      <div class="min-w-[160px] flex-1">
        <label for="inv-kind" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Kind
        </label>
        <select
          id="inv-kind"
          v-model="kindFilter"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        >
          <option value="">All kinds</option>
          <option value="furniture">Furniture</option>
          <option value="cosmetic">Cosmetic</option>
          <option value="consumable">Consumable</option>
          <option value="misc">Misc</option>
        </select>
      </div>
      <div class="min-w-[200px] flex-[2]">
        <label for="inv-search" class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Search
        </label>
        <input
          id="inv-search"
          v-model="searchInput"
          type="search"
          autocomplete="off"
          placeholder="Name or code"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30"
        />
      </div>
    </div>

    <div v-if="loading" class="flex flex-col items-center justify-center gap-3 py-20 text-slate-600">
      <span
        class="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-purple-600"
        aria-hidden="true"
      />
      <p class="m-0 text-sm font-medium">Loading inventory…</p>
    </div>

    <div
      v-else-if="loadError"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900"
      role="alert"
    >
      <p class="m-0 font-semibold">Could not load inventory</p>
      <p class="mt-1 text-sm">{{ loadError }}</p>
      <button
        type="button"
        class="mt-4 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
        @click="loadInventory"
      >
        Try again
      </button>
    </div>

    <div
      v-else-if="items.length === 0"
      class="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-slate-600"
    >
      <p class="m-0 text-lg font-semibold text-slate-800">No items match</p>
      <p class="mt-2 text-sm">
        Try another search, clear filters, or
        <RouterLink
          to="/item-shop"
          class="font-semibold text-purple-700 underline decoration-purple-300 underline-offset-2 hover:text-purple-600"
        >
          visit the shop
        </RouterLink>
        .
      </p>
    </div>

    <div v-else class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">Item</th>
            <th scope="col" class="px-4 py-3">Kind</th>
            <th scope="col" class="px-4 py-3 text-right">Qty</th>
            <th scope="col" class="hidden px-4 py-3 sm:table-cell">Code</th>
            <th scope="col" class="hidden px-4 py-3 md:table-cell">Bind</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in items"
            :key="row.id"
            class="border-b border-slate-100 last:border-0 hover:bg-slate-50/80"
          >
            <td class="px-4 py-3">
              <p class="m-0 font-semibold text-slate-900">{{ row.item.name }}</p>
              <p class="m-0 mt-0.5 text-xs text-slate-500 sm:hidden">{{ row.item.code }}</p>
            </td>
            <td class="px-4 py-3 capitalize text-slate-700">{{ kindLabel(row.item.kind) }}</td>
            <td class="px-4 py-3 text-right font-mono text-base font-bold text-slate-900">
              {{ row.quantity.toLocaleString() }}
            </td>
            <td class="hidden px-4 py-3 font-mono text-xs text-slate-600 sm:table-cell">{{ row.item.code }}</td>
            <td class="hidden px-4 py-3 text-slate-600 md:table-cell">{{ row.item.bind }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
