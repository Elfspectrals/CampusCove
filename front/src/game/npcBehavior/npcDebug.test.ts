import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debugView, type NpcDebugEntry } from './npcDebug.ts'

const entry = (id: string): NpcDebugEntry => ({
  id,
  active: ['root', 'rb', 'rb/greet', 'rb/greet/hi'],
  results: { wait_1: { status: 'success', at: 900 }, 'rb/hi': { status: 'failure', at: 950 }, rb: { status: 'failure', at: 500 } },
  values: { visits: 2 },
  target: null,
  clip: 'idle',
  say: null,
})

test('the debug view lights a Run Behavior node for what runs inside it and keeps only the shown tree results', () => {
  const view = debugView({ now: 1000, instances: [{ roomId: 'r1', npcs: [entry('orchard/p4')] }] }, 'orchard/p4')!
  assert.deepEqual([...view.active].sort(), ['rb', 'root'])
  assert.deepEqual([...view.results.keys()].sort(), ['rb', 'wait_1'])
  assert.equal(view.roomId, 'r1')
})

test('the first instance running the NPC wins, none gives null', () => {
  const response = { now: 0, instances: [{ roomId: 'a', npcs: [] }, { roomId: 'b', npcs: [entry('z/n')] }, { roomId: 'c', npcs: [entry('z/n')] }] }
  assert.equal(debugView(response, 'z/n')!.roomId, 'b')
  assert.equal(debugView(response, 'z/other'), null)
})
