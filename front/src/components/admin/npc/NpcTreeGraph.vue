<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import UiIcon from '../../ui/UiIcon.vue'
import {
  COMPOSITE_TYPES,
  DECORATOR_TYPES,
  MAX_CHILDREN,
  MAX_DECORATORS,
  MAX_SERVICES,
  NODE_SPECS,
  SERVICE_TYPES,
  TASK_TYPES,
  isComposite,
  type BehaviorTree,
  type BtNode,
  type CompositeType,
  type DecoratorType,
  type ServiceType,
  type TaskType,
} from '../../../game/npcBehavior/npcBehavior'
import {
  NODE_WIDTH,
  describeDecorator,
  describeNode,
  describeService,
  findNode,
  isUnder,
  layoutTree,
  parentOf,
  reparentNode,
  setPositions,
  sortChildren,
  type NodeBox,
} from '../../../game/npcBehavior/npcTreeEdit'
import type { Selection } from '../../../composables/useNpcBehaviorEditor'
import type { NpcDebugView } from '../../../game/npcBehavior/npcDebug'

const props = defineProps<{ tree: BehaviorTree; selection: Selection; problems: ReadonlyMap<string, string>; debug: NpcDebugView | null }>()
const emit = defineEmits<{
  select: [selection: Selection]
  addChild: [parentId: string, type: CompositeType | TaskType, pos?: [number, number]]
  addDecorator: [nodeId: string, type: DecoratorType]
  addService: [nodeId: string, type: ServiceType]
  remove: [selection: Selection]
  update: [tree: BehaviorTree]
  error: [text: string]
}>()

const ROOT_TAG_H = 30
const FIT_MARGIN = 40
const DRAG_THRESHOLD = 3
const PIN = 14
const RESULT_SHOWN_MS = 2500

interface MenuItem {
  group: string
  label: string
  run: () => void
}

type Gesture =
  | { kind: 'pan'; x: number; y: number; panX: number; panY: number; moved: boolean }
  | { kind: 'node'; id: string; ids: string[]; x: number; y: number; moved: boolean }
  | { kind: 'cable-out'; from: string }
  | { kind: 'cable-in'; child: string }

const viewport = ref<HTMLElement | null>(null)
const search = ref<HTMLInputElement | null>(null)
const pan = ref({ x: 0, y: 0 })
const zoom = ref(1)
const menu = ref<{ x: number; y: number; nodeId: string; pos?: [number, number] } | null>(null)
const query = ref('')
const highlighted = ref(0)
const collapsed = ref(new Set<string>())
const dragOffset = ref<{ ids: Set<string>; dx: number; dy: number } | null>(null)
const cursor = ref<[number, number] | null>(null)
const gesture = ref<Gesture | null>(null)

const baseBoxes = computed(() => layoutTree(props.tree.root, collapsed.value))
const boxes = computed<NodeBox[]>(() => {
  const drag = dragOffset.value
  if (!drag) return baseBoxes.value
  const moved = new Set<string>()
  return baseBoxes.value.map((b) => {
    const parentMoved = b.parentId !== null && moved.has(b.parentId) && !b.node.pos
    if (!drag.ids.has(b.node.id) && !parentMoved) return b
    moved.add(b.node.id)
    return { ...b, x: b.x + drag.dx, y: b.y + drag.dy }
  })
})
const byId = computed(() => new Map(boxes.value.map((b) => [b.node.id, b])))
const rootBox = computed(() => boxes.value[0]!)

function top(b: NodeBox): number {
  return b.y + ROOT_TAG_H
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dy = Math.max(30, Math.abs(y2 - y1) / 2)
  return `M ${x1} ${y1} C ${x1} ${y1 + dy} ${x2} ${y2 - dy} ${x2} ${y2}`
}

const edges = computed(() =>
  boxes.value.flatMap((b) => {
    const parent = b.parentId ? byId.value.get(b.parentId) : undefined
    if (!parent) return []
    const d = curve(parent.x + NODE_WIDTH / 2, top(parent) + parent.height, b.x + NODE_WIDTH / 2, top(b))
    const state = isActive(b.node.id) ? 'npc-edge-running' : isSelected(b.node.id, 'node') ? 'npc-edge-active' : 'npc-edge'
    return [{ id: b.node.id, d, state }]
  }),
)

const pendingCable = computed(() => {
  const g = gesture.value
  const at = cursor.value
  if (!at || !g) return null
  if (g.kind === 'cable-out') {
    const from = byId.value.get(g.from)
    return from ? curve(from.x + NODE_WIDTH / 2, top(from) + from.height, at[0], at[1]) : null
  }
  if (g.kind === 'cable-in') {
    const child = byId.value.get(g.child)
    return child ? curve(at[0], at[1], child.x + NODE_WIDTH / 2, top(child)) : null
  }
  return null
})

const menuNode = computed(() => (menu.value ? findNode(props.tree.root, menu.value.nodeId) : null))

const menuItems = computed<MenuItem[]>(() => {
  const node = menuNode.value
  const at = menu.value
  if (!node || !at) return []
  const items: MenuItem[] = []
  if (isComposite(node) && node.children.length < MAX_CHILDREN) {
    for (const t of COMPOSITE_TYPES) items.push({ group: 'Composite', label: NODE_SPECS[t].label, run: () => emit('addChild', node.id, t, at.pos) })
    for (const t of TASK_TYPES) items.push({ group: 'Task', label: NODE_SPECS[t].label, run: () => emit('addChild', node.id, t, at.pos) })
  }
  if (!at.pos && node.decorators.length < MAX_DECORATORS) {
    for (const t of DECORATOR_TYPES) items.push({ group: 'Decorator', label: NODE_SPECS[t].label, run: () => emit('addDecorator', node.id, t) })
  }
  if (!at.pos && isComposite(node) && node.services.length < MAX_SERVICES) {
    for (const t of SERVICE_TYPES) items.push({ group: 'Service', label: NODE_SPECS[t].label, run: () => emit('addService', node.id, t) })
  }
  if (!at.pos && node.id !== props.tree.root.id) items.push({ group: 'Node', label: 'Delete node', run: () => emit('remove', { node: node.id, part: 'node' }) })
  const q = query.value.trim().toLowerCase()
  return q ? items.filter((i) => `${i.group} ${i.label}`.toLowerCase().includes(q)) : items
})

watch(menuItems, () => {
  highlighted.value = 0
})

function isSelected(nodeId: string, part: 'node' | 'decorator' | 'service', index = -1): boolean {
  const s = props.selection
  if (!s || s.node !== nodeId || s.part !== part) return false
  return part === 'node' || ('index' in s && s.index === index)
}

function isActive(nodeId: string): boolean {
  return props.debug?.active.has(nodeId) ?? false
}

function recentResult(nodeId: string): 'success' | 'failure' | null {
  const result = props.debug?.results.get(nodeId)
  if (!result || isActive(nodeId) || props.debug!.now - result.at > RESULT_SHOWN_MS) return null
  return result.status
}

function groupClass(type: keyof typeof NODE_SPECS): string {
  return NODE_SPECS[type].group === 'composite' ? 'npc-composite' : 'npc-task'
}

function local(event: { clientX: number; clientY: number }): [number, number] {
  const rect = viewport.value!.getBoundingClientRect()
  return [event.clientX - rect.left, event.clientY - rect.top]
}

function toWorld(event: { clientX: number; clientY: number }): [number, number] {
  const [x, y] = local(event)
  return [(x - pan.value.x) / zoom.value, (y - pan.value.y) / zoom.value]
}

function openMenu(at: [number, number], nodeId: string, pos?: [number, number]): void {
  menu.value = { x: at[0], y: at[1], nodeId, pos }
  query.value = ''
  highlighted.value = 0
  void nextTick(() => search.value?.focus())
}

function closeMenu(): void {
  menu.value = null
  viewport.value?.focus()
}

function onContextMenu(event: MouseEvent, nodeId: string): void {
  openMenu(local(event), nodeId)
  emit('select', { node: nodeId, part: 'node' })
}

function openPalette(): void {
  const id = props.selection?.node ?? props.tree.root.id
  const b = byId.value.get(id)
  if (!b) return
  openMenu([pan.value.x + (b.x + NODE_WIDTH) * zoom.value + 8, pan.value.y + top(b) * zoom.value], id)
}

function runItem(item: MenuItem | undefined): void {
  if (!item) return
  item.run()
  closeMenu()
}

function onMenuKey(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const n = menuItems.value.length
    if (n > 0) highlighted.value = (highlighted.value + (event.key === 'ArrowDown' ? 1 : n - 1)) % n
  } else if (event.key === 'Enter') {
    event.preventDefault()
    runItem(menuItems.value[highlighted.value])
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
  }
}

function capture(event: PointerEvent): void {
  viewport.value?.setPointerCapture(event.pointerId)
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) return
  menu.value = null
  gesture.value = { kind: 'pan', x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y, moved: false }
  capture(event)
}

function subtreeIds(id: string): string[] {
  return boxes.value.filter((b) => isUnder(props.tree.root, id, b.node.id)).map((b) => b.node.id)
}

function onNodeDown(event: PointerEvent, id: string): void {
  if (event.button !== 0) return
  menu.value = null
  gesture.value = { kind: 'node', id, ids: event.shiftKey ? subtreeIds(id) : [id], x: event.clientX, y: event.clientY, moved: false }
  capture(event)
}

function onPinDown(event: PointerEvent, kind: 'cable-out' | 'cable-in', id: string): void {
  if (event.button !== 0) return
  menu.value = null
  gesture.value = kind === 'cable-out' ? { kind, from: id } : { kind, child: id }
  cursor.value = toWorld(event)
  capture(event)
}

function onPointerMove(event: PointerEvent): void {
  const g = gesture.value
  if (!g) return
  if (g.kind === 'pan') {
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) g.moved = true
    pan.value = { x: g.panX + dx, y: g.panY + dy }
  } else if (g.kind === 'node') {
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (!g.moved && Math.hypot(dx, dy) <= DRAG_THRESHOLD) return
    g.moved = true
    dragOffset.value = { ids: new Set(g.ids), dx: dx / zoom.value, dy: dy / zoom.value }
  } else {
    cursor.value = toWorld(event)
  }
}

function nodeAt(event: PointerEvent): string | null {
  const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]')
  return hit?.dataset.nodeId ?? null
}

function placedTree(tree: BehaviorTree): BehaviorTree {
  const positions = new Map(boxes.value.map((b) => [b.node.id, [Math.round(b.x), Math.round(b.y)] as [number, number]]))
  const drag = dragOffset.value
  for (const b of drag ? boxes.value.filter((x) => x.hidden > 0 && drag.ids.has(x.node.id)) : []) {
    const visit = (n: BtNode): void => {
      if (n !== b.node && n.pos) positions.set(n.id, [Math.round(n.pos[0] + drag!.dx), Math.round(n.pos[1] + drag!.dy)])
      if (isComposite(n)) n.children.forEach(visit)
    }
    visit(b.node)
  }
  return setPositions(tree, positions)
}

function xOf(id: string): number {
  return byId.value.get(id)?.x ?? Number.POSITIVE_INFINITY
}

function finishNodeDrag(g: Extract<Gesture, { kind: 'node' }>): void {
  if (!g.moved) {
    emit('select', { node: g.id, part: 'node' })
    return
  }
  let next = placedTree(props.tree)
  const parent = parentOf(next.root, g.id)
  if (parent) next = sortChildren(next, parent.id, xOf)
  dragOffset.value = null
  emit('update', next)
}

function connect(child: string, parentId: string): void {
  const moved = reparentNode(placedTree(props.tree), child, parentId)
  if ('error' in moved) return emit('error', moved.error)
  emit('update', sortChildren(moved.tree, parentId, xOf))
  emit('select', { node: child, part: 'node' })
}

function finishCable(g: Extract<Gesture, { kind: 'cable-out' | 'cable-in' }>, event: PointerEvent): void {
  const target = nodeAt(event)
  if (g.kind === 'cable-out') {
    if (target && target !== g.from) connect(target, g.from)
    else if (!target) {
      const [wx, wy] = toWorld(event)
      openMenu(local(event), g.from, [Math.round(wx - NODE_WIDTH / 2), Math.round(wy - ROOT_TAG_H)])
    }
    return
  }
  if (target && target !== g.child) connect(g.child, target)
}

function onPointerUp(event: PointerEvent): void {
  const g = gesture.value
  gesture.value = null
  cursor.value = null
  if (!g) return
  if (g.kind === 'pan') {
    if (!g.moved) emit('select', null)
  } else if (g.kind === 'node') finishNodeDrag(g)
  else finishCable(g, event)
  dragOffset.value = null
}

function toggleCollapse(id: string): void {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

function onWheel(event: WheelEvent): void {
  const [cx, cy] = local(event)
  const next = Math.min(1.6, Math.max(0.3, zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
  const k = next / zoom.value
  pan.value = { x: cx - (cx - pan.value.x) * k, y: cy - (cy - pan.value.y) * k }
  zoom.value = next
}

function fit(): void {
  const el = viewport.value
  if (!el || boxes.value.length === 0) return
  const minX = Math.min(...boxes.value.map((b) => b.x)) - FIT_MARGIN
  const minY = Math.min(...boxes.value.map((b) => b.y)) - FIT_MARGIN
  const maxX = Math.max(...boxes.value.map((b) => b.x + NODE_WIDTH)) + FIT_MARGIN
  const maxY = Math.max(...boxes.value.map((b) => top(b) + b.height)) + FIT_MARGIN
  const z = Math.min(1, Math.max(0.3, Math.min(el.clientWidth / (maxX - minX), el.clientHeight / (maxY - minY))))
  zoom.value = z
  pan.value = { x: (el.clientWidth - (maxX - minX) * z) / 2 - minX * z, y: 8 - minY * z }
}

onMounted(() => void nextTick(fit))
watch(
  () => props.tree,
  (next, previous) => {
    if (previous && next.name === previous.name && next.root.id === previous.root.id) return
    collapsed.value = new Set()
    void nextTick(fit)
  },
)
defineExpose({ fit, openPalette })
</script>

<template>
  <div
    ref="viewport"
    tabindex="0"
    class="npc-graph relative h-full w-full cursor-grab overflow-hidden rounded-2xl outline-none"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <div class="absolute left-0 top-0 origin-top-left" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }">
      <svg class="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1">
        <path v-for="e in edges" :key="e.id" :d="e.d" fill="none" :class="e.state" stroke-width="3" stroke-linecap="round" />
        <path v-if="pendingCable" :d="pendingCable" fill="none" class="npc-edge-pending" stroke-width="3" stroke-dasharray="6 5" stroke-linecap="round" />
      </svg>
      <div
        class="npc-root-tag absolute flex items-center justify-center rounded-t-lg text-xs font-extrabold uppercase"
        :style="{ left: `${rootBox.x}px`, top: `${rootBox.y}px`, width: `${NODE_WIDTH}px`, height: `${ROOT_TAG_H - 4}px` }"
      >
        Root
      </div>
      <div
        v-for="b in boxes"
        :key="b.node.id"
        :data-node-id="b.node.id"
        :class="[
          'npc-node absolute flex cursor-pointer flex-col rounded-xl text-left',
          groupClass(b.node.type),
          isSelected(b.node.id, 'node') ? 'npc-selected' : '',
          problems.has(b.node.id) ? 'npc-invalid' : '',
          isActive(b.node.id) ? 'npc-running' : '',
        ]"
        :style="{ left: `${b.x}px`, top: `${top(b)}px`, width: `${NODE_WIDTH}px`, height: `${b.height}px` }"
        @pointerdown.stop="onNodeDown($event, b.node.id)"
        @contextmenu.prevent.stop="onContextMenu($event, b.node.id)"
      >
        <span
          v-if="b.parentId"
          class="npc-pin npc-pin-in absolute left-1/2 cursor-crosshair rounded-full"
          :style="{ width: `${PIN}px`, height: `${PIN}px`, top: `${-PIN / 2}px`, marginLeft: `${-PIN / 2}px` }"
          title="Drag onto a composite to move this node under it"
          @pointerdown.stop="onPinDown($event, 'cable-in', b.node.id)"
        />
        <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px]">
          <button
            v-for="(d, i) in b.node.decorators"
            :key="`d${i}`"
            type="button"
            :class="['npc-decorator flex h-[26px] shrink-0 items-center gap-1 px-2 text-[11px] font-bold', isSelected(b.node.id, 'decorator', i) ? 'npc-part-selected' : '']"
            :title="NODE_SPECS[d.type].hint"
            @pointerdown.stop
            @click.stop="emit('select', { node: b.node.id, part: 'decorator', index: i })"
          >
            <UiIcon name="flag" :size="11" />
            <span class="truncate">{{ describeDecorator(d) }}</span>
          </button>
          <div class="npc-header flex h-[58px] shrink-0 flex-col justify-center px-2.5">
            <div class="flex items-center gap-1.5">
              <span class="npc-order rounded px-1 font-mono text-[10px] font-bold">{{ b.order }}</span>
              <span class="truncate text-sm font-extrabold">{{ NODE_SPECS[b.node.type].label }}</span>
              <span v-if="b.node.weight !== undefined" class="rounded bg-ink-950/50 px-1 font-mono text-[10px]">w {{ b.node.weight }}</span>
              <span v-if="recentResult(b.node.id)" :class="['ml-auto rounded px-1 text-[10px] font-extrabold', recentResult(b.node.id) === 'success' ? 'npc-ok' : 'npc-ko']">
                {{ recentResult(b.node.id) === 'success' ? '✓' : '✗' }}
              </span>
              <span v-if="problems.has(b.node.id)" class="npc-alert ml-auto rounded px-1 text-[10px] font-extrabold" :title="problems.get(b.node.id)">!</span>
            </div>
            <div class="flex items-center gap-1 text-[11px] opacity-80">
              <span class="font-mono">{{ b.node.id }}</span>
              <span class="truncate">· {{ describeNode(b.node) }}</span>
            </div>
          </div>
          <template v-if="isComposite(b.node)">
            <button
              v-for="(s, i) in b.node.services"
              :key="`s${i}`"
              type="button"
              :class="['npc-service flex h-[24px] shrink-0 items-center gap-1 px-2 text-[11px] font-bold', isSelected(b.node.id, 'service', i) ? 'npc-part-selected' : '']"
              :title="NODE_SPECS[s.type].hint"
              @pointerdown.stop
              @click.stop="emit('select', { node: b.node.id, part: 'service', index: i })"
            >
              <UiIcon name="eye" :size="11" />
              <span class="truncate">{{ describeService(s) }}</span>
            </button>
          </template>
        </div>
        <template v-if="isComposite(b.node)">
          <span
            v-if="!b.hidden"
            class="npc-pin npc-pin-out absolute left-1/2 cursor-crosshair rounded-full"
            :style="{ width: `${PIN}px`, height: `${PIN}px`, bottom: `${-PIN / 2}px`, marginLeft: `${-PIN / 2}px` }"
            title="Drag to a node to make it a child, or to an empty spot to add one"
            @pointerdown.stop="onPinDown($event, 'cable-out', b.node.id)"
          />
          <button
            type="button"
            class="npc-fold absolute right-1.5 flex items-center gap-0.5 rounded px-1 text-[10px] font-extrabold"
            :style="{ bottom: `${-PIN / 2 - 2}px` }"
            :title="b.hidden ? 'Expand' : 'Collapse'"
            @pointerdown.stop
            @click.stop="toggleCollapse(b.node.id)"
          >
            <UiIcon :name="b.hidden ? 'chevron-right' : 'chevron-down'" :size="10" />
            <span v-if="b.hidden">+{{ b.hidden }}</span>
          </button>
        </template>
      </div>
    </div>

    <div class="cc-panel-glass absolute right-2 top-2 flex items-center gap-1 px-2 py-1 text-xs font-bold" @pointerdown.stop>
      <span class="text-mist">Drag cards (Shift: with children) · drag pins to link · Space: add · right-click: menu</span>
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" title="Fit the tree" @click="fit"><UiIcon name="grid" :size="14" /> Fit</button>
    </div>

    <div
      v-if="menu && menuNode"
      class="cc-panel-flat absolute z-10 flex max-h-[70%] w-60 flex-col gap-0.5 p-1.5 text-sm"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @pointerdown.stop
    >
      <input ref="search" v-model="query" class="cc-input mb-1 py-1 text-sm" :placeholder="menu.pos ? `Add under ${menuNode.id}…` : 'Search…'" @keydown.stop="onMenuKey" />
      <div class="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        <template v-for="(item, i) in menuItems" :key="`${item.group}-${item.label}`">
          <p v-if="i === 0 || menuItems[i - 1]!.group !== item.group" class="cc-eyebrow m-0 px-2 pt-1 text-mist">{{ item.group }}</p>
          <button
            type="button"
            :class="['npc-menu-item', i === highlighted ? 'npc-menu-item-on' : '', item.label === 'Delete node' ? 'text-red-400' : '']"
            @mouseenter="highlighted = i"
            @click="runItem(item)"
          >
            {{ item.label }}
          </button>
        </template>
        <p v-if="menuItems.length === 0" class="m-0 px-2 py-1 text-xs text-mist">Nothing matches.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.npc-graph {
  background-color: rgb(var(--cc-ink-950));
  background-image:
    linear-gradient(rgb(255 255 255 / 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.04) 1px, transparent 1px);
  background-size: 24px 24px;
}
.npc-graph:active {
  cursor: grabbing;
}
.npc-edge {
  stroke: rgb(255 255 255 / 0.28);
}
.npc-edge-active {
  stroke: rgb(var(--cc-sun));
}
.npc-edge-running {
  stroke: #5ee0a0;
}
.npc-edge-pending {
  stroke: rgb(var(--cc-sun));
}
.npc-root-tag {
  background: rgb(255 255 255 / 0.08);
  color: rgb(255 255 255 / 0.6);
}
.npc-node {
  border: 2px solid rgb(255 255 255 / 0.12);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
  color: #f3f1ea;
  touch-action: none;
}
.npc-composite .npc-header {
  background: #3a3f4b;
}
.npc-task .npc-header {
  background: #5b3f8c;
}
.npc-decorator {
  background: #2e5f9e;
  border-bottom: 1px solid rgb(0 0 0 / 0.25);
}
.npc-service {
  background: #2f7a64;
  border-top: 1px solid rgb(0 0 0 / 0.25);
}
.npc-order {
  background: rgb(0 0 0 / 0.35);
}
.npc-selected {
  border-color: #ffc850;
  box-shadow: 0 0 0 2px rgb(255 200 80 / 0.35), 0 6px 18px rgb(0 0 0 / 0.35);
}
.npc-invalid {
  border-color: #f06a6a;
}
.npc-running {
  border-color: #5ee0a0;
  box-shadow: 0 0 0 3px rgb(94 224 160 / 0.35), 0 6px 18px rgb(0 0 0 / 0.35);
}
.npc-alert {
  background: #f06a6a;
  color: #1a1a1a;
}
.npc-ok {
  background: #5ee0a0;
  color: #1a1a1a;
}
.npc-ko {
  background: #f06a6a;
  color: #1a1a1a;
}
.npc-part-selected {
  outline: 2px solid #ffc850;
  outline-offset: -2px;
}
.npc-pin {
  background: #20232b;
  border: 2px solid rgb(255 255 255 / 0.55);
  z-index: 1;
}
.npc-pin:hover {
  border-color: #ffc850;
  background: #ffc850;
}
.npc-fold {
  background: #20232b;
  border: 1px solid rgb(255 255 255 / 0.3);
  z-index: 1;
}
.npc-menu-item {
  border-radius: 0.5rem;
  padding: 0.3rem 0.5rem;
  text-align: left;
  font-weight: 700;
}
.npc-menu-item-on {
  background: rgb(255 255 255 / 0.1);
}
</style>
