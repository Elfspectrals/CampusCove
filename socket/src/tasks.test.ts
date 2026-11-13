import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseTaskTierReached, sendTaskTierReached } from './tasks.ts'
import type { GameClient, GameRoom, Player } from './types.ts'

const valid = { accountId: 7, task: 'darts', tier: 1, threshold: 10 }

test('a tier reached from Laravel is read field by field', () => {
  assert.deepEqual(parseTaskTierReached(valid), valid)
})

test('a tier reached with a missing or wrong field is refused', () => {
  for (const body of [
    null,
    'darts',
    { ...valid, accountId: 0 },
    { ...valid, accountId: '7' },
    { ...valid, task: '' },
    { ...valid, task: 'Darts!' },
    { ...valid, tier: 0 },
    { ...valid, tier: 4 },
    { ...valid, tier: 1.5 },
    { ...valid, threshold: 0 },
  ]) {
    assert.equal(parseTaskTierReached(body), null, JSON.stringify(body))
  }
})

test('only the clients of that account hear that their tier is reached', () => {
  const sent: Array<{ sessionId: string, type: string, payload: unknown }> = []
  const client = (sessionId: string) => ({ sessionId, send: (type: string, payload: unknown) => sent.push({ sessionId, type, payload }) }) as unknown as GameClient
  const room = {
    clients: [client('a'), client('b')],
    players: new Map([['a', { accountId: 7 } as Player], ['b', { accountId: 8 } as Player]]),
  } as unknown as GameRoom

  sendTaskTierReached(room, { accountId: 7, task: 'darts', tier: 1, threshold: 10 })

  assert.deepEqual(sent, [{ sessionId: 'a', type: 'task_done', payload: { task: 'darts', tier: 1, threshold: 10 } }])
})
