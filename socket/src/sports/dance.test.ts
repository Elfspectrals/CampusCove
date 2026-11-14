import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/dance.json', import.meta.url), 'utf8'))
const STUDIO = { minX: -398, maxX: -372, minZ: -210, maxZ: -191 }
manifest.zones.push({ key: 'sports_dance', sportsPass: true, bounds: STUDIO })
api.files.set('sports/rules/dance.json', RULES)
installWorld()
const { loadWorld } = await import('../world.ts')
const venues = await import('./venues.ts')
const dance = await import('./dance.ts')
await loadWorld()
await dance.loadDanceVenue()
venues.assertVenueZones()

const NOW = 7_000_000
const [COACH_X, COACH_Z] = RULES.venue.coach as [number, number]

interface Start { startAt: number, notes: [number, number][], dancers: { sessionId: string }[], bpm: number }
interface Judge { sessionId: string, judgement: string, score: number, combo: number, synced: boolean, teamScore: number | null }

async function studio(count: number): Promise<{ room: FakeRoom, players: Player[] }> {
  const players = await Promise.all(Array.from({ length: count }, (_, i) => makePlayer(200 + i, COACH_X - 1, COACH_Z)))
  for (const p of players) p.sportsPassUntil = NOW * 10
  return { room: await fakeRoom(players), players }
}

async function signup(room: FakeRoom, p: Player, settings: Record<string, string> | undefined, at: number) {
  await venues.onSportsSignup(room, clientOf(room, p), { coach: dance.DANCE_VENUE, venue: dance.DANCE_VENUE, ...(settings ? { settings } : {}) }, at)
}

test('a solo song: kickoff at once, dancer on the first spot, socket judges and records the result', async () => {
  api.calls.length = 0
  api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
  const { room, players: [p] } = await studio(1)
  await signup(room, p, { mode: 'solo', song: 'cove_groove', difficulty: 'easy' }, NOW)
  venues.tickSports(room, NOW)
  const [start] = sentOf(clientOf(room, p), 'dance_start') as Start[]
  assert.equal(start.startAt, NOW + RULES.leadInMs)
  assert.equal(start.bpm, 112)
  assert.deepEqual([p.x, p.z], RULES.venue.spots[0])

  const [t, lane] = start.notes[0]
  dance.onDancePress(room, clientOf(room, p), { lane }, start.startAt + t + 100)
  dance.onDancePress(room, clientOf(room, p), { lane: 'x' }, start.startAt + t + 300)
  const judged = sentOf(clientOf(room, p), 'dance_judge') as Judge[]
  assert.deepEqual(judged.map((j) => [j.judgement, j.score, j.combo]), [['perfect', 300, 1]])

  const end = start.startAt + RULES.songs[1].lengthSec * 1000 + 1000
  venues.tickSports(room, end)
  const misses = (sentOf(clientOf(room, p), 'dance_judge') as Judge[]).filter((j) => j.judgement === 'miss')
  assert.equal(misses.length, start.notes.length - 1)
  const [result] = sentOf(clientOf(room, p), 'dance_end') as { dancers: { score: number, result: string, fullCombo: boolean }[] }[]
  assert.deepEqual(result.dancers.map((d) => [d.score, d.result, d.fullCombo]), [[300, 'finished', false]])
  assert.equal(room.sports.matches.size, 0)
  await new Promise((resolve) => setImmediate(resolve))
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { sport: string, players: { result: string, score: number }[] }
  assert.equal(record.sport, 'dance')
  assert.deepEqual(record.players.map((r) => [r.result, r.score]), [['finished', 300]])
})

test('a press from someone not dancing is ignored', async () => {
  const { room, players: [a, b] } = await studio(2)
  await signup(room, a, { mode: 'solo', song: 'harbour_sway', difficulty: 'normal' }, NOW)
  venues.tickSports(room, NOW)
  const [start] = sentOf(clientOf(room, a), 'dance_start') as Start[]
  assert.equal(sentOf(clientOf(room, b), 'dance_start').length, 1)
  const [t, lane] = start.notes[0]
  dance.onDancePress(room, clientOf(room, b), { lane }, start.startAt + t)
  assert.equal(sentOf(clientOf(room, b), 'dance_judge').length, 0)
  venues.endMatch(room, dance.DANCE_VENUE, { reason: 'finished' }, NOW + 1)
})

test('team mode: two dancers hitting the same note share the sync bonus', async () => {
  const { room, players: [a, b] } = await studio(2)
  await signup(room, a, { mode: 'team', song: 'night_sprint', difficulty: 'hard' }, NOW)
  await signup(room, b, undefined, NOW + 1000)
  venues.tickSports(room, NOW + 1000 + 60_000)
  const [start] = sentOf(clientOf(room, a), 'dance_start') as Start[]
  assert.equal(start.dancers.length, 2)
  const [t, lane] = start.notes[0]
  dance.onDancePress(room, clientOf(room, a), { lane }, start.startAt + t)
  dance.onDancePress(room, clientOf(room, b), { lane }, start.startAt + t + 20)
  const last = (sentOf(clientOf(room, a), 'dance_judge') as Judge[]).at(-1) as Judge
  assert.equal(last.synced, true)
  assert.equal(last.teamScore, 600 + RULES.syncBonus)
  venues.endMatch(room, dance.DANCE_VENUE, { reason: 'finished' }, start.startAt + t + 30)
})

test('rules whose song options do not match the songs are refused at boot', () => {
  const bad = structuredClone(RULES)
  bad.signup.settings[1].options = ['cove_groove']
  assert.throws(() => dance.registerDanceVenue(bad), /song options/)
})
