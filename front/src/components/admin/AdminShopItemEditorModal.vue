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
  <div v-if="open" class="cc-backdrop" @click.self="closePanel">
    <div class="cc-modal max-w-3xl">
      <h2 class="cc-display m-0 text-2xl text-fog">
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
      <p class="mt-2 text-sm text-mist">
        <template v-if="isSkinSection">
          Skins are <span class="font-bold text-fog">permanent, account-wide</span> cosmetics—unlocked for the whole account when purchased.
        </template>
        <template v-else>
          Shop items are in-game assets (furniture/apartment assets and other non-cosmetics).
        </template>
      </p>
      <p
        v-if="isSkinSection && editingId !== null && formState.kind !== 'cosmetic'"
        class="mt-2 cc-alert cc-alert-warn font-semibold"
      >
        This row is <span class="font-semibold">{{ formState.kind }}</span>, not a cosmetic. Save keeps that item type; new skins created here are always cosmetics.
      </p>
      <form class="mt-4 grid gap-3 md:grid-cols-2" @submit.prevent="emit('submit')">
        <div>
          <label class="cc-label">Code</label>
          <input v-model="formState.code" type="text" class="cc-input cc-input-sm w-full" required />
        </div>
        <div>
          <label class="cc-label">Name</label>
          <input v-model="formState.name" type="text" class="cc-input cc-input-sm w-full" required />
        </div>
        <div>
          <label class="cc-label">Rarity</label>
          <select v-model.number="formState.rarity" class="cc-input cc-input-sm w-full">
            <option v-for="opt in rarityOptions" :key="`rarity-${opt.value}`" :value="opt.value">{{ opt.label }} ({{ opt.value }})</option>
          </select>
        </div>
        <div v-if="!isSkinSection">
          <label class="cc-label">Kind</label>
          <select v-model="formState.kind" class="cc-input cc-input-sm w-full">
            <option v-for="kind in ITEM_KIND_OPTIONS" :key="`kind-${kind}`" :value="kind">
              {{ kind }}
            </option>
          </select>
        </div>
        <div v-if="isSkinSection">
          <label class="cc-label">Cosmetic slot</label>
          <select v-model="formState.cosmetic_slot" class="cc-input cc-input-sm w-full">
            <option value="body">body</option>
            <option value="hair">hair</option>
            <option value="top">top</option>
            <option value="bottom">bottom</option>
            <option value="shoes">shoes</option>
            <option value="head_accessory">head_accessory</option>
          </select>
        </div>
        <div>
          <label class="cc-label">Coins price</label>
          <input v-model.number="formState.coins_price" type="number" min="1" class="cc-input cc-input-sm w-full" />
        </div>
        <div>
          <label class="cc-label">Premium price</label>
          <input v-model.number="formState.premium_price" type="number" min="1" class="cc-input cc-input-sm w-full" />
        </div>
        <div>
          <label class="cc-label">Preview image URL</label>
          <input
            v-model="formState.preview_image"
            type="url"
            class="cc-input cc-input-sm w-full"
            placeholder="/assets/skins/example-preview.png"
          />
        </div>
        <div>
          <label class="cc-label">Model GLB URL</label>
          <input
            v-model="formState.model_glb"
            type="url"
            class="cc-input cc-input-sm w-full"
            placeholder="/assets/skins/example.glb"
          />
        </div>
        <div>
          <label class="cc-label">Preview image file</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" class="cc-input cc-input-sm w-full file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-ink-600 file:px-3 file:py-1 file:font-bold file:text-fog" @change="emit('previewFileChange', $event)" />
        </div>
        <div>
          <label class="cc-label">GLB file</label>
          <input type="file" accept=".glb,model/gltf-binary" class="cc-input cc-input-sm w-full file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-ink-600 file:px-3 file:py-1 file:font-bold file:text-fog" @change="emit('glbFileChange', $event)" />
        </div>
        <div>
          <label class="cc-label">Stock remaining</label>
          <input v-model.number="formState.stock_remaining" type="number" min="0" class="cc-input cc-input-sm w-full" />
        </div>
        <div v-if="!isSkinSection">
          <label class="cc-label">Max stack</label>
          <input v-model.number="formState.max_stack" type="number" min="1" class="cc-input cc-input-sm w-full" />
        </div>
        <div v-if="!isSkinSection">
          <label class="cc-label">Bind mode</label>
          <select v-model="formState.bind" class="cc-input cc-input-sm w-full">
            <option value="none">none</option>
            <option value="bind_on_equip">bind_on_equip</option>
            <option value="bind_on_place">bind_on_place</option>
            <option value="bound">bound</option>
          </select>
        </div>
        <div class="cc-panel-flat flex flex-wrap items-center gap-4 px-3 py-2.5 md:col-span-2">
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="formState.tradable" type="checkbox" class="cc-check" />Tradable
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="formState.premium_only" type="checkbox" class="cc-check" />Premium only
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="formState.is_active" type="checkbox" class="cc-check" />Active
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="formState.is_published" type="checkbox" class="cc-check" />Published
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="formState.is_unique_per_account" type="checkbox" class="cc-check" />Unique per account
          </label>
        </div>
        <p v-if="formError" class="m-0 text-sm text-coral md:col-span-2">{{ formError }}</p>
        <div class="flex justify-end gap-2 md:col-span-2">
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="formSubmitting" @click="closePanel">
            Cancel
          </button>
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-sun" :disabled="formSubmitting">
            {{
              formSubmitting ? 'Saving...' : editingId === null ? (isSkinSection ? 'Create skin' : 'Create item') : 'Save changes'
            }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
