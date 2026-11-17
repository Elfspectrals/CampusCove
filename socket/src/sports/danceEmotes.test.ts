import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/dance.json', import.meta.url), 'utf8'))
installWorld()
const emotes = await import('./danceEmotes.ts')
const loaded = emotes.parseEmoteRules(RULES)
emotes.setEmoteRules(loaded)
const NOW = 9_000_000
const notBusy = () => false

test('four free dances, three unlocked by the songs_danced tiers', () => {
  assert.deepEqual(loaded.free.map((e) => e.id), ['bounce', 'sway', 'robot', 'shuffle'])
  assert.deepEqual(emotes.allowedEmotes(loaded, new Map()), ['bounce', 'sway', 'robot', 'shuffle'])
  assert.deepEqual(emotes.allowedEmotes(loaded, new Map([['songs_danced', [1, 2]]])), ['bounce', 'sway', 'robot', 'shuffle', 'spin', 'disco'])
  assert.throws(() => emotes.parseEmoteRules({ ...RULES, freeEmotes: [] }), /freeEmotes/)
  assert.throws(() => emotes.parseEmoteRules({ ...RULES, unlockableEmotes: [{ id: 'x', clip: 'X', task: 't', tier: 4 }] }), /unlockableEmotes/)
})

test('a free dance is broadcast, a step past 25 cm stops it', async () => {
  const [a, b] = await Promise.all([makePlayer(301, 0, 0), makePlayer(302, 2, 0)])
  const room = await fakeRoom([a, b])
  await emotes.onEmotePlay(room, clientOf(room, a), { emote: 'sway' }, notBusy, NOW)
  assert.deepEqual(sentOf(clientOf(room, b), 'user_emote'), [{ sessionId: a.sessionId, emote: 'sway' }])
  a.x = 0.2
  emotes.moveEmote(room, a)
  assert.equal(sentOf(clientOf(room, b), 'user_emote').length, 1)
  a.x = 0.3
  emotes.moveEmote(room, a)
  assert.deepEqual(sentOf(clientOf(room, b), 'user_emote').at(-1), { sessionId: a.sessionId, emote: null })
})

test('a locked dance is refused until the task tier is reached, an unknown one is ignored', async () => {
  const [a] = await Promise.all([makePlayer(303, 0, 0)])
  const room = await fakeRoom([a])
  api.replies.set('GET /tasks', () => json({ tasks: [{ task: 'songs_danced', value: 3, tiers: [10, 50, 150], reached: [] }] }))
  await emotes.onEmotePlay(room, clientOf(room, a), { emote: 'spin' }, notBusy, NOW)
  assert.equal((sentOf(clientOf(room, a), 'emote_error')[0] as { code: string }).code, 'emote_locked')
  await emotes.onEmotePlay(room, clientOf(room, a), { emote: 'moonwalk' }, notBusy, NOW + 1000)
  assert.equal(sentOf(clientOf(room, a), 'user_emote').length, 0)

  const [c] = await Promise.all([makePlayer(304, 0, 0)])
  const room2 = await fakeRoom([c])
  api.replies.set('GET /tasks', () => json({ tasks: [{ task: 'songs_danced', value: 12, tiers: [10, 50, 150], reached: [1] }] }))
  await emotes.onEmotePlay(room2, clientOf(room2, c), { emote: 'spin' }, notBusy, NOW)
  assert.deepEqual(sentOf(clientOf(room2, c), 'user_emote'), [{ sessionId: c.sessionId, emote: 'spin' }])
  await emotes.onEmoteList(room2, clientOf(room2, c), NOW + 1000)
  assert.deepEqual(sentOf(clientOf(room2, c), 'emote_list'), [{ unlocked: ['bounce', 'sway', 'robot', 'shuffle', 'spin'] }])
})

test('no emote while dancing a song, and a joiner sees the dances in progress', async () => {
  const [a, b] = await Promise.all([makePlayer(305, 0, 0), makePlayer(306, 1, 0)])
  const room = await fakeRoom([a, b])
  await emotes.onEmotePlay(room, clientOf(room, a), { emote: 'robot' }, () => true, NOW)
  assert.equal(sentOf(clientOf(room, b), 'user_emote').length, 0)
  await emotes.onEmotePlay(room, clientOf(room, b), { emote: 'robot' }, notBusy, NOW)
  emotes.sendEmotesOnJoin(room, clientOf(room, a))
  assert.deepEqual(sentOf(clientOf(room, a), 'user_emotes'), [{ emotes: [{ sessionId: b.sessionId, emote: 'robot' }] }])
  await emotes.onEmotePlay(room, clientOf(room, b), { emote: 'bounce' }, notBusy, NOW + 100)
  assert.equal(sentOf(clientOf(room, a), 'user_emote').filter((m) => (m as { emote: string }).emote === 'bounce').length, 0)
})
