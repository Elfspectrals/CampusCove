// NPC behavior trees, server copy of the contract in docs/NPC_BEHAVIOR.md (the editor validates the same file in
// front/src/game/npcBehavior/npcBehavior.ts). Every field is checked here: the socket runs what it accepts.

export type Vec3Tuple = [number, number, number]
export type Abort = 'none' | 'self' | 'lower' | 'both'
export type MoveSpeed = 'walk' | 'run'
export type NpcClip = 'idle' | 'sit' | 'pick' | 'eat' | 'drink' | 'browse' | 'take' | 'pay'
export type CompositeType = 'selector' | 'sequence' | 'random'
export type CropKind = 'any' | 'corn' | 'potato' | 'cabbage' | 'pumpkin' | 'apple_tree'

export type Decorator =
  | { type: 'has_target'; invert: boolean; abort: Abort }
  | { type: 'time_of_day'; from: number; to: number; invert: boolean; abort: Abort }
  | { type: 'chance'; percent: number }
  | { type: 'cooldown'; seconds: number }
  | { type: 'loop'; count: number }

export type Condition = Extract<Decorator, { abort: Abort }>

export interface Service {
  type: 'perceive_players'
  radius: number
  interval: number
}

interface NodeBase {
  id: string
  decorators: Decorator[]
  weight: number
}

export interface CompositeNode extends NodeBase {
  type: CompositeType
  services: Service[]
  children: BtNode[]
}

export type TaskNode = NodeBase &
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
  points: Record<string, Vec3Tuple>
}

export interface NpcBehaviorFile {
  trees: Map<string, BehaviorTree>
  npcs: NpcAssignment[]
}

const KEY = /^[a-z0-9_]+$/
const BUILT_IN_POINTS = ['home', 'target']
const COMPOSITES: readonly string[] = ['selector', 'sequence', 'random']
const LIMITS = { trees: 40, points: 16, nodes: 200, depth: 12, children: 12, decorators: 6, services: 3, npcs: 64, name: 40 }

type Field =
  | { kind: 'number'; min: number; max: number; integer?: true }
  | { kind: 'choice'; options: readonly string[] }
  | { kind: 'bool' }
  | { kind: 'point' }
  | { kind: 'lines'; maxLines: number; maxLength: number }

const ABORT: Field = { kind: 'choice', options: ['none', 'self', 'lower', 'both'] }
const SPEED: Field = { kind: 'choice', options: ['walk', 'run'] }
const HOUR: Field = { kind: 'number', min: 0, max: 23, integer: true }

const TASK_FIELDS: Record<string, Record<string, Field>> = {
  move_to: { point: { kind: 'point' }, speed: SPEED },
  wander: { radius: { kind: 'number', min: 1, max: 30 }, speed: SPEED },
  pick_crop: { crop: { kind: 'choice', options: ['any', 'corn', 'potato', 'cabbage', 'pumpkin', 'apple_tree'] }, radius: { kind: 'number', min: 1, max: 60 }, speed: SPEED },
  wait: { min: { kind: 'number', min: 0, max: 600 }, max: { kind: 'number', min: 0, max: 600 } },
  face: { point: { kind: 'point' } },
  browse_shelf: { radius: { kind: 'number', min: 1, max: 60 }, seconds: { kind: 'number', min: 2, max: 30 }, take: { kind: 'number', min: 0, max: 100, integer: true } },
  checkout: {},
  animate: { clip: { kind: 'choice', options: ['idle', 'sit', 'pick', 'eat', 'drink', 'browse', 'take', 'pay'] }, seconds: { kind: 'number', min: 0.5, max: 600 } },
  say: { lines: { kind: 'lines', maxLines: 10, maxLength: 120 }, seconds: { kind: 'number', min: 1, max: 6 } },
}

const DECORATOR_FIELDS: Record<string, Record<string, Field>> = {
  has_target: { invert: { kind: 'bool' }, abort: ABORT },
  time_of_day: { from: HOUR, to: HOUR, invert: { kind: 'bool' }, abort: ABORT },
  chance: { percent: { kind: 'number', min: 1, max: 99, integer: true } },
  cooldown: { seconds: { kind: 'number', min: 1, max: 3600 } },
  loop: { count: { kind: 'number', min: 0, max: 100, integer: true } },
}

const SERVICE_FIELDS: Record<string, Record<string, Field>> = {
  perceive_players: { radius: { kind: 'number', min: 1, max: 30 }, interval: { kind: 'number', min: 0.25, max: 5 } },
}

type Json = Record<string, unknown>

function fail(path: string, problem: string): never {
  throw new Error(`npc/behavior.json ${path}: ${problem}`)
}

function objectAt(value: unknown, path: string, allowed?: readonly string[]): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object')
  const unknownKey = allowed && Object.keys(value).find((k) => !allowed.includes(k))
  if (unknownKey) fail(`${path}.${unknownKey}`, 'unknown field')
  return value as Json
}

function arrayAt(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(path, `expected an array of ${min} to ${max} entries`)
  return value
}

function keyAt(value: unknown, path: string): string {
  if (typeof value !== 'string' || !KEY.test(value)) fail(path, `expected a key matching ${KEY}`)
  return value
}

function fieldAt(field: Field, value: unknown, path: string, points: readonly string[]): unknown {
  switch (field.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || value < field.min || value > field.max) fail(path, `expected a number from ${field.min} to ${field.max}`)
      if (field.integer && !Number.isInteger(value)) fail(path, 'expected a whole number')
      return value
    case 'choice':
      if (typeof value !== 'string' || !field.options.includes(value)) fail(path, `expected one of ${field.options.join(', ')}`)
      return value
    case 'bool':
      if (typeof value !== 'boolean') fail(path, 'expected true or false')
      return value
    case 'point':
      if (typeof value !== 'string' || ![...BUILT_IN_POINTS, ...points].includes(value)) fail(path, 'expected home, target or a point of the tree')
      return value
    case 'lines':
      return arrayAt(value, path, field.maxLines, 1).map((line, i) => {
        if (typeof line !== 'string' || line.trim() === '' || line.length > field.maxLength) fail(`${path}[${i}]`, `expected 1 to ${field.maxLength} characters`)
        return line
      })
  }
}

function typedAt(table: Record<string, Record<string, Field>>, raw: unknown, path: string, extra: readonly string[], points: readonly string[]): Json {
  const type = (raw as Json | null)?.type
  if (typeof type !== 'string' || !table[type]) fail(`${path}.type`, `expected one of ${Object.keys(table).join(', ')}`)
  const fields = table[type]
  const json = objectAt(raw, path, ['type', ...extra, ...Object.keys(fields)])
  return { ...json, type, ...Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, fieldAt(f, json[k], `${path}.${k}`, points)])) }
}

export function isCondition(d: Decorator): d is Condition {
  return d.type === 'has_target' || d.type === 'time_of_day'
}

export function isComposite(node: BtNode): node is CompositeNode {
  return COMPOSITES.includes(node.type)
}

function decoratorAt(raw: unknown, path: string, parent: string | null): Decorator {
  const d = typedAt(DECORATOR_FIELDS, raw, path, [], []) as Decorator
  if (d.type === 'time_of_day' && d.from === d.to) fail(`${path}.to`, 'from and to must differ')
  if (isCondition(d) && (d.abort === 'lower' || d.abort === 'both') && parent !== 'selector') fail(`${path}.abort`, 'lower priority aborts only work under a selector')
  return d
}

interface Walk {
  points: readonly string[]
  ids: Set<string>
}

function nodeAt(raw: unknown, path: string, walk: Walk, parent: string | null, depth: number): BtNode {
  if (depth > LIMITS.depth) fail(path, `at most ${LIMITS.depth} levels`)
  const type = (raw as Json | null)?.type
  const composite = typeof type === 'string' && COMPOSITES.includes(type)
  const json = composite
    ? objectAt(raw, path, ['id', 'type', 'decorators', 'weight', 'services', 'children'])
    : typedAt(TASK_FIELDS, raw, path, ['id', 'decorators', 'weight'], walk.points)
  const id = keyAt(json.id, `${path}.id`)
  if (walk.ids.has(id)) fail(`${path}.id`, `"${id}" is used by another node`)
  walk.ids.add(id)
  if (walk.ids.size > LIMITS.nodes) fail(path, `at most ${LIMITS.nodes} nodes`)
  const decorators = arrayAt(json.decorators ?? [], `${path}.decorators`, LIMITS.decorators).map((d, i) => decoratorAt(d, `${path}.decorators[${i}]`, parent))
  if (json.weight !== undefined && parent !== 'random') fail(`${path}.weight`, 'weight only exists under a random composite')
  const weight = json.weight === undefined ? 1 : (fieldAt({ kind: 'number', min: 1, max: 100 }, json.weight, `${path}.weight`, []) as number)
  if (composite) {
    const services = arrayAt(json.services ?? [], `${path}.services`, LIMITS.services).map((s, i) => typedAt(SERVICE_FIELDS, s, `${path}.services[${i}]`, [], []) as unknown as Service)
    const children = arrayAt(json.children, `${path}.children`, LIMITS.children, 1).map((c, i) => nodeAt(c, `${path}.children[${i}]`, walk, type as string, depth + 1))
    return { id, type: type as CompositeType, decorators, weight, services, children }
  }
  const task = { ...json, id, decorators, weight } as TaskNode
  if (task.type === 'wait' && task.min > task.max) fail(`${path}.max`, 'max must be at least min')
  return task
}

function treeAt(raw: unknown, path: string): BehaviorTree {
  const json = objectAt(raw, path, ['name', 'points', 'root'])
  if (typeof json.name !== 'string' || json.name.trim() === '' || json.name.length > LIMITS.name) fail(`${path}.name`, `expected 1 to ${LIMITS.name} characters`)
  const points = arrayAt(json.points, `${path}.points`, LIMITS.points).map((p, i) => {
    const key = keyAt(p, `${path}.points[${i}]`)
    if (BUILT_IN_POINTS.includes(key)) fail(`${path}.points[${i}]`, `"${key}" is built in`)
    return key
  })
  if (new Set(points).size !== points.length) fail(`${path}.points`, 'a point is listed twice')
  return { name: json.name, points, root: nodeAt(json.root, `${path}.root`, { points, ids: new Set() }, null, 1) }
}

function vec3At(value: unknown, path: string): Vec3Tuple {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) fail(path, 'expected [x, y, z]')
  return [value[0], value[1], value[2]]
}

export function parseNpcBehavior(raw: unknown): NpcBehaviorFile {
  const json = objectAt(raw, 'root', ['version', 'trees', 'npcs'])
  if (json.version !== 1) fail('version', 'expected 1')
  const treeJson = objectAt(json.trees, 'trees')
  if (Object.keys(treeJson).length > LIMITS.trees) fail('trees', `at most ${LIMITS.trees} trees`)
  const trees = new Map(Object.entries(treeJson).map(([key, t]) => [keyAt(key, `trees.${key}`), treeAt(t, `trees.${key}`)]))
  const seen = new Set<string>()
  const npcs = arrayAt(json.npcs, 'npcs', LIMITS.npcs).map((raw, i): NpcAssignment => {
    const path = `npcs[${i}]`
    const a = objectAt(raw, path, ['zone', 'npc', 'tree', 'points'])
    const tree = trees.get(keyAt(a.tree, `${path}.tree`)) ?? fail(`${path}.tree`, `no tree "${a.tree}"`)
    const points = objectAt(a.points, `${path}.points`, tree.points)
    const zone = keyAt(a.zone, `${path}.zone`)
    if (typeof a.npc !== 'string' || a.npc === '') fail(`${path}.npc`, 'expected a non-empty string')
    const id = `${zone}/${a.npc}`
    if (seen.has(id)) fail(path, `${id} already has a tree`)
    seen.add(id)
    return { zone, npc: a.npc, tree: a.tree as string, points: Object.fromEntries(tree.points.map((p) => [p, vec3At(points[p], `${path}.points.${p}`)])) }
  })
  return { trees, npcs }
}
