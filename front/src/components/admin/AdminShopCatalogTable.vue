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
  <div v-if="loading" class="cc-panel-flat px-4 py-16 text-center text-sm font-bold text-mist">
    Loading items...
  </div>
  <div v-else-if="listError" class="cc-panel-flat border-coral/50 p-4 text-coral">
    <p class="m-0 font-semibold">Could not load items</p>
    <p class="m-0 mt-1 text-sm">{{ listError }}</p>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-coral mt-3"
      @click="emit('retryLoad')"
    >
      Try again
    </button>
  </div>
  <div v-else-if="displayedRows.length === 0" class="cc-panel-flat px-4 py-16 text-center text-sm font-bold text-mist">
    No items found.
  </div>
  <div v-else class="cc-panel overflow-hidden">
    <div class="overflow-x-auto">
      <table class="cc-table">
        <thead>
          <tr>
            <th class="px-3 py-3 text-left">
              <input type="checkbox" :checked="allSelected" class="cc-check" @change="emit('toggleSelectAll')" />
            </th>
            <th class="px-3 py-3 text-left">
              <button type="button" class="hover:text-sun" @click="emit('setSort', 'name')">Name</button>
            </th>
            <th class="px-3 py-3 text-left">
              <button type="button" class="hover:text-sun" @click="emit('setSort', 'code')">Code</button>
            </th>
            <th v-if="!isSkinSection" class="px-3 py-3 text-left">
              <button type="button" class="hover:text-sun" @click="emit('setSort', 'kind')">Kind</button>
            </th>
            <th v-else class="px-3 py-3 text-left">Slot</th>
            <th class="px-3 py-3 text-left">
              <button type="button" class="hover:text-sun" @click="emit('setSort', 'price')">Price</button>
            </th>
            <th class="px-3 py-3 text-left">Status</th>
            <th class="px-3 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in displayedRows" :key="row.shop_catalog_item_id">
            <td class="px-3 py-3">
              <input
                type="checkbox"
                :checked="selectedIds.includes(row.shop_catalog_item_id)"
                class="cc-check"
                @change="emit('toggleRowSelection', row.shop_catalog_item_id)"
              />
            </td>
            <td class="px-3 py-3">
              <p class="m-0 font-semibold text-fog">{{ row.item.name }}</p>
              <p class="m-0 text-xs text-mist">#{{ row.shop_catalog_item_id }}</p>
            </td>
            <td class="px-3 py-3 font-mono text-xs text-fog/90">{{ row.item.code }}</td>
            <td v-if="!isSkinSection" class="px-3 py-3 text-fog/90">{{ row.item.kind }}</td>
            <td v-else class="px-3 py-3 text-fog/90">{{ row.item.cosmetic_slot ?? 'body' }}</td>
            <td class="px-3 py-3 text-fog/90">{{ rowPriceText(row) }}</td>
            <td class="px-3 py-3">
              <span class="cc-chip" :class="statusClass(row)">{{ statusLabel(row) }}</span>
            </td>
            <td class="px-3 py-3">
              <div class="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="cc-btn cc-btn-sm cc-btn-ghost"
                  :disabled="actionLoading === row.shop_catalog_item_id"
                  @click="emit('openEdit', row)"
                >
                  Edit
                </button>
                <button
                  type="button"
                  class="cc-btn cc-btn-sm cc-btn-ghost"
                  :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at"
                  @click="emit('publishToggle', row)"
                >
                  {{ row.is_published ? 'Unpublish' : 'Publish' }}
                </button>
                <button
                  type="button"
                  class="cc-btn cc-btn-sm cc-btn-ghost"
                  :disabled="actionLoading === row.shop_catalog_item_id || !!row.deleted_at"
                  @click="emit('activeToggle', row)"
                >
                  {{ row.is_active ? 'Deactivate' : 'Activate' }}
                </button>
                <button
                  v-if="!row.deleted_at"
                  type="button"
                  class="cc-btn cc-btn-sm cc-btn-ghost text-coral"
                  :disabled="actionLoading === row.shop_catalog_item_id"
                  @click="emit('softDeleteRow', row)"
                >
                  Soft-delete
                </button>
                <button
                  v-else
                  type="button"
                  class="cc-btn cc-btn-sm cc-btn-ghost text-mint"
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
