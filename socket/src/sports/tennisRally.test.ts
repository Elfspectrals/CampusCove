import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COURT_HALF_LENGTH, POINT_PAUSE_MS, SERVE_WAIT_MS, SERVE_WINDOW_MS, SINGLES_HALF_WIDTH, TOSS_FALL_MS } from './tennisConstants.ts'
import { type Court, type Rally, ballAt, strokeOf, contactQuality, groundTime, hit, landsIn, serveWait, shoot, step, tossBall, tossPeak } from './tennisRally.ts'

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
  const net = step({ phase: 'flight', ...shoot(COURT, { x: 0, y: 0.3, z: -1 }, { x: 0, z: 11 }, 20, T0), hitter: 'blue', bounces: 0 }, netAt + 1, COURT, nowhere)
  assert.deepEqual(net.phase === 'point' && [net.winner, net.call, net.until], ['red', 'net', netAt + POINT_PAUSE_MS])
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

test('a late serve flies long by up to 4 m and is called out', () => {
  const ball = served({ x: 0, z: 10 }, SERVE_WINDOW_MS)
  const at = ballAt(ball.ball, groundTime(ball.ball))
  assert.ok(Math.abs(at.z - 14) < 0.01, `landed at ${at.z}`)
  const out = step(ball, groundTime(ball.ball) + 1, COURT, nowhere)
  assert.deepEqual(out.phase === 'point' && [out.winner, out.call], ['red', 'out'])
})

test('a click outside the toss window or by another player does nothing', () => {
  const toss: Rally = { phase: 'toss', server: 'b', team: 'blue', ball: tossBall(1, -12, T0) }
  assert.equal(hit(toss, BLUE_SERVER, { x: 0, z: 8 }, false, tossPeak(toss.ball) - SERVE_WINDOW_MS - 1, COURT), null)
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
  assert.equal(hit(bounced, { ...receiver, x: at.x + 1.7 }, { x: 0, z: -9 }, false, t, COURT), null)
  assert.equal(hit(bounced, { ...BLUE_SERVER, x: at.x, z: at.z }, { x: 0, z: 9 }, false, t, COURT), null)
  assert.equal(hit(bounced, { ...receiver, z: -3 }, { x: 0, z: -9 }, false, t, COURT), null)
})

test('the hit is judged within 150 ms before the click, on the server clock', () => {
  const ball = served({ x: 0, z: 8 })
  const bounced = flight(step(ball, groundTime(ball.ball) + 1, COURT, nowhere))
  const at = ballAt(bounced.ball, bounced.ball.t + 300)
  const receiver = { ...RED_RECEIVER, x: at.x, z: at.z }
  assert.ok(hit(bounced, receiver, { x: 0, z: -9 }, false, bounced.ball.t + 440, COURT))
  assert.equal(hit(bounced, receiver, { x: 0, z: -9 }, false, bounced.ball.t + 600, COURT), null)
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
  assert.equal(contactQuality(1.6), 0)
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
