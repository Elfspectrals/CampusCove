<script setup lang="ts">
import { ITEM_KIND_OPTIONS, type ShopFormState } from '../../types/adminShopUi'

const open = defineModel<boolean>('open', { required: true })
const formState = defineModel<ShopFormState>('formState', { required: true })

defineProps<{
  isSkinSection: boolean
  editingId: number | null
  formSubmitting: boolean
  formError: string | null
  rarityOptions: readonly { value: number; label: string }[]
}>()

const emit = defineEmits<{
  submit: []
  previewFileChange: [event: Event]
  glbFileChange: [event: Event]
}>()

function closePanel(): void {
  open.value = false
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" @click.self="closePanel">
    <div class="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
      <h2 class="m-0 text-lg font-bold text-slate-900">
        {{
          editingId === null
            ? isSkinSection
              ? 'Create shop skin'
              : 'Create shop item'
            : isSkinSection
              ? 'Edit shop skin'
              : 'Edit shop item'
        }}
      </h2>
      <p class="mt-2 text-sm text-slate-600">
        <template v-if="isSkinSection">
          Skins are <span class="font-medium text-slate-800">permanent, account-wide</span> cosmetics—unlocked for the whole account when purchased.
        </template>
        <template v-else>
          Shop items are in-game assets (furniture/apartment assets and other non-cosmetics).
        </template>
      </p>
      <p
        v-if="isSkinSection && editingId !== null && formState.kind !== 'cosmetic'"
        class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
      >
        This row is <span class="font-semibold">{{ formState.kind }}</span>, not a cosmetic. Save keeps that item type; new skins created here are always cosmetics.
      </p>
      <form class="mt-4 grid gap-3 md:grid-cols-2" @submit.prevent="emit('submit')">
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Code</label>
          <input v-model="formState.code" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Name</label>
          <input v-model="formState.name" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Rarity</label>
          <select v-model.number="formState.rarity" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option v-for="opt in rarityOptions" :key="`rarity-${opt.value}`" :value="opt.value">{{ opt.label }} ({{ opt.value }})</option>
          </select>
        </div>
        <div v-if="!isSkinSection">
          <label class="mb-1 block text-sm font-medium text-slate-700">Kind</label>
          <select v-model="formState.kind" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option v-for="kind in ITEM_KIND_OPTIONS" :key="`kind-${kind}`" :value="kind">
              {{ kind }}
            </option>
          </select>
        </div>
        <div v-if="isSkinSection">
          <label class="mb-1 block text-sm font-medium text-slate-700">Cosmetic slot</label>
          <select v-model="formState.cosmetic_slot" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="body">body</option>
            <option value="hair">hair</option>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
            <option value="shoes">shoes</option>
            <option value="head_accessory">head_accessory</option>
          </select>
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
          <input
            v-model="formState.preview_image"
            type="url"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="/assets/skins/example-preview.png"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Model GLB URL</label>
          <input
            v-model="formState.model_glb"
            type="url"
            class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="/assets/skins/example.glb"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Preview image file</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" @change="emit('previewFileChange', $event)" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">GLB file</label>
          <input type="file" accept=".glb,model/gltf-binary" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" @change="emit('glbFileChange', $event)" />
        </div>
        <div>
          <label class="mb-1 block text-sm font-medium text-slate-700">Stock remaining</label>
          <input v-model.number="formState.stock_remaining" type="number" min="0" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div v-if="!isSkinSection">
          <label class="mb-1 block text-sm font-medium text-slate-700">Max stack</label>
          <input v-model.number="formState.max_stack" type="number" min="1" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div v-if="!isSkinSection">
          <label class="mb-1 block text-sm font-medium text-slate-700">Bind mode</label>
          <select v-model="formState.bind" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="none">none</option>
            <option value="bind_on_equip">bind_on_equip</option>
            <option value="bind_on_place">bind_on_place</option>
            <option value="bound">bound</option>
          </select>
        </div>
        <div class="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="formState.tradable" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Tradable
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="formState.premium_only" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Premium only
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="formState.is_active" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Active
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="formState.is_published" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Published
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="formState.is_unique_per_account" type="checkbox" class="h-4 w-4 rounded border-slate-300" />Unique per account
          </label>
        </div>
        <p v-if="formError" class="m-0 text-sm text-red-600 md:col-span-2">{{ formError }}</p>
        <div class="flex justify-end gap-2 md:col-span-2">
          <button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800" :disabled="formSubmitting" @click="closePanel">
            Cancel
          </button>
          <button type="submit" class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60" :disabled="formSubmitting">
            {{
              formSubmitting ? 'Saving...' : editingId === null ? (isSkinSection ? 'Create skin' : 'Create item') : 'Save changes'
            }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
