import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { inlineSubtrees, parseNpcBehavior, type BehaviorTree } from './npcBehavior.ts'
import { NPC_PICK_MS, NpcBrain, PICK_STAND, WALK_SPEED, type BrainWorld } from './npcBrain.ts'
import { buildBrains, plantSource, zoneNpcHome } from './npcs.ts'

const COMMITTED = new URL('../../front/public/assets/npc/behavior.json', import.meta.url)

function treeOf(root: unknown, points: string[] = []): BehaviorTree {
  return parseNpcBehavior({ version: 1, trees: { t: { name: 'T', points, root } }, npcs: [] }).trees.get('t')!
}

const HOME = { position: [0, 0, 0] as [number, number, number], yaw: 0 }

function world(now: number, players: BrainWorld['players'] = [], hour = 12): BrainWorld {
  return { now, hour, players }
}

test('the committed behavior file passes the server checks', { skip: !existsSync(COMMITTED) }, () => {
  assert.doesNotThrow(() => parseNpcBehavior(JSON.parse(readFileSync(COMMITTED, 'utf8'))))
})

test('the server refuses fields out of range', () => {
  assert.throws(() => treeOf({ id: 'w', type: 'wait', min: 0, max: 9999 }), /from 0 to 600/)
  assert.throws(() => treeOf({ id: 'w', type: 'wait', min: 1, max: 1, speed: 'walk' }), /unknown field/)
  assert.throws(() => treeOf({ id: 's', type: 'sequence', children: [{ id: 'w', type: 'wait', min: 1, max: 1, decorators: [{ type: 'has_target', invert: false, abort: 'lower' }] }] }), /under a selector/)
})

test('a sequence walks to a point at walking speed, then waits, then starts over', () => {
  const tree = treeOf(
    { id: 's', type: 'sequence', children: [{ id: 'go', type: 'move_to', point: 'p', speed: 'walk' }, { id: 'w', type: 'wait', min: 1, max: 1 }] },
    ['p']
  )
  const brain = new NpcBrain('z/n', tree, HOME, { p: [5, 0, 0] })
  assert.equal(brain.tick(world(0)), true)
  const start = brain.state(0)
  assert.deepEqual(start.move, { x: 5, y: 0, z: 0, ms: (5 / WALK_SPEED) * 1000 })
  assert.equal(start.ry, Math.PI / 2)
  const arrive = (5 / WALK_SPEED) * 1000
  assert.equal(brain.state(arrive / 2).x, 2.5)
  brain.tick(world(arrive))
  assert.equal(brain.state(arrive).move, null)
  assert.equal(brain.state(arrive).x, 5)
  brain.tick(world(arrive + 1000))
  assert.equal(brain.state(arrive + 1000).x, 5, 'already there: the restarted move succeeds at once')
})

const greeter = () =>
  treeOf({
    id: 'root',
    type: 'selector',
    services: [{ type: 'perceive_players', radius: 5, interval: 0.25 }],
    children: [
      {
        id: 'greet',
        type: 'sequence',
        decorators: [{ type: 'has_target', invert: false, abort: 'both' }],
        children: [{ id: 'look', type: 'face', point: 'target' }, { id: 'hi', type: 'say', lines: ['Hi!'], seconds: 3 }]
      },
      { id: 'idle', type: 'animate', clip: 'sit', seconds: 60 }
    ]
  })

test('a player walking up interrupts the lower branch (abort lower) and gets greeted', () => {
  const brain = new NpcBrain('z/n', greeter(), HOME, {})
  brain.tick(world(0))
  assert.equal(brain.state(0).clip, 'sit')
  brain.tick(world(500, [{ sessionId: 'a', x: 0, z: 10 }]))
  assert.equal(brain.state(500).clip, 'sit', 'out of range: still sitting')
  brain.tick(world(1000, [{ sessionId: 'a', x: 0, z: -3 }]))
  const greeted = brain.state(1000)
  assert.equal(greeted.say, 'Hi!')
  assert.equal(greeted.clip, 'idle', 'the sit was aborted')
  assert.equal(greeted.ry, Math.PI)
})

test('the player leaving aborts the greeting (abort self)', () => {
  const brain = new NpcBrain('z/n', greeter(), HOME, {})
  brain.tick(world(0, [{ sessionId: 'a', x: 2, z: 0 }]))
  assert.equal(brain.state(0).say, 'Hi!')
  brain.tick(world(1000, []))
  assert.equal(brain.state(1000).clip, 'sit')
})

test('cooldown, chance and loop decorators', () => {
  const tree = treeOf({
    id: 'root',
    type: 'selector',
    children: [
      { id: 'eat', type: 'animate', clip: 'eat', seconds: 1, decorators: [{ type: 'loop', count: 2 }, { type: 'cooldown', seconds: 10 }] },
      { id: 'wait', type: 'wait', min: 1, max: 1 }
    ]
  })
  const brain = new NpcBrain('z/n', tree, HOME, {})
  brain.tick(world(0))
  const first = brain.state(0).clipSeq
  brain.tick(world(1000))
  brain.tick(world(1100))
  assert.equal(brain.state(1100).clipSeq, first + 1, 'the loop plays the clip a second time')
  brain.tick(world(2100))
  assert.equal(brain.state(2100).clip, 'idle', 'cooling down: the selector falls to wait')
  brain.tick(world(3100))
  brain.tick(world(3200))
  assert.equal(brain.state(3200).clip, 'idle', 'still cooling down')
  brain.tick(world(12100))
  brain.tick(world(12200))
  assert.equal(brain.state(12200).clip, 'eat')

  const never = treeOf({ id: 's', type: 'selector', children: [{ id: 'eat', type: 'animate', clip: 'eat', seconds: 1, decorators: [{ type: 'chance', percent: 50 }] }, { id: 'w', type: 'wait', min: 1, max: 1 }] })
  const unlucky = new NpcBrain('z/n', never, HOME, {}, { random: () => 0.9 })
  unlucky.tick(world(0))
  assert.equal(unlucky.state(0).clip, 'idle')
})

test('time of day wraps past midnight', () => {
  const tree = treeOf({ id: 'a', type: 'animate', clip: 'sit', seconds: 1, decorators: [{ type: 'time_of_day', from: 22, to: 6, invert: false, abort: 'none' }] })
  const night = new NpcBrain('z/n', tree, HOME, {})
  night.tick(world(0, [], 2))
  assert.equal(night.state(0).clip, 'sit')
  const day = new NpcBrain('z/n', tree, HOME, {})
  day.tick(world(0, [], 12))
  assert.equal(day.state(0).clip, 'idle')
})

test('only free NPCs get a brain, and their points stay near them', () => {
  const decor = {
    props: [
      { kind: 'npc', id: 'free', position: [0, 0, 0], yaw: 1 },
      { kind: 'npc', id: 'nurse', role: 'nurse', position: [0, 0, 0] },
      { kind: 'npc', id: 'clerk', position: [0, 0, 0] }
    ],
    areas: [{ npc: 'clerk' }]
  }
  assert.deepEqual(zoneNpcHome('z', decor, 'free'), { position: [0, 0, 0], yaw: 1 })
  assert.throws(() => zoneNpcHome('z', decor, 'nurse'), /staff/)
  assert.throws(() => zoneNpcHome('z', decor, 'clerk'), /sale area/)
  assert.throws(() => zoneNpcHome('z', decor, 'ghost'), /no NPC/)
  const file = parseNpcBehavior({ version: 1, trees: { t: { name: 'T', points: ['p'], root: { id: 'w', type: 'wait', min: 1, max: 1 } } }, npcs: [{ zone: 'z', npc: 'free', tree: 't', points: { p: [90, 0, 0] } }] })
  assert.throws(() => buildBrains(file, new Map([['z', decor]])), /over 60 m/)
})

test('pick crop walks to a plant of the kind within the radius, faces it, then picks', () => {
  const plants = plantSource(
    [
      { x: 10, y: 0, z: 0, crop: 'corn' },
      { x: 0, y: 0, z: 50, crop: 'corn' },
      { x: 0, y: 0, z: 8, crop: 'potato' }
    ],
    [{ x: -6, y: 0, z: 0 }]
  )
  const tree = treeOf({ id: 'p', type: 'pick_crop', crop: 'corn', radius: 20, speed: 'walk' })
  const brain = new NpcBrain('z/n', tree, HOME, {}, { random: () => 0.99, plants })
  brain.tick(world(0))
  const walk = brain.state(0)
  assert.equal(walk.move?.x, 10 - PICK_STAND.crop, 'the corn 50 m away and the potato are not candidates')
  assert.equal(walk.clip, 'idle')
  const arrive = walk.move!.ms
  brain.tick(world(arrive))
  const picking = brain.state(arrive)
  assert.equal(picking.clip, 'pick')
  assert.equal(picking.ry, Math.PI / 2, 'facing the plant')
  brain.tick(world(arrive + NPC_PICK_MS - 100))
  assert.equal(brain.state(arrive + NPC_PICK_MS - 100).clip, 'pick')
  brain.tick(world(arrive + NPC_PICK_MS))
  assert.equal(brain.state(arrive + NPC_PICK_MS).clip, 'idle', 'done: the root starts over')

  const orchard = new NpcBrain('z/n', treeOf({ id: 'p', type: 'pick_crop', crop: 'apple_tree', radius: 20, speed: 'walk' }), HOME, {}, { random: () => 0, plants })
  orchard.tick(world(0))
  assert.equal(orchard.state(0).move?.x, -6 + PICK_STAND.tree, 'trees are picked from the trunk')

  const nothing = new NpcBrain('z/n', treeOf({ id: 'p', type: 'pick_crop', crop: 'pumpkin', radius: 20, speed: 'walk' }), HOME, {}, { random: () => 0, plants })
  nothing.tick(world(0))
  assert.equal(nothing.state(0).move, null, 'no pumpkin around: the task fails, nobody walks')
})

function fileOf(trees: Record<string, unknown>) {
  return parseNpcBehavior({ version: 1, trees, npcs: [] })
}

test('blackboard keys are typed: compare, add and values must fit the key', () => {
  const withKeys = (root: unknown) => ({ name: 'T', points: ['spot'], keys: [{ key: 'mood', type: 'text', value: 'calm' }, { key: 'tired', type: 'bool', value: false }, { key: 'visits', type: 'number', value: 0 }], root })
  const guard = (d: unknown) => ({ id: 'w', type: 'wait', min: 1, max: 1, decorators: [d] })
  assert.doesNotThrow(() => fileOf({ t: withKeys(guard({ type: 'blackboard', key: 'visits', compare: 'ge', value: 2, abort: 'none' })) }))
  assert.throws(() => fileOf({ t: withKeys(guard({ type: 'blackboard', key: 'mood', compare: 'lt', value: 'x', abort: 'none' })) }), /only compares with eq or ne/)
  assert.throws(() => fileOf({ t: withKeys(guard({ type: 'blackboard', key: 'tired', compare: 'eq', value: 1, abort: 'none' })) }), /expected a bool value/)
  assert.throws(() => fileOf({ t: withKeys(guard({ type: 'blackboard', key: 'nope', compare: 'eq', value: 1, abort: 'none' })) }), /blackboard key of the tree/)
  assert.throws(() => fileOf({ t: withKeys({ id: 's', type: 'set_value', key: 'tired', op: 'add', value: true }) }), /add only works on a number key/)
  assert.throws(() => fileOf({ t: { ...withKeys({ id: 'w', type: 'wait', min: 1, max: 1 }), keys: [{ key: 'spot', type: 'bool', value: true }] } }), /already a point/)
})

test('set value adds to a number and a blackboard condition reads it', () => {
  const tree = fileOf({
    t: {
      name: 'T',
      points: [],
      keys: [{ key: 'visits', type: 'number', value: 0 }],
      root: {
        id: 'root',
        type: 'selector',
        children: [
          { id: 'again', type: 'say', lines: ['Again?'], seconds: 3, decorators: [{ type: 'blackboard', key: 'visits', compare: 'ge', value: 2, abort: 'none' }] },
          { id: 'count', type: 'sequence', children: [{ id: 'add', type: 'set_value', key: 'visits', op: 'add', value: 1 }, { id: 'w', type: 'wait', min: 1, max: 1 }] }
        ]
      }
    }
  }).trees.get('t')!
  const brain = new NpcBrain('z/n', tree, HOME, {})
  brain.tick(world(0))
  assert.equal(brain.debug().values.visits, 1)
  brain.tick(world(1000))
  brain.tick(world(1100))
  assert.equal(brain.debug().values.visits, 2, 'the root starts over on the tick after it finished')
  assert.equal(brain.state(1100).say, null)
  brain.tick(world(2100))
  brain.tick(world(2200))
  assert.equal(brain.state(2200).say, 'Again?')
  assert.equal(brain.debug().values.visits, 2)
})

test('a blackboard condition with abort self stops its node as soon as the value changes', () => {
  const tree = fileOf({
    t: {
      name: 'T',
      points: [],
      keys: [{ key: 'done', type: 'bool', value: false }],
      root: {
        id: 'root',
        type: 'selector',
        children: [
          {
            id: 'once',
            type: 'sequence',
            decorators: [{ type: 'blackboard', key: 'done', compare: 'eq', value: false, abort: 'self' }],
            children: [{ id: 'mark', type: 'set_value', key: 'done', op: 'set', value: true }, { id: 'long', type: 'wait', min: 5, max: 5 }]
          },
          { id: 'idle', type: 'wait', min: 10, max: 10 }
        ]
      }
    }
  }).trees.get('t')!
  const brain = new NpcBrain('z/n', tree, HOME, {})
  brain.tick(world(0))
  assert.ok(brain.debug().active.includes('long'))
  brain.tick(world(100))
  const debug = brain.debug()
  assert.deepEqual(debug.active, ['root', 'idle'])
  assert.equal(debug.results.once?.status, 'failure')
})

test('run behavior inlines the other tree under the node id, and refuses loops and missing keys', () => {
  const greet = { name: 'Greet', points: [], keys: [{ key: 'polite', type: 'bool', value: true }], root: { id: 'hi', type: 'say', lines: ['Hi!'], seconds: 2 } }
  const main = { name: 'Main', points: [], keys: [{ key: 'polite', type: 'bool', value: true }], root: { id: 'root', type: 'sequence', children: [{ id: 'rb', type: 'run_behavior', tree: 'greet' }] } }
  const file = fileOf({ greet, main })
  const brain = new NpcBrain('z/n', inlineSubtrees(file.trees.get('main')!, file.trees), HOME, {})
  brain.tick(world(0))
  assert.equal(brain.state(0).say, 'Hi!')
  assert.deepEqual(brain.debug().active, ['root', 'rb', 'rb/hi'])
  assert.throws(() => fileOf({ main: { ...main, keys: [] }, greet }), /uses the bool key polite, missing here/)
  assert.throws(() => fileOf({ main, greet: { ...greet, root: { id: 'back', type: 'run_behavior', tree: 'main' } } }), /Run Behavior loops/)
  assert.throws(() => fileOf({ main }), /no tree "greet"/)
})

test('editor card positions are accepted and never reach the brain', () => {
  const tree = treeOf({ id: 'w', type: 'wait', min: 1, max: 1, pos: [120, -40] })
  assert.equal('pos' in tree.root, false)
  assert.throws(() => treeOf({ id: 'w', type: 'wait', min: 1, max: 1, pos: [1] }), /expected \[x, y\]/)
})
