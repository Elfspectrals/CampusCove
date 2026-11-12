import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TrackSource } from 'livekit-server-sdk'
import type { GameRoom, Player } from './types.ts'
import { createVoiceSync, onVoiceMute } from './voiceSync.ts'

function setup() {
  const players = new Map<string, Player>()
  const room = { players, housingUnits: [] } as unknown as GameRoom
  const tracks = new Map<string, string[]>()
  const calls: string[] = []
  const service = {
    listParticipants: async () => [...players.keys()].map((identity) => ({ identity, tracks: (tracks.get(identity) ?? []).map((sid) => ({ sid, source: TrackSource.MICROPHONE })) })),
    updateSubscriptions: async (_room: string, identity: string, sids: string[], subscribe: boolean) => void calls.push(`${identity} ${subscribe ? '+' : '-'}${sids.join(',')}`)
  }
  const add = (sessionId: string, x: number, mic: string | null) => {
    players.set(sessionId, { sessionId, accountId: sessionId.length, x, y: 1.6, z: 0, voiceMuted: new Set() } as unknown as Player)
    if (mic) tracks.set(sessionId, [mic])
  }
  return { room, players, tracks, calls, add, sync: createVoiceSync(room, service, 'city-1').sync }
}

test('the socket subscribes nearby players to each other and only sends changes', async () => {
  const { calls, add, sync } = setup()
  add('a', 0, 'TR_a')
  add('b', 10, 'TR_b')
  await sync()
  assert.deepEqual(calls.sort(), ['a +TR_b', 'b +TR_a'])
  calls.length = 0
  await sync()
  assert.deepEqual(calls, [])
})

test('walking away past 34 m unsubscribes', async () => {
  const { calls, add, sync, players } = setup()
  add('a', 0, 'TR_a')
  add('b', 10, 'TR_b')
  await sync()
  calls.length = 0
  players.get('b')!.x = 40
  await sync()
  assert.deepEqual(calls.sort(), ['a -TR_b', 'b -TR_a'])
})

test('a player without a mic yet is subscribed to once the mic is published', async () => {
  const { calls, add, sync, tracks } = setup()
  add('a', 0, 'TR_a')
  add('b', 10, null)
  await sync()
  assert.deepEqual(calls, ['b +TR_a'])
  calls.length = 0
  tracks.set('b', ['TR_b'])
  await sync()
  assert.deepEqual(calls, ['a +TR_b'])
})

test('a muted account is unsubscribed for the player who muted it', async () => {
  const { calls, add, sync, room } = setup()
  add('a', 0, 'TR_a')
  add('bb', 10, 'TR_bb')
  await sync()
  calls.length = 0
  onVoiceMute(room, { sessionId: 'a' } as never, { accounts: ['2'] })
  await sync()
  assert.deepEqual(calls, ['a -TR_bb'])
})

test('a mute list that is not account ids is ignored', () => {
  const { add, room, players } = setup()
  add('a', 0, null)
  onVoiceMute(room, { sessionId: 'a' } as never, { accounts: ['2', 'drop table'] })
  assert.equal(players.get('a')!.voiceMuted.size, 0)
})
