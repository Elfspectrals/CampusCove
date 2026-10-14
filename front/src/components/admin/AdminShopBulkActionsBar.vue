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
  <section v-if="selectedCount > 0" class="mb-4 flex flex-wrap items-center gap-2 cc-panel-flat border-sun/50 p-3 text-sm">
    <span class="font-semibold text-sun">{{ selectedCount }} selected</span>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost"
      :disabled="bulkLoading"
      @click="emit('bulk', 'publish')"
    >
      Publish
    </button>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost"
      :disabled="bulkLoading"
      @click="emit('bulk', 'unpublish')"
    >
      Unpublish
    </button>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost"
      :disabled="bulkLoading"
      @click="emit('bulk', 'activate')"
    >
      Activate
    </button>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost"
      :disabled="bulkLoading"
      @click="emit('bulk', 'deactivate')"
    >
      Deactivate
    </button>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost text-coral"
      :disabled="bulkLoading"
      @click="emit('bulk', 'soft_delete')"
    >
      Soft-delete
    </button>
    <button
      type="button"
      class="cc-btn cc-btn-sm cc-btn-ghost text-mint"
      :disabled="bulkLoading"
      @click="emit('bulk', 'restore')"
    >
      Restore
    </button>
  </section>
</template>
