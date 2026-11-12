import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseNpcBehavior, parseTree, farPoints, type BehaviorTree } from './npcBehavior.ts'
import { addChild, findNode, layoutTree, moveNode, removeNode, removePoint, renamePoint, setCompositeType, updateNode } from './npcTreeEdit.ts'

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
