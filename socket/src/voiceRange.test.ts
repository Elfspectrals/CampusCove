import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VOICE_RANGE, VOICE_RELEASE_RANGE, desiredVoices, type VoiceListener } from './voiceRange.ts'

const player = (sessionId: string, x: number, z = 0, extra: Partial<VoiceListener> = {}): VoiceListener =>
  ({ sessionId, accountId: `acc-${sessionId}`, x, z, unit: null, muted: new Set(), ...extra })

const heard = (players: VoiceListener[], current = new Map<string, Set<string>>()) =>
  Object.fromEntries([...desiredVoices(players, current)].map(([k, v]) => [k, [...v].sort()]))

test('players hear each other at 30 m but not just past it', () => {
  assert.deepEqual(heard([player('a', 0), player('b', VOICE_RANGE)]), { a: ['b'], b: ['a'] })
  assert.deepEqual(heard([player('a', 0), player('b', VOICE_RANGE + 0.01)]), { a: [], b: [] })
})

test('a voice already heard is kept up to 34 m, then dropped', () => {
  const current = new Map([['a', new Set(['b'])]])
  assert.deepEqual(heard([player('a', 0), player('b', VOICE_RELEASE_RANGE)], current).a, ['b'])
  assert.deepEqual(heard([player('a', 0), player('b', VOICE_RELEASE_RANGE + 0.01)], current).a, [])
})

test('a muted account is never heard by the player who muted it, the other way still works', () => {
  const players = [player('a', 0, 0, { muted: new Set(['acc-b']) }), player('b', 1)]
  assert.deepEqual(heard(players), { a: [], b: ['a'] })
})

test('a wall between a house and the street cuts the voice', () => {
  const house = { id: 1 }
  assert.deepEqual(heard([player('a', 0, 0, { unit: house }), player('b', 2)]), { a: [], b: [] })
})
