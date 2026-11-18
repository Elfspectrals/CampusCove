import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COURT_HALF_LENGTH, POINT_PAUSE_MS, REACH_M, SWING_DRIFT_M, SERVE_WAIT_MS, SERVE_WINDOW_MS, SINGLES_HALF_WIDTH, SMASH_SPEED, TOSS_FALL_MS } from './tennisConstants.ts'
import { type Court, type Rally, ballAt, strokeOf, contactQuality, groundTime, hit, inPosition, landsIn, serveWait, shoot, step, timingFactor, timingOf, tossBall, tossPeak, trackReady } from './tennisRally.ts'

const COURT: Court = { cx: 0, netZ: 0, halfWidth: SINGLES_HALF_WIDTH }
const T0 = 1_000_000
const BLUE_SERVER = { sessionId: 'b', team: 'blue' as const, x: 1, z: -COURT_HALF_LENGTH - 0.5 }
const RED_RECEIVER = { sessionId: 'r', team: 'red' as const, x: 0, z: COURT_HALF_LENGTH }
const nowhere = () => null

function flight(rally: Rally | null): Extract<Rally, { phase: 'flight' }> {
  assert.ok(rally && rally.phase === 'flight', `expected a ball in flight, got ${JSON.stringify(rally)}`)
  return rally
}

function served(aim = { x: 0, z: 8 }, offMs = 0): Extract<Rally, { phase: 'flight' }> {
  const tossing = hit(serveWait('b', 'blue', T0), BLUE_SERVER, aim, false, T0, COURT)
  assert.equal(tossing?.phase, 'toss')
  const peak = tossPeak((tossing as Extract<Rally, { phase: 'toss' }>).ball)
  return flight(hit(tossing as Rally, BLUE_SERVER, aim, false, peak + offMs, COURT))
}

test('a shot lands on the aimed spot', () => {
  const { ball, netAt } = shoot(COURT, { x: 0, y: 1, z: -10 }, { x: 2, z: 9 }, 15, T0)
  const at = ballAt(ball, groundTime(ball))
  assert.ok(Math.abs(at.x - 2) < 1e-6 && Math.abs(at.z - 9) < 1e-6 && Math.abs(at.y) < 1e-6)
  assert.equal(netAt, null)
})

test('a low ball from near the net catches the net', () => {
  const { netAt } = shoot(COURT, { x: 0, y: 0.3, z: -1 }, { x: 0, z: 11 }, 20, T0)
  assert.ok(netAt !== null && netAt > T0)
  const net = step({ phase: 'flight', ...shoot(COURT, { x: 0, y: 0.3, z: -1 }, { x: 0, z: 11 }, 20, T0), hitter: 'blue', bounces: 0, swing: null, shot: null }, netAt + 1, COURT, nowhere)
  assert.deepEqual(net.phase === 'point' && [net.winner, net.call, net.until], ['red', 'net', netAt + POINT_PAUSE_MS])
})

test('a good shot from the same spot is lifted over the net and still lands where aimed', () => {
  const { ball, netAt } = shoot(COURT, { x: 0, y: 0.3, z: -1 }, { x: 0, z: 11 }, 20, T0, true)
  assert.equal(netAt, null)
  const at = ballAt(ball, groundTime(ball))
  assert.ok(Math.abs(at.z - 11) < 1e-6 && Math.abs(at.y) < 1e-6)
})

test('a serve at the top of the toss lands where aimed, bounces once, then a second bounce wins the point', () => {
  const ball = served()
  const landing = groundTime(ball.ball)
  const at = ballAt(ball.ball, landing)
  assert.ok(Math.abs(at.z - 8) < 1e-6)
  assert.equal(step(ball, landing - 1, COURT, nowhere), ball)
  const bounced = flight(step(ball, landing + 1, COURT, nowhere))
  assert.equal(bounced.bounces, 1)
  assert.ok(bounced.ball.vy > 0)
  const end = step(bounced, groundTime(bounced.ball) + 1, COURT, nowhere)
  assert.deepEqual(end.phase === 'point' && [end.winner, end.call], ['blue', 'double_bounce'])
})

test('a serve 400 ms off the top of the toss, early or late, flies 2.8 m long and is called out', () => {
  const early = served({ x: 0, z: 10 }, -SERVE_WINDOW_MS)
  assert.ok(Math.abs(ballAt(early.ball, groundTime(early.ball)).z - 12.8) < 0.01)
  assert.equal(early.shot?.timing, 'early')
  const ball = served({ x: 0, z: 10 }, SERVE_WINDOW_MS)
  const at = ballAt(ball.ball, groundTime(ball.ball))
  assert.ok(Math.abs(at.z - 12.8) < 0.01, `landed at ${at.z}`)
  assert.equal(ball.shot?.timing, 'late')
  assert.equal(served({ x: 0, z: 10 }, 200).shot?.timing, 'good')
  assert.equal(served({ x: 0, z: 10 }, 0).shot?.timing, 'perfect')
  const out = step(ball, groundTime(ball.ball) + 1, COURT, nowhere)
  assert.deepEqual(out.phase === 'point' && [out.winner, out.call], ['red', 'out'])
})

test('a toss is only hit by a server still within 1 m of it', () => {
  const tossing = hit(serveWait('b', 'blue', T0), BLUE_SERVER, { x: 0, z: 8 }, false, T0, COURT) as Extract<Rally, { phase: 'toss' }>
  assert.equal(tossing.phase, 'toss')
  const peak = tossPeak(tossing.ball)
  assert.equal(hit(tossing, { ...BLUE_SERVER, x: tossing.ball.x + 1.2, z: tossing.ball.z }, { x: 0, z: 8 }, false, peak, COURT), null)
  assert.equal(hit(tossing, { ...BLUE_SERVER, x: tossing.ball.x + 0.9, z: tossing.ball.z }, { x: 0, z: 8 }, false, peak, COURT)?.phase, 'flight')
})

test('a serve or a toss by another player does nothing', () => {
  const toss: Rally = { phase: 'toss', server: 'b', team: 'blue', ball: tossBall(1, -12, T0) }
  assert.equal(hit(toss, { ...BLUE_SERVER, sessionId: 'b2' }, { x: 0, z: 8 }, false, tossPeak(toss.ball), COURT), null)
  assert.equal(hit(serveWait('b', 'blue', T0), RED_RECEIVER, { x: 0, z: -8 }, false, T0, COURT), null)
})

test('an untouched toss gives the point to the receivers; a server who waits 10 s tosses anyway', () => {
  const toss: Rally = { phase: 'toss', server: 'b', team: 'blue', ball: tossBall(1, -12, T0) }
  const missed = step(toss, T0 + TOSS_FALL_MS, COURT, nowhere)
  assert.deepEqual(missed.phase === 'point' && [missed.winner, missed.call], ['red', 'missed_toss'])
  const waiting = serveWait('b', 'blue', T0)
  assert.equal(step(waiting, T0 + SERVE_WAIT_MS - 1, COURT, nowhere), waiting)
  const auto = step(waiting, T0 + SERVE_WAIT_MS, COURT, () => ({ x: 2, z: -12 }))
  assert.deepEqual(auto.phase === 'toss' && [auto.ball.x, auto.ball.z, auto.ball.t], [2, -12, T0 + SERVE_WAIT_MS])
})

test('the receiver returns the ball when it is within reach on their half, the timing sets the quality', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const t = bounced.ball.t + 300
  const at = ballAt(bounced.ball, t)
  const receiver = { ...RED_RECEIVER, x: at.x + 0.3, z: at.z }
  const back = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, t, COURT))
  assert.equal(back.hitter, 'red')
  assert.equal(back.bounces, 0)
  const landing = ballAt(back.ball, groundTime(back.ball))
  assert.ok(Math.abs(landing.z + 9) < 1e-6)
  assert.equal(back.shot?.timing, 'perfect')
  assert.ok(Math.hypot(back.ball.vx, back.ball.vz) < 19 + 1e-6)
  const charged = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, t, COURT, true))
  assert.equal(charged.shot?.timing, 'smash')
  assert.ok(Math.abs(Math.hypot(charged.ball.vx, charged.ball.vz) - SMASH_SPEED) < 1e-6)
  const ahead = flight(step(flight(hit(bounced, receiver, { x: 0, z: -9 }, false, t - 150, COURT)), t + 20, COURT, () => receiver))
  assert.equal(ahead.shot?.timing, 'perfect')
  assert.ok(Math.hypot(ahead.ball.vx, ahead.ball.vz) < 19 + 1e-6)
  assert.equal(hit(bounced, { ...receiver, x: at.x + 2.0 }, { x: 0, z: -9 }, false, t, COURT), null)
  assert.equal(hit(bounced, { ...BLUE_SERVER, x: at.x, z: at.z }, { x: 0, z: 9 }, false, t, COURT), null)
  assert.equal(hit(bounced, { ...receiver, z: -3 }, { x: 0, z: -9 }, false, t, COURT), null)
})

test('the hit is judged within 150 ms before the click, on the server clock', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const at = ballAt(bounced.ball, bounced.ball.t + 300)
  const receiver = { ...RED_RECEIVER, x: at.x, z: at.z }
  const late = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, bounced.ball.t + 440, COURT))
  assert.equal(late.hitter, 'red')
  assert.equal(late.shot?.timing, 'late')
  assert.equal(hit(bounced, receiver, { x: 0, z: -9 }, false, bounced.ball.t + 700, COURT), null)
})

test('a click up to 350 ms before the ball passes closest commits the swing, which strikes when the ball is there; earlier is a miss', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const contactAt = bounced.ball.t + 400
  const at = ballAt(bounced.ball, contactAt)
  const receiver = { ...RED_RECEIVER, x: at.x, z: at.z }
  const clickAt = contactAt - 300
  const committed = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, clickAt, COURT))
  assert.equal(committed.hitter, 'blue')
  assert.equal(committed.swing?.at, contactAt)
  assert.equal(hit(committed, receiver, { x: 0, z: -9 }, false, clickAt + 50, COURT), null)
  assert.equal(step(committed, contactAt - 1, COURT, nowhere), committed)
  const struck = flight(step(committed, contactAt + 20, COURT, () => receiver))
  assert.equal(struck.hitter, 'red')
  assert.equal(struck.ball.t, contactAt)
  assert.equal(struck.shot?.timing, 'early')
  const perfect = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, contactAt, COURT))
  assert.ok(Math.hypot(struck.ball.vx, struck.ball.vz) < Math.hypot(perfect.ball.vx, perfect.ball.vz))
  assert.equal(flight(hit(bounced, receiver, { x: 0, z: -9 }, false, contactAt - 350, COURT)).swing?.at, contactAt)
  const within = ballAt(bounced.ball, contactAt - 360 + 350)
  assert.ok(Math.hypot(within.x - receiver.x, within.z - receiver.z) < REACH_M)
  assert.equal(hit(bounced, receiver, { x: 0, z: -9 }, false, contactAt - 360, COURT), null)
})

test('a player who runs off after committing a swing misses: the socket strikes only from where they are at contact', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const contactAt = bounced.ball.t + 400
  const at = ballAt(bounced.ball, contactAt)
  const receiver = { ...RED_RECEIVER, x: at.x + 0.5, z: at.z }
  const committed = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, contactAt - 300, COURT))
  const ranOff = { ...receiver, x: at.x + REACH_M + SWING_DRIFT_M + 0.1 }
  const missed = flight(step(committed, contactAt + 20, COURT, () => ranOff))
  assert.equal(missed.hitter, 'blue')
  assert.equal(missed.swing, null)
  assert.equal(step(missed, groundTime(missed.ball) + 1, COURT, nowhere).phase, 'point')
  const drifted = { ...receiver, x: at.x + REACH_M + SWING_DRIFT_M - 0.1 }
  assert.equal(flight(step(committed, contactAt + 20, COURT, () => drifted)).hitter, 'red')
  assert.equal(flight(step(committed, contactAt + 20, COURT, nowhere)).swing, null)
})

test('the timing keeps the full quality from 60 ms late to 200 ms early and halves it at the edges; a clean hit in that window is a smash only when charged', () => {
  for (const [offset, factor] of [[0, 1], [200, 1], [275, 0.75], [350, 0.5], [-60, 1], [-105, 0.75], [-150, 0.5]] as const) {
    assert.ok(Math.abs(timingFactor(offset) - factor) < 1e-9, `${offset} ms gives ${timingFactor(offset)}`)
  }
  assert.equal(timingOf(300, 1, false), 'early')
  assert.equal(timingOf(-100, 1, false), 'late')
  assert.equal(timingOf(150, 0.9, false), 'perfect')
  assert.equal(timingOf(-30, 0.9, false), 'perfect')
  assert.equal(timingOf(0, 0.6, false), 'good')
  assert.equal(timingOf(0, 0.9, false), 'perfect')
  assert.equal(timingOf(0, 0.9, true), 'smash')
  assert.equal(timingOf(200, 0.9, true), 'smash')
  assert.equal(timingOf(-60, 0.9, true), 'smash')
  assert.equal(timingOf(201, 1, true), 'early')
  assert.equal(timingOf(-61, 1, true), 'late')
  assert.equal(timingOf(50, 0.84, true), 'good')
})

test('a receiver is charged after standing 1 s where the ball comes; stepping out, a new ball or their own shot starts again', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const contactAt = bounced.ball.t + 300
  const at = ballAt(bounced.ball, contactAt)
  const inPlace = { ...RED_RECEIVER, x: at.x + 0.3, z: at.z }
  const away = { ...RED_RECEIVER, x: at.x + 2.0, z: at.z }
  const who = {}
  const start = contactAt - 1100
  assert.equal(inPosition(ball, COURT, inPlace, start), true)
  assert.equal(inPosition(ball, COURT, { ...inPlace, x: at.x + 0.8 }, start), true)
  assert.equal(inPosition(ball, COURT, { ...inPlace, x: at.x + 0.81 }, start), false)
  assert.equal(inPosition(ball, COURT, { ...inPlace, team: 'blue' }, start), false)
  assert.equal(trackReady(who, ball, COURT, inPlace, start), false)
  assert.equal(trackReady(who, ball, COURT, inPlace, start + 999), false)
  assert.equal(trackReady(who, ball, COURT, inPlace, start + 1000), true)
  assert.equal(trackReady(who, bounced, COURT, inPlace, start + 1050), true)
  assert.equal(trackReady(who, bounced, COURT, away, start + 1060), false)
  assert.equal(trackReady(who, bounced, COURT, inPlace, start + 1070), false)
  const other = {}
  assert.equal(trackReady(other, ball, COURT, inPlace, start), false)
  const next = { ...ball, shot: { sessionId: 'b', timing: 'good' as const } }
  assert.equal(trackReady(other, next, COURT, inPlace, start + 1000), false)
  assert.equal(trackReady(other, serveWait('b', 'blue', T0), COURT, inPlace, start + 2000), false)
})

test('a lob flies higher and slower than a drive to the same spot', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const t = bounced.ball.t + 300
  const at = ballAt(bounced.ball, t)
  const receiver = { ...RED_RECEIVER, x: at.x, z: at.z }
  const drive = flight(hit(bounced, receiver, { x: 0, z: -9 }, false, t, COURT))
  const lob = flight(hit(bounced, receiver, { x: 0, z: -9 }, true, t, COURT))
  assert.ok(lob.ball.vy > drive.ball.vy)
  assert.ok(groundTime(lob.ball) > groundTime(drive.ball))
})

test('aims are kept on the receiving half; lines count as in', () => {
  const ball = served({ x: 0, z: -5 })
  const at = ballAt(ball.ball, groundTime(ball.ball))
  assert.ok(at.z >= 1 - 1e-6)
  assert.equal(landsIn(COURT, 'red', SINGLES_HALF_WIDTH, COURT_HALF_LENGTH), true)
  assert.equal(landsIn(COURT, 'red', SINGLES_HALF_WIDTH + 0.1, 5), false)
  assert.equal(landsIn(COURT, 'red', 0, -1), false)
  assert.equal(contactQuality(0.2), 1)
  assert.equal(contactQuality(0.8), 1)
  assert.equal(contactQuality(1.3), 0.5)
  assert.equal(contactQuality(1.8), 0)
})

test('the stroke shown to others: serve at the toss, forehand on the racket side, backhand on the other, lob on right click', () => {
  const waiting = serveWait('b', 'blue', T0)
  const tossing = hit(waiting, BLUE_SERVER, { x: 0, z: 8 }, false, T0, COURT) as Rally
  assert.equal(strokeOf(waiting, tossing, BLUE_SERVER, false), 'serve')
  const ball = served({ x: 0, z: 8 })
  assert.equal(strokeOf(tossing, ball, BLUE_SERVER, false), null)
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const t = bounced.ball.t + 300
  const at = ballAt(bounced.ball, t)
  for (const [dx, lob, stroke] of [[-0.4, false, 'forehand'], [0.4, false, 'backhand'], [0.4, true, 'lob']] as const) {
    const receiver = { ...RED_RECEIVER, x: at.x + dx, z: at.z }
    const back = flight(hit(bounced, receiver, { x: 0, z: -9 }, lob, t, COURT))
    assert.equal(strokeOf(bounced, back, receiver, lob), stroke)
  }
})
