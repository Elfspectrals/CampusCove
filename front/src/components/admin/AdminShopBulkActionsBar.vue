<script setup lang="ts">
import type { BulkAction } from '../../types/adminShopUi'

defineProps<{
  selectedCount: number
  bulkLoading: boolean
}>()

const emit = defineEmits<{
  bulk: [action: BulkAction]
}>()
</script>

<template>
  <section v-if="selectedCount > 0" class="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm">
    <span class="font-semibold text-purple-900">{{ selectedCount }} selected</span>
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800"
      :disabled="bulkLoading"
      @click="emit('bulk', 'publish')"
    >
      Publish
    </button>
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800"
      :disabled="bulkLoading"
      @click="emit('bulk', 'unpublish')"
    >
      Unpublish
    </button>
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800"
      :disabled="bulkLoading"
      @click="emit('bulk', 'activate')"
    >
      Activate
    </button>
    <button
      type="button"
      class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-semibold text-slate-800"
      :disabled="bulkLoading"
      @click="emit('bulk', 'deactivate')"
    >
      Deactivate
    </button>
    <button
      type="button"
      class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 font-semibold text-red-900"
      :disabled="bulkLoading"
      @click="emit('bulk', 'soft_delete')"
    >
      Soft-delete
    </button>
    <button
      type="button"
      class="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-900"
      :disabled="bulkLoading"
      @click="emit('bulk', 'restore')"
    >
      Restore
    </button>
  </section>
</template>
