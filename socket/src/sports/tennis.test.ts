import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { type Match, joinLobby, openLobby, startMatch } from './signup.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
await loadWorld()
const tennis = await import('./tennis.ts')
const C = await import('./tennisConstants.ts')
const { tossPeak } = await import('./tennisRally.ts')

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/tennis.json', import.meta.url), 'utf8'))
const [COURT_1] = C.TENNIS_COURTS
const T0 = 9_000_000

async function singles(format = 'short_set_4'): Promise<{ room: FakeRoom, match: Match, red: Player, blue: Player }> {
  const red = await makePlayer(1, COURT_1.cx, C.TENNIS_NET_Z + 5)
  const blue = await makePlayer(2, COURT_1.cx, C.TENNIS_NET_Z - 5)
  const room = await fakeRoom([red, blue])
  const settings = { mode: 'singles', format }
  const lobby = openLobby(COURT_1.id, C.TENNIS_COACH.id, settings, tennis.playersFor(settings), { sessionId: red.sessionId, accountId: 1, name: 'P1', team: 'red' }, T0)
  joinLobby(lobby, { sessionId: blue.sessionId, accountId: 2, name: 'P2', team: 'blue' }, T0)
  const match = startMatch(lobby, 'match-1', 'tennis', T0)
  room.sports.matches.set(COURT_1.id, match)
  return { room, match, red, blue }
}

function phaseOf(game: { rally: { phase: string } }): string {
  return game.rally.phase
}

function lastState(room: FakeRoom, player: Player): Record<string, unknown> {
  return sentOf(clientOf(room, player), 'tennis_state').at(-1) as Record<string, unknown>
}

test('the rules file says what the socket plays', () => {
  assert.equal(RULES.status, 'ready')
  assert.equal(RULES.zone, C.TENNIS_ZONE)
  assert.equal(RULES.coachId, C.TENNIS_COACH.id)
  assert.deepEqual(RULES.signup.settings, tennis.TENNIS_SETTINGS)
  assert.deepEqual(RULES.courts.map((c: { id: string, centre: number[] }) => [c.id, c.centre[0], c.centre[2]]), C.TENNIS_COURTS.map((c) => [c.id, c.cx, C.TENNIS_NET_Z]))
  assert.deepEqual(RULES.players, { singles: tennis.playersFor({ mode: 'singles' }).max, doubles: tennis.playersFor({ mode: 'doubles' }).max })
  assert.deepEqual(RULES.ball, { radiusM: C.BALL_RADIUS, restitution: C.RESTITUTION, bounceKeep: C.BOUNCE_KEEP, drag: 0, gravity: C.GRAVITY })
  assert.deepEqual([RULES.hit.windowMs, RULES.hit.reachM, RULES.hit.sweetSpotM, RULES.hit.maxHeightM, RULES.hit.missM], [C.HIT_ALLOWANCE_MS, C.REACH_M, C.SWEET_M, C.HIT_MAX_HEIGHT, C.MISS_M])
  assert.deepEqual([RULES.hit.driveSpeedMs, RULES.lob.speedMs, RULES.serve.speedMs], [C.DRIVE_SPEED, C.LOB_SPEED, C.SERVE_SPEED])
  assert.deepEqual([RULES.serve.tossStartY, RULES.serve.tossSpeedMs, RULES.serve.windowMs, RULES.serve.autoTossAfterMs], [C.TOSS_START_Y, C.TOSS_SPEED, C.SERVE_WINDOW_MS, C.SERVE_WAIT_MS])
  assert.equal(RULES.rejoinGraceSec * 1000, C.REJOIN_GRACE_MS)
  assert.deepEqual(RULES.gear, [tennis.TENNIS_GEAR])
})

test('the two courts and the coach between them sit inside the venue footprint', () => {
  const footprint = { minX: -467, maxX: -420, minZ: -293, maxZ: -250 }
  for (const { cx } of C.TENNIS_COURTS) {
    const area = tennis.playAreaFor(cx)
    assert.ok(area.minX > footprint.minX && area.maxX < footprint.maxX && area.minZ > footprint.minZ && area.maxZ < footprint.maxZ)
    assert.ok(Math.abs(C.TENNIS_COACH.x - cx) > C.DOUBLES_HALF_WIDTH + C.PLAY_AREA_SIDE_MARGIN)
  }
})

test('kick-off puts each side on its baseline and the serving team server waits with the ball', async () => {
  const { room, match, red, blue } = await singles()
  tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  assert.equal(red.z, C.TENNIS_NET_Z + C.COURT_HALF_LENGTH + C.BASELINE_STANDBY_M)
  assert.equal(blue.z, C.TENNIS_NET_Z - C.COURT_HALF_LENGTH - C.BASELINE_STANDBY_M)
  assert.equal((sentOf(clientOf(room, red), 'position_correction')[0] as { reason: string }).reason, 'tennis_kickoff')
  const state = lastState(room, red)
  assert.deepEqual([state.phase, state.server, state.serving, state.points], ['serve_wait', blue.sessionId, 'blue', { red: '0', blue: '0' }])
})

test('a full point: toss, serve on the socket clock, two bounces, 0-15, then the next serve', async () => {
  const { room, match, red, blue } = await singles()
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }
  tennis.onTennisHit(room, clientOf(room, red), aim, T0 + 10)
  assert.equal(phaseOf(game), 'serve_wait')
  tennis.onTennisHit(room, clientOf(room, blue), aim, T0 + 10)
  assert.equal(phaseOf(game), 'toss')
  const peak = tossPeak((game.rally as { ball: Parameters<typeof tossPeak>[0] }).ball)
  tennis.onTennisHit(room, clientOf(room, blue), aim, peak)
  assert.equal(phaseOf(game), 'flight')
  assert.equal(lastState(room, red).phase, 'flight')
  for (let t = peak; phaseOf(game) === 'flight'; t += 100) tennis.runTennis(room, match, t)
  const point = game.rally as { phase: string, winner: string, call: string, until: number }
  assert.deepEqual([point.phase, point.winner, point.call], ['point', 'blue', 'double_bounce'])
  assert.deepEqual(lastState(room, blue).points, { red: '0', blue: '15' })
  tennis.runTennis(room, match, point.until)
  assert.deepEqual([phaseOf(game), lastState(room, red).server], ['serve_wait', blue.sessionId])
})

test('hits are rate-limited and malformed hits are ignored', async () => {
  const { room, match, blue } = await singles()
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  tennis.onTennisHit(room, clientOf(room, blue), { aimX: 'x', aimZ: 0 }, T0)
  tennis.onTennisHit(room, clientOf(room, blue), { aimX: 0, aimZ: Number.NaN }, T0)
  tennis.onTennisHit(room, clientOf(room, blue), { aimX: 0, aimZ: 0, lob: 'yes' }, T0)
  assert.equal(game.rally.phase, 'serve_wait')
  tennis.onTennisHit(room, clientOf(room, blue), { aimX: 0, aimZ: 0 }, T0)
  assert.equal(game.rally.phase, 'toss')
  const toss = game.rally
  tennis.onTennisHit(room, clientOf(room, blue), { aimX: 0, aimZ: 0 }, T0 + C.TENNIS_HIT_COOLDOWN_MS - 1)
  assert.equal(game.rally, toss)
})

test('the match ends after the winning point pause and is recorded with the games of each side', async () => {
  const { room, match } = await singles()
  const game = tennis.startTennis(room, match, COURT_1.cx, 'red', T0)
  game.score.games = { red: 4, blue: 1 }
  game.score.winner = 'red'
  game.rally = { phase: 'point', winner: 'red', call: 'out', ball: null, until: T0 + 100 }
  api.calls.length = 0
  tennis.runTennis(room, match, T0 + 50)
  assert.ok(room.sports.matches.has(COURT_1.id))
  tennis.runTennis(room, match, T0 + 100)
  assert.equal(room.sports.matches.has(COURT_1.id), false)
  assert.equal(tennis.tennisGame(room, COURT_1.id), null)
  await new Promise((resolve) => setTimeout(resolve, 0))
  const call = api.calls.find((c) => c.url === '/sports/matches')
  assert.deepEqual((call?.body as { players: unknown[] }).players, [
    { accountId: 1, team: 'red', result: 'win', score: 4 },
    { accountId: 2, team: 'blue', result: 'loss', score: 1 }
  ])
})

test('results: a forfeit gives the win to the side still on court, a leaver past the grace did not finish', async () => {
  const { room, match } = await singles('tiebreak_7')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'red', T0)
  game.score.points = { red: 3, blue: 5 }
  match.players[0].out = true
  assert.deepEqual(tennis.tennisResults(match, game, { reason: 'forfeit', loser: 'red' }), [
    { accountId: 1, team: 'red', result: 'dnf', score: 3 },
    { accountId: 2, team: 'blue', result: 'win', score: 5 }
  ])
  assert.deepEqual(tennis.tennisResults(match, null, { reason: 'forfeit', loser: null }).map((r) => r.result), ['dnf', 'dnf'])
})

test('the serve rotates between doubles partners each time their side serves again', async () => {
  const players = await Promise.all([1, 2, 3, 4].map((id) => makePlayer(id, COURT_1.cx, C.TENNIS_NET_Z + (id <= 2 ? 5 : -5))))
  const room = await fakeRoom(players)
  const settings = { mode: 'doubles', format: 'short_set_4' }
  const lobby = openLobby(COURT_1.id, C.TENNIS_COACH.id, settings, tennis.playersFor(settings), { sessionId: 's1', accountId: 1, name: 'P1', team: 'red' }, T0)
  for (const id of [2, 3, 4]) joinLobby(lobby, { sessionId: `s${id}`, accountId: id, name: `P${id}`, team: id <= 2 ? 'red' : 'blue' }, T0)
  const match = startMatch(lobby, 'match-2', 'tennis', T0)
  room.sports.matches.set(COURT_1.id, match)
  const game = tennis.startTennis(room, match, COURT_1.cx, 'red', T0)
  assert.equal(game.court.halfWidth, C.DOUBLES_HALF_WIDTH)
  const servers: string[] = []
  let now = T0
  for (let g = 0; g < 4; g++) {
    servers.push((game.rally as { server: string }).server)
    const loser = game.score.serving === 'red' ? 'blue' : 'red'
    for (let p = 0; p < 4; p++) {
      game.rally = { phase: 'flight', ball: { x: COURT_1.cx + 30, y: 0, z: C.TENNIS_NET_Z, vx: 0, vy: 0, vz: 0, t: now }, hitter: loser, bounces: 0, netAt: null }
      tennis.runTennis(room, match, now)
      now += C.POINT_PAUSE_MS
      tennis.runTennis(room, match, now)
    }
  }
  assert.deepEqual(game.score.games, { red: 2, blue: 2 })
  assert.deepEqual(servers, ['s1', 's3', 's2', 's4'])
})
