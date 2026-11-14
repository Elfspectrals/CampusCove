import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { TennisStatePayload } from '../../types/gameRealtime'
import { TENNIS_BOUNCE_KEEP, TENNIS_GRAVITY, TENNIS_HALF_LENGTH, TENNIS_REACH_M, TENNIS_RESTITUTION, aimOnCourt, ballComing, ballPosition, iServe, myTeam } from './tennis.ts'

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
    ball: { x: 0, y: 1, z: -10, vx: 0, vy: 4, vz: 15, t: 0 },
    hitter: 'blue',
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
})

test('the ball follows its arc, then bounces up instead of sinking before the server sends the bounce', () => {
  const ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 10, t: 0 }
  const fall = Math.sqrt(2 / TENNIS_GRAVITY) * 1000
  assert.ok(Math.abs(ballPosition(ball, 200).y - (1 - (TENNIS_GRAVITY * 0.04) / 2)) < 1e-9)
  const after = ballPosition(ball, fall + 100)
  assert.ok(after.y > 0)
  assert.ok(after.z > (10 * fall) / 1000 && after.z < (10 * fall) / 1000 + 1)
})

test('the hitting cue shows only for the side the ball comes to, when it is about to pass within reach', () => {
  const s = state()
  const landing = ballPosition(s.ball!, 1400)
  assert.equal(ballComing(s, 'red', { x: landing.x, z: landing.z }, 1300), true)
  assert.equal(ballComing(s, 'red', { x: landing.x + 3, z: landing.z }, 1300), false)
  assert.equal(ballComing(s, 'blue', { x: landing.x, z: landing.z }, 1300), false)
  assert.equal(ballComing(state({ phase: 'point' }), 'red', { x: landing.x, z: landing.z }, 1300), false)
})

test('the aim is where the view meets the ground, or the far baseline when looking level', () => {
  const s = state()
  assert.deepEqual(aimOnCourt(s, 'red', { x: 0, y: 1.6, z: 10 }, { x: 0, y: -0.2, z: -1 }), { x: 0, z: 2 })
  assert.deepEqual(aimOnCourt(s, 'red', { x: 1, y: 1.6, z: 10 }, { x: 0.1, y: 0, z: -1 }), { x: 1 + 0.1 * (10 + TENNIS_HALF_LENGTH), z: -TENNIS_HALF_LENGTH })
  assert.deepEqual(aimOnCourt(s, 'red', { x: 0, y: 1.6, z: 10 }, { x: 0, y: 0, z: 1 }), { x: 0, z: -TENNIS_HALF_LENGTH })
})

test('my side and my serve come from the server state', () => {
  assert.equal(myTeam(state(), 'b'), 'blue')
  assert.equal(myTeam(state(), 'x'), null)
  assert.equal(iServe(state({ phase: 'serve_wait', server: 'b' }), 'b'), true)
  assert.equal(iServe(state({ phase: 'flight', server: null }), 'b'), false)
})
