<script setup lang="ts">
import type { AdminShopCatalogRow } from '../../api/adminShop'
import { rowPriceText, statusClass, statusLabel } from '../../utils/adminShopRowMeta'
import type { SortBy } from '../../types/adminShopUi'

defineProps<{
  displayedRows: AdminShopCatalogRow[]
  isSkinSection: boolean
  selectedIds: number[]
  allSelected: boolean
  loading: boolean
  listError: string | null
  actionLoading: number | null
}>()

const emit = defineEmits<{
  toggleSelectAll: []
  toggleRowSelection: [id: number]
  setSort: [column: SortBy]
  openEdit: [row: AdminShopCatalogRow]
  publishToggle: [row: AdminShopCatalogRow]
  activeToggle: [row: AdminShopCatalogRow]
  softDeleteRow: [row: AdminShopCatalogRow]
  restoreRow: [row: AdminShopCatalogRow]
  retryLoad: []
}>()
</script>

<template>
  <div v-if="loading" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">
    Loading items...
  </div>
  <div v-else-if="listError" class="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-red-900">
    <p class="m-0 font-semibold">Could not load items</p>
    <p class="m-0 mt-1 text-sm">{{ listError }}</p>
    <button
      type="button"
      class="mt-3 rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-600"
      @click="emit('retryLoad')"
    >
      Try again
    </button>
  </div>
  <div v-else-if="displayedRows.length === 0" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">
    No items found.
  </div>
  <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-slate-200 text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th class="px-3 py-3 text-left">
              <input type="checkbox" :checked="allSelected" class="h-4 w-4 rounded border-slate-300" @change="emit('toggleSelectAll')" />
            </th>
            <th class="px-3 py-3 text-left font-semibold text-slate-700">
              <button type="button" class="hover:text-slate-900" @click="emit('setSort', 'name')">Name</button>
            </th>
            <th class="px-3 py-3 text-left font-semibold text-slate-700">
              <button type="button" class="hover:text-slate-900" @click="emit('setSort', 'code')">Code</button>
            </th>
            <th v-if="!isSkinSection" class="px-3 py-3 text-left font-semibold text-slate-700">
              <button type="button" class="hover:text-slate-900" @click="emit('setSort', 'kind')">Kind</button>
            </th>
            <th v-else class="px-3 py-3 text-left font-semibold text-slate-700">Slot</th>
            <th class="px-3 py-3 text-left font-semibold text-slate-700">
              <button type="button" class="hover:text-slate-900" @click="emit('setSort', 'price')">Price</button>
            </th>
            <th class="px-3 py-3 text-left font-semibold text-slate-700">Status</th>
            <th class="px-3 py-3 text-right font-semibold text-slate-700">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr v-for="row in displayedRows" :key="row.shop_catalog_item_id">
            <td class="px-3 py-3">
              <input
                type="checkbox"
                :checked="selectedIds.includes(row.shop_catalog_item_id)"
                class="h-4 w-4 rounded border-slate-300"
                @change="emit('toggleRowSelection', row.shop_catalog_item_id)"
              />
            </td>
            <td class="px-3 py-3">
              <p class="m-0 font-semibold text-slate-900">{{ row.item.name }}</p>
              <p class="m-0 text-xs text-slate-500">#{{ row.shop_catalog_item_id }}</p>
            </td>
            <td class="px-3 py-3 font-mono text-xs text-slate-700">{{ row.item.code }}</td>
            <td v-if="!isSkinSection" class="px-3 py-3 text-slate-700">{{ row.item.kind }}</td>
            <td v-else class="px-3 py-3 text-slate-700">{{ row.item.cosmetic_slot ?? 'body' }}</td>
            <td class="px-3 py-3 text-slate-700">{{ rowPriceText(row) }}</td>
            <td class="px-3 py-3">
              <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="statusClass(row)">{{ statusLabel(row) }}</span>
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  :disabled="actionLoading === row.shop_catalog_item_id"
                  @click="emit('openEdit', row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at"
                  @click="emit('publishToggle', row)"
                >
                  {{ row.is_published ? 'Unpublish' : 'Publish' }}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                  :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at"
                  @click="emit('activeToggle', row)"
                >
                  {{ row.is_active ? 'Deactivate' : 'Activate' }}
                </button>
                <button
                  v-if="!row.deleted_at"
                  type="button"
                  class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100"
                  :disabled="actionLoading === row.shop_catalog_item_id"
                  @click="emit('softDeleteRow', row)"
                >
                  Soft-delete
                </button>
                <button
                  v-else
                  type="button"
                  class="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                  :disabled="actionLoading === row.shop_catalog_item_id"
                  @click="emit('restoreRow', row)"
                >
                  Restore
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
