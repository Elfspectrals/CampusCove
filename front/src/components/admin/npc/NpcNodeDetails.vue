<script setup lang="ts">
import { computed } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'
import {
  BUILT_IN_POINTS,
  COMPOSITE_TYPES,
  KEY_PATTERN,
  NODE_SPECS,
  isComposite,
  type BehaviorTree,
  type BtNode,
  type CompositeType,
  type FieldSpec,
} from '../../../game/npcBehavior/npcBehavior'
import { findNode, moveNode, parentOf, removeNode, setCompositeType, updateNode } from '../../../game/npcBehavior/npcTreeEdit'
import type { Selection } from '../../../composables/useNpcBehaviorEditor'

const props = defineProps<{ tree: BehaviorTree; selection: Selection }>()
const emit = defineEmits<{ update: [tree: BehaviorTree]; select: [selection: Selection] }>()

type Params = Record<string, unknown>

const node = computed(() => (props.selection ? findNode(props.tree.root, props.selection.node) : null))
const parent = computed(() => (node.value ? parentOf(props.tree.root, node.value.id) : null))
const part = computed<{ list: 'decorators' | 'services'; index: number; value: Params & { type: keyof typeof NODE_SPECS } } | null>(() => {
  const s = props.selection
  const n = node.value
  if (!s || !n || s.part === 'node') return null
  const list = s.part === 'decorator' ? 'decorators' : 'services'
  const items = (list === 'services' && isComposite(n) ? n.services : n.decorators) as unknown as Array<Params & { type: keyof typeof NODE_SPECS }>
  const value = items[s.index]
  return value ? { list, index: s.index, value } : null
})
const spec = computed(() => (part.value ? NODE_SPECS[part.value.value.type] : node.value ? NODE_SPECS[node.value.type] : null))
const values = computed<Params>(() => (part.value ? part.value.value : ((node.value ?? {}) as unknown as Params)))
const pointOptions = computed(() => [...BUILT_IN_POINTS, ...props.tree.points])
const siblings = computed(() => parent.value?.children ?? [])
const index = computed(() => siblings.value.findIndex((c) => c.id === node.value?.id))

function editNode(edit: (n: BtNode) => BtNode): void {
  if (node.value) emit('update', updateNode(props.tree, node.value.id, edit))
}

function setField(field: FieldSpec, raw: unknown): void {
  let value = raw
  if (field.kind === 'number') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    value = Math.min(field.max, Math.max(field.min, field.integer ? Math.round(n) : n))
  }
  if (field.kind === 'lines') {
    const lines = String(raw)
      .split('\n')
      .map((l) => l.slice(0, field.maxLength))
      .filter((l) => l.trim() !== '')
      .slice(0, field.maxLines)
    if (lines.length === 0) return
    value = lines
  }
  const p = part.value
  if (!p) return editNode((n) => ({ ...n, [field.key]: value }) as BtNode)
  editNode((n) => {
    const list = [...((n as unknown as Record<string, Params[]>)[p.list] ?? [])]
    list[p.index] = { ...list[p.index], [field.key]: value }
    return { ...n, [p.list]: list } as unknown as BtNode
  })
}

function renameId(event: Event): void {
  const input = event.target as HTMLInputElement
  const id = input.value.trim()
  const current = node.value
  if (!current || id === current.id) return
  if (!KEY_PATTERN.test(id) || findNode(props.tree.root, id)) {
    input.value = current.id
    return
  }
  emit('update', updateNode(props.tree, current.id, (n) => ({ ...n, id })))
  emit('select', { node: id, part: 'node' })
}

function setWeight(raw: string): void {
  const w = Math.min(100, Math.max(1, Math.round(Number(raw)) || 1))
  editNode((n) => ({ ...n, weight: w }))
}

function setType(type: CompositeType): void {
  if (node.value) emit('update', setCompositeType(props.tree, node.value.id, type))
}

function move(delta: -1 | 1): void {
  const p = part.value
  if (!p) {
    if (node.value) emit('update', moveNode(props.tree, node.value.id, delta))
    return
  }
  const to = p.index + delta
  editNode((n) => {
    const list = [...((n as unknown as Record<string, Params[]>)[p.list] ?? [])]
    if (to < 0 || to >= list.length) return n
    ;[list[p.index], list[to]] = [list[to]!, list[p.index]!]
    return { ...n, [p.list]: list } as unknown as BtNode
  })
  if (to >= 0) emit('select', { node: props.selection!.node, part: props.selection!.part as 'decorator' | 'service', index: to })
}

function remove(): void {
  const p = part.value
  const n = node.value
  if (!n) return
  if (!p) {
    if (n.id === props.tree.root.id) return
    emit('update', removeNode(props.tree, n.id))
    emit('select', parent.value ? { node: parent.value.id, part: 'node' } : null)
    return
  }
  editNode((x) => ({ ...x, [p.list]: ((x as unknown as Record<string, Params[]>)[p.list] ?? []).filter((_, i) => i !== p.index) }) as unknown as BtNode)
  emit('select', { node: n.id, part: 'node' })
}

const canRemove = computed(() => !!part.value || (!!node.value && node.value.id !== props.tree.root.id && siblings.value.length > 1))
</script>

<template>
  <section class="cc-panel-flat flex min-h-0 flex-col overflow-hidden">
    <header class="flex items-center gap-2 border-b-2 border-ink-600/50 px-3 py-2">
      <span class="cc-eyebrow m-0 text-mist">Details</span>
      <span v-if="spec" class="truncate text-xs font-bold text-fog">{{ spec.label }}</span>
    </header>
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm" @keydown.stop>
      <p v-if="!node || !spec" class="m-0 text-xs text-mist">
        Select a node, a decorator (blue) or a service (green). Right-click a node in the graph to add children, decorators and services.
      </p>
      <template v-else>
        <p class="m-0 text-xs text-mist">{{ spec.hint }}</p>

        <template v-if="!part">
          <label class="flex flex-col gap-1">
            <span class="text-xs font-bold text-mist">Node id</span>
            <input :key="node.id" :value="node.id" class="cc-input py-1.5 font-mono text-sm" @change="renameId" />
          </label>
          <label v-if="isComposite(node)" class="flex flex-col gap-1">
            <span class="text-xs font-bold text-mist">Composite</span>
            <select class="cc-input py-1.5 text-sm" :value="node.type" @change="setType(($event.target as HTMLSelectElement).value as CompositeType)">
              <option v-for="t in COMPOSITE_TYPES" :key="t" :value="t">{{ NODE_SPECS[t].label }}</option>
            </select>
          </label>
          <label v-if="parent?.type === 'random'" class="flex flex-col gap-1">
            <span class="text-xs font-bold text-mist">Weight (1-100)</span>
            <input type="number" min="1" max="100" step="1" :value="node.weight ?? 1" class="cc-input py-1.5 text-sm" @change="setWeight(($event.target as HTMLInputElement).value)" />
          </label>
        </template>

        <label v-for="field in spec.fields" :key="`${selection?.node}-${field.key}`" :class="field.kind === 'bool' ? 'flex items-center gap-2' : 'flex flex-col gap-1'">
          <template v-if="field.kind === 'bool'">
            <input type="checkbox" :checked="values[field.key] === true" @change="setField(field, ($event.target as HTMLInputElement).checked)" />
            <span class="text-xs font-bold">{{ field.label }}</span>
          </template>
          <template v-else>
            <span class="text-xs font-bold text-mist">{{ field.label }}</span>
            <input
              v-if="field.kind === 'number'"
              type="number"
              :min="field.min"
              :max="field.max"
              :step="field.step"
              :value="values[field.key]"
              class="cc-input py-1.5 text-sm"
              @change="setField(field, ($event.target as HTMLInputElement).value)"
            />
            <select v-else-if="field.kind === 'choice'" class="cc-input py-1.5 text-sm" :value="values[field.key]" @change="setField(field, ($event.target as HTMLSelectElement).value)">
              <option v-for="o in field.options" :key="o" :value="o">{{ o }}</option>
            </select>
            <select v-else-if="field.kind === 'point'" class="cc-input py-1.5 font-mono text-sm" :value="values[field.key]" @change="setField(field, ($event.target as HTMLSelectElement).value)">
              <option v-for="o in pointOptions" :key="o" :value="o">{{ o }}</option>
            </select>
            <textarea
              v-else-if="field.kind === 'lines'"
              rows="4"
              class="cc-input py-1.5 text-sm"
              :value="(values[field.key] as string[]).join('\n')"
              :placeholder="`One line each, up to ${field.maxLines}`"
              @change="setField(field, ($event.target as HTMLTextAreaElement).value)"
            />
          </template>
        </label>

        <p v-if="!part && spec.group === 'task' && 'point' in node && node.point === 'target'" class="m-0 rounded-lg bg-ink-950/50 p-2 text-xs text-mist">
          Fails when no player is perceived: put a Perceive Players service on a composite above.
        </p>
        <p v-if="part && (values.abort === 'lower' || values.abort === 'both') && parent?.type !== 'selector' && node.id !== tree.root.id" class="m-0 text-xs font-bold text-red-400">
          Lower priority aborts only work on a child of a selector.
        </p>

        <div class="mt-1 flex flex-wrap gap-1">
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" :disabled="part ? part.index === 0 : index <= 0" @click="move(-1)">
            <UiIcon name="chevron-left" :size="14" /> {{ part ? 'Up' : 'Left' }}
          </button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" :disabled="part ? false : index < 0 || index >= siblings.length - 1" @click="move(1)">
            {{ part ? 'Down' : 'Right' }} <UiIcon name="chevron-right" :size="14" />
          </button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost ml-auto px-2 text-red-400" :disabled="!canRemove" title="Delete (Del)" @click="remove">
            <UiIcon name="trash" :size="14" /> Delete
          </button>
        </div>
        <p v-if="!part && node.id !== tree.root.id && siblings.length <= 1" class="m-0 text-xs text-mist">A composite keeps at least one child.</p>
      </template>
    </div>
  </section>
</template>
