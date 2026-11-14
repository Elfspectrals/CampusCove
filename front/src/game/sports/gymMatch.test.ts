import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { GymStatePayload } from '../../types/gameRealtime.ts'
import { carriedSpot, clockText, dribbleBeat, dribbleHeight, goodWindowStart, meterFill, myTeam, nearestFreeBall, parseGymCourtView, parseGymHudRules, predictBall } from './gymMatch.ts'

const rules = (sport: string) => JSON.parse(readFileSync(new URL(`../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))

test('the HUD reads its numbers from the shipped rules files', () => {
  const football = parseGymHudRules('football', rules('football'))
  assert.deepEqual(football.meter, { kind: 'charge', chargeMs: 1000 })
  assert.equal(football.defendCooldownMs, 3000)
  assert.equal(football.downMs, 800)
  const basketball = parseGymHudRules('basketball', rules('basketball'))
  assert.equal(basketball.meter.kind, 'bounce')
  assert.equal(basketball.defendCooldownMs, 2000)
  assert.throws(() => parseGymHudRules('football', { ...rules('football'), shotChargeMs: 0 }), /shotChargeMs/)
})

test('the match clock counts down in m:ss and never shows a negative time', () => {
  assert.equal(clockText(240_000), '4:00')
  assert.equal(clockText(61_200), '1:02')
  assert.equal(clockText(-500), '0:00')
})

test('the football meter fills and holds; the basketball meter rises then falls, its good window narrows with distance', () => {
  const charge = { kind: 'charge', chargeMs: 1000 } as const
  assert.equal(meterFill(charge, 500), 0.5)
  assert.equal(meterFill(charge, 3000), 1)
  const bounce = { kind: 'bounce', riseMs: 900, windowNear: 0.18, windowFar: 0.07, farDistanceM: 12 } as const
  assert.equal(meterFill(bounce, 450), 0.5)
  assert.equal(meterFill(bounce, 1350), 0.5)
  assert.equal(meterFill(bounce, 2000), 0)
  assert.equal(goodWindowStart(charge, 5), null)
  assert.ok(Math.abs((goodWindowStart(bounce, 0) ?? 0) - 0.82) < 1e-9)
  assert.ok(Math.abs((goodWindowStart(bounce, 24) ?? 0) - 0.93) < 1e-9)
})

test('the ball is drawn ahead of the last update along its flight and never under the floor', () => {
  const ball: GymStatePayload['ball'] = [0, 3, 0, 2, 0, 0]
  const [x, y] = predictBall(ball, 0.5, 0.2, 0.12, false)
  assert.equal(x, 1)
  assert.ok(Math.abs(y - (3 - 0.5 * 9.81 * 0.25)) < 1e-9)
  assert.equal(predictBall(ball, 5, 0.2, 0.12, false)[1], 0.32)
  assert.deepEqual(predictBall([0, 1.1, 0, 1, 0, 0], 0.1, 0.2, 0.12, true), [0.1, 1.1, 0])
})

test('only the players listed in the state are in the match', () => {
  const state = { players: [{ sessionId: 'a', team: 'red' }] } as GymStatePayload
  assert.equal(myTeam(state, 'a'), 'red')
  assert.equal(myTeam(state, 'b'), null)
  assert.equal(myTeam(null, 'a'), null)
})

test('the shipped court contract gives the floor and the basket each team attacks', () => {
  const court = parseGymCourtView(JSON.parse(readFileSync(new URL('../../../public/assets/sports/gym/court.json', import.meta.url), 'utf8')))
  assert.equal(court.floorY, 0.2)
  assert.ok(court.baskets.red.x > court.baskets.blue.x)
  assert.throws(() => parseGymCourtView({ floorY: 0.2, baskets: {} }), /baskets.red.x/)
})

test('a basketball bounces between the hand and the floor, a football rolls just ahead of the toe', () => {
  assert.equal(dribbleHeight(1.0, 0.2, 0.12, 0), 1.0)
  assert.ok(Math.abs(dribbleHeight(1.0, 0.2, 0.12, 0.25) - 0.32) < 1e-9)
  const foot = carriedSpot('football', { x: 1, y: 0.25, z: 2 }, 0, 0.2, 0.11, 3)
  assert.ok(Math.abs(foot.z - 2.15) < 1e-9 && Math.abs(foot.y - 0.31) < 1e-9)
  assert.equal(carriedSpot('basketball', { x: 1, y: 1, z: 2 }, 0, 0.2, 0.12, 0).y, 1)
  assert.equal(dribbleBeat(0.2), dribbleBeat(0.24))
  assert.notEqual(dribbleBeat(0.24), dribbleBeat(0.26))
})

test('the ball a free player acts on is the one they hold, else the nearest loose one in reach', () => {
  const ball = (id: string, x: number, owner: string | null) => ({ id, sport: 'football' as const, lender: null, ball: [x, 0.31, 0, 0, 0, 0] as [number, number, number, number, number, number], owner })
  const balls = [ball('a', 1.5, null), ball('b', 0.8, null), ball('c', 9, 'me')]
  assert.equal(nearestFreeBall(balls, 'me', 0, 0, 2)?.id, 'c')
  assert.equal(nearestFreeBall(balls.slice(0, 2), 'me', 0, 0, 2)?.id, 'b')
  assert.equal(nearestFreeBall(balls.slice(0, 2), 'me', 5, 0, 2), null)
})
