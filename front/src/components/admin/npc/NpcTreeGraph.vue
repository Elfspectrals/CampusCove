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
  type CompositeType,
  type DecoratorType,
  type ServiceType,
  type TaskType,
} from '../../../game/npcBehavior/npcBehavior'
import { NODE_WIDTH, describeDecorator, describeNode, describeService, layoutTree, type NodeBox } from '../../../game/npcBehavior/npcTreeEdit'
import type { Selection } from '../../../composables/useNpcBehaviorEditor'

const props = defineProps<{ tree: BehaviorTree; selection: Selection }>()
const emit = defineEmits<{
  select: [selection: Selection]
  addChild: [parentId: string, type: CompositeType | TaskType]
  addDecorator: [nodeId: string, type: DecoratorType]
  addService: [nodeId: string, type: ServiceType]
  remove: [selection: Selection]
}>()

const ROOT_TAG_H = 34
const PADDING = 40
const viewport = ref<HTMLElement | null>(null)
const pan = ref({ x: 0, y: 0 })
const zoom = ref(1)
const menu = ref<{ x: number; y: number; nodeId: string } | null>(null)
let drag: { x: number; y: number; panX: number; panY: number; moved: boolean } | null = null

const boxes = computed(() => layoutTree(props.tree.root))
const byId = computed(() => new Map(boxes.value.map((b) => [b.node.id, b])))
const minX = computed(() => Math.min(...boxes.value.map((b) => b.x)))
const size = computed(() => ({
  width: Math.max(...boxes.value.map((b) => b.x)) - minX.value + NODE_WIDTH + PADDING * 2,
  height: Math.max(...boxes.value.map((b) => b.y + b.height)) + ROOT_TAG_H + PADDING * 2,
}))

function left(b: NodeBox): number {
  return b.x - minX.value + PADDING
}

function top(b: NodeBox): number {
  return b.y + ROOT_TAG_H + PADDING
}

const edges = computed(() =>
  boxes.value.flatMap((b) => {
    const parent = b.parentId ? byId.value.get(b.parentId) : undefined
    if (!parent) return []
    const x1 = left(parent) + NODE_WIDTH / 2
    const y1 = top(parent) + parent.height
    const x2 = left(b) + NODE_WIDTH / 2
    const y2 = top(b)
    const mid = (y1 + y2) / 2
    return [{ id: b.node.id, d: `M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`, active: isSelected(b.node.id, 'node') }]
  }),
)

const menuNode = computed(() => (menu.value ? (byId.value.get(menu.value.nodeId)?.node ?? null) : null))

function isSelected(nodeId: string, part: 'node' | 'decorator' | 'service', index = -1): boolean {
  const s = props.selection
  if (!s || s.node !== nodeId || s.part !== part) return false
  return part === 'node' || ('index' in s && s.index === index)
}

function groupClass(type: keyof typeof NODE_SPECS): string {
  return NODE_SPECS[type].group === 'composite' ? 'npc-composite' : 'npc-task'
}

function openMenu(event: MouseEvent, nodeId: string): void {
  const rect = viewport.value!.getBoundingClientRect()
  menu.value = { x: event.clientX - rect.left, y: event.clientY - rect.top, nodeId }
  emit('select', { node: nodeId, part: 'node' })
}

function pick<T>(fn: () => T): void {
  fn()
  menu.value = null
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 && event.button !== 1) return
  if ((event.target as HTMLElement).closest('[data-node]')) return
  menu.value = null
  drag = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y, moved: false }
  viewport.value?.setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return
  const dx = event.clientX - drag.x
  const dy = event.clientY - drag.y
  if (Math.hypot(dx, dy) > 3) drag.moved = true
  pan.value = { x: drag.panX + dx, y: drag.panY + dy }
}

function onPointerUp(): void {
  if (drag && !drag.moved) emit('select', null)
  drag = null
}

function onWheel(event: WheelEvent): void {
  const rect = viewport.value!.getBoundingClientRect()
  const cx = event.clientX - rect.left
  const cy = event.clientY - rect.top
  const next = Math.min(1.6, Math.max(0.3, zoom.value * (event.deltaY < 0 ? 1.1 : 1 / 1.1)))
  const k = next / zoom.value
  pan.value = { x: cx - (cx - pan.value.x) * k, y: cy - (cy - pan.value.y) * k }
  zoom.value = next
}

function fit(): void {
  const el = viewport.value
  if (!el) return
  const z = Math.min(1, Math.max(0.3, Math.min(el.clientWidth / size.value.width, el.clientHeight / size.value.height)))
  zoom.value = z
  pan.value = { x: (el.clientWidth - size.value.width * z) / 2, y: 8 }
}

onMounted(() => void nextTick(fit))
watch(
  () => props.tree,
  (next, previous) => {
    if (!previous || next.name !== previous.name || next.root.id !== previous.root.id) void nextTick(fit)
  },
)
defineExpose({ fit })
</script>

<template>
  <div
    ref="viewport"
    class="npc-graph relative h-full w-full cursor-grab overflow-hidden rounded-2xl"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @wheel.prevent="onWheel"
    @contextmenu.prevent
  >
    <div class="absolute left-0 top-0 origin-top-left" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, width: `${size.width}px`, height: `${size.height}px` }">
      <svg class="pointer-events-none absolute inset-0" :width="size.width" :height="size.height">
        <path v-for="e in edges" :key="e.id" :d="e.d" fill="none" :class="e.active ? 'npc-edge-active' : 'npc-edge'" stroke-width="3" stroke-linejoin="round" />
      </svg>
      <div
        class="npc-root-tag absolute flex items-center justify-center rounded-t-lg text-xs font-extrabold uppercase"
        :style="{ left: `${left(boxes[0]!)}px`, top: `${PADDING}px`, width: `${NODE_WIDTH}px`, height: `${ROOT_TAG_H - 4}px` }"
      >
        Root
      </div>
      <div
        v-for="b in boxes"
        :key="b.node.id"
        data-node
        :class="['npc-node absolute flex cursor-pointer flex-col overflow-hidden rounded-xl text-left', groupClass(b.node.type), isSelected(b.node.id, 'node') ? 'npc-selected' : '']"
        :style="{ left: `${left(b)}px`, top: `${top(b)}px`, width: `${NODE_WIDTH}px`, height: `${b.height}px` }"
        @pointerdown.stop
        @click.stop="emit('select', { node: b.node.id, part: 'node' })"
        @contextmenu.prevent.stop="openMenu($event, b.node.id)"
      >
        <button
          v-for="(d, i) in b.node.decorators"
          :key="`d${i}`"
          type="button"
          :class="['npc-decorator flex h-[26px] shrink-0 items-center gap-1 px-2 text-[11px] font-bold', isSelected(b.node.id, 'decorator', i) ? 'npc-part-selected' : '']"
          :title="NODE_SPECS[d.type].hint"
          @click.stop="emit('select', { node: b.node.id, part: 'decorator', index: i })"
        >
          <UiIcon name="flag" :size="11" />
          <span class="truncate">{{ describeDecorator(d) }}</span>
        </button>
        <div class="npc-header flex h-[58px] shrink-0 flex-col justify-center px-2.5">
          <div class="flex items-center gap-1.5">
            <span class="npc-order rounded px-1 font-mono text-[10px] font-bold">{{ b.order }}</span>
            <span class="truncate text-sm font-extrabold">{{ NODE_SPECS[b.node.type].label }}</span>
            <span v-if="b.node.weight !== undefined" class="ml-auto rounded bg-ink-950/50 px-1 font-mono text-[10px]">w {{ b.node.weight }}</span>
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
            @click.stop="emit('select', { node: b.node.id, part: 'service', index: i })"
          >
            <UiIcon name="eye" :size="11" />
            <span class="truncate">{{ describeService(s) }}</span>
          </button>
        </template>
      </div>
    </div>

    <div class="cc-panel-glass absolute right-2 top-2 flex items-center gap-1 px-2 py-1 text-xs font-bold" @pointerdown.stop>
      <span class="text-mist">Right-click a node to add · drag to pan · wheel to zoom</span>
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost px-2" title="Fit the tree" @click="fit"><UiIcon name="grid" :size="14" /> Fit</button>
    </div>

    <div
      v-if="menu && menuNode"
      class="cc-panel-flat absolute z-10 flex max-h-[70%] w-56 flex-col gap-0.5 overflow-y-auto p-1.5 text-sm"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @pointerdown.stop
    >
      <template v-if="isComposite(menuNode) && menuNode.children.length < MAX_CHILDREN">
        <p class="cc-eyebrow m-0 px-2 pt-1 text-mist">Add composite</p>
        <button v-for="t in COMPOSITE_TYPES" :key="t" type="button" class="npc-menu-item" @click="pick(() => emit('addChild', menuNode!.id, t))">{{ NODE_SPECS[t].label }}</button>
        <p class="cc-eyebrow m-0 px-2 pt-1 text-mist">Add task</p>
        <button v-for="t in TASK_TYPES" :key="t" type="button" class="npc-menu-item" @click="pick(() => emit('addChild', menuNode!.id, t))">{{ NODE_SPECS[t].label }}</button>
      </template>
      <template v-if="menuNode.decorators.length < MAX_DECORATORS">
        <p class="cc-eyebrow m-0 px-2 pt-1 text-mist">Add decorator</p>
        <button v-for="t in DECORATOR_TYPES" :key="t" type="button" class="npc-menu-item" @click="pick(() => emit('addDecorator', menuNode!.id, t))">{{ NODE_SPECS[t].label }}</button>
      </template>
      <template v-if="isComposite(menuNode) && menuNode.services.length < MAX_SERVICES">
        <p class="cc-eyebrow m-0 px-2 pt-1 text-mist">Add service</p>
        <button v-for="t in SERVICE_TYPES" :key="t" type="button" class="npc-menu-item" @click="pick(() => emit('addService', menuNode!.id, t))">{{ NODE_SPECS[t].label }}</button>
      </template>
      <button v-if="menuNode.id !== tree.root.id" type="button" class="npc-menu-item text-red-400" @click="pick(() => emit('remove', { node: menuNode!.id, part: 'node' }))">
        Delete node
      </button>
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
.npc-root-tag {
  background: rgb(255 255 255 / 0.08);
  color: rgb(255 255 255 / 0.6);
}
.npc-node {
  border: 2px solid rgb(255 255 255 / 0.12);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.35);
  color: #f3f1ea;
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
.npc-part-selected {
  outline: 2px solid #ffc850;
  outline-offset: -2px;
}
.npc-menu-item {
  border-radius: 0.5rem;
  padding: 0.3rem 0.5rem;
  text-align: left;
  font-weight: 700;
}
.npc-menu-item:hover {
  background: rgb(255 255 255 / 0.08);
}
</style>
