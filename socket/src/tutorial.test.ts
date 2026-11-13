import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTutorialChange, parseTutorialChange } from './tutorial.ts'
import type { GameClient, GameRoom, Player } from './types.ts'

test('a tutorial change from Laravel is read field by field', () => {
  assert.deepEqual(parseTutorialChange({ accountId: 7, status: 'active', step: 'eat_apple' }), { accountId: 7, status: 'active', step: 'eat_apple' })
  assert.deepEqual(parseTutorialChange({ accountId: 7, status: 'done', step: null }), { accountId: 7, status: 'done', step: null })
})

test('a tutorial change with a missing or wrong field is refused', () => {
  for (const body of [
    null,
    { accountId: 0, status: 'active', step: 'eat_apple' },
    { accountId: '7', status: 'active', step: 'eat_apple' },
    { accountId: 7, status: 'active', step: 'buy_food' },
    { accountId: 7, status: 'active', step: null },
    { accountId: 7, status: 'done', step: 'play_darts' },
    { accountId: 7, status: 'paused', step: 'eat_apple' },
  ]) {
    assert.equal(parseTutorialChange(body), null, JSON.stringify(body))
  }
})

function fakeRoom() {
  const sent: Array<{ sessionId: string, type: string, payload: unknown }> = []
  const client = (sessionId: string) => ({ sessionId, send: (type: string, payload: unknown) => sent.push({ sessionId, type, payload }) }) as unknown as GameClient
  const clients = [client('a'), client('b')]
  const room = {
    clients,
    players: new Map([['a', { sessionId: 'a', accountId: 7, badges: [] } as unknown as Player], ['b', { sessionId: 'b', accountId: 8, badges: [] } as unknown as Player]]),
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c !== except).forEach(fn),
  } as unknown as GameRoom
  return { room, sent }
}

test('only that player hears a new step, and nobody gets a badge', () => {
  const { room, sent } = fakeRoom()

  applyTutorialChange(room, { accountId: 7, status: 'active', step: 'sell_apples' })

  assert.deepEqual(sent, [{ sessionId: 'a', type: 'tutorial_state', payload: { status: 'active', step: 'sell_apples' } }])
  assert.deepEqual(room.players.get('a')!.badges, [])
})

test('the end gives the badge, which the other players see once', () => {
  const { room, sent } = fakeRoom()

  applyTutorialChange(room, { accountId: 7, status: 'done', step: null })
  applyTutorialChange(room, { accountId: 7, status: 'done', step: null })

  assert.deepEqual(room.players.get('a')!.badges, ['new_citizen'])
  assert.deepEqual(sent.filter((m) => m.type === 'user_badges'), [{ sessionId: 'b', type: 'user_badges', payload: { sessionId: 'a', badges: ['new_citizen'] } }])
})
