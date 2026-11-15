import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { GymStatePayload } from '../../types/gameRealtime.ts'
import { COURT_FILES, FREE_PLAY_COACHES, carriedSpot, clampToArea, clockText, courtHoops, courtUrlOf, dribbleBeat, dribbleHeight, dribbleMove, goodWindowStart, hoopAhead, insideArea, lobFill, meterFill, myTeam, nearestFreeBall, parseGymCourtView, overchargeStart, parseGymHudRules, predictBall, scoreboardLines } from './gymMatch.ts'

const rules = (sport: string) => JSON.parse(readFileSync(new URL(`../../../public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))

test('the HUD reads its numbers from the shipped rules files', () => {
  const football = parseGymHudRules('football', rules('football'))
  assert.deepEqual(football.meter, { kind: 'charge', chargeMs: 1000, overFrom: 0.9 })
  assert.deepEqual(football.lob, { holdMs: 250, chargeMs: 750 })
  assert.equal(football.defendCooldownMs, 3000)
  assert.equal(football.standingCooldownMs, 1000)
  assert.equal(football.downMs, 800)
  const basketball = parseGymHudRules('basketball', rules('basketball'))
  assert.equal(basketball.meter.kind, 'bounce')
  assert.deepEqual(basketball.meter.kind === 'bounce' && basketball.meter.contest, { reachM: 2, tightM: 0.8, minShare: 0.45 })
  assert.equal(basketball.lob, null)
  assert.equal(basketball.defendCooldownMs, 2000)
  assert.equal(basketball.standingCooldownMs, null)
  assert.throws(() => parseGymHudRules('football', { ...rules('football'), shotChargeMs: 0 }), /shotChargeMs/)
})

test('the match clock counts down in m:ss and never shows a negative time', () => {
  assert.equal(clockText(240_000), '4:00')
  assert.equal(clockText(61_200), '1:02')
  assert.equal(clockText(-500), '0:00')
})

test('the football meter fills and holds; the basketball meter rises then falls, its good window narrows with distance', () => {
  const charge = { kind: 'charge', chargeMs: 1000, overFrom: 0.9 } as const
  assert.equal(meterFill(charge, 500), 0.5)
  assert.equal(meterFill(charge, 3000), 1)
  const bounce = { kind: 'bounce', riseMs: 900, windowNear: 0.18, windowFar: 0.07, farDistanceM: 12, contest: { reachM: 2, tightM: 0.8, minShare: 0.45 } } as const
  assert.equal(meterFill(bounce, 450), 0.5)
  assert.equal(meterFill(bounce, 1350), 0.5)
  assert.equal(meterFill(bounce, 2000), 0)
  assert.equal(goodWindowStart(charge, 5), null)
  assert.ok(Math.abs((goodWindowStart(bounce, 0) ?? 0) - 0.82) < 1e-9)
  assert.ok(Math.abs((goodWindowStart(bounce, 24) ?? 0) - 0.93) < 1e-9)
  assert.ok(Math.abs((goodWindowStart(bounce, 0, 2) ?? 0) - 0.82) < 1e-9)
  assert.ok(Math.abs((goodWindowStart(bounce, 0, 1.4) ?? 0) - (1 - 0.18 * 0.725)) < 1e-9)
  assert.ok(Math.abs((goodWindowStart(bounce, 0, 0.5) ?? 0) - (1 - 0.18 * 0.45)) < 1e-9)
  assert.equal(overchargeStart(charge), 0.9)
  assert.equal(overchargeStart(bounce), null)
})

test('the lob meter starts once the pass button is held 250 ms and fills in 750 ms', () => {
  const lob = { holdMs: 250, chargeMs: 750 }
  assert.equal(lobFill(lob, 249), null)
  assert.equal(lobFill(lob, 250), 0)
  assert.equal(lobFill(lob, 625), 0.5)
  assert.equal(lobFill(lob, 2000), 1)
  assert.equal(lobFill(null, 2000), null)
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
  assert.ok(court.baskets !== null && court.baskets.red.x > court.baskets.blue.x)
  assert.throws(() => parseGymCourtView({ floorY: 0.2, court: { minX: 0, maxX: 44, minZ: 0, maxZ: 24 }, baskets: {} }), /baskets.red.x/)
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
  const ball = (id: string, x: number, owner: string | null) => ({ id, court: 'gym', sport: 'football' as const, lender: null, ball: [x, 0.31, 0, 0, 0, 0] as [number, number, number, number, number, number], owner })
  const balls = [ball('a', 1.5, null), ball('b', 0.8, null), ball('c', 9, 'me')]
  assert.equal(nearestFreeBall(balls, 'me', 0, 0, 2)?.id, 'c')
  assert.equal(nearestFreeBall(balls.slice(0, 2), 'me', 0, 0, 2)?.id, 'b')
  assert.equal(nearestFreeBall(balls.slice(0, 2), 'me', 5, 0, 2), null)
})

test('the scoreboard shows the score and the clock in a match, the gym name otherwise', () => {
  assert.deepEqual(scoreboardLines(null), ['COVE GYM', ''])
  assert.deepEqual(scoreboardLines({ score: { red: 3, blue: 1 }, clock: '2:05', half: 2, halves: 2 }), ['3 : 1', '2:05 · 2/2'])
  assert.deepEqual(scoreboardLines({ score: { red: 0, blue: 0 }, clock: '4:00', half: 1, halves: 1 }), ['0 : 0', '4:00'])
})

test('the shipped court contract gives the live scoreboard screen', () => {
  const court = parseGymCourtView(JSON.parse(readFileSync(new URL('../../../public/assets/sports/gym/court.json', import.meta.url), 'utf8')))
  assert.ok(court.scoreboard !== null && court.scoreboard.width > 1 && court.scoreboard.height > 0.5)
  assert.deepEqual(court.scoreboard?.facing, [-1, 0])
})

test('each venue and free-play court reads its own court file; the pitch has no baskets and no gym screen, and its coach lends only footballs', () => {
  assert.equal(courtUrlOf('gym_basketball'), '/assets/sports/gym/court.json')
  assert.equal(courtUrlOf('athletics'), '/assets/sports/athletics/pitch.json')
  assert.equal(courtUrlOf('athletics_football'), '/assets/sports/athletics/pitch.json')
  assert.throws(() => courtUrlOf('nowhere'), /nowhere/)
  assert.deepEqual(COURT_FILES, ['/assets/sports/gym/court.json', '/assets/sports/athletics/pitch.json'])
  assert.deepEqual(FREE_PLAY_COACHES.athletics_coach, ['football'])
  const pitch = parseGymCourtView(JSON.parse(readFileSync(new URL('../../../public/assets/sports/athletics/pitch.json', import.meta.url), 'utf8')))
  assert.deepEqual({ ...pitch, court: null, playArea: null }, { floorY: 0.03, court: null, playArea: null, baskets: null, sideBaskets: [], scoreboard: null })
  assert.ok(pitch.playArea.minX < pitch.court.minX && pitch.playArea.maxZ > pitch.court.maxZ)
  assert.ok(pitch.court.maxX - pitch.court.minX > 20 && pitch.court.maxZ - pitch.court.minZ > 10)
  assert.throws(() => parseGymCourtView({ floorY: 0.2, court: { minX: 1, maxX: 1, minZ: 0, maxZ: 5 } }), /court must have a size/)
  assert.throws(() => parseGymCourtView({ floorY: 0.2, court: { minX: 0, maxX: 44, minZ: 0, maxZ: 24 } }), /playArea.minX/)
})

test('a player is held inside the play area once they are in it', () => {
  const area = { minX: -2, maxX: 46, minZ: -2, maxZ: 26 }
  assert.deepEqual(clampToArea(area, 46.3, 10), { x: 46, z: 10 })
  assert.deepEqual(clampToArea(area, -5, 30), { x: -2, z: 26 })
  assert.deepEqual(clampToArea(area, 20, 10), { x: 20, z: 10 })
  assert.equal(insideArea(area, 46, 26), true)
  assert.equal(insideArea(area, 46.01, 10), false)
})

test('a dribble move hops to the side held on the screen, back with the back key or with no side held', () => {
  const near = (v: { x: number; z: number }, x: number, z: number) => assert.ok(Math.abs(v.x - x) < 1e-9 && Math.abs(v.z - z) < 1e-9, `${v.x}, ${v.z} is not ${x}, ${z}`)
  near(dribbleMove(0, 1, false), 1, 0)
  near(dribbleMove(0, -1, false), -1, 0)
  near(dribbleMove(0, 0, false), 0, 1)
  near(dribbleMove(0, 0, true), 0, 1)
  near(dribbleMove(0, 1, true), Math.SQRT1_2, Math.SQRT1_2)
  near(dribbleMove(Math.PI, 0, false), 0, -1)
  near(dribbleMove(Math.PI, 1, false), -1, 0)
})

test('a free-play shot goes to the hoop ahead: the nearest one, a hoop behind counting three times its distance', () => {
  const me = { x: 0, z: 0 }
  const ahead = { x: 0, y: 3, z: -5 }
  const behind = { x: 0, y: 3, z: 3 }
  const beside = { x: 4, y: 3, z: 0 }
  assert.equal(hoopAhead([behind, beside, ahead], me, 0), ahead)
  assert.equal(hoopAhead([behind, beside, ahead], me, Math.PI), behind)
  assert.equal(hoopAhead([{ x: 0, y: 3, z: 1 }, ahead], me, 0)?.z, 1)
  assert.equal(hoopAhead([], me, 0), null)
})

test('the gym court lists its two match baskets and its four free-play hoops', () => {
  const court = parseGymCourtView(JSON.parse(readFileSync(new URL('../../../public/assets/sports/gym/court.json', import.meta.url), 'utf8')))
  assert.equal(court.sideBaskets.length, 4)
  assert.equal(courtHoops(court).length, 6)
  assert.throws(() => parseGymCourtView({ floorY: 0.2, court: { minX: 0, maxX: 44, minZ: 0, maxZ: 24 }, sideBaskets: [{ x: 1, y: 2 }] }), /sideBaskets\[0\].z/)
})
