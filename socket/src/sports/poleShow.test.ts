import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { api, clientOf, fakeRoom, installWorld, makePlayer, manifest, sentOf } from './testWorld.ts'

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/dance.json', import.meta.url), 'utf8'))
const STUDIO = { minX: -398, maxX: -372, minZ: -210, maxZ: -191 }
const STAGE = [90, -2.7, -140]
const BASEMENT_EYE_Y = -3 + 1.6
manifest.zones.push({ key: 'sports_dance', sportsPass: true, bounds: STUDIO })
;(manifest as Record<string, unknown>).pub = {
  bartender: [90, 0, -138], bartenderYaw: 0, bouncer: [100, 0, -142], quizmaster: [91, 0.2, -123.5],
  counter: [90, 0, -135], taps: [90, 1.05, -137], serve: [91, 1.05, -136], bell: [92, 1.9, -137],
  secretDoor: { position: [102, 0, -142], yaw: 0 },
  secretRoom: { minX: 100, maxX: 108, minZ: -150, maxZ: -143 },
  basement: { minX: 86, maxX: 108, minZ: -150, maxZ: -130, floorY: -3 },
  stage: STAGE,
  seats: [{ id: 'stool_01', kind: 'stool', position: [88, 0.72, -134], yaw: 0 }],
  darts: { board: [84, 1.73, -142], boardYaw: 0, oche: [84, 0, -139.6] },
  shots: { plank: [95, 1.05, -136], yaw: 0, player: [95, 0, -135] }
}
manifest.zones.push({ key: 'pub', bounds: { minX: 40, maxX: 140, minZ: -180, maxZ: -80 } })
api.files.set('sports/rules/dance.json', RULES)
installWorld()
const { loadWorld } = await import('../world.ts')
const dance = await import('./dance.ts')
const pole = await import('./poleShow.ts')
await loadWorld()
await dance.loadDanceVenue()

const NOW = 9_000_000

interface Start { startAt: number, venue: string, notes: [number, number][], focus: [number, number] }
interface Judge { judgement: string, score: number, combo: number }

async function onStage(x: number, eyeY: number, accountId = 300): Promise<{ room: Awaited<ReturnType<typeof fakeRoom>>, player: Player }> {
  const player = await makePlayer(accountId, x, STAGE[2])
  player.y = eyeY
  return { room: await fakeRoom([player]), player }
}

test('a solo show starts only on the lounge stage and puts the dancer on it', async () => {
  const away = await onStage(100, BASEMENT_EYE_Y)
  pole.onPoleShowStart(away.room, clientOf(away.room, away.player), NOW)
  assert.equal(sentOf(clientOf(away.room, away.player), 'dance_start').length, 0)

  const upstairs = await onStage(STAGE[0], 1.6)
  pole.onPoleShowStart(upstairs.room, clientOf(upstairs.room, upstairs.player), NOW)
  assert.equal(sentOf(clientOf(upstairs.room, upstairs.player), 'dance_start').length, 0)

  const { room, player } = await onStage(STAGE[0] + 1, BASEMENT_EYE_Y)
  pole.onPoleShowStart(room, clientOf(room, player), NOW)
  const [start] = sentOf(clientOf(room, player), 'dance_start') as Start[]
  assert.equal(start.venue, pole.POLE_SHOW_VENUE)
  assert.equal(start.startAt, NOW + RULES.leadInMs)
  assert.deepEqual([player.x, player.z], [STAGE[0], STAGE[2]])
  assert.deepEqual(start.focus, [97, -140])
})

test('the socket judges the presses, a second start is ignored and the show ends with its result', async () => {
  const { room, player } = await onStage(STAGE[0], BASEMENT_EYE_Y, 301)
  const client = clientOf(room, player)
  pole.onPoleShowStart(room, client, NOW)
  pole.onPoleShowStart(room, client, NOW + 1)
  const starts = sentOf(client, 'dance_start') as Start[]
  assert.equal(starts.length, 1)

  const [t, lane] = starts[0].notes[0]
  assert.equal(pole.onPoleShowPress(client, { lane }, starts[0].startAt + t + 100), true)
  const judged = sentOf(client, 'dance_judge') as Judge[]
  assert.deepEqual(judged.map((j) => [j.judgement, j.score, j.combo]), [['perfect', 300, 1]])

  pole.tickPoleShows(room, starts[0].startAt + RULES.songs[1].lengthSec * 1000 + 1000)
  const [end] = sentOf(client, 'dance_end') as { venue: string, dancers: { score: number, result: string }[] }[]
  assert.deepEqual([end.venue, end.dancers[0].score, end.dancers[0].result], [pole.POLE_SHOW_VENUE, 300, 'finished'])
  assert.equal(pole.onPoleShowPress(client, { lane }, NOW), false)
})

test('walking out of the lounge ends the show', async () => {
  const { room, player } = await onStage(STAGE[0], BASEMENT_EYE_Y, 302)
  const client = clientOf(room, player)
  pole.onPoleShowStart(room, client, NOW)
  player.y = 1.6
  pole.tickPoleShows(room, NOW + 1000)
  assert.equal(sentOf(client, 'dance_end').length, 1)
})
