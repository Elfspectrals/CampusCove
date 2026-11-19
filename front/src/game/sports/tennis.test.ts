import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TennisStatePayload } from '../../types/gameRealtime'
import { BALL_BASKETS, TENNIS_GAUGE_FULL, pressSpecial, stillArmed, TENNIS_BOUNCE_KEEP, TENNIS_COURTS, TENNIS_GRAVITY, TENNIS_HALF_LENGTH, TENNIS_NET_Z, TENNIS_REACH_M, TENNIS_RESTITUTION, TENNIS_MARK_MS, TENNIS_LATE_ALLOWANCE_MS, TENNIS_PERFECT_TIMING_MS, TENNIS_CHARGE_MS, TENNIS_HIT_MAX_HEIGHT, TENNIS_SERVE_FLOOR, TENNIS_SERVE_WINDOW_MS, serveRing, committedSwingAt, swingClick, TENNIS_HIT_COOLDOWN_MS, TENNIS_WHIFF_RECOVERY_MS, TENNIS_SWEET_M, TENNIS_SWING_AHEAD_MS, aimMoved, ballComing, ballPosition, chargeFill, defaultAim, freeCourtAt, highBall, inPlace, interceptSpot, iServe, markOpacity, markYaw, myTeam, sideAt, swingFor, swingRing, swingTone } from './tennis.ts'

const BOUNCE = { keep: TENNIS_BOUNCE_KEEP, restitution: TENNIS_RESTITUTION }

const ZONE = JSON.parse(readFileSync(new URL('../../../public/assets/zones/sports_tennis.json', import.meta.url), 'utf8'))
const RULES = JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/tennis.json', import.meta.url), 'utf8'))

function state(extra: Partial<TennisStatePayload> = {}): TennisStatePayload {
  return {
    venue: 'tennis_1',
    court: { cx: 0, netZ: 0, halfWidth: 4.115 },
    mode: 'singles',
    format: 'short_set_4',
    phase: 'flight',
    games: { red: 0, blue: 0 },
    points: { red: '0', blue: '0' },
    tiebreak: false,
    serving: 'blue',
    server: null,
    ball: { x: 0, y: 1, z: -10, vx: 0, vy: 4, vz: 15, t: 0, ...BOUNCE },
    hitter: 'blue',
    bounces: 0,
    shot: null,
    call: null,
    pointWinner: null,
    winner: null,
    players: [{ sessionId: 'r', team: 'red' }, { sessionId: 'b', team: 'blue' }],
    serverNow: 0,
    ...extra,
  }
}

test('the ball physics shown match the rules the socket plays', () => {
  assert.deepEqual([RULES.ball.gravity, RULES.ball.restitution, RULES.ball.bounceKeep, RULES.hit.reachM], [TENNIS_GRAVITY, TENNIS_RESTITUTION, TENNIS_BOUNCE_KEEP, TENNIS_REACH_M])
  assert.equal(RULES.courts[0].sizeM[1] / 2, TENNIS_HALF_LENGTH)
  assert.deepEqual([RULES.hit.sweetSpotM, RULES.hit.windowMs, RULES.hit.swingAheadMs, RULES.hit.perfectTimingMs, RULES.hit.chargeMs, RULES.hit.maxHeightM], [TENNIS_SWEET_M, TENNIS_LATE_ALLOWANCE_MS, TENNIS_SWING_AHEAD_MS, TENNIS_PERFECT_TIMING_MS, TENNIS_CHARGE_MS, TENNIS_HIT_MAX_HEIGHT])
})

test('the swing ring colour says what a click now would give: red miss, orange weak, green good, purple smash once charged', () => {
  for (const [offset, distance, tone, charged] of [
    [500, 0.3, 'miss', 'miss'], [351, 0.3, 'miss', 'miss'], [350, 0.3, 'weak', 'weak'], [201, 0.3, 'weak', 'weak'], [200, 0.3, 'good', 'smash'],
    [0, 0.3, 'good', 'smash'], [-60, 0.3, 'good', 'smash'], [-61, 0.3, 'weak', 'weak'], [-150, 0.3, 'weak', 'weak'], [-151, 0.3, 'miss', 'miss'],
    [50, 0.95, 'good', 'smash'], [50, 1.0, 'good', 'good'], [50, 1.3, 'good', 'good'], [50, 1.4, 'weak', 'weak'], [50, 1.8, 'weak', 'weak'], [50, 1.81, 'miss', 'miss'],
  ] as const) {
    assert.equal(swingTone(offset, distance), tone, `${offset} ms early at ${distance} m`)
    assert.equal(swingTone(offset, distance, true), charged, `charged, ${offset} ms early at ${distance} m`)
  }
})

test('on the serve the ring closes on the server as the toss rises and is green within 60 ms of its top, orange within 280 ms, red outside', () => {
  assert.deepEqual([RULES.serve.windowMs, RULES.serve.floor], [TENNIS_SERVE_WINDOW_MS, TENNIS_SERVE_FLOOR])
  const toss = { x: 0, y: RULES.serve.tossStartY, z: 0, vx: 0, vy: RULES.serve.tossSpeedMs, vz: 0, t: 10_000, ...BOUNCE }
  const peak = 10_000 + (RULES.serve.tossSpeedMs / TENNIS_GRAVITY) * 1000
  assert.ok(Math.abs(serveRing(toss, 10_000).radius - 2.4) < 1e-9)
  assert.ok(Math.abs(serveRing(toss, peak).radius - 0.6) < 1e-9)
  assert.ok(Math.abs(serveRing(toss, peak + 300).radius - 0.6) < 1e-9)
  for (const [offset, tone] of [[0, 'good'], [-59, 'good'], [59, 'good'], [-61, 'weak'], [61, 'weak'], [-279, 'weak'], [279, 'weak'], [-281, 'miss'], [281, 'miss']] as const) {
    assert.equal(serveRing(toss, peak + offset).tone, tone, `${offset} ms from the top`)
  }
})

test('the mark charges while the player stands within 0.8 m of where the ball passes at a height they can hit, in 1 s', () => {
  const s = state()
  const play = { ...s, netZ: s.court.netZ }
  const pass = ballPosition(s.ball!, 1400)
  assert.equal(inPlace(play, 'red', { x: pass.x + 0.79, z: pass.z }, 500), true)
  assert.equal(inPlace(play, 'red', { x: pass.x + 2.5, z: pass.z }, 500), false)
  assert.equal(inPlace(play, 'blue', { x: pass.x, z: pass.z }, 500), false)
  assert.equal(chargeFill(null, 5000), 0)
  assert.equal(chargeFill(4500, 5000), 0.5)
  assert.equal(chargeFill(4000, 5000), 1)
  assert.equal(chargeFill(1000, 5000), 1)
  assert.equal(highBall({ x: 0, y: 1, z: 0, vx: 0, vy: 8, vz: 5, t: 0, ...BOUNCE }), true)
  assert.equal(highBall({ x: 0, y: 1, z: 0, vx: 0, vy: 7, vz: 5, t: 0, ...BOUNCE }), false)
  assert.equal(highBall({ x: 0, y: 4.2, z: 0, vx: 0, vy: -3, vz: 5, t: 0, ...BOUNCE }), true)
})

test('a click that commits a swing roots the player until the ball passes; a click that would miss does not', () => {
  const s = state()
  const play = { ...s, netZ: s.court.netZ }
  const pass = ballPosition(s.ball!, 1400)
  const me = { x: pass.x, z: pass.z }
  assert.equal(committedSwingAt(play, 'red', me, 1400 - TENNIS_SWING_AHEAD_MS), 1400)
  assert.equal(committedSwingAt(play, 'red', me, 1400 - TENNIS_SWING_AHEAD_MS - 20), null)
  assert.equal(committedSwingAt(play, 'red', { x: pass.x + TENNIS_REACH_M + 0.2, z: pass.z }, 1300), null)
  assert.equal(committedSwingAt(play, 'blue', me, 1300), null)
})

test('a click waits the socket cooldown like the socket: 400 ms, 700 ms after a swing at nothing in a match', () => {
  const s = state()
  const play = { ...s, netZ: s.court.netZ }
  const pass = ballPosition(s.ball!, 1400)
  const me = { x: pass.x, z: pass.z }
  assert.deepEqual(swingClick(play, 'red', me, 1300, true), { rootUntil: 1400, recoveryMs: TENNIS_HIT_COOLDOWN_MS })
  assert.deepEqual(swingClick(play, 'red', me, 900, true), { rootUntil: null, recoveryMs: TENNIS_WHIFF_RECOVERY_MS })
  assert.deepEqual(swingClick(play, 'red', me, 900, false), { rootUntil: null, recoveryMs: TENNIS_HIT_COOLDOWN_MS })
  assert.deepEqual(swingClick(null, 'red', me, 900, true), { rootUntil: null, recoveryMs: TENNIS_HIT_COOLDOWN_MS })
  assert.deepEqual([RULES.hit.cooldownMs, RULES.hit.whiffRecoveryMs], [TENNIS_HIT_COOLDOWN_MS, TENNIS_WHIFF_RECOVERY_MS])
})

test('the swing ring shows from 900 ms before the ball passes closest and shrinks from 2.4 m to 0.6 m', () => {
  const s = state()
  const play = { ...s, netZ: s.court.netZ }
  const pass = ballPosition(s.ball!, 1400)
  const me = { x: pass.x, z: pass.z }
  assert.equal(swingRing(play, 'red', me, 490), null)
  const far = swingRing(play, 'red', me, 500)!
  assert.ok(Math.abs(far.radius - 2.4) < 1e-9)
  assert.equal(far.tone, 'miss')
  const half = swingRing(play, 'red', me, 950)!
  assert.ok(Math.abs(half.radius - 1.5) < 1e-9)
  assert.equal(swingRing(play, 'red', me, 1150)!.tone, 'weak')
  assert.equal(swingRing(play, 'red', me, 1250)!.tone, 'good')
  const now = swingRing(play, 'red', me, 1350, true)!
  assert.equal(now.tone, 'smash')
  assert.equal(swingRing(play, 'red', me, 1350)!.tone, 'good')
  assert.ok(Math.abs(now.radius - 0.7) < 1e-9)
  assert.equal(swingRing(play, 'red', me, 1430)!.tone, 'good')
  assert.equal(swingRing(play, 'blue', me, 1350), null)
})

test('the ball follows its arc, then bounces up instead of sinking before the server sends the bounce', () => {
  const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 10, t: 0, ...BOUNCE }
  const fall = Math.sqrt(2 / TENNIS_GRAVITY) * 1000
  assert.ok(Math.abs(ballPosition(ball, 200).y - (1 - (TENNIS_GRAVITY * 0.04) / 2)) < 1e-9)
  const after = ballPosition(ball, fall + 100)
  assert.ok(after.y > 0)
  assert.ok(after.z > (10 * fall) / 1000 && after.z < (10 * fall) / 1000 + 1)
})

test('the hitting cue shows only for the side the ball comes to, from 180 ms before it passes closest', () => {
  const s = state()
  const landing = ballPosition(s.ball!, 1400)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'red', { x: landing.x, z: landing.z }, 1300), true)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'red', { x: landing.x, z: landing.z }, 1220), true)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'red', { x: landing.x, z: landing.z }, 1200), false)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'red', { x: landing.x, z: landing.z }, 1450), true)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'red', { x: landing.x + 3, z: landing.z }, 1300), false)
  assert.equal(ballComing({ ...s, netZ: s.court.netZ }, 'blue', { x: landing.x, z: landing.z }, 1300), false)
  assert.equal(ballComing({ ...state({ phase: 'point' }), netZ: 0 }, 'red', { x: landing.x, z: landing.z }, 1300), false)
})

function near(actual: { x: number; z: number } | null, expected: { x: number; z: number }, what: string): void {
  assert.ok(actual && Math.abs(actual.x - expected.x) < 1e-6 && Math.abs(actual.z - expected.z) < 1e-6, `${what}: ${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`)
}

test('the aim mark starts deep in the middle of the other half and follows the mouse as seen from behind the baseline', () => {
  const court = state().court
  near(defaultAim(court, 'red'), { x: 0, z: -8.5 }, 'red aims at the blue half')
  near(defaultAim(court, 'blue'), { x: 0, z: 8.5 }, 'blue aims at the red half')
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, 100, 0), { x: 2, z: -8.5 }, 'mouse right, red')
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, 0, -100), { x: 0, z: -10.5 }, 'mouse up, red')
  near(aimMoved(court, 'blue', { x: 0, z: 8.5 }, 100, 0), { x: -2, z: 8.5 }, 'mouse right, blue')
  near(aimMoved(court, 'blue', { x: 0, z: 8.5 }, 0, -100), { x: 0, z: 10.5 }, 'mouse up, blue')
})

test('the aim mark stays inside the lines: 0.5 m from them and 1.5 m from the net', () => {
  const court = state().court
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, 1000, 0), { x: 3.615, z: -8.5 }, 'right line')
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, -1000, 0), { x: -3.615, z: -8.5 }, 'left line')
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, 0, -1000), { x: 0, z: -(TENNIS_HALF_LENGTH - 0.5) }, 'baseline')
  near(aimMoved(court, 'red', { x: 0, z: -8.5 }, 0, 1000), { x: 0, z: -1.5 }, 'net')
})

test('the mark shows where to stand: where the ball will be 350 ms after its bounce, 0.6 m off so it comes on the racket side', () => {
  const s = state()
  const play = { ...s, netZ: s.court.netZ }
  const landing = (4 + Math.sqrt(16 + 2 * TENNIS_GRAVITY)) / TENNIS_GRAVITY
  const z = -10 + 15 * landing + 15 * TENNIS_BOUNCE_KEEP * 0.35
  near(interceptSpot(play, 'red', 0), { x: -0.6, z }, 'before the bounce')
  assert.equal(interceptSpot(play, 'blue', 0), null)
  assert.equal(interceptSpot({ ...play, phase: 'point' }, 'red', 0), null)
  const bounced = { ...play, bounces: 1, ball: { x: 1, y: 0, z: 5, vx: 0, vy: 6, vz: 10, t: 1000, ...BOUNCE } }
  near(interceptSpot(bounced, 'red', 1000), { x: 0.4, z: 8.5 }, 'after the bounce')
  near(interceptSpot(bounced, 'red', 1400), { x: 0.4, z: 10.5 }, 'chasing a ball already past')
  const long = { ...play, bounces: 1, ball: { x: 0, y: 0, z: 11, vx: 0, vy: 6, vz: 20, t: 0, ...BOUNCE } }
  near(interceptSpot(long, 'red', 0), { x: -0.6, z: TENNIS_HALF_LENGTH + 3 }, 'never more than 3 m behind the baseline')
})

test('my side and my serve come from the server state', () => {
  assert.equal(myTeam(state(), 'b'), 'blue')
  assert.equal(myTeam(state(), 'x'), null)
  assert.equal(iServe(state({ phase: 'serve_wait', server: 'b' }), 'b'), true)
  assert.equal(iServe(state({ phase: 'flight', server: null }), 'b'), false)
})

test('courts and ball baskets match the rules and the zone file', () => {
  assert.deepEqual(RULES.courts.map((c: { id: string; centre: number[] }) => [c.id, c.centre[0], c.centre[2]]), TENNIS_COURTS.map((c) => [c.id, c.cx, TENNIS_NET_Z]))
  const baskets = ZONE.props.filter((p: { key?: string }) => p.key === 'tennis_ball_basket').map((p: { position: number[] }) => [p.position[0], p.position[2]])
  assert.deepEqual(baskets, BALL_BASKETS.map((b) => [b.position[0], b.position[2]]))
})

test('free play happens inside a court play area, the side comes from the half you stand on', () => {
  assert.equal(freeCourtAt(TENNIS_COURTS[1].cx + 6, TENNIS_NET_Z + 15)?.id, 'tennis_2')
  assert.equal(freeCourtAt(-443.5, TENNIS_NET_Z), null)
  assert.equal(sideAt(TENNIS_NET_Z + 1), 'red')
  assert.equal(sideAt(TENNIS_NET_Z - 1), 'blue')
})

test('my own swing: serve while serving, lob on right click, forehand on the racket side facing the net', () => {
  assert.equal(swingFor(true, true, 'red', { x: 0 }, 1), 'serve')
  assert.equal(swingFor(false, true, 'red', { x: 0 }, 1), 'lob')
  assert.equal(swingFor(false, false, 'red', { x: 0 }, 1), 'forehand')
  assert.equal(swingFor(false, false, 'red', { x: 0 }, -1), 'backhand')
  assert.equal(swingFor(false, false, 'blue', { x: 0 }, -1), 'forehand')
  assert.equal(swingFor(false, false, 'blue', { x: 0 }, null), 'forehand')
})

test('an out mark stays fully visible, then fades out over its last 1.5 s', () => {
  assert.equal(TENNIS_MARK_MS, 4000)
  assert.equal(markOpacity(0), 1)
  assert.equal(markOpacity(2500), 1)
  assert.equal(markOpacity(3250), 0.5)
  assert.equal(markOpacity(4000), 0)
  assert.equal(markOpacity(6000), 0)
  assert.equal(markOpacity(-1), 0)
})

test('an out mark lies along the direction the ball was travelling', () => {
  assert.equal(markYaw({ vx: 0, vz: 12 }), 0)
  assert.equal(markYaw({ vx: 3, vz: 0 }), Math.PI / 2)
  assert.equal(markYaw({ vx: 0, vz: -12 }), Math.PI)
})

test('the predicted bounce follows the ball it was hit with: a slice stays lower than a topspin', () => {
  const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 2, vz: 12, t: 0 }
  const apexAfterBounce = (restitution: number) => Math.max(...Array.from({ length: 300 }, (_, i) => ballPosition({ ...ball, keep: 0.8, restitution }, 600 + i * 5).y))
  assert.ok(apexAfterBounce(0.45) < apexAfterBounce(0.9) / 2)
})

test('Tennis Cove gauge size matches the shared rules file', () => {
  assert.equal(RULES.cove.gauge.full, TENNIS_GAUGE_FULL)
})

test('Tennis Cove: Space arms or disarms the special only on a full gauge, and leaves the jump alone otherwise', () => {
  assert.equal(pressSpecial(TENNIS_GAUGE_FULL, false), true)
  assert.equal(pressSpecial(TENNIS_GAUGE_FULL, true), false)
  assert.equal(pressSpecial(TENNIS_GAUGE_FULL - 1, false), null)
  assert.equal(pressSpecial(null, false), null)
})

test('Tennis Cove: the special stays armed after a refused click and drops once the socket spends the gauge', () => {
  assert.equal(stillArmed(true, TENNIS_GAUGE_FULL), true)
  assert.equal(stillArmed(true, 0), false)
  assert.equal(stillArmed(true, null), false)
  assert.equal(stillArmed(false, TENNIS_GAUGE_FULL), false)
})
