import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseNpcBehavior, parseTree, farPoints, type BehaviorTree } from './npcBehavior.ts'
import { addChild, allIds, findNode, layoutTree, moveNode, nodeProblems, pasteNode, removeNode, removePoint, renameKey, renamePoint, reparentNode, setCompositeType, setPositions, sortChildren, updateNode } from './npcTreeEdit.ts'

const committed = JSON.parse(readFileSync(new URL('../../../public/assets/npc/behavior.json', import.meta.url), 'utf8'))

function tree(root: unknown, points: string[] = []): unknown {
  return { name: 'Test', points, root }
}

const wait = (id: string) => ({ id, type: 'wait', decorators: [], min: 1, max: 2 })

test('the committed behavior file is valid', () => {
  const file = parseNpcBehavior(committed)
  assert.ok(Object.keys(file.trees).length >= 1)
  assert.equal(file.npcs.length, new Set(file.npcs.map((n) => `${n.zone}/${n.npc}`)).size)
})

test('node ids are unique within a tree', () => {
  assert.throws(() => parseTree(tree({ id: 'a', type: 'sequence', children: [wait('b'), wait('b')] }), 't'), /"b" is used by another node/)
})

test('a move_to points at a declared point, home or target', () => {
  const move = (point: string) => ({ id: 'm', type: 'move_to', point, speed: 'walk' })
  assert.doesNotThrow(() => parseTree(tree(move('bench'), ['bench']), 't'))
  assert.doesNotThrow(() => parseTree(tree(move('target')), 't'))
  assert.throws(() => parseTree(tree(move('bench')), 't'), /expected home, target or a point/)
})

test('lower priority aborts need a selector parent', () => {
  const guarded = { ...wait('w'), decorators: [{ type: 'has_target', invert: false, abort: 'lower' }] }
  assert.doesNotThrow(() => parseTree(tree({ id: 's', type: 'selector', children: [guarded, wait('x')] }), 't'))
  assert.throws(() => parseTree(tree({ id: 's', type: 'sequence', children: [guarded, wait('x')] }), 't'), /child of a selector/)
})

test('weight only under random, wait min ≤ max, ranges are checked', () => {
  assert.throws(() => parseTree(tree({ id: 's', type: 'sequence', children: [{ ...wait('w'), weight: 2 }] }), 't'), /weight only exists/)
  assert.throws(() => parseTree(tree({ ...wait('w'), min: 5, max: 1 }), 't'), /max must be at least min/)
  assert.throws(() => parseTree(tree({ id: 'w', type: 'wander', radius: 99, speed: 'walk' }), 't'), /from 1 to 30/)
  assert.throws(() => parseTree(tree({ id: 'c', type: 'selector', children: [] }), 't'), /1 to 12 entries/)
})

test('an assignment places every point of its tree', () => {
  const trees = { t: tree(wait('w'), ['a']) }
  assert.throws(() => parseNpcBehavior({ version: 1, trees, npcs: [{ zone: 'z', npc: 'n', tree: 't', points: {} }] }), /not placed/)
  assert.throws(() => parseNpcBehavior({ version: 1, trees, npcs: [{ zone: 'z', npc: 'n', tree: 'nope', points: {} }] }), /no tree "nope"/)
  const ok = { zone: 'z', npc: 'n', tree: 't', points: { a: [100, 0, 0] } }
  assert.throws(() => parseNpcBehavior({ version: 1, trees, npcs: [ok, ok] }), /already has a tree/)
  assert.deepEqual(farPoints(parseNpcBehavior({ version: 1, trees, npcs: [ok] }).npcs[0]!, [0, 0, 0]), ['a'])
})

function sample(): BehaviorTree {
  return parseTree(tree({ id: 'root', type: 'random', children: [{ ...wait('a'), weight: 3 }, { id: 'go', type: 'move_to', decorators: [], point: 'p', speed: 'run' }] }, ['p']), 't')
}

test('edits keep the tree valid', () => {
  let t = sample()
  const added = addChild(t, 'root', 'sequence')
  t = added.tree
  assert.equal(findNode(t.root, added.id)?.type, 'sequence')
  t = moveNode(t, 'go', -1)
  assert.deepEqual((t.root as { children: { id: string }[] }).children.map((c) => c.id), ['go', 'a', added.id])
  t = setCompositeType(t, 'root', 'sequence')
  assert.equal(findNode(t.root, 'a')?.weight, undefined)
  t = renamePoint(t, 'p', 'bench')
  assert.equal((findNode(t.root, 'go') as { point: string }).point, 'bench')
  t = removePoint(t, 'bench')
  assert.equal((findNode(t.root, 'go') as { point: string }).point, 'home')
  t = removeNode(t, added.id)
  t = updateNode(t, 'a', (n) => ({ ...n, decorators: [{ type: 'loop', count: 2 }] }))
  assert.doesNotThrow(() => parseTree(t, 't'))
})

test('layout centres parents over their children and numbers nodes depth first', () => {
  const boxes = layoutTree(sample().root)
  const [root, a, go] = boxes
  assert.equal(root!.x, (a!.x + go!.x) / 2)
  assert.deepEqual(boxes.map((b) => b.order), [0, 1, 2])
  assert.ok(a!.y > root!.y)
})

const childIds = (t: BehaviorTree, id: string) => ((findNode(t.root, id) as { children: { id: string }[] }).children ?? []).map((c) => c.id)

function nested(): BehaviorTree {
  return parseTree(
    tree({
      id: 'root',
      type: 'selector',
      children: [
        { id: 'left', type: 'sequence', children: [wait('a'), wait('b')] },
        { id: 'right', type: 'random', children: [{ ...wait('c'), weight: 4 }] },
      ],
    }),
    't',
  )
}

test('reparent moves a node with its subtree, and refuses loops and empty composites', () => {
  const t = nested()
  const moved = reparentNode(t, 'b', 'right')
  assert.ok('tree' in moved)
  assert.deepEqual(childIds(moved.tree, 'left'), ['a'])
  assert.deepEqual(childIds(moved.tree, 'right'), ['c', 'b'])
  assert.deepEqual(reparentNode(t, 'left', 'left'), { error: 'A node cannot go under itself.' })
  assert.match((reparentNode(t, 'c', 'left') as { error: string }).error, /right would be left without a child/)
  assert.match((reparentNode(t, 'root', 'left') as { error: string }).error, /root has no parent/)
  const fromRandom = reparentNode(reparentNode(t, 'a', 'right').tree as BehaviorTree, 'c', 'left')
  assert.equal(findNode((fromRandom as { tree: BehaviorTree }).tree.root, 'c')?.weight, undefined, 'a weight stays under random only')
})

test('children run in the order of their cards from left to right', () => {
  const xs: Record<string, number> = { a: 300, b: -20 }
  assert.deepEqual(childIds(sortChildren(nested(), 'left', (id) => xs[id]!), 'left'), ['b', 'a'])
  assert.deepEqual(childIds(sortChildren(nested(), 'left', (id) => (id === 'a' ? 0 : 1)), 'left'), ['a', 'b'])
})

test('paste gives fresh ids to the copy and its subtree', () => {
  const t = nested()
  const left = findNode(t.root, 'left')!
  const pasted = pasteNode(t, 'root', left)
  assert.ok('tree' in pasted)
  const ids = allIds(pasted.tree.root)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(pasted.id, 'left_1')
  assert.deepEqual(childIds(pasted.tree, 'left_1'), ['a_1', 'b_1'])
  assert.doesNotThrow(() => parseTree(pasted.tree, 't'))
  assert.match((pasteNode(t, 'a', left) as { error: string }).error, /under a composite/)
})

test('a card with a position sits there and the cards under it keep their offset', () => {
  const auto = layoutTree(nested().root)
  const autoOf = (id: string) => auto.find((b) => b.node.id === id)!
  const placed = layoutTree(setPositions(nested(), new Map([['left', [1000, 500] as [number, number]]])).root)
  const of = (id: string) => placed.find((b) => b.node.id === id)!
  assert.deepEqual([of('left').x, of('left').y], [1000, 500])
  assert.equal(of('a').x - of('left').x, autoOf('a').x - autoOf('left').x)
  assert.equal(of('a').y - of('left').y, autoOf('a').y - autoOf('left').y)
  assert.equal(of('right').x, autoOf('right').x, 'siblings without a position do not move')
})

test('a collapsed composite hides its children but keeps the order numbers', () => {
  const boxes = layoutTree(nested().root, new Set(['left']))
  assert.deepEqual(boxes.map((b) => b.node.id), ['root', 'left', 'right', 'c'])
  assert.equal(boxes[1]!.hidden, 2)
  assert.equal(boxes[2]!.order, 4)
})

test('node problems point at the node the server would refuse', () => {
  const keys = [{ key: 'visits', type: 'number', value: 0 }]
  const t = { ...nested(), keys } as BehaviorTree
  const broken = updateNode(updateNode(t, 'a', (n) => ({ ...n, min: 9, max: 1 }) as typeof n), 'b', (n) => ({ ...n, decorators: [{ type: 'blackboard', key: 'visits', compare: 'eq', value: 'x', abort: 'none' }] }))
  const problems = nodeProblems(broken, {})
  assert.deepEqual([...problems.keys()].sort(), ['a', 'b'])
  assert.match(problems.get('a')!, /max must be at least min/)
  assert.match(problems.get('b')!, /expected a number value/)
  const lower = updateNode(t, 'c', (n) => ({ ...n, decorators: [{ type: 'has_target', invert: false, abort: 'lower' }] }))
  assert.match(nodeProblems(lower, {}).get('c')!, /child of a selector/)
  assert.equal(nodeProblems(nested(), {}).size, 0)
})

test('typed keys: conditions and Set Value must fit the key, and renaming a key follows its readers', () => {
  const withKeys = (root: unknown) => ({ name: 'T', points: [], keys: [{ key: 'mood', type: 'text', value: 'calm' }, { key: 'visits', type: 'number', value: 0 }], root })
  assert.throws(() => parseTree(withKeys({ ...wait('w'), decorators: [{ type: 'blackboard', key: 'mood', compare: 'gt', value: 'a', abort: 'none' }] }), 't'), /only compares with eq or ne/)
  assert.throws(() => parseTree(withKeys({ id: 's', type: 'set_value', decorators: [], key: 'mood', op: 'add', value: 'x' }), 't'), /add only works on a number key/)
  const t = parseTree(withKeys({ id: 's', type: 'set_value', decorators: [{ type: 'blackboard', key: 'visits', compare: 'lt', value: 3, abort: 'none' }], key: 'visits', op: 'add', value: 1 }), 't')
  const renamed = renameKey(t, 'visits', 'count')
  assert.equal((renamed.root as { key: string }).key, 'count')
  assert.equal((renamed.root.decorators[0] as { key: string }).key, 'count')
  assert.doesNotThrow(() => parseTree(renamed, 't'))
})

test('run behavior needs an existing tree whose points and keys are here, without loops', () => {
  const sub = { name: 'Sub', points: ['bench'], keys: [], root: wait('s') }
  const caller = (points: string[]) => ({ name: 'C', points, keys: [], root: { id: 'rb', type: 'run_behavior', decorators: [], tree: 'sub' } })
  assert.doesNotThrow(() => parseNpcBehavior({ version: 1, trees: { sub, caller: caller(['bench']) }, npcs: [] }))
  assert.throws(() => parseNpcBehavior({ version: 1, trees: { sub, caller: caller([]) }, npcs: [] }), /uses the point bench, missing here/)
  assert.throws(() => parseNpcBehavior({ version: 1, trees: { caller: { ...caller([]), root: { id: 'rb', type: 'run_behavior', tree: 'caller' } } }, npcs: [] }), /Run Behavior loops/)
})

test('in a tree laid out by hand, new and pasted nodes take a place and children stay ordered by x', () => {
  const placed = setPositions(nested(), new Map<string, [number, number]>([['root', [0, 0]], ['left', [-300, 120]], ['right', [300, 120]], ['a', [-400, 240]], ['b', [-200, 240]], ['c', [300, 240]]]))
  const added = addChild(placed, 'left', 'wait')
  assert.deepEqual(findNode(added.tree.root, added.id)?.pos, [-200 + 220 + 28, 240])
  const dropped = addChild(placed, 'left', 'wait', [-1000, 240])
  assert.deepEqual(childIds(dropped.tree, 'left'), [dropped.id, 'a', 'b'])
  const pasted = pasteNode(placed, 'root', findNode(placed.root, 'right')!, [-900, 0])
  assert.deepEqual(childIds((pasted as { tree: BehaviorTree }).tree, 'root'), ['right_1', 'left', 'right'])
  const swapped = moveNode(placed, 'b', -1)
  assert.deepEqual(childIds(swapped, 'left'), ['b', 'a'])
  assert.deepEqual([findNode(swapped.root, 'b')?.pos, findNode(swapped.root, 'a')?.pos], [[-400, 240], [-200, 240]])
})
