import { computed, ref, shallowRef } from 'vue'
import {
  KEY_PATTERN,
  MAX_TREES,
  NPC_BEHAVIOR_URL,
  freeNpcs,
  parseNpcBehavior,
  type BehaviorTree,
  type BtNode,
  type FreeNpc,
  type NpcAssignment,
  type NpcBehaviorFile,
  type ZoneNpcSource,
} from '../game/npcBehavior/npcBehavior'
import { createNode } from '../game/npcBehavior/npcTreeEdit'
import type { Vec3 } from '../game/mallTemplates/mallTemplate'
import type { WorldManifest } from '../game/world/worldManifest'

const SAVE_URL = '/__editor/npc-behavior'
const ZONE_INDEX_URL = '/assets/zones/index.json'
const WORLD_MANIFEST_URL = '/assets/world.manifest.json'
const ORCHARD_ZONE = 'orchard'
const HISTORY_LIMIT = 100

export type Selection = { node: string; part: 'node' } | { node: string; part: 'decorator' | 'service'; index: number } | null

export interface ZoneNpcs {
  zone: string
  npcs: FreeNpc[]
  /** Every prop of the zone, drawn as dots on the placement map. */
  props: Array<{ id: string; kind: string; position: Vec3 }>
  /** Crops and orchard trees of the zone, the plants Pick Crop can walk to. */
  plants: Vec3[]
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.json()
}

/** State, history and persistence of the admin NPC Interface (docs/NPC_BEHAVIOR.md). */
export function useNpcBehaviorEditor() {
  const file = shallowRef<NpcBehaviorFile>({ version: 1, trees: {}, npcs: [] })
  const saved = ref('')
  const treeKey = ref('')
  const selection = ref<Selection>(null)
  const zones = shallowRef<ZoneNpcs[]>([])
  const status = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const loadError = ref<string | null>(null)
  const undoStack: NpcBehaviorFile[] = []
  const redoStack: NpcBehaviorFile[] = []
  const historySize = ref(0)

  const dirty = computed(() => JSON.stringify(file.value) !== saved.value)
  const tree = computed<BehaviorTree | null>(() => file.value.trees[treeKey.value] ?? null)
  const treeKeys = computed(() => Object.keys(file.value.trees).sort())
  /** What the server would say about the file as it stands; null when valid. */
  const validation = computed(() => {
    try {
      parseNpcBehavior(JSON.parse(JSON.stringify(file.value)))
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  })
  const canUndo = computed(() => historySize.value >= 0 && undoStack.length > 0)
  const canRedo = computed(() => historySize.value >= 0 && redoStack.length > 0)

  function commit(next: NpcBehaviorFile): void {
    undoStack.push(file.value)
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift()
    redoStack.length = 0
    file.value = next
    historySize.value++
  }

  function step(from: NpcBehaviorFile[], to: NpcBehaviorFile[]): void {
    const previous = from.pop()
    if (!previous) return
    to.push(file.value)
    file.value = previous
    if (!file.value.trees[treeKey.value]) treeKey.value = treeKeys.value[0] ?? ''
    selection.value = null
    historySize.value++
  }

  const undo = () => step(undoStack, redoStack)
  const redo = () => step(redoStack, undoStack)

  function setTree(next: BehaviorTree): void {
    commit({ ...file.value, trees: { ...file.value.trees, [treeKey.value]: next } })
  }

  async function load(): Promise<void> {
    try {
      const parsed = parseNpcBehavior(await fetchJson(NPC_BEHAVIOR_URL))
      file.value = parsed
      saved.value = JSON.stringify(parsed)
      treeKey.value = Object.keys(parsed.trees).sort()[0] ?? ''
    } catch (error) {
      loadError.value = `Behavior file: ${error instanceof Error ? error.message : String(error)}`
    }
    try {
      const index = (await fetchJson(ZONE_INDEX_URL)) as { zones: string[] }
      const manifest = (await fetchJson(WORLD_MANIFEST_URL)) as Pick<WorldManifest, 'crops' | 'orchard'>
      const plantsOf = (zone: string): Vec3[] => [
        ...(manifest.crops ?? []).filter((c) => c.zone === zone).map((c) => c.position),
        ...(zone === ORCHARD_ZONE ? (manifest.orchard?.trees ?? []) : []),
      ]
      const loaded = await Promise.all(
        index.zones.map(async (zone) => {
          const json = (await fetchJson(`/assets/zones/${zone}.json`)) as ZoneNpcSource & { parent?: string }
          return { zone, npcs: freeNpcs(json), props: json.props.map(({ id, kind, position }) => ({ id, kind, position })), plants: plantsOf(zone) }
        }),
      )
      zones.value = loaded.filter((z) => z.npcs.length > 0)
    } catch (error) {
      loadError.value = `Zones: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  async function save(): Promise<void> {
    if (validation.value) {
      status.value = { kind: 'error', text: validation.value }
      return
    }
    try {
      const res = await fetch(SAVE_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(file.value) })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? `save answered ${res.status}`)
      saved.value = JSON.stringify(file.value)
      status.value = { kind: 'ok', text: 'Saved. Running games pick it up within 5 seconds.' }
    } catch (error) {
      status.value = { kind: 'error', text: error instanceof Error ? error.message : String(error) }
    }
  }

  function freeKey(base: string): string {
    if (!file.value.trees[base]) return base
    for (let n = 2; ; n++) if (!file.value.trees[`${base}_${n}`]) return `${base}_${n}`
  }

  function addTree(key: string, name: string): string | null {
    if (!KEY_PATTERN.test(key)) return 'Key: lowercase letters, digits and _'
    if (file.value.trees[key]) return `A tree "${key}" already exists`
    if (treeKeys.value.length >= MAX_TREES) return `At most ${MAX_TREES} trees`
    const root = createNode('selector', 'root', createNode('wait', 'wait_1')) as BtNode
    commit({ ...file.value, trees: { ...file.value.trees, [key]: { name: name || key, points: [], root } } })
    treeKey.value = key
    selection.value = { node: 'root', part: 'node' }
    return null
  }

  function duplicateTree(): void {
    if (!tree.value) return
    const key = freeKey(`${treeKey.value}_copy`)
    commit({ ...file.value, trees: { ...file.value.trees, [key]: { ...structuredClone(tree.value), name: `${tree.value.name} copy`.slice(0, 40) } } })
    treeKey.value = key
  }

  function deleteTree(): string | null {
    const users = file.value.npcs.filter((a) => a.tree === treeKey.value)
    if (users.length > 0) return `Still used by ${users.map((a) => `${a.zone}/${a.npc}`).join(', ')}`
    const trees = { ...file.value.trees }
    delete trees[treeKey.value]
    commit({ ...file.value, trees })
    treeKey.value = Object.keys(trees).sort()[0] ?? ''
    selection.value = null
    return null
  }

  function assignmentOf(zone: string, npc: string): NpcAssignment | null {
    return file.value.npcs.find((a) => a.zone === zone && a.npc === npc) ?? null
  }

  /** Gives an NPC a tree (points start on the NPC itself) or takes it away (`key` empty). */
  function assign(zone: string, npc: FreeNpc, key: string): void {
    const others = file.value.npcs.filter((a) => !(a.zone === zone && a.npc === npc.id))
    const def = file.value.trees[key]
    if (!def) return commit({ ...file.value, npcs: others })
    const before = assignmentOf(zone, npc.id)
    const points = Object.fromEntries(def.points.map((p) => [p, before?.points[p] ?? ([...npc.position] as Vec3)]))
    commit({ ...file.value, npcs: [...others, { zone, npc: npc.id, tree: key, points }] })
  }

  function placePoint(zone: string, npc: string, point: string, at: Vec3): void {
    commit({ ...file.value, npcs: file.value.npcs.map((a) => (a.zone === zone && a.npc === npc ? { ...a, points: { ...a.points, [point]: at } } : a)) })
  }

  /** Keeps assignments in step with the tree's point list after a blackboard edit. */
  function syncPoints(key: string, next: BehaviorTree, renamed?: { from: string; to: string }): void {
    const npcs = file.value.npcs.map((a) => {
      if (a.tree !== key) return a
      const old = a.points
      const points = Object.fromEntries(
        next.points.map((p) => {
          const source = renamed && p === renamed.to ? old[renamed.from] : old[p]
          const npc = zones.value.find((z) => z.zone === a.zone)?.npcs.find((n) => n.id === a.npc)
          return [p, source ?? ([...(npc?.position ?? [0, 0, 0])] as Vec3)]
        }),
      )
      return { ...a, points }
    })
    commit({ ...file.value, trees: { ...file.value.trees, [key]: next }, npcs })
  }

  return {
    file,
    tree,
    treeKey,
    treeKeys,
    selection,
    zones,
    status,
    loadError,
    dirty,
    validation,
    canUndo,
    canRedo,
    load,
    save,
    undo,
    redo,
    setTree,
    addTree,
    duplicateTree,
    deleteTree,
    assignmentOf,
    assign,
    placePoint,
    syncPoints,
  }
}
