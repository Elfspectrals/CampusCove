import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { GymStatePayload } from '../../types/gameRealtime.ts'
import { clockText, goodWindowStart, meterFill, myTeam, parseGymCourtView, parseGymHudRules, predictBall } from './gymMatch.ts'

const rules = (sport: string) => JSON.parse(readFileSync(new URL(`../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))

test('the HUD reads its numbers from the shipped rules files', () => {
  const football = parseGymHudRules('football', rules('football'))
  assert.deepEqual(football.meter, { kind: 'charge', chargeMs: 1000 })
  assert.equal(football.defendCooldownMs, 3000)
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
