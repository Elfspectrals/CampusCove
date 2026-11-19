import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import type { ShotKind } from './tennisConstants.ts'
import { type Match, joinLobby, markAway, markBack, openLobby, startMatch } from './signup.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
await loadWorld()
const tennis = await import('./tennis.ts')
const { moveRejection } = await import('../movement.ts')
const C = await import('./tennisConstants.ts')
const { ballAt, groundTime, playAreaFor, tossPeak } = await import('./tennisRally.ts')

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/tennis.json', import.meta.url), 'utf8'))
const [COURT_1] = C.TENNIS_COURTS
const T0 = 9_000_000

async function singles(format = 'short_set_4', rules = 'classic'): Promise<{ room: FakeRoom, match: Match, red: Player, blue: Player }> {
  const red = await makePlayer(1, COURT_1.cx, C.TENNIS_NET_Z + 5)
  const blue = await makePlayer(2, COURT_1.cx, C.TENNIS_NET_Z - 5)
  const room = await fakeRoom([red, blue])
  const settings = { mode: 'singles', format, rules }
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
  assert.deepEqual([RULES.hit.swingAheadMs, RULES.hit.perfectTimingMs, RULES.hit.timingFloor, RULES.hit.netClearM, RULES.serve.floor], [C.SWING_AHEAD_MS, C.TIMING_PERFECT_MS, C.TIMING_FLOOR, C.NET_CLEAR_M, C.SERVE_FLOOR])
  assert.deepEqual([RULES.hit.chargeMs, RULES.hit.smashSpeedMs, RULES.serve.reachM, RULES.hit.swingDriftM], [C.CHARGE_MS, C.SMASH_SPEED, C.SERVE_REACH_M, C.SWING_DRIFT_M])
  assert.deepEqual([RULES.hit.cooldownMs, RULES.hit.whiffRecoveryMs], [C.TENNIS_HIT_COOLDOWN_MS, C.TENNIS_WHIFF_RECOVERY_MS])
  assert.deepEqual([RULES.hit.driveSpeedMs, RULES.lob.speedMs, RULES.serve.speedMs], [C.DRIVE_SPEED, C.LOB_SPEED, C.SERVE_SPEED])
  assert.deepEqual([RULES.serve.tossStartY, RULES.serve.tossSpeedMs, RULES.serve.windowMs, RULES.serve.autoTossAfterMs], [C.TOSS_START_Y, C.TOSS_SPEED, C.SERVE_WINDOW_MS, C.SERVE_WAIT_MS])
  assert.equal(RULES.rejoinGraceSec * 1000, C.REJOIN_GRACE_MS)
  assert.deepEqual(RULES.gear, [C.TENNIS_GEAR])
  assert.deepEqual(RULES.cove.strokes, C.COVE_STROKES)
  for (const [kind, rule] of Object.entries(RULES.cove.shots) as [ShotKind, { speedMs: number[], bounceKeep: number, restitution: number, netClearM: number, maxDepthM?: number }][]) {
    const spec = C.SHOTS[kind]
    assert.deepEqual([rule.speedMs, rule.bounceKeep, rule.restitution, rule.netClearM, rule.maxDepthM ?? null], [spec.speed, spec.keep, spec.restitution, spec.netClearM, spec.maxDepthM], kind)
  }
  assert.deepEqual(RULES.cove.gauge, { full: C.GAUGE_FULL, gain: C.GAUGE_GAIN })
  assert.deepEqual(RULES.cove.knock, { returnQuality: C.KNOCKED_RETURN_QUALITY, backM: C.KNOCK_BACK_M, rootMs: C.KNOCK_ROOT_MS })
})

test('the two courts and the coach between them sit inside the venue footprint', () => {
  const footprint = { minX: -467, maxX: -420, minZ: -293, maxZ: -250 }
  for (const { cx } of C.TENNIS_COURTS) {
    const area = playAreaFor(cx, C.TENNIS_NET_Z)
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

test('a full point: toss, serve on the socket clock, two bounces, 0-15, then the next serve from behind the baseline, which a server who walked off the toss cannot hit', async () => {
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
  blue.x = COURT_1.cx + 20
  blue.z = C.TENNIS_NET_Z - 2
  tennis.runTennis(room, match, point.until)
  assert.deepEqual([phaseOf(game), lastState(room, red).server], ['serve_wait', blue.sessionId])
  assert.deepEqual([blue.x, blue.z], [COURT_1.cx + C.SINGLES_HALF_WIDTH, C.TENNIS_NET_Z - C.COURT_HALF_LENGTH - C.BASELINE_STANDBY_M])
  assert.equal((sentOf(clientOf(room, blue), 'position_correction').at(-1) as { reason: string }).reason, 'tennis_serve')
  tennis.onTennisHit(room, clientOf(room, blue), aim, point.until + 1000)
  assert.equal(phaseOf(game), 'toss')
  blue.x -= 2
  tennis.onTennisHit(room, clientOf(room, blue), aim, point.until + 1500)
  assert.equal(phaseOf(game), 'toss')
})

test('no serve while a player is away: neither a click nor the automatic toss starts the point, and the wait starts again when they are back', async () => {
  const { room, match, red, blue } = await singles()
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }
  markAway(match, 1, T0 + 100)
  tennis.onTennisHit(room, clientOf(room, blue), aim, T0 + 200)
  assert.equal(phaseOf(game), 'serve_wait')
  tennis.runTennis(room, match, T0 + C.SERVE_WAIT_MS + 5000)
  assert.equal(phaseOf(game), 'serve_wait')
  markBack(match, 1, red.sessionId)
  tennis.runTennis(room, match, T0 + C.SERVE_WAIT_MS + 5000 + C.SERVE_WAIT_MS - 1)
  assert.equal(phaseOf(game), 'serve_wait')
  tennis.onTennisHit(room, clientOf(room, blue), aim, T0 + C.SERVE_WAIT_MS + 6000)
  assert.equal(phaseOf(game), 'toss')
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

test('a swing at a ball still out of reach is a miss that costs 700 ms, so clicking in bursts does not return the ball', async () => {
  const { room, match, red, blue } = await singles()
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }
  tennis.onTennisHit(room, clientOf(room, blue), aim, T0)
  const peak = tossPeak((game.rally as { ball: Parameters<typeof tossPeak>[0] }).ball)
  tennis.onTennisHit(room, clientOf(room, blue), aim, peak)
  const served = game.rally
  const back = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z - 8 }
  tennis.onTennisHit(room, clientOf(room, red), back, peak + 100)
  assert.equal(game.rally, served)
  const landing = groundTime((served as { ball: Parameters<typeof groundTime>[0] }).ball)
  const at = ballAt((served as { ball: Parameters<typeof ballAt>[0] }).ball, landing)
  red.x = at.x
  red.z = at.z
  tennis.onTennisHit(room, clientOf(room, red), back, peak + 100 + C.TENNIS_WHIFF_RECOVERY_MS - 1)
  assert.equal((game.rally as { hitter: string }).hitter, 'blue')
  assert.equal((game.rally as { swing: unknown }).swing, null)
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
      game.rally = { phase: 'flight', ball: { x: COURT_1.cx + 30, y: 0, z: C.TENNIS_NET_Z, vx: 0, vy: 0, vz: 0, t: now, keep: C.BOUNCE_KEEP, restitution: C.RESTITUTION }, hitter: loser, bounces: 0, netAt: null, swing: null, shot: null }
      tennis.runTennis(room, match, now)
      now += C.POINT_PAUSE_MS
      tennis.runTennis(room, match, now)
    }
  }
  assert.deepEqual(game.score.games, { red: 2, blue: 2 })
  assert.deepEqual(servers, ['s1', 's3', 's2', 's4'])
})

const { bounce, shoot } = await import('./tennisRally.ts')

function incoming(from: 'red' | 'blue', kind: ShotKind, sessionId: string, start: number) {
  const sign = from === 'red' ? 1 : -1
  const court = { cx: COURT_1.cx, netZ: C.TENNIS_NET_Z, halfWidth: C.SINGLES_HALF_WIDTH }
  const { ball } = shoot(court, { x: COURT_1.cx, y: 1, z: C.TENNIS_NET_Z + sign * 11 }, { x: COURT_1.cx, z: C.TENNIS_NET_Z - sign * 8 }, 14, start, true)
  const bounced = bounce(ball, groundTime(ball))
  const contactAt = bounced.t + 300
  const rally = { phase: 'flight' as const, ball: bounced, hitter: from, bounces: 1 as const, netAt: null, swing: null, shot: { sessionId, timing: 'perfect' as const, kind, knocked: false } }
  return { rally, contactAt, contact: ballAt(bounced, contactAt) }
}

test('Tennis Cove: a stroke is required, a good serve fills the gauge, the classic rules have no gauge', async () => {
  const classic = await singles()
  const plain = tennis.startTennis(classic.room, classic.match, COURT_1.cx, 'blue', T0)
  assert.deepEqual([lastState(classic.room, classic.red).rules, lastState(classic.room, classic.red).gauges], ['classic', null])
  tennis.onTennisHit(classic.room, clientOf(classic.room, classic.blue), { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8, stroke: 'slice' }, T0 + 10)
  assert.equal(phaseOf(plain), 'toss')

  const { room, match, red, blue } = await singles('short_set_4', 'cove')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }
  tennis.onTennisHit(room, clientOf(room, blue), aim, T0 + 10)
  assert.equal(phaseOf(game), 'serve_wait')
  tennis.onTennisHit(room, clientOf(room, blue), { ...aim, stroke: 'spin' }, T0 + 20)
  tennis.onTennisHit(room, clientOf(room, blue), { ...aim, stroke: 'topspin', special: 'yes' }, T0 + 30)
  assert.equal(phaseOf(game), 'serve_wait')
  tennis.onTennisHit(room, clientOf(room, blue), { ...aim, stroke: 'topspin' }, T0 + 40)
  assert.equal(phaseOf(game), 'toss')
  const peak = tossPeak((game.rally as { ball: Parameters<typeof tossPeak>[0] }).ball)
  tennis.onTennisHit(room, clientOf(room, blue), { ...aim, stroke: 'topspin', special: true }, peak)
  assert.equal(phaseOf(game), 'flight')
  assert.deepEqual(lastState(room, red).gauges, { [red.sessionId]: 0, [blue.sessionId]: C.GAUGE_GAIN.perfect })
  assert.equal(lastState(room, red).rules, 'cove')
})

test('Tennis Cove: the special needs a full gauge, empties it and flies faster than any flat shot', async () => {
  const { room, match, red } = await singles('short_set_4', 'cove')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z - 8 }
  const first = incoming('blue', 'topspin', 'blue-session', T0 + 5000)
  game.rally = first.rally
  Object.assign(red, { x: first.contact.x + 0.3, z: first.contact.z })
  game.gauges?.set(1, C.GAUGE_FULL - 1)
  tennis.onTennisHit(room, clientOf(room, red), { ...aim, stroke: 'flat', special: true }, first.contactAt - 100)
  tennis.runTennis(room, match, first.contactAt + 10)
  const flat = game.rally as { shot: { kind: string } }
  assert.equal(flat.shot.kind, 'flat')

  const second = incoming('blue', 'topspin', 'blue-session', T0 + 15_000)
  game.rally = second.rally
  game.gauges?.set(1, C.GAUGE_FULL)
  tennis.onTennisHit(room, clientOf(room, red), { ...aim, stroke: 'flat', special: true }, second.contactAt - 100)
  assert.equal(game.gauges?.get(1), 0)
  tennis.runTennis(room, match, second.contactAt + 10)
  const special = game.rally as { ball: { vx: number, vz: number }, shot: { kind: string } }
  assert.equal(special.shot.kind, 'special')
  assert.ok(Math.hypot(special.ball.vx, special.ball.vz) > C.SHOTS.flat.speed[1])
})

test('Tennis Cove: a special returned with less than a Perfect pops up and knocks the player 2 m back for 0.8 s; a Perfect sends it back', async () => {
  const { room, match, red } = await singles('short_set_4', 'cove')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z - 8 }
  const weak = incoming('blue', 'special', 'blue-session', T0 + 5000)
  game.rally = weak.rally
  Object.assign(red, { x: weak.contact.x + 1.3, z: weak.contact.z })
  tennis.onTennisHit(room, clientOf(room, red), { ...aim, stroke: 'topspin' }, weak.contactAt - 100)
  tennis.runTennis(room, match, weak.contactAt + 10)
  const popped = game.rally as { shot: { kind: string, knocked: boolean, timing: string } }
  assert.deepEqual([popped.shot.kind, popped.shot.knocked, popped.shot.timing], ['lob', true, 'good'])
  assert.ok(Math.abs(red.z - (weak.contact.z + C.KNOCK_BACK_M)) < 1e-9)
  assert.equal((sentOf(clientOf(room, red), 'position_correction').at(-1) as { reason: string }).reason, 'tennis_knocked')
  assert.deepEqual(sentOf(clientOf(room, red), 'tennis_knocked').at(-1), { until: weak.contactAt + 10 + C.KNOCK_ROOT_MS })
  const knockedUntil = weak.contactAt + 10 + C.KNOCK_ROOT_MS
  assert.equal(moveRejection(room, red, red.x, red.y, red.z - 0.5, knockedUntil - 1), 'tackled')
  assert.notEqual(moveRejection(room, red, red.x, red.y, red.z - 0.5, knockedUntil + 1000), 'tackled')
  assert.equal((lastState(room, red).gauges as Record<string, number>)[red.sessionId], 0)

  const clean = incoming('blue', 'special', 'blue-session', T0 + 15_000)
  game.rally = clean.rally
  Object.assign(red, { x: clean.contact.x + 0.3, z: clean.contact.z })
  tennis.onTennisHit(room, clientOf(room, red), { ...aim, stroke: 'topspin' }, clean.contactAt - 100)
  tennis.runTennis(room, match, clean.contactAt + 10)
  const back = game.rally as { shot: { kind: string, knocked: boolean, timing: string } }
  assert.deepEqual([back.shot.kind, back.shot.knocked, back.shot.timing], ['topspin', false, 'perfect'])
  assert.equal(red.z, clean.contact.z)
})
