<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import EditorSearchSelect from '../../components/admin/mallEditor/EditorSearchSelect.vue'
import NpcTreeGraph from '../../components/admin/npc/NpcTreeGraph.vue'
import NpcNodeDetails from '../../components/admin/npc/NpcNodeDetails.vue'
import NpcAssignments from '../../components/admin/npc/NpcAssignments.vue'
import { useNpcBehaviorEditor, type Selection } from '../../composables/useNpcBehaviorEditor'
import { BUILT_IN_POINTS, KEY_PATTERN, MAX_POINTS, isComposite, type BehaviorTree, type CompositeType, type DecoratorType, type ServiceType, type TaskType } from '../../game/npcBehavior/npcBehavior'
import { addChild, createDecorator, createService, findNode, removeNode, removePoint, renamePoint, updateNode } from '../../game/npcBehavior/npcTreeEdit'

const CAN_WRITE = import.meta.env.DEV
const editor = useNpcBehaviorEditor()
const { tree, treeKey, selection, status } = editor
const tab = ref<'tree' | 'npcs'>('tree')
const creating = ref(false)
const newKey = ref('')
const newName = ref('')
const newPoint = ref('')
const pointError = ref<string | null>(null)

function setTree(next: BehaviorTree): void {
  editor.setTree(next)
}

function select(next: Selection): void {
  selection.value = next
}

function onAddChild(parentId: string, type: CompositeType | TaskType): void {
  if (!tree.value) return
  const { tree: next, id } = addChild(tree.value, parentId, type)
  setTree(next)
  select({ node: id, part: 'node' })
}

function onAddDecorator(nodeId: string, type: DecoratorType): void {
  if (!tree.value) return
  const node = findNode(tree.value.root, nodeId)
  if (!node) return
  setTree(updateNode(tree.value, nodeId, (n) => ({ ...n, decorators: [...n.decorators, createDecorator(type)] })))
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

function pointProblem(key: string, except?: string): string | null {
  if (!KEY_PATTERN.test(key)) return 'Point keys: lowercase letters, digits and _'
  if ((BUILT_IN_POINTS as readonly string[]).includes(key)) return `"${key}" is built in`
  if (key !== except && tree.value?.points.includes(key)) return `"${key}" already exists`
  return null
}

function addPoint(): void {
  const key = newPoint.value.trim()
  if (!tree.value) return
  pointError.value = tree.value.points.length >= MAX_POINTS ? `At most ${MAX_POINTS} points` : pointProblem(key)
  if (pointError.value) return
  editor.syncPoints(treeKey.value, { ...tree.value, points: [...tree.value.points, key] })
  newPoint.value = ''
}

function renamePointKey(from: string, event: Event): void {
  const input = event.target as HTMLInputElement
  const to = input.value.trim()
  if (!tree.value || to === from) return
  pointError.value = pointProblem(to, from)
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
              <span>Numbers give the execution order.</span>
            </div>
          </div>
          <p v-else class="m-0 p-3 text-xs text-mist">No tree yet: click New.</p>
        </section>

        <div class="relative min-w-0 flex-1">
          <NpcTreeGraph
            v-if="tree"
            :tree="tree"
            :selection="selection"
            @select="select"
            @add-child="onAddChild"
            @add-decorator="onAddDecorator"
            @add-service="onAddService"
            @remove="onRemove"
          />
        </div>

        <NpcNodeDetails v-if="tree" class="w-80 shrink-0" :tree="tree" :selection="selection" @update="setTree" @select="select" />
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
