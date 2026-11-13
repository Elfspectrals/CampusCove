/**
 * Pure edits and layout of a behavior tree for the admin NPC Interface. Every edit returns a new tree, so the
 * editor can keep an undo stack of snapshots.
 */
import {
  NODE_SPECS,
  isComposite,
  isCondition,
  type BehaviorTree,
  type BtNode,
  type CompositeNode,
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

function allIds(root: BtNode): string[] {
  return [root.id, ...(isComposite(root) ? root.children.flatMap(allIds) : [])]
}

function newNodeId(root: BtNode, type: string): string {
  const ids = new Set(allIds(root))
  for (let n = 1; ; n++) if (!ids.has(`${type}_${n}`)) return `${type}_${n}`
}

export function createNode(type: CompositeType | TaskType, id: string, firstChild?: BtNode): BtNode {
  const spec = NODE_SPECS[type]
  if (spec.group === 'composite') {
    return { id, type: type as CompositeType, decorators: [], services: [], children: firstChild ? [firstChild] : [] }
  }
  return { id, type, decorators: [], ...structuredClone(spec.defaults) } as unknown as BtNode
}

export function createDecorator(type: DecoratorType): Decorator {
  return { type, ...structuredClone(NODE_SPECS[type].defaults) } as Decorator
}

export function createService(type: ServiceType): Service {
  return { type, ...structuredClone(NODE_SPECS[type].defaults) } as Service
}

export function updateNode(tree: BehaviorTree, id: string, edit: (node: BtNode) => BtNode): BehaviorTree {
  return { ...tree, root: mapNode(tree.root, id, edit) }
}

/** A new task under a composite; a new composite needs a first child, so it gets a Wait. */
export function addChild(tree: BehaviorTree, parentId: string, type: CompositeType | TaskType): { tree: BehaviorTree; id: string } {
  const id = newNodeId(tree.root, type)
  const withFirst = NODE_SPECS[type].group === 'composite'
  const node = createNode(type, id, withFirst ? createNode('wait', `${id}_wait`) : undefined)
  const next = updateNode(tree, parentId, (parent) => (isComposite(parent) ? { ...parent, children: [...parent.children, node] } : parent))
  return { tree: next, id }
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
  ;[children[from], children[to]] = [children[to]!, children[from]!]
  return updateNode(tree, parent.id, (p) => ({ ...p, children }))
}

/** Change a composite's type and drop what its children may no longer carry (weights, lower aborts). */
export function setCompositeType(tree: BehaviorTree, id: string, type: CompositeType): BehaviorTree {
  return updateNode(tree, id, (node) => {
    if (!isComposite(node)) return node
    const children = node.children.map((child) => {
      const { weight, ...rest } = child
      const decorators = child.decorators.map((d) => (type !== 'selector' && isCondition(d) && (d.abort === 'lower' || d.abort === 'both') ? { ...d, abort: d.abort === 'both' ? 'self' : 'none' } : d)) as Decorator[]
      return { ...(type === 'random' && weight !== undefined ? { weight } : {}), ...rest, decorators } as BtNode
    })
    return { ...node, type, children }
  })
}

function replacePoint(root: BtNode, from: string, to: string): BtNode {
  const node = 'point' in root && root.point === from ? ({ ...root, point: to } as BtNode) : root
  return isComposite(node) ? { ...node, children: node.children.map((c) => replacePoint(c, from, to)) } : node
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
const HEADER_H = 58
const DECORATOR_H = 26
const SERVICE_H = 24
const GAP_X = 28
const GAP_Y = 54

export interface NodeBox {
  node: BtNode
  /** Execution order, depth first like UE5's index badges. */
  order: number
  x: number
  y: number
  height: number
  parentId: string | null
}

function nodeHeight(node: BtNode): number {
  return HEADER_H + node.decorators.length * DECORATOR_H + (isComposite(node) ? node.services.length * SERVICE_H : 0)
}

/** Leaves side by side, each parent centred over its children. */
export function layoutTree(root: BtNode): NodeBox[] {
  const boxes: NodeBox[] = []
  let nextLeafX = 0
  let order = 0
  function place(node: BtNode, y: number, parentId: string | null): number {
    const box: NodeBox = { node, order: order++, x: 0, y, height: nodeHeight(node), parentId }
    boxes.push(box)
    const childY = y + box.height + GAP_Y
    if (!isComposite(node) || node.children.length === 0) {
      box.x = nextLeafX
      nextLeafX += NODE_WIDTH + GAP_X
      return box.x
    }
    const xs = node.children.map((c) => place(c, childY, node.id))
    box.x = (xs[0]! + xs[xs.length - 1]!) / 2
    return box.x
  }
  place(root, 0, null)
  return boxes
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
    default:
      return NODE_SPECS[node.type].hint
  }
}

export function describeDecorator(d: Decorator): string {
  switch (d.type) {
    case 'has_target':
      return `${d.invert ? 'No target' : 'Has target'}${d.abort !== 'none' ? ` · aborts ${d.abort}` : ''}`
    case 'time_of_day':
      return `${d.invert ? 'Not ' : ''}${d.from}h–${d.to}h${d.abort !== 'none' ? ` · aborts ${d.abort}` : ''}`
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
