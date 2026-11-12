/**
 * NPC behavior trees (contract: docs/NPC_BEHAVIOR.md). The socket runs them (socket/src/npcBehavior.ts validates
 * the same file); this module validates what the admin editor saves and describes every node for its forms.
 */
import { TemplateError, type Vec3 } from '../mallTemplates/mallTemplate.ts'

export const NPC_BEHAVIOR_URL = '/assets/npc/behavior.json'
export const KEY_PATTERN = /^[a-z0-9_]+$/
export const BUILT_IN_POINTS = ['home', 'target'] as const
export const MAX_TREES = 40
export const MAX_POINTS = 16
const MAX_NODES = 200
const MAX_DEPTH = 12
export const MAX_CHILDREN = 12
export const MAX_DECORATORS = 6
export const MAX_SERVICES = 3
const MAX_ASSIGNMENTS = 64
export const MAX_POINT_DISTANCE = 60
const MAX_NAME = 40

export const COMPOSITE_TYPES = ['selector', 'sequence', 'random'] as const
export const TASK_TYPES = ['move_to', 'wander', 'pick_crop', 'browse_shelf', 'checkout', 'wait', 'face', 'animate', 'say'] as const
export const DECORATOR_TYPES = ['has_target', 'time_of_day', 'chance', 'cooldown', 'loop'] as const
export const SERVICE_TYPES = ['perceive_players'] as const
const ABORTS = ['none', 'self', 'lower', 'both'] as const
const SPEEDS = ['walk', 'run'] as const
const CLIPS = ['idle', 'sit', 'pick', 'eat', 'drink', 'browse', 'take', 'pay'] as const
/** What Pick Crop looks for: a crop of the farm fields, an orchard tree, or any of them. */
const CROP_KINDS = ['any', 'corn', 'potato', 'cabbage', 'pumpkin', 'apple_tree'] as const
const MAX_PICK_RADIUS = 60

export type CompositeType = (typeof COMPOSITE_TYPES)[number]
export type TaskType = (typeof TASK_TYPES)[number]
export type DecoratorType = (typeof DECORATOR_TYPES)[number]
export type ServiceType = (typeof SERVICE_TYPES)[number]
export type Abort = (typeof ABORTS)[number]
type MoveSpeed = (typeof SPEEDS)[number]
export type NpcClip = (typeof CLIPS)[number]
type CropKind = (typeof CROP_KINDS)[number]

export type Decorator =
  | { type: 'has_target'; invert: boolean; abort: Abort }
  | { type: 'time_of_day'; from: number; to: number; invert: boolean; abort: Abort }
  | { type: 'chance'; percent: number }
  | { type: 'cooldown'; seconds: number }
  | { type: 'loop'; count: number }

export type Service = { type: 'perceive_players'; radius: number; interval: number }

interface NodeBase {
  id: string
  decorators: Decorator[]
  /** Only under a `random` composite. */
  weight?: number
}

export interface CompositeNode extends NodeBase {
  type: CompositeType
  services: Service[]
  children: BtNode[]
}

type TaskNode = NodeBase &
  (
    | { type: 'move_to'; point: string; speed: MoveSpeed }
    | { type: 'wander'; radius: number; speed: MoveSpeed }
    | { type: 'pick_crop'; crop: CropKind; radius: number; speed: MoveSpeed }
    | { type: 'browse_shelf'; radius: number; seconds: number; take: number }
    | { type: 'checkout' }
    | { type: 'wait'; min: number; max: number }
    | { type: 'face'; point: string }
    | { type: 'animate'; clip: NpcClip; seconds: number }
    | { type: 'say'; lines: string[]; seconds: number }
  )

export type BtNode = CompositeNode | TaskNode

export interface BehaviorTree {
  name: string
  points: string[]
  root: BtNode
}

export interface NpcAssignment {
  zone: string
  npc: string
  tree: string
  points: Record<string, Vec3>
}

export interface NpcBehaviorFile {
  version: 1
  trees: Record<string, BehaviorTree>
  npcs: NpcAssignment[]
}

export type FieldSpec =
  | { key: string; label: string; kind: 'number'; min: number; max: number; integer?: true; step: number }
  | { key: string; label: string; kind: 'choice'; options: readonly string[] }
  | { key: string; label: string; kind: 'bool' }
  | { key: string; label: string; kind: 'point' }
  | { key: string; label: string; kind: 'lines'; maxLines: number; maxLength: number }

type NodeGroup = 'composite' | 'task' | 'decorator' | 'service'

export interface NodeSpec {
  type: CompositeType | TaskType | DecoratorType | ServiceType
  label: string
  group: NodeGroup
  hint: string
  fields: readonly FieldSpec[]
  defaults: Record<string, unknown>
}

const ABORT_FIELD: FieldSpec = { key: 'abort', label: 'Observer aborts', kind: 'choice', options: ABORTS }
const INVERT_FIELD: FieldSpec = { key: 'invert', label: 'Inverse condition', kind: 'bool' }
const SPEED_FIELD: FieldSpec = { key: 'speed', label: 'Speed', kind: 'choice', options: SPEEDS }
const POINT_FIELD: FieldSpec = { key: 'point', label: 'Point', kind: 'point' }

/** Every node type, its parameters and their ranges: drives validation and the editor's Details panel. */
export const NODE_SPECS: Record<NodeSpec['type'], NodeSpec> = {
  selector: { type: 'selector', label: 'Selector', group: 'composite', hint: 'Runs children left to right until one succeeds.', fields: [], defaults: {} },
  sequence: { type: 'sequence', label: 'Sequence', group: 'composite', hint: 'Runs children left to right until one fails.', fields: [], defaults: {} },
  random: { type: 'random', label: 'Random', group: 'composite', hint: 'Picks one child by weight and returns its result.', fields: [], defaults: {} },
  move_to: { type: 'move_to', label: 'Move To', group: 'task', hint: 'Walks or runs in a straight line to a point.', fields: [POINT_FIELD, SPEED_FIELD], defaults: { point: 'home', speed: 'walk' } },
  wander: {
    type: 'wander',
    label: 'Wander',
    group: 'task',
    hint: 'Goes to a random spot around home.',
    fields: [{ key: 'radius', label: 'Radius (m)', kind: 'number', min: 1, max: 30, step: 0.5 }, SPEED_FIELD],
    defaults: { radius: 5, speed: 'walk' },
  },
  pick_crop: {
    type: 'pick_crop',
    label: 'Pick Crop',
    group: 'task',
    hint: 'Walks to a random plant around home and picks it (just the animation, nothing is harvested).',
    fields: [
      { key: 'crop', label: 'Plant', kind: 'choice', options: CROP_KINDS },
      { key: 'radius', label: 'Search radius from home (m)', kind: 'number', min: 1, max: MAX_PICK_RADIUS, step: 1 },
      SPEED_FIELD,
    ],
    defaults: { crop: 'any', radius: 30, speed: 'walk' },
  },
  browse_shelf: {
    type: 'browse_shelf',
    label: 'Browse Shelf',
    group: 'task',
    hint: 'In a shop zone: walks to a random shelf slot with goods, looks at it, then may take an item into its hand (nothing leaves the stock).',
    fields: [
      { key: 'radius', label: 'Search radius from home (m)', kind: 'number', min: 1, max: MAX_PICK_RADIUS, step: 1 },
      { key: 'seconds', label: 'Looking time (s)', kind: 'number', min: 2, max: 30, step: 0.5 },
      { key: 'take', label: 'Takes an item (%)', kind: 'number', min: 0, max: 100, integer: true, step: 5 },
    ],
    defaults: { radius: 30, seconds: 5, take: 60 },
  },
  checkout: {
    type: 'checkout',
    label: 'Checkout',
    group: 'task',
    hint: 'Queues at the clerk of the shop zone and pays for what is in hand (fake buying). Fails with empty hands.',
    fields: [],
    defaults: {},
  },
  wait: {
    type: 'wait',
    label: 'Wait',
    group: 'task',
    hint: 'Waits a random time between min and max.',
    fields: [
      { key: 'min', label: 'Min (s)', kind: 'number', min: 0, max: 600, step: 0.5 },
      { key: 'max', label: 'Max (s)', kind: 'number', min: 0, max: 600, step: 0.5 },
    ],
    defaults: { min: 2, max: 5 },
  },
  face: { type: 'face', label: 'Face', group: 'task', hint: 'Turns towards a point or the target.', fields: [POINT_FIELD], defaults: { point: 'target' } },
  animate: {
    type: 'animate',
    label: 'Play Animation',
    group: 'task',
    hint: 'Plays a clip for a while (sit and idle are held).',
    fields: [
      { key: 'clip', label: 'Clip', kind: 'choice', options: CLIPS },
      { key: 'seconds', label: 'Duration (s)', kind: 'number', min: 0.5, max: 600, step: 0.5 },
    ],
    defaults: { clip: 'sit', seconds: 10 },
  },
  say: {
    type: 'say',
    label: 'Say',
    group: 'task',
    hint: 'Shows one of the lines in a bubble over the head.',
    fields: [
      { key: 'lines', label: 'Lines (one is picked)', kind: 'lines', maxLines: 10, maxLength: 120 },
      { key: 'seconds', label: 'Duration (s)', kind: 'number', min: 1, max: 6, step: 0.5 },
    ],
    defaults: { lines: ['Hello!'], seconds: 4 },
  },
  has_target: { type: 'has_target', label: 'Has Target', group: 'decorator', hint: 'Passes when a player is perceived.', fields: [INVERT_FIELD, ABORT_FIELD], defaults: { invert: false, abort: 'none' } },
  time_of_day: {
    type: 'time_of_day',
    label: 'Time of Day',
    group: 'decorator',
    hint: 'Passes between two hours (Paris time).',
    fields: [
      { key: 'from', label: 'From (h)', kind: 'number', min: 0, max: 23, integer: true, step: 1 },
      { key: 'to', label: 'To (h)', kind: 'number', min: 0, max: 23, integer: true, step: 1 },
      INVERT_FIELD,
      ABORT_FIELD,
    ],
    defaults: { from: 8, to: 20, invert: false, abort: 'none' },
  },
  chance: {
    type: 'chance',
    label: 'Chance',
    group: 'decorator',
    hint: 'Rolled once when the node starts.',
    fields: [{ key: 'percent', label: 'Percent', kind: 'number', min: 1, max: 99, integer: true, step: 1 }],
    defaults: { percent: 50 },
  },
  cooldown: {
    type: 'cooldown',
    label: 'Cooldown',
    group: 'decorator',
    hint: 'Fails for a while after the node last finished.',
    fields: [{ key: 'seconds', label: 'Seconds', kind: 'number', min: 1, max: 3600, step: 1 }],
    defaults: { seconds: 30 },
  },
  loop: {
    type: 'loop',
    label: 'Loop',
    group: 'decorator',
    hint: 'Runs the node again while it succeeds (0 = forever).',
    fields: [{ key: 'count', label: 'Count', kind: 'number', min: 0, max: 100, integer: true, step: 1 }],
    defaults: { count: 3 },
  },
  perceive_players: {
    type: 'perceive_players',
    label: 'Perceive Players',
    group: 'service',
    hint: 'Sets target to the nearest player in range.',
    fields: [
      { key: 'radius', label: 'Radius (m)', kind: 'number', min: 1, max: 30, step: 0.5 },
      { key: 'interval', label: 'Interval (s)', kind: 'number', min: 0.25, max: 5, step: 0.25 },
    ],
    defaults: { radius: 6, interval: 0.5 },
  },
}

export function isComposite(node: BtNode): node is CompositeNode {
  return (COMPOSITE_TYPES as readonly string[]).includes(node.type)
}

export function isCondition(decorator: Decorator): decorator is Extract<Decorator, { abort: Abort }> {
  return decorator.type === 'has_target' || decorator.type === 'time_of_day'
}

// ------------------------------------------------------------------ parsing

type Json = Record<string, unknown>

function objectAt(value: unknown, path: string, allowed: readonly string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TemplateError(path, 'expected an object')
  const unknownKey = Object.keys(value).find((k) => !allowed.includes(k))
  if (unknownKey) throw new TemplateError(`${path}.${unknownKey}`, `unknown field, expected one of ${allowed.join(', ')}`)
  return value as Json
}

function arrayAt(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value)) throw new TemplateError(path, 'expected an array')
  if (value.length < min || value.length > max) throw new TemplateError(path, `expected ${min} to ${max} entries`)
  return value
}

function keyAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) throw new TemplateError(path, `expected a key matching ${KEY_PATTERN}`)
  return value
}

function fieldAt(spec: FieldSpec, value: unknown, path: string, points: readonly string[]): unknown {
  switch (spec.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < spec.min || value > spec.max) throw new TemplateError(path, `expected a number from ${spec.min} to ${spec.max}`)
      if (spec.integer && !Number.isInteger(value)) throw new TemplateError(path, 'expected a whole number')
      return value
    }
    case 'choice':
      if (typeof value !== 'string' || !spec.options.includes(value)) throw new TemplateError(path, `expected one of ${spec.options.join(', ')}`)
      return value
    case 'bool':
      if (typeof value !== 'boolean') throw new TemplateError(path, 'expected true or false')
      return value
    case 'point':
      if (typeof value !== 'string' || !([...BUILT_IN_POINTS, ...points] as string[]).includes(value)) throw new TemplateError(path, `expected home, target or a point of the tree (${points.join(', ') || 'none'})`)
      return value
    case 'lines':
      return arrayAt(value, path, spec.maxLines, 1).map((line, i) => {
        if (typeof line !== 'string' || line.trim() === '' || line.length > spec.maxLength) throw new TemplateError(`${path}[${i}]`, `expected a text of 1 to ${spec.maxLength} characters`)
        return line
      })
  }
}

function paramsAt(spec: NodeSpec, json: Json, path: string, points: readonly string[]): Json {
  return Object.fromEntries(spec.fields.map((f) => [f.key, fieldAt(f, json[f.key], `${path}.${f.key}`, points)]))
}

function decoratorAt(raw: unknown, path: string, parent: CompositeType | null): Decorator {
  const type = (raw as Json | null)?.type
  if (typeof type !== 'string' || !(DECORATOR_TYPES as readonly string[]).includes(type)) throw new TemplateError(`${path}.type`, `expected one of ${DECORATOR_TYPES.join(', ')}`)
  const spec = NODE_SPECS[type as DecoratorType]
  const json = objectAt(raw, path, ['type', ...spec.fields.map((f) => f.key)])
  const decorator = { type, ...paramsAt(spec, json, path, []) } as Decorator
  if (decorator.type === 'time_of_day' && decorator.from === decorator.to) throw new TemplateError(`${path}.to`, 'from and to must differ')
  if (isCondition(decorator) && (decorator.abort === 'lower' || decorator.abort === 'both') && parent !== 'selector') {
    throw new TemplateError(`${path}.abort`, 'lower priority aborts only work on a child of a selector')
  }
  return decorator
}

function serviceAt(raw: unknown, path: string): Service {
  const type = (raw as Json | null)?.type
  if (typeof type !== 'string' || !(SERVICE_TYPES as readonly string[]).includes(type)) throw new TemplateError(`${path}.type`, `expected one of ${SERVICE_TYPES.join(', ')}`)
  const spec = NODE_SPECS[type as ServiceType]
  return { type, ...paramsAt(spec, objectAt(raw, path, ['type', ...spec.fields.map((f) => f.key)]), path, []) } as Service
}

interface NodeWalk {
  points: readonly string[]
  ids: Set<string>
}

function nodeAt(raw: unknown, path: string, walk: NodeWalk, parent: CompositeType | null, depth: number): BtNode {
  if (depth > MAX_DEPTH) throw new TemplateError(path, `trees are at most ${MAX_DEPTH} levels deep`)
  const type = (raw as Json | null)?.type
  const types = [...COMPOSITE_TYPES, ...TASK_TYPES] as readonly string[]
  if (typeof type !== 'string' || !types.includes(type)) throw new TemplateError(`${path}.type`, `expected one of ${types.join(', ')}`)
  const spec = NODE_SPECS[type as CompositeType | TaskType]
  const composite = spec.group === 'composite'
  const allowed = ['id', 'type', 'decorators', 'weight', ...(composite ? ['services', 'children'] : spec.fields.map((f) => f.key))]
  const json = objectAt(raw, path, allowed)
  const id = keyAt(json.id, `${path}.id`)
  if (walk.ids.has(id)) throw new TemplateError(`${path}.id`, `"${id}" is used by another node`)
  walk.ids.add(id)
  if (walk.ids.size > MAX_NODES) throw new TemplateError(path, `a tree holds at most ${MAX_NODES} nodes`)
  const decorators = arrayAt(json.decorators ?? [], `${path}.decorators`, MAX_DECORATORS).map((d, i) => decoratorAt(d, `${path}.decorators[${i}]`, parent))
  const base: NodeBase = { id, decorators }
  if (json.weight !== undefined) {
    if (parent !== 'random') throw new TemplateError(`${path}.weight`, 'weight only exists under a random composite')
    base.weight = fieldAt({ key: 'weight', label: '', kind: 'number', min: 1, max: 100, step: 1 }, json.weight, `${path}.weight`, []) as number
  }
  if (composite) {
    const services = arrayAt(json.services ?? [], `${path}.services`, MAX_SERVICES).map((s, i) => serviceAt(s, `${path}.services[${i}]`))
    const children = arrayAt(json.children, `${path}.children`, MAX_CHILDREN, 1).map((c, i) => nodeAt(c, `${path}.children[${i}]`, walk, type as CompositeType, depth + 1))
    return { ...base, type: type as CompositeType, services, children }
  }
  const task = { ...base, type, ...paramsAt(spec, json, path, walk.points) } as TaskNode
  if (task.type === 'wait' && task.min > task.max) throw new TemplateError(`${path}.max`, 'max must be at least min')
  return task
}

export function parseTree(raw: unknown, path: string): BehaviorTree {
  const json = objectAt(raw, path, ['name', 'points', 'root'])
  if (typeof json.name !== 'string' || json.name.trim() === '' || json.name.length > MAX_NAME) throw new TemplateError(`${path}.name`, `expected 1 to ${MAX_NAME} characters`)
  const points = arrayAt(json.points, `${path}.points`, MAX_POINTS).map((p, i) => {
    const key = keyAt(p, `${path}.points[${i}]`)
    if ((BUILT_IN_POINTS as readonly string[]).includes(key)) throw new TemplateError(`${path}.points[${i}]`, `"${key}" is built in`)
    return key
  })
  if (new Set(points).size !== points.length) throw new TemplateError(`${path}.points`, 'a point is listed twice')
  return { name: json.name, points, root: nodeAt(json.root, `${path}.root`, { points, ids: new Set() }, null, 1) }
}

function vec3At(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) throw new TemplateError(path, 'expected [x, y, z]')
  return [value[0], value[1], value[2]]
}

function assignmentAt(raw: unknown, path: string, trees: Record<string, BehaviorTree>): NpcAssignment {
  const json = objectAt(raw, path, ['zone', 'npc', 'tree', 'points'])
  const tree = keyAt(json.tree, `${path}.tree`)
  const def = trees[tree]
  if (!def) throw new TemplateError(`${path}.tree`, `no tree "${tree}"`)
  const points = objectAt(json.points, `${path}.points`, def.points)
  const missing = def.points.find((p) => points[p] === undefined)
  if (missing) throw new TemplateError(`${path}.points.${missing}`, 'this point of the tree is not placed')
  return {
    zone: keyAt(json.zone, `${path}.zone`),
    npc: stringAt(json.npc, `${path}.npc`),
    tree,
    points: Object.fromEntries(def.points.map((p) => [p, vec3At(points[p], `${path}.points.${p}`)])),
  }
}

function stringAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || value === '') throw new TemplateError(path, 'expected a non-empty string')
  return value
}

export function parseNpcBehavior(raw: unknown): NpcBehaviorFile {
  const json = objectAt(raw, 'behavior', ['version', 'trees', 'npcs'])
  if (json.version !== 1) throw new TemplateError('behavior.version', 'expected 1')
  const treeJson = objectAt(json.trees, 'behavior.trees', Object.keys(json.trees ?? {}))
  if (Object.keys(treeJson).length > MAX_TREES) throw new TemplateError('behavior.trees', `at most ${MAX_TREES} trees`)
  const trees = Object.fromEntries(Object.entries(treeJson).map(([key, tree]) => [keyAt(key, `behavior.trees.${key}`), parseTree(tree, `behavior.trees.${key}`)]))
  const npcs = arrayAt(json.npcs, 'behavior.npcs', MAX_ASSIGNMENTS).map((a, i) => assignmentAt(a, `behavior.npcs[${i}]`, trees))
  const seen = new Set<string>()
  npcs.forEach((a, i) => {
    const id = npcStateId(a.zone, a.npc)
    if (seen.has(id)) throw new TemplateError(`behavior.npcs[${i}]`, `${id} already has a tree`)
    seen.add(id)
  })
  return { version: 1, trees, npcs }
}

/** `<zone>/<npc>`: the id of a driven NPC in `npc_state` messages. */
export function npcStateId(zone: string, npc: string): string {
  return `${zone}/${npc}`
}

/** Points too far from the NPC's own spot (checked where the zone files are read: dev save, socket). */
export function farPoints(assignment: NpcAssignment, home: Vec3): string[] {
  return Object.entries(assignment.points)
    .filter(([, [x, , z]]) => Math.hypot(x - home[0], z - home[2]) > MAX_POINT_DISTANCE)
    .map(([key]) => key)
}

/** The bits of a `zones/<zone>.json` file the NPC Interface reads. */
export interface ZoneNpcSource {
  props: Array<{ kind: string; id: string; role?: string; position: Vec3; yaw: number; body?: string }>
  areas: Array<{ npc: string }>
}

export type FreeNpc = ZoneNpcSource['props'][number]

/** NPCs that may get a tree: no staff role, no sale area to stand behind. */
export function freeNpcs(zone: ZoneNpcSource): FreeNpc[] {
  const working = new Set(zone.areas.map((a) => a.npc))
  return zone.props.filter((p) => p.kind === 'npc' && p.role === undefined && !working.has(p.id))
}

/** Problems with the assignments against the zone files they name; empty when all is fine. */
export function assignmentProblems(file: NpcBehaviorFile, zoneOf: (zone: string) => ZoneNpcSource | null): string[] {
  return file.npcs.flatMap((a) => {
    const zone = zoneOf(a.zone)
    if (!zone) return [`${a.zone}: no such zone`]
    const npc = freeNpcs(zone).find((p) => p.id === a.npc)
    if (!npc) return [`${npcStateId(a.zone, a.npc)}: not a free NPC (missing, staff or seller)`]
    return farPoints(a, npc.position).map((p) => `${npcStateId(a.zone, a.npc)}: point ${p} is over ${MAX_POINT_DISTANCE} m away`)
  })
}
