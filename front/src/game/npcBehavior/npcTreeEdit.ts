/**
 * Pure edits and layout of a behavior tree for the admin NPC Interface. Every edit returns a new tree, so the
 * editor can keep an undo stack of snapshots.
 */
import {
  MAX_CHILDREN,
  NODE_SPECS,
  defaultValue,
  isComposite,
  isCondition,
  parseTree,
  subtreeProblem,
  type BehaviorTree,
  type BtNode,
  type CompositeNode,
  type Compare,
  type CompositeType,
  type Decorator,
  type DecoratorType,
  type Service,
  type ServiceType,
  type TaskType,
} from './npcBehavior.ts'

export function findNode(root: BtNode, id: string): BtNode | null {
  if (root.id === id) return root
  if (!isComposite(root)) return null
  for (const child of root.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export function parentOf(root: BtNode, id: string): CompositeNode | null {
  if (!isComposite(root)) return null
  if (root.children.some((c) => c.id === id)) return root
  for (const child of root.children) {
    const found = parentOf(child, id)
    if (found) return found
  }
  return null
}

function mapNode(root: BtNode, id: string, edit: (node: BtNode) => BtNode): BtNode {
  if (root.id === id) return edit(root)
  if (!isComposite(root)) return root
  return { ...root, children: root.children.map((c) => mapNode(c, id, edit)) }
}

export function allIds(root: BtNode): string[] {
  return [root.id, ...(isComposite(root) ? root.children.flatMap(allIds) : [])]
}

function newNodeId(root: BtNode, type: string): string {
  return freeId(new Set(allIds(root)), type)
}

function freeId(taken: ReadonlySet<string>, base: string): string {
  for (let n = 1; ; n++) if (!taken.has(`${base}_${n}`)) return `${base}_${n}`
}

export function isUnder(root: BtNode, ancestorId: string, id: string): boolean {
  const ancestor = findNode(root, ancestorId)
  return ancestor !== null && findNode(ancestor, id) !== null
}

export function createNode(type: CompositeType | TaskType, id: string, firstChild?: BtNode): BtNode {
  const spec = NODE_SPECS[type]
  if (spec.group === 'composite') {
    return { id, type: type as CompositeType, decorators: [], services: [], children: firstChild ? [firstChild] : [] }
  }
  return { id, type, decorators: [], ...structuredClone(spec.defaults) } as unknown as BtNode
}

function withFirstKey<T extends object>(item: T, tree: BehaviorTree | undefined): T {
  const key = tree?.keys[0]
  return key && 'key' in item ? { ...item, key: key.key, value: defaultValue(key.type) } : item
}

export function createDecorator(type: DecoratorType, tree?: BehaviorTree): Decorator {
  return withFirstKey({ type, ...structuredClone(NODE_SPECS[type].defaults) } as Decorator, tree)
}

export function createService(type: ServiceType): Service {
  return { type, ...structuredClone(NODE_SPECS[type].defaults) } as Service
}

export function updateNode(tree: BehaviorTree, id: string, edit: (node: BtNode) => BtNode): BehaviorTree {
  return { ...tree, root: mapNode(tree.root, id, edit) }
}

/** A new task under a composite; a new composite needs a first child, so it gets a Wait. `pos` places the card. */
export function addChild(tree: BehaviorTree, parentId: string, type: CompositeType | TaskType, pos?: [number, number]): { tree: BehaviorTree; id: string } {
  const id = newNodeId(tree.root, type)
  const withFirst = NODE_SPECS[type].group === 'composite'
  const parent = findNode(tree.root, parentId)
  const at = pos ?? (parent && isComposite(parent) ? besideSiblings(parent) : undefined)
  const first = withFirst ? createNode('wait', `${id}_wait`) : undefined
  if (first && at) first.pos = [at[0], at[1] + HEADER_H + GAP_Y]
  const node = withFirstKey(createNode(type, id, first), tree)
  if (at) node.pos = at
  const next = updateNode(tree, parentId, (p) => (isComposite(p) ? { ...p, children: byPosition([...p.children, node]) } : p))
  return { tree: next, id }
}

function byPosition(children: BtNode[]): BtNode[] {
  return children.every((c) => c.pos) ? [...children].sort((a, b) => a.pos![0] - b.pos![0]) : children
}

function besideSiblings(parent: CompositeNode): [number, number] | undefined {
  if (!parent.pos) return undefined
  const placed = parent.children.filter((c) => c.pos)
  if (placed.length === 0) return [parent.pos[0], parent.pos[1] + nodeHeight(parent) + GAP_Y]
  const right = placed.reduce((a, b) => (b.pos![0] > a.pos![0] ? b : a))
  return [right.pos![0] + NODE_WIDTH + GAP_X, right.pos![1]]
}

function shifted(node: BtNode, dx: number): BtNode {
  const moved = node.pos ? { ...node, pos: [node.pos[0] + dx, node.pos[1]] as [number, number] } : node
  return isComposite(moved) ? { ...moved, children: moved.children.map((c) => shifted(c, dx)) } : moved
}

/** Not the root, and a composite keeps at least one child: returns the same tree then. */
export function removeNode(tree: BehaviorTree, id: string): BehaviorTree {
  const parent = parentOf(tree.root, id)
  if (!parent || parent.children.length <= 1) return tree
  return updateNode(tree, parent.id, (p) => ({ ...p, children: (p as CompositeNode).children.filter((c) => c.id !== id) }))
}

export function moveNode(tree: BehaviorTree, id: string, delta: -1 | 1): BehaviorTree {
  const parent = parentOf(tree.root, id)
  if (!parent) return tree
  const from = parent.children.findIndex((c) => c.id === id)
  const to = from + delta
  if (to < 0 || to >= parent.children.length) return tree
  const children = [...parent.children]
  const [a, b] = [children[from]!, children[to]!]
  const dx = a.pos && b.pos ? b.pos[0] - a.pos[0] : 0
  ;[children[from], children[to]] = [shifted(b, -dx), shifted(a, dx)]
  return updateNode(tree, parent.id, (p) => ({ ...p, children }))
}

function fitToParent(child: BtNode, type: CompositeType): BtNode {
  const { weight, ...rest } = child
  const decorators = child.decorators.map((d) => (type !== 'selector' && isCondition(d) && (d.abort === 'lower' || d.abort === 'both') ? { ...d, abort: d.abort === 'both' ? 'self' : 'none' } : d)) as Decorator[]
  return { ...(type === 'random' && weight !== undefined ? { weight } : {}), ...rest, decorators } as BtNode
}

/** Change a composite's type and drop what its children may no longer carry (weights, lower aborts). */
export function setCompositeType(tree: BehaviorTree, id: string, type: CompositeType): BehaviorTree {
  return updateNode(tree, id, (node) => (isComposite(node) ? { ...node, type, children: node.children.map((c) => fitToParent(c, type)) } : node))
}

export type EditResult = { tree: BehaviorTree } | { error: string }

export function reparentNode(tree: BehaviorTree, id: string, parentId: string): EditResult {
  const node = findNode(tree.root, id)
  const target = findNode(tree.root, parentId)
  const from = parentOf(tree.root, id)
  if (!node || !from) return { error: 'The root has no parent.' }
  if (!target || !isComposite(target)) return { error: 'Only a composite takes children.' }
  if (isUnder(tree.root, id, parentId)) return { error: 'A node cannot go under itself.' }
  if (from.id === parentId) return { tree }
  if (from.children.length <= 1) return { error: `${from.id} would be left without a child: a composite keeps at least one.` }
  if (target.children.length >= MAX_CHILDREN) return { error: `${parentId} already has ${MAX_CHILDREN} children.` }
  const without = updateNode(tree, from.id, (p) => ({ ...p, children: (p as CompositeNode).children.filter((c) => c.id !== id) }))
  return { tree: updateNode(without, parentId, (p) => ({ ...p, children: [...(p as CompositeNode).children, fitToParent(node, (p as CompositeNode).type)] })) }
}

export function sortChildren(tree: BehaviorTree, parentId: string, xOf: (id: string) => number): BehaviorTree {
  return updateNode(tree, parentId, (p) => {
    if (!isComposite(p)) return p
    const children = [...p.children].sort((a, b) => xOf(a.id) - xOf(b.id))
    return children.every((c, i) => c === p.children[i]) ? p : { ...p, children }
  })
}

export function setPositions(tree: BehaviorTree, positions: ReadonlyMap<string, [number, number]>): BehaviorTree {
  const place = (node: BtNode): BtNode => {
    const pos = positions.get(node.id)
    const placed = pos ? { ...node, pos } : node
    return isComposite(placed) ? { ...placed, children: placed.children.map(place) } : placed
  }
  return { ...tree, root: place(tree.root) }
}

function freshCopy(tree: BehaviorTree, node: BtNode, offset: [number, number]): BtNode {
  const taken = new Set(allIds(tree.root))
  const copy = (n: BtNode): BtNode => {
    const id = taken.has(n.id) ? freeId(taken, n.id.replace(/_\d+$/, '')) : n.id
    taken.add(id)
    const pos: [number, number] | undefined = n.pos ? [n.pos[0] + offset[0], n.pos[1] + offset[1]] : undefined
    const base = { ...structuredClone(n), id, ...(pos ? { pos } : {}) }
    return isComposite(n) ? { ...(base as CompositeNode), children: n.children.map(copy) } : (base as BtNode)
  }
  return copy(node)
}

export const PASTE_OFFSET: [number, number] = [40, 40]

export function pasteNode(tree: BehaviorTree, parentId: string, node: BtNode, offset: [number, number] = PASTE_OFFSET): EditResult & { id?: string } {
  const parent = findNode(tree.root, parentId)
  if (!parent || !isComposite(parent)) return { error: 'Paste under a composite: select one first.' }
  if (parent.children.length >= MAX_CHILDREN) return { error: `${parentId} already has ${MAX_CHILDREN} children.` }
  const copy = fitToParent(freshCopy(tree, node, offset), parent.type)
  return { tree: updateNode(tree, parentId, (p) => ({ ...p, children: byPosition([...(p as CompositeNode).children, copy]) })), id: copy.id }
}

function replacePoint(root: BtNode, from: string, to: string): BtNode {
  const node = 'point' in root && root.point === from ? ({ ...root, point: to } as BtNode) : root
  return isComposite(node) ? { ...node, children: node.children.map((c) => replacePoint(c, from, to)) } : node
}

function replaceKey(root: BtNode, from: string, to: string): BtNode {
  const own = 'key' in root && root.key === from ? ({ ...root, key: to } as BtNode) : root
  const node = { ...own, decorators: own.decorators.map((d) => ('key' in d && d.key === from ? { ...d, key: to } : d)) } as BtNode
  return isComposite(node) ? { ...node, children: node.children.map((c) => replaceKey(c, from, to)) } : node
}

export function renameKey(tree: BehaviorTree, from: string, to: string): BehaviorTree {
  return { ...tree, keys: tree.keys.map((k) => (k.key === from ? { ...k, key: to } : k)), root: replaceKey(tree.root, from, to) }
}

export function renamePoint(tree: BehaviorTree, from: string, to: string): BehaviorTree {
  return { ...tree, points: tree.points.map((p) => (p === from ? to : p)), root: replacePoint(tree.root, from, to) }
}

/** Tasks that pointed at the removed key go home. */
export function removePoint(tree: BehaviorTree, key: string): BehaviorTree {
  return { ...tree, points: tree.points.filter((p) => p !== key), root: replacePoint(tree.root, key, 'home') }
}

// ------------------------------------------------------------------ layout

export const NODE_WIDTH = 220
export const HEADER_H = 58
const DECORATOR_H = 26
const SERVICE_H = 24
const GAP_X = 28
export const GAP_Y = 54

export interface NodeBox {
  node: BtNode
  /** Execution order, depth first like UE5's index badges. */
  order: number
  x: number
  y: number
  height: number
  parentId: string | null
  hidden: number
}

function countNodes(node: BtNode): number {
  return 1 + (isComposite(node) ? node.children.reduce((n, c) => n + countNodes(c), 0) : 0)
}

function nodeHeight(node: BtNode): number {
  return HEADER_H + node.decorators.length * DECORATOR_H + (isComposite(node) ? node.services.length * SERVICE_H : 0)
}

/**
 * Leaves side by side, each parent centred over its children. A node with a `pos` sits there, and the nodes
 * under it without one keep their place relative to it. The children of a collapsed composite are left out.
 */
export function layoutTree(root: BtNode, collapsed: ReadonlySet<string> = new Set()): NodeBox[] {
  const boxes: NodeBox[] = []
  let nextLeafX = 0
  let order = 0
  function place(node: BtNode, y: number, parentId: string | null): number {
    const folded = isComposite(node) && collapsed.has(node.id)
    const box: NodeBox = { node, order: order++, x: 0, y, height: nodeHeight(node), parentId, hidden: folded ? countNodes(node) - 1 : 0 }
    boxes.push(box)
    const childY = y + box.height + GAP_Y
    if (folded) order += box.hidden
    if (!isComposite(node) || node.children.length === 0 || folded) {
      box.x = nextLeafX
      nextLeafX += NODE_WIDTH + GAP_X
      return box.x
    }
    const xs = node.children.map((c) => place(c, childY, node.id))
    box.x = (xs[0]! + xs[xs.length - 1]!) / 2
    return box.x
  }
  place(root, 0, null)
  const auto = new Map(boxes.map((b) => [b.node.id, { x: b.x, y: b.y }]))
  const byId = new Map(boxes.map((b) => [b.node.id, b]))
  for (const box of boxes) {
    if (box.node.pos) {
      ;[box.x, box.y] = box.node.pos
      continue
    }
    const parent = box.parentId ? byId.get(box.parentId) : undefined
    if (!parent) continue
    const own = auto.get(box.node.id)!
    const parentAuto = auto.get(parent.node.id)!
    box.x = parent.x + own.x - parentAuto.x
    box.y = parent.y + own.y - parentAuto.y
  }
  return boxes
}

export function nodeProblems(tree: BehaviorTree, trees: Readonly<Record<string, BehaviorTree>>): Map<string, string> {
  const problems = new Map<string, string>()
  const visit = (node: BtNode, parent: CompositeNode | null): void => {
    const shallow = isComposite(node) ? { ...node, children: [{ id: `${node.id}_probe`, type: 'wait', decorators: [], min: 0, max: 0 }] } : node
    const { children: _children, ...wrapper } = parent ?? { id: 'probe_parent', type: 'sequence', decorators: [], services: [], children: [] }
    const id = node.id === wrapper.id ? 'probe_parent_2' : wrapper.id
    try {
      parseTree({ name: 'probe', points: tree.points, keys: tree.keys, root: { ...wrapper, id, decorators: [], children: [shallow] } }, 'node')
      if (node.type === 'run_behavior') {
        const problem = node.tree === '' ? 'choose a tree' : subtreeProblem(tree, trees[node.tree], node.tree)
        if (problem) problems.set(node.id, problem)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      problems.set(node.id, message.slice(message.indexOf(': ') + 2))
    }
    if (isComposite(node)) node.children.forEach((c) => visit(c, node))
  }
  visit(tree.root, null)
  return problems
}

/** One-line summary of a node's parameters for its graph card. */
export function describeNode(node: BtNode): string {
  switch (node.type) {
    case 'move_to':
      return `${node.point} · ${node.speed}`
    case 'wander':
      return `${node.radius} m · ${node.speed}`
    case 'wait':
      return node.min === node.max ? `${node.min} s` : `${node.min}–${node.max} s`
    case 'face':
      return node.point
    case 'animate':
      return `${node.clip} · ${node.seconds} s`
    case 'pick_crop':
      return `${node.crop.replace('_', ' ')} within ${node.radius} m · ${node.speed}`
    case 'browse_shelf':
      return `shelves within ${node.radius} m · ${node.seconds} s · takes ${node.take} %`
    case 'checkout':
      return 'queue and pay the clerk'
    case 'say':
      return `“${node.lines[0]}”${node.lines.length > 1 ? ` +${node.lines.length - 1}` : ''}`
    case 'set_value':
      return `${node.key || '?'} ${node.op === 'add' ? '+=' : '='} ${JSON.stringify(node.value)}`
    case 'run_behavior':
      return node.tree ? `runs ${node.tree}` : 'choose a tree'
    default:
      return NODE_SPECS[node.type].hint
  }
}

export const COMPARE_SIGNS: Record<Compare, string> = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }

export function describeDecorator(d: Decorator): string {
  switch (d.type) {
    case 'has_target':
      return `${d.invert ? 'No target' : 'Has target'}${d.abort !== 'none' ? ` · aborts ${d.abort}` : ''}`
    case 'time_of_day':
      return `${d.invert ? 'Not ' : ''}${d.from}h–${d.to}h${d.abort !== 'none' ? ` · aborts ${d.abort}` : ''}`
    case 'blackboard':
      return `${d.key || '?'} ${COMPARE_SIGNS[d.compare]} ${JSON.stringify(d.value)}${d.abort !== 'none' ? ` · aborts ${d.abort}` : ''}`
    case 'chance':
      return `Chance ${d.percent} %`
    case 'cooldown':
      return `Cooldown ${d.seconds} s`
    case 'loop':
      return d.count === 0 ? 'Loop forever' : `Loop × ${d.count}`
  }
}

export function describeService(s: Service): string {
  return `Perceive players · ${s.radius} m every ${s.interval} s`
}

/** Wander, Pick Crop and Browse Shelf radii used anywhere in the tree, for the placement map. */
export function areaRadii(root: BtNode): number[] {
  const own = root.type === 'wander' || root.type === 'pick_crop' || root.type === 'browse_shelf' ? [root.radius] : []
  return [...own, ...(isComposite(root) ? root.children.flatMap(areaRadii) : [])]
}
