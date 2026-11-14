import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { type Ball, droppedThroughRim, launchToward, stepBall } from './gymBall.ts'
import { type GymCourt, parseGymCourt } from './gymCourt.ts'
import { type Athlete, type GymEvent, type GymGame, actGym, chargeOf, goodWindow, meterOf, newGymGame, outcomeFor, stepGym } from './gymMatch.ts'
import { type BasketballRules, type FootballRules, gymPlayerRules, halvesOf, parseBasketballRules, parseFootballRules } from './gymRules.ts'

const rulesFile = (sport: string) => JSON.parse(readFileSync(new URL(`../../../front/public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const FOOTBALL = parseFootballRules(rulesFile('football'))
const BASKETBALL = parseBasketballRules(rulesFile('basketball'))
const EAST = -Math.PI / 2
const WEST = Math.PI / 2

function basket(side: 1 | -1) {
  return { x: side * 20.425, y: 3.25, z: 0, rimRadius: 0.225, boardX: side * 20.8, boardHalfWidth: 0.9, boardBottom: 3.1, boardTop: 4.15, threePointRadius: 6.75 }
}

const COURT: GymCourt = parseGymCourt({
  floorY: 0.2,
  ceilingY: 9,
  arena: { minX: -24, maxX: 24, minZ: -14, maxZ: 14 },
  playArea: { minX: -23, maxX: 23, minZ: -14, maxZ: 12 },
  court: { minX: -22, maxX: 22, minZ: -12, maxZ: 12 },
  centre: { x: 0, z: 0 },
  coach: { x: 0, z: -13 },
  goals: { red: { lineX: 22, inward: 1, minZ: -1.5, maxZ: 1.5, height: 2 }, blue: { lineX: -22, inward: -1, minZ: -1.5, maxZ: 1.5, height: 2 } },
  baskets: { red: basket(1), blue: basket(-1) }
})

const T0 = 1_000_000

function athlete(accountId: number, team: 'red' | 'blue', x: number, z: number, ry = EAST, vx = 0): Athlete {
  return { accountId, team, x, z, vx, vz: 0, ry }
}

function run(game: GymGame, rules: FootballRules | BasketballRules, athletes: Athlete[], seconds: number, now: number): GymEvent[] {
  const events: GymEvent[] = []
  for (let i = 0; i < seconds * 60; i++) events.push(...stepGym(game, rules, athletes, 1 / 60, now + i * 16))
  return events
}

function freshGame(rules: FootballRules | BasketballRules): GymGame {
  const game = newGymGame(COURT, rules, T0)
  game.restart = null
  return game
}

function scores(events: GymEvent[]) {
  return events.filter((e) => e.kind === 'score')
}

test('the shipped rules files parse, and the 2 x 4 min length has two halves', () => {
  assert.equal(FOOTBALL.sport, 'football')
  assert.equal(BASKETBALL.sport, 'basketball')
  assert.equal(halvesOf(FOOTBALL, 480), 2)
  assert.equal(halvesOf(BASKETBALL, 240), 1)
  assert.deepEqual(gymPlayerRules(rulesFile('football'), 'football'), { minPlayers: 4, rejoinGraceMs: 30_000, coachId: 'gym_coach' })
  assert.throws(() => parseFootballRules({ ...rulesFile('football'), passPower: null }), /passPower/)
  assert.throws(() => parseBasketballRules({ ...rulesFile('basketball'), steal: { reachM: 1, chance: 1.4, cooldownMs: 10 } }), /chance/)
})

test('the shipped court contract parses and red attacks east', () => {
  const shipped = parseGymCourt(JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/gym/court.json', import.meta.url), 'utf8')))
  assert.ok(shipped.goals.red.lineX > shipped.goals.blue.lineX)
  assert.ok(shipped.baskets.red.x > shipped.centre.x && shipped.baskets.blue.x < shipped.centre.x)
})

test('a court whose lines leave the arena is refused', () => {
  assert.throws(() => parseGymCourt({ ...COURT, court: { minX: -30, maxX: 22, minZ: -12, maxZ: 12 } }), /leave the arena/)
})

test('a dropped ball bounces, then rests and rolls to a stop on the floor', () => {
  const ball: Ball = { x: 0, y: 3, z: 0, vx: 3, vy: 0, vz: 0 }
  const world = { floorY: 0.2, ceilingY: 9, arena: COURT.arena, baskets: [] }
  for (let i = 0; i < 600; i++) stepBall(ball, FOOTBALL.ball, world, 1 / 60)
  assert.ok(Math.abs(ball.y - (0.2 + FOOTBALL.ball.radius)) < 1e-9)
  assert.equal(ball.vy, 0)
  assert.equal(Math.hypot(ball.vx, ball.vz), 0)
})

test('the ball bounces back off a wall instead of leaving the arena', () => {
  const ball: Ball = { x: 23.5, y: 0.31, z: 0, vx: 10, vy: 0, vz: 0 }
  stepBall(ball, FOOTBALL.ball, { floorY: 0.2, ceilingY: 9, arena: COURT.arena, baskets: [] }, 0.1)
  assert.ok(ball.x <= 24 - FOOTBALL.ball.radius)
  assert.ok(ball.vx < 0)
})

test('a launch aimed at the rim drops through it', () => {
  const rim = COURT.baskets.red
  const v = launchToward(15, 2.3, 0, rim.x, rim.y, rim.z, (52 * Math.PI) / 180)
  assert.ok(v)
  const ball: Ball = { x: 15, y: 2.3, z: 0, ...v }
  const world = { floorY: 0.2, ceilingY: 9, arena: COURT.arena, baskets: [] }
  let through = false
  for (let i = 0; i < 240 && !through; i++) {
    const before = { ...ball }
    stepBall(ball, BASKETBALL.ball, world, 1 / 120)
    through = droppedThroughRim(before, ball, rim)
  }
  assert.ok(through)
})

test('football: running into the ball takes it, and it stays at the feet', () => {
  const game = freshGame(FOOTBALL)
  const a = athlete(1, 'red', 0.5, 0, WEST)
  stepGym(game, FOOTBALL, [a], 1 / 60, T0)
  assert.equal(game.owner, 1)
  a.x = 5
  stepGym(game, FOOTBALL, [a], 1 / 60, T0 + 20)
  assert.ok(Math.abs(game.ball.x - (5 - FOOTBALL.carryAheadM)) < 1e-9)
})

test('football: a pass goes along the facing and the passer cannot take it back at once', () => {
  const game = freshGame(FOOTBALL)
  const a = athlete(1, 'red', -0.5, 0, EAST)
  stepGym(game, FOOTBALL, [a], 1 / 60, T0)
  const events = actGym(game, FOOTBALL, a, [a], 'pass', T0 + 10, () => 0.5)
  assert.deepEqual(events, [{ kind: 'kick', accountId: 1, shot: false }])
  assert.equal(game.owner, null)
  assert.ok(Math.abs(game.ball.vx - FOOTBALL.passSpeed) < 1e-9)
  stepGym(game, FOOTBALL, [a], 1 / 60, T0 + 20)
  assert.equal(game.owner, null)
})

test('football: shot power comes from the server clock between press and release', () => {
  assert.equal(chargeOf(500, 1000), 0.5)
  assert.equal(chargeOf(4000, 1000), 1)
  const game = freshGame(FOOTBALL)
  const a = athlete(1, 'red', -0.5, 0, EAST)
  stepGym(game, FOOTBALL, [a], 1 / 60, T0)
  actGym(game, FOOTBALL, a, [a], 'shot_start', T0 + 10, () => 0.5)
  actGym(game, FOOTBALL, a, [a], 'shot_release', T0 + 1010, () => 0.5)
  assert.ok(Math.abs(game.ball.vx - FOOTBALL.shotSpeed[1]) < 1e-9)
  assert.equal(actGym(game, FOOTBALL, a, [a], 'shot_release', T0 + 1100, () => 0.5).length, 0)
})

test('football: a ball into the east goal scores for red, credits the shooter and restarts at the centre for blue', () => {
  const game = freshGame(FOOTBALL)
  const a = athlete(7, 'red', 15, 0, EAST)
  game.ball = { x: 15.5, y: 0.31, z: 0, vx: 0, vy: 0, vz: 0 }
  stepGym(game, FOOTBALL, [a], 1 / 60, T0)
  actGym(game, FOOTBALL, a, [a], 'shot_start', T0 + 10, () => 0.5)
  actGym(game, FOOTBALL, a, [a], 'shot_release', T0 + 600, () => 0.5)
  a.x = -10
  const events = scores(run(game, FOOTBALL, [a], 2, T0 + 700))
  assert.deepEqual(events, [{ kind: 'score', team: 'red', scorer: 7, points: 1, dunk: false }])
  assert.deepEqual(game.score, { red: 1, blue: 0 })
  assert.equal(game.tallies.get(7), 1)
  assert.equal(game.restart?.team, 'blue')
  assert.ok(Math.abs(game.ball.x) < 1e-9 && game.ball.vx === 0)
})

test('football: during the restart only the conceding team may take the ball', () => {
  const game = freshGame(FOOTBALL)
  game.restart = { team: 'blue', until: T0 + 3000 }
  const red = athlete(1, 'red', 0.4, 0)
  const blue = athlete(2, 'blue', 0.6, 0)
  stepGym(game, FOOTBALL, [red, blue], 1 / 60, T0)
  assert.equal(game.owner, 2)
})

test('football: a tackle in front takes the ball; a miss puts the player down and the cooldown holds', () => {
  const game = freshGame(FOOTBALL)
  const carrier = athlete(1, 'red', 0, 0, EAST)
  const defender = athlete(2, 'blue', 2.0, 0, WEST)
  stepGym(game, FOOTBALL, [carrier], 1 / 60, T0)
  stepGym(game, FOOTBALL, [carrier], 1 / 60, T0 + 5)
  assert.equal(game.owner, 1)
  assert.deepEqual(actGym(game, FOOTBALL, defender, [carrier, defender], 'tackle', T0 + 10, () => 0.5), [{ kind: 'tackle', accountId: 2, won: true }])
  assert.equal(game.owner, 2)
  assert.deepEqual(actGym(game, FOOTBALL, defender, [carrier, defender], 'tackle', T0 + 1000, () => 0.5), [])
  const behind = athlete(3, 'red', 6, 0, EAST)
  assert.deepEqual(actGym(game, FOOTBALL, behind, [carrier, defender, behind], 'tackle', T0 + 20, () => 0.5), [{ kind: 'tackle', accountId: 3, won: false }])
  assert.deepEqual(actGym(game, FOOTBALL, behind, [carrier, defender, behind], 'pass', T0 + 500, () => 0.5), [])
})

test('basketball: the meter rises then falls, and the good window narrows with distance', () => {
  assert.deepEqual(meterOf(450, 900), { value: 0.5, rising: true })
  assert.deepEqual(meterOf(1350, 900), { value: 0.5, rising: false })
  assert.equal(goodWindow(BASKETBALL, 0), BASKETBALL.shotMeter.windowNear)
  assert.equal(goodWindow(BASKETBALL, 50), BASKETBALL.shotMeter.windowFar)
})

function shoot(x: number, heldMs: number, ry = EAST) {
  const game = freshGame(BASKETBALL)
  const a = athlete(5, 'red', x, 0, ry)
  game.owner = 5
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + heldMs, () => 0.5)
  a.x = 0
  return { game, events: scores(run(game, BASKETBALL, [a], 3, T0 + heldMs)) }
}

test('basketball: a well-timed shot scores 2 inside the arc and 3 beyond it', () => {
  assert.deepEqual(shoot(16, 900).events, [{ kind: 'score', team: 'red', scorer: 5, points: 2, dunk: false }])
  const three = shoot(12.5, 880)
  assert.deepEqual(three.events, [{ kind: 'score', team: 'red', scorer: 5, points: 3, dunk: false }])
  assert.equal(three.game.threes.get(5), 1)
})

test('basketball: good timing corrects a small aim error, bad timing misses', () => {
  assert.equal(shoot(16, 900, EAST + 0.05).events.length, 1)
  assert.equal(shoot(16, 300).events.length, 0)
})

test('basketball: after a basket the other team restarts under it', () => {
  const { game } = shoot(16, 900)
  assert.equal(game.restart?.team, 'blue')
  assert.ok(Math.abs(game.ball.x - (COURT.baskets.red.x - 1.2)) < 1e-9)
})

test('basketball: a steal is rolled by the server and has a cooldown', () => {
  const game = freshGame(BASKETBALL)
  const carrier = athlete(1, 'red', 0, 0)
  const defender = athlete(2, 'blue', 1, 0, WEST)
  game.owner = 1
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0, () => 0.9), [{ kind: 'steal', accountId: 2, won: false }])
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0 + 1000, () => 0.1), [])
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0 + 2100, () => 0.1), [{ kind: 'steal', accountId: 2, won: true }])
  assert.equal(game.owner, 2)
})

test('basketball: a defender who jumps with the release blocks the shot', () => {
  const game = freshGame(BASKETBALL)
  const shooter = athlete(1, 'red', 14, 0)
  const defender = athlete(2, 'blue', 15, 0, WEST)
  game.owner = 1
  actGym(game, BASKETBALL, shooter, [shooter, defender], 'shot_start', T0, () => 0.5)
  actGym(game, BASKETBALL, defender, [shooter, defender], 'jump', T0 + 700, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, shooter, [shooter, defender], 'shot_release', T0 + 900, () => 0.5), [{ kind: 'block', accountId: 2 }])
  assert.equal(game.lastShot, null)
})

test('basketball: a running shot near the rim is a dunk that almost always scores', () => {
  const game = freshGame(BASKETBALL)
  const a = athlete(1, 'red', 19.5, 0, EAST, 6)
  game.owner = 1
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + 100, () => 0.5), [{ kind: 'score', team: 'red', scorer: 1, points: 2, dunk: true }])
})

test('basketball: only the carrier can pass or shoot', () => {
  const game = freshGame(BASKETBALL)
  const a = athlete(1, 'red', 0, 0)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'pass', T0, () => 0.5), [])
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  assert.equal(game.shotStartedAt.size, 0)
})

test('match outcome per team, a forfeit counts against the empty team', () => {
  assert.equal(outcomeFor('red', { red: 2, blue: 1 }, undefined), 'win')
  assert.equal(outcomeFor('blue', { red: 2, blue: 2 }, undefined), 'draw')
  assert.equal(outcomeFor('red', { red: 5, blue: 0 }, 'red'), 'loss')
  assert.equal(outcomeFor('blue', { red: 0, blue: 0 }, null), 'draw')
})
