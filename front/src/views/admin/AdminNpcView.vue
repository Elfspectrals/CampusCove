<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import EditorSearchSelect from '../../components/admin/mallEditor/EditorSearchSelect.vue'
import NpcTreeGraph from '../../components/admin/npc/NpcTreeGraph.vue'
import NpcNodeDetails from '../../components/admin/npc/NpcNodeDetails.vue'
import NpcAssignments from '../../components/admin/npc/NpcAssignments.vue'
import { useNpcBehaviorEditor, type Selection } from '../../composables/useNpcBehaviorEditor'
import { useNpcLiveDebug } from '../../composables/useNpcLiveDebug'
import {
  BUILT_IN_POINTS,
  KEY_PATTERN,
  KEY_TYPES,
  MAX_KEYS,
  MAX_NUMBER,
  MAX_POINTS,
  MAX_TEXT,
  defaultValue,
  isComposite,
  npcStateId,
  type BbValue,
  type BehaviorTree,
  type BtNode,
  type CompositeType,
  type DecoratorType,
  type KeyType,
  type ServiceType,
  type TaskType,
} from '../../game/npcBehavior/npcBehavior'
import {
  addChild,
  createDecorator,
  createService,
  findNode,
  nodeProblems,
  parentOf,
  pasteNode,
  removeNode,
  removePoint,
  renameKey,
  renamePoint,
  updateNode,
} from '../../game/npcBehavior/npcTreeEdit'

const CAN_WRITE = import.meta.env.DEV
const editor = useNpcBehaviorEditor()
const { tree, treeKey, selection, status } = editor
const tab = ref<'tree' | 'npcs'>('tree')
const creating = ref(false)
const newKey = ref('')
const newName = ref('')
const newPoint = ref('')
const pointError = ref<string | null>(null)
const newKeyName = ref('')
const newKeyType = ref<KeyType>('number')
const keyError = ref<string | null>(null)
const graph = ref<InstanceType<typeof NpcTreeGraph> | null>(null)
const clipboard = shallowRef<BtNode | null>(null)
const live = useNpcLiveDebug()

const problems = computed(() => (tree.value ? nodeProblems(tree.value, editor.file.value.trees) : new Map<string, string>()))
const subtreeKeys = computed(() => editor.treeKeys.value.filter((k) => k !== treeKey.value))
const treeUsers = computed(() => editor.file.value.npcs.filter((n) => n.tree === treeKey.value).map((n) => npcStateId(n.zone, n.npc)))

function setTree(next: BehaviorTree): void {
  editor.setTree(next)
}

function select(next: Selection): void {
  selection.value = next
}

function onAddChild(parentId: string, type: CompositeType | TaskType, pos?: [number, number]): void {
  if (!tree.value) return
  const { tree: next, id } = addChild(tree.value, parentId, type, pos)
  setTree(next)
  select({ node: id, part: 'node' })
}

function onAddDecorator(nodeId: string, type: DecoratorType): void {
  if (!tree.value) return
  const node = findNode(tree.value.root, nodeId)
  if (!node) return
  setTree(updateNode(tree.value, nodeId, (n) => ({ ...n, decorators: [...n.decorators, createDecorator(type, tree.value!)] })))
  select({ node: nodeId, part: 'decorator', index: node.decorators.length })
}

function onAddService(nodeId: string, type: ServiceType): void {
  if (!tree.value) return
  const node = findNode(tree.value.root, nodeId)
  if (!node || !isComposite(node)) return
  setTree(updateNode(tree.value, nodeId, (n) => (isComposite(n) ? { ...n, services: [...n.services, createService(type)] } : n)))
  select({ node: nodeId, part: 'service', index: node.services.length })
}

function onRemove(target: Selection): void {
  if (!tree.value || !target) return
  if (target.part === 'node') {
    const next = removeNode(tree.value, target.node)
    if (next === tree.value) {
      status.value = { kind: 'error', text: 'The root stays, and a composite keeps at least one child.' }
      return
    }
    setTree(next)
    select(null)
    return
  }
  const list = target.part === 'decorator' ? 'decorators' : 'services'
  setTree(updateNode(tree.value, target.node, (n) => ({ ...n, [list]: ((n as unknown as Record<string, unknown[]>)[list] ?? []).filter((_, i) => i !== target.index) }) as typeof n))
  select({ node: target.node, part: 'node' })
}

function createTree(): void {
  const error = editor.addTree(newKey.value.trim(), newName.value.trim())
  if (error) {
    status.value = { kind: 'error', text: error }
    return
  }
  creating.value = false
  newKey.value = ''
  newName.value = ''
  tab.value = 'tree'
}

function deleteTree(): void {
  if (!tree.value || !window.confirm(`Delete the tree "${tree.value.name}"?`)) return
  const error = editor.deleteTree()
  if (error) status.value = { kind: 'error', text: error }
}

function renameTree(name: string): void {
  if (tree.value && name.trim() && name !== tree.value.name) setTree({ ...tree.value, name: name.trim().slice(0, 40) })
}

function nameProblem(key: string, except?: string): string | null {
  if (!KEY_PATTERN.test(key)) return 'Keys: lowercase letters, digits and _'
  if ((BUILT_IN_POINTS as readonly string[]).includes(key)) return `"${key}" is built in`
  if (key !== except && (tree.value?.points.includes(key) || tree.value?.keys.some((k) => k.key === key))) return `"${key}" already exists`
  return null
}

function addKey(): void {
  const key = newKeyName.value.trim()
  if (!tree.value) return
  keyError.value = tree.value.keys.length >= MAX_KEYS ? `At most ${MAX_KEYS} keys` : nameProblem(key)
  if (keyError.value) return
  setTree({ ...tree.value, keys: [...tree.value.keys, { key, type: newKeyType.value, value: defaultValue(newKeyType.value) }] })
  newKeyName.value = ''
}

function renameKeyName(from: string, event: Event): void {
  const input = event.target as HTMLInputElement
  const to = input.value.trim()
  if (!tree.value || to === from) return
  keyError.value = nameProblem(to, from)
  if (keyError.value) {
    input.value = from
    return
  }
  setTree(renameKey(tree.value, from, to))
}

function setKeyValue(key: string, type: KeyType, raw: string | boolean): void {
  if (!tree.value) return
  let value: BbValue = raw
  if (type === 'number') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    value = Math.min(MAX_NUMBER, Math.max(-MAX_NUMBER, n))
  } else if (type === 'text') value = String(raw).slice(0, MAX_TEXT)
  setTree({ ...tree.value, keys: tree.value.keys.map((k) => (k.key === key ? { ...k, value } : k)) })
}

function dropKey(key: string): void {
  if (tree.value) setTree({ ...tree.value, keys: tree.value.keys.filter((k) => k.key !== key) })
}

function selectedNode(): BtNode | null {
  return tree.value && selection.value ? findNode(tree.value.root, selection.value.node) : null
}

function copySelected(): boolean {
  const node = selectedNode()
  if (!node) return false
  clipboard.value = structuredClone(node)
  return true
}

function paste(source: BtNode, besideId?: string): void {
  if (!tree.value) return
  const anchor = besideId ? null : selectedNode()
  const parentId = besideId ? parentOf(tree.value.root, besideId)?.id : anchor && isComposite(anchor) ? anchor.id : anchor ? parentOf(tree.value.root, anchor.id)?.id : tree.value.root.id
  const pasted = pasteNode(tree.value, parentId ?? '', source)
  if ('error' in pasted) {
    status.value = { kind: 'error', text: pasted.error }
    return
  }
  setTree(pasted.tree)
  select({ node: pasted.id!, part: 'node' })
}

function treeShortcut(key: string): boolean {
  if (key === 'c') return copySelected()
  if (key === 'x') {
    const node = selectedNode()
    if (!copySelected() || !node) return false
    onRemove({ node: node.id, part: 'node' })
    return true
  }
  if (key === 'v' && clipboard.value) {
    paste(clipboard.value)
    return true
  }
  if (key === 'd') {
    const node = selectedNode()
    if (!node || node.id === tree.value?.root.id) return false
    paste(structuredClone(node), node.id)
    return true
  }
  return false
}

function addPoint(): void {
  const key = newPoint.value.trim()
  if (!tree.value) return
  pointError.value = tree.value.points.length >= MAX_POINTS ? `At most ${MAX_POINTS} points` : nameProblem(key)
  if (pointError.value) return
  editor.syncPoints(treeKey.value, { ...tree.value, points: [...tree.value.points, key] })
  newPoint.value = ''
}

function renamePointKey(from: string, event: Event): void {
  const input = event.target as HTMLInputElement
  const to = input.value.trim()
  if (!tree.value || to === from) return
  pointError.value = nameProblem(to, from)
  if (pointError.value) {
    input.value = from
    return
  }
  editor.syncPoints(treeKey.value, renamePoint(tree.value, from, to), { from, to })
}

function dropPoint(key: string): void {
  if (tree.value) editor.syncPoints(treeKey.value, removePoint(tree.value, key))
}

function openTree(key: string): void {
  if (key !== treeKey.value) live.npcId.value = ''
  treeKey.value = key
  selection.value = null
  tab.value = 'tree'
}

function onKeyDown(event: KeyboardEvent): void {
  const typing = (event.target as HTMLElement | null)?.closest('input, textarea, select')
  const mod = event.ctrlKey || event.metaKey
  if (mod && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (CAN_WRITE) void editor.save()
    return
  }
  if (typing) return
  if (tab.value === 'tree' && mod && treeShortcut(event.key.toLowerCase())) {
    event.preventDefault()
    return
  }
  const inGraph = !!(event.target as HTMLElement | null)?.closest('.npc-graph') || event.target === document.body
  if (tab.value === 'tree' && inGraph && !mod && (event.key === ' ' || event.key === 'Tab')) {
    event.preventDefault()
    graph.value?.openPalette()
    return
  }
  if (mod && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) editor.redo()
    else editor.undo()
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection.value && tab.value === 'tree') {
    event.preventDefault()
    onRemove(selection.value)
  }
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (editor.dirty.value) event.preventDefault()
}

onMounted(() => {
  void editor.load()
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})
</script>

<template>
  <div class="h-full w-full overflow-auto bg-ink-950">
    <div class="flex h-full min-h-[680px] w-full min-w-[1000px] flex-col text-fog">
      <header class="cc-panel-flat m-2 mb-0 flex flex-wrap items-center gap-3 px-4 py-2">
        <h1 class="cc-display m-0 text-xl text-sun">NPC Interface</h1>
        <div class="flex items-center gap-1">
          <button type="button" :class="['cc-btn cc-btn-sm px-3', tab === 'tree' ? 'cc-btn-sun' : 'cc-btn-ghost']" @click="tab = 'tree'"><UiIcon name="grid" :size="14" /> Behavior Tree</button>
          <button type="button" :class="['cc-btn cc-btn-sm px-3', tab === 'npcs' ? 'cc-btn-sun' : 'cc-btn-ghost']" @click="tab = 'npcs'"><UiIcon name="users" :size="14" /> NPCs</button>
        </div>
        <div class="ml-auto flex flex-wrap items-center gap-1">
          <EditorSearchSelect
            class="w-56"
            :model-value="treeKey"
            :options="editor.treeKeys.value.map((k) => ({ value: k, label: `${editor.file.value.trees[k]!.name} · ${k}` }))"
            placeholder="Open a tree…"
            @update:model-value="openTree"
          />
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="creating = !creating"><UiIcon name="plus" :size="14" /> New</button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="!tree" @click="editor.duplicateTree">Duplicate</button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost text-red-400" :disabled="!tree" @click="deleteTree"><UiIcon name="trash" :size="14" /></button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="!editor.canUndo.value" title="Undo (Ctrl/Cmd+Z)" @click="editor.undo"><UiIcon name="rotate-left" :size="16" /></button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" :disabled="!editor.canRedo.value" title="Redo (Ctrl/Cmd+Shift+Z)" @click="editor.redo"><UiIcon name="rotate-right" :size="16" /></button>
          <button v-if="CAN_WRITE" type="button" class="cc-btn cc-btn-sm cc-btn-sun" :disabled="!editor.dirty.value || !!editor.validation.value" title="Save (Ctrl/Cmd+S)" @click="editor.save">
            Save<span v-if="editor.dirty.value"> •</span>
          </button>
        </div>
        <form v-if="creating" class="flex w-full flex-wrap items-center gap-2" @submit.prevent="createTree">
          <input v-model="newName" placeholder="Tree name (Shopkeeper's walk)" maxlength="40" class="cc-input w-56 py-1.5 text-sm" />
          <input v-model="newKey" placeholder="file_key" class="cc-input w-40 py-1.5 font-mono text-sm" />
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-sun">Create</button>
          <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="creating = false">Cancel</button>
        </form>
        <p v-if="status" :class="['m-0 w-full text-sm font-bold', status.kind === 'error' ? 'text-red-400' : 'text-mint']">{{ status.text }}</p>
        <p v-if="editor.validation.value" class="m-0 w-full text-sm font-bold text-red-400">Not valid yet: {{ editor.validation.value }}</p>
        <p v-if="!CAN_WRITE" class="m-0 w-full text-xs font-bold text-sun">Read-only: trees are edited and saved on the local dev server, then committed.</p>
        <p v-if="editor.loadError.value" class="m-0 w-full text-sm font-bold text-red-400">{{ editor.loadError.value }}</p>
      </header>

      <div v-if="tab === 'tree'" class="flex min-h-0 flex-1 gap-2 p-2">
        <section class="cc-panel-flat flex w-64 shrink-0 flex-col overflow-hidden">
          <header class="border-b-2 border-ink-600/50 px-3 py-2"><span class="cc-eyebrow m-0 text-mist">Blackboard</span></header>
          <div v-if="tree" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm" @keydown.stop>
            <label class="flex flex-col gap-1">
              <span class="text-xs font-bold text-mist">Tree name</span>
              <input :key="treeKey" :value="tree.name" maxlength="40" class="cc-input py-1.5 text-sm" @change="renameTree(($event.target as HTMLInputElement).value)" />
            </label>
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold text-mist">Keys</span>
              <div class="flex items-center gap-2 rounded-lg bg-ink-950/50 px-2 py-1 font-mono text-xs"><span class="text-sun">home</span><span class="text-mist">point · the NPC's spot</span></div>
              <div class="flex items-center gap-2 rounded-lg bg-ink-950/50 px-2 py-1 font-mono text-xs"><span class="text-sun">target</span><span class="text-mist">player · from Perceive</span></div>
              <div v-for="p in tree.points" :key="`${treeKey}-${p}`" class="flex items-center gap-1">
                <input :value="p" class="cc-input min-w-0 flex-1 py-1 font-mono text-xs" @change="renamePointKey(p, $event)" />
                <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2 text-red-400" title="Remove: tasks using it go home" @click="dropPoint(p)"><UiIcon name="x" :size="12" /></button>
              </div>
              <form class="flex items-center gap-1" @submit.prevent="addPoint">
                <input v-model="newPoint" placeholder="new_point" class="cc-input min-w-0 flex-1 py-1 font-mono text-xs" />
                <button type="submit" class="cc-btn cc-btn-sm cc-btn-ghost px-2"><UiIcon name="plus" :size="12" /></button>
              </form>
              <p v-if="pointError" class="m-0 text-xs font-bold text-red-400">{{ pointError }}</p>
              <p class="m-0 text-xs text-mist">Points are placed per NPC, in the NPCs tab.</p>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold text-mist">Values</span>
              <div v-for="k in tree.keys" :key="`${treeKey}-k-${k.key}`" class="flex items-center gap-1">
                <input :value="k.key" class="cc-input min-w-0 flex-1 py-1 font-mono text-xs" :title="`${k.type} key`" @change="renameKeyName(k.key, $event)" />
                <span class="w-9 shrink-0 text-center font-mono text-[10px] text-mist">{{ k.type }}</span>
                <input v-if="k.type === 'bool'" type="checkbox" :checked="k.value === true" title="Starting value" @change="setKeyValue(k.key, k.type, ($event.target as HTMLInputElement).checked)" />
                <input
                  v-else
                  :type="k.type === 'number' ? 'number' : 'text'"
                  :value="k.value"
                  :maxlength="MAX_TEXT"
                  class="cc-input w-16 py-1 text-xs"
                  title="Starting value"
                  @change="setKeyValue(k.key, k.type, ($event.target as HTMLInputElement).value)"
                />
                <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2 text-red-400" title="Remove: nodes reading it turn red" @click="dropKey(k.key)"><UiIcon name="x" :size="12" /></button>
              </div>
              <form class="flex items-center gap-1" @submit.prevent="addKey">
                <input v-model="newKeyName" placeholder="new_key" class="cc-input min-w-0 flex-1 py-1 font-mono text-xs" />
                <select v-model="newKeyType" class="cc-input w-24 shrink-0 py-1 text-xs">
                  <option v-for="t in KEY_TYPES" :key="t" :value="t">{{ t }}</option>
                </select>
                <button type="submit" class="cc-btn cc-btn-sm cc-btn-ghost px-2"><UiIcon name="plus" :size="12" /></button>
              </form>
              <p v-if="keyError" class="m-0 text-xs font-bold text-red-400">{{ keyError }}</p>
              <p class="m-0 text-xs text-mist">Read by the Blackboard decorator, changed by Set Value.</p>
            </div>
            <div v-if="CAN_WRITE" class="flex flex-col gap-1">
              <span class="text-xs font-bold text-mist">Live debug</span>
              <select v-model="live.npcId.value" class="cc-input py-1 font-mono text-xs">
                <option value="">Off</option>
                <option v-for="id in treeUsers" :key="id" :value="id">{{ id }}</option>
              </select>
              <p v-if="live.error.value" class="m-0 text-xs font-bold text-red-400">{{ live.error.value }}</p>
              <template v-if="live.view.value">
                <div v-for="(v, k) in live.view.value.entry.values" :key="k" class="flex items-center gap-2 rounded-lg bg-ink-950/50 px-2 py-1 font-mono text-xs">
                  <span class="text-sun">{{ k }}</span><span class="ml-auto">{{ JSON.stringify(v) }}</span>
                </div>
                <div class="flex items-center gap-2 rounded-lg bg-ink-950/50 px-2 py-1 font-mono text-xs">
                  <span class="text-sun">target</span><span class="ml-auto">{{ live.view.value.entry.target ?? 'none' }}</span>
                </div>
                <div class="flex items-center gap-2 rounded-lg bg-ink-950/50 px-2 py-1 font-mono text-xs">
                  <span class="text-sun">clip</span><span class="ml-auto">{{ live.view.value.entry.clip }}</span>
                </div>
                <p v-if="live.view.value.entry.say" class="m-0 text-xs text-mist">Says “{{ live.view.value.entry.say }}”</p>
                <p class="m-0 text-xs text-mist">Running nodes glow green, ✓ / ✗ show results of the last 2.5 s. Instance {{ live.view.value.roomId }}. Shows the saved tree.</p>
              </template>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-xs font-bold text-mist">Used by</span>
              <button
                v-for="a in editor.file.value.npcs.filter((n) => n.tree === treeKey)"
                :key="`${a.zone}/${a.npc}`"
                type="button"
                class="rounded-lg bg-ink-950/50 px-2 py-1 text-left font-mono text-xs hover:bg-ink-800"
                @click="tab = 'npcs'"
              >
                {{ a.zone }}/{{ a.npc }}
              </button>
              <p v-if="!editor.file.value.npcs.some((n) => n.tree === treeKey)" class="m-0 text-xs text-mist">No NPC yet.</p>
            </div>
            <div class="mt-auto flex flex-col gap-1 rounded-xl bg-ink-950/40 p-2 text-[11px] text-mist">
              <span><b class="text-fog">Grey</b> composite · <b class="text-fog">purple</b> task</span>
              <span><b class="text-fog">Blue</b> decorator · <b class="text-fog">green</b> service</span>
              <span>Numbers give the execution order: left to right.</span>
              <span><b class="text-fog">Red</b> card: the server would refuse it (hover the !).</span>
              <span>Ctrl+C / X / V / D copy, cut, paste, duplicate.</span>
            </div>
          </div>
          <p v-else class="m-0 p-3 text-xs text-mist">No tree yet: click New.</p>
        </section>

        <div class="relative min-w-0 flex-1">
          <NpcTreeGraph
            v-if="tree"
            ref="graph"
            :tree="tree"
            :selection="selection"
            :problems="problems"
            :debug="live.view.value"
            @select="select"
            @update="setTree"
            @error="(text: string) => (status = { kind: 'error', text })"
            @add-child="onAddChild"
            @add-decorator="onAddDecorator"
            @add-service="onAddService"
            @remove="onRemove"
          />
        </div>

        <NpcNodeDetails v-if="tree" class="w-80 shrink-0" :tree="tree" :selection="selection" :subtrees="subtreeKeys" @update="setTree" @select="select" />
      </div>

      <div v-else class="flex min-h-0 flex-1 p-2">
        <NpcAssignments
          :zones="editor.zones.value"
          :file="editor.file.value"
          @assign="editor.assign"
          @place-point="editor.placePoint"
          @open-tree="openTree"
        />
      </div>
    </div>
  </div>
</template>
