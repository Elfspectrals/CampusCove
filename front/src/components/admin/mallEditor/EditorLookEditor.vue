<script setup lang="ts">
import { computed } from 'vue'
import type { MaterialLook, TexturePart } from '../../../game/mallTemplates/mallTemplate.ts'
import EditorColorPicker from './EditorColorPicker.vue'
import EditorSearchSelect, { type SelectOption } from './EditorSearchSelect.vue'

const props = defineProps<{
  label: string
  look: MaterialLook | undefined
  materialOptions: SelectOption[] | null
  textureOptions: SelectOption[]
  texturable: boolean
  textureParts: Record<string, TexturePart[]>
  ownParts: TexturePart[]
}>()

const emit = defineEmits<{ update: [look: MaterialLook | null] }>()

const NONE = ''
const DEFAULT_PAINT = '#ffffff'

const withModel = (options: SelectOption[]): SelectOption[] => [{ value: NONE, label: '(model)' }, ...options]
const materials = computed(() => (props.materialOptions ? withModel(props.materialOptions) : null))
const textures = computed(() => withModel(props.textureOptions))
const parts = computed(() => {
  if (props.look?.material) return []
  if (props.look?.texture) return props.textureParts[props.look.texture] ?? []
  return props.look?.color ? [] : props.ownParts
})

function send(next: MaterialLook): void {
  const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && !(typeof v === 'object' && Object.keys(v).length === 0))) as MaterialLook
  emit('update', Object.keys(clean).length ? clean : null)
}

function setMaterial(material: string): void {
  send({ material: material || undefined, color: props.look?.color })
}

function setTexture(texture: string): void {
  send({ texture: texture || undefined, color: props.look?.color })
}

function setPaint(on: boolean): void {
  send({ ...props.look, color: on ? (props.look?.color ?? DEFAULT_PAINT) : undefined, parts: on && !props.look?.texture ? undefined : props.look?.parts })
}

function setColor(color: string): void {
  send({ ...props.look, color })
}

function setPart(part: TexturePart, color: string): void {
  const next = { ...(props.look?.parts ?? {}) }
  if (color === part.color) delete next[part.id]
  else next[part.id] = color
  send({ ...props.look, parts: next })
}
</script>

<template>
  <div class="flex flex-col gap-1 border-t border-ink-700/70 py-1.5 first:border-t-0">
    <p class="m-0 text-[11px] font-extrabold uppercase tracking-[0.1em] text-fog">{{ label }}</p>
    <div v-if="materials" class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span class="text-xs text-mist">Material</span>
      <EditorSearchSelect :model-value="look?.material ?? NONE" :options="materials" @update:model-value="setMaterial" />
    </div>
    <div v-if="texturable && !look?.material" class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span class="text-xs text-mist">Texture</span>
      <EditorSearchSelect :model-value="look?.texture ?? NONE" :options="textures" @update:model-value="setTexture" />
    </div>
    <div class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <label class="flex items-center gap-1.5 text-xs text-mist">
        <input type="checkbox" class="accent-[rgb(var(--cc-pool))]" :checked="look?.color !== undefined" @change="setPaint(($event.target as HTMLInputElement).checked)" />
        {{ look?.texture || look?.material ? 'Tint' : 'Colour' }}
      </label>
      <EditorColorPicker :model-value="look?.color ?? DEFAULT_PAINT" :disabled="look?.color === undefined" @update:model-value="setColor" />
    </div>
    <div v-for="part in parts" :key="part.id" class="grid grid-cols-[5.5rem_1fr] items-center gap-2">
      <span class="truncate pl-2 text-xs text-mist">· {{ part.label }}</span>
      <EditorColorPicker :model-value="look?.parts?.[part.id] ?? part.color" @update:model-value="setPart(part, $event)" />
    </div>
  </div>
</template>
