import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { type Ball, bounceBody, droppedThroughRim, launchToward, stepBall } from './gymBall.ts'
import { type GymCourt, basketsOf, courtObstacles, parseGymCourt } from './gymCourt.ts'
import { type Athlete, type GymEvent, type GymGame, actGym, chargeOf, goodWindow, meterOf, newGymGame, outcomeFor, releaseOf, stepGym } from './gymMatch.ts'
import { type BasketballRules, type FootballRules, gymPlayerRules, halvesOf, parseBasketballRules, parseFootballRules } from './gymRules.ts'

const rulesFile = (sport: string) => JSON.parse(readFileSync(new URL(`../../../front/public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const FOOTBALL = parseFootballRules(rulesFile('football'))
const BASKETBALL = parseBasketballRules(rulesFile('basketball'))
const EAST = -Math.PI / 2
const WEST = Math.PI / 2

function basket(side: 1 | -1) {
  const board = { minX: side * 20.8 - 0.025, maxX: side * 20.8 + 0.025, minY: 3.1, maxY: 4.15, minZ: -0.9, maxZ: 0.9 }
  return { x: side * 20.425, y: 3.25, z: 0, rimRadius: 0.225, board, threePointRadius: 6.75 }
}

const SIDE_HOOP = { x: -8, y: 3.25, z: 12.625, rimRadius: 0.225, board: { minX: -8.9, maxX: -7.1, minY: 3.1, maxY: 4.15, minZ: 12.975, maxZ: 13.025 } }

const COURT: GymCourt = parseGymCourt({
  walls: true,
  floorY: 0.2,
  ceilingY: 9,
  arena: { minX: -24, maxX: 24, minZ: -14, maxZ: 14 },
  playArea: { minX: -23, maxX: 23, minZ: -14, maxZ: 12 },
  court: { minX: -22, maxX: 22, minZ: -12, maxZ: 12 },
  centre: { x: 0, z: 0 },
  coach: { x: 0, z: -13 },
  goals: { red: { lineX: 22, inward: 1, minZ: -1.5, maxZ: 1.5, height: 2, depth: 1 }, blue: { lineX: -22, inward: -1, minZ: -1.5, maxZ: 1.5, height: 2, depth: 1 } },
  baskets: { red: basket(1), blue: basket(-1) },
  sideBaskets: [SIDE_HOOP]
})
const EMPTY_WORLD = { floorY: 0.2, ceilingY: 9, arena: COURT.arena, rims: [], boxes: [] }
const COURT_WORLD = { floorY: 0.2, ceilingY: 9, arena: COURT.arena, ...courtObstacles(COURT) }

const T0 = 1_000_000

function athlete(accountId: number, team: 'red' | 'blue' | null, x: number, z: number, ry = EAST, vx = 0): Athlete {
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
  assert.ok(basketsOf(shipped).red.x > shipped.centre.x && basketsOf(shipped).blue.x < shipped.centre.x)
})

test('a court whose lines leave the arena is refused', () => {
  assert.throws(() => parseGymCourt({ ...COURT, court: { minX: -30, maxX: 22, minZ: -12, maxZ: 12 } }), /leave the arena/)
})

test('a dropped ball bounces, then rests and rolls to a stop on the floor', () => {
  const ball: Ball = { x: 0, y: 3, z: 0, vx: 3, vy: 0, vz: 0 }
  const world = EMPTY_WORLD
  for (let i = 0; i < 600; i++) stepBall(ball, FOOTBALL.ball, world, 1 / 60)
  assert.ok(Math.abs(ball.y - (0.2 + FOOTBALL.ball.radius)) < 1e-9)
  assert.equal(ball.vy, 0)
  assert.equal(Math.hypot(ball.vx, ball.vz), 0)
})

test('the ball bounces back off a wall instead of leaving the arena', () => {
  const ball: Ball = { x: 23.5, y: 0.31, z: 0, vx: 10, vy: 0, vz: 0 }
  stepBall(ball, FOOTBALL.ball, EMPTY_WORLD, 0.1)
  assert.ok(ball.x <= 24 - FOOTBALL.ball.radius)
  assert.ok(ball.vx < 0)
})

test('a launch aimed at the rim drops through it', () => {
  const rim = basketsOf(COURT).red
  const v = launchToward(15, 2.3, 0, rim.x, rim.y, rim.z, (52 * Math.PI) / 180)
  assert.ok(v)
  const ball: Ball = { x: 15, y: 2.3, z: 0, ...v }
  const world = EMPTY_WORLD
  const rimSpot = { x: rim.x, y: rim.y, z: rim.z, radius: rim.rimRadius }
  let through = false
  for (let i = 0; i < 240 && !through; i++) {
    const before = { ...ball }
    stepBall(ball, BASKETBALL.ball, world, 1 / 120)
    through = droppedThroughRim(before, ball, rimSpot)
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
  assert.ok(Math.abs(game.ball.x - (basketsOf(COURT).red.x - 1.2)) < 1e-9)
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

test('a ball kicked at a post bounces back, and the net stops a ball inside the goal', () => {
  const post: Ball = { x: 20, y: 0.5, z: 1.5, vx: 12, vy: 0, vz: 0 }
  for (let i = 0; i < 30; i++) stepBall(post, FOOTBALL.ball, COURT_WORLD, 1 / 60)
  assert.ok(post.vx < 0 && post.x < 22)
  const net: Ball = { x: 22.3, y: 0.5, z: 0, vx: 15, vy: 0, vz: 0 }
  for (let i = 0; i < 30; i++) stepBall(net, FOOTBALL.ball, COURT_WORLD, 1 / 60)
  assert.ok(net.x < 23 && Math.abs(net.vx) < 3)
})

test('a free ball bounces off a player in its way and keeps out of the body', () => {
  const ball: Ball = { x: 0.3, y: 0.31, z: 0, vx: -8, vy: 0, vz: 0 }
  assert.equal(bounceBody(ball, 0.11, 0.2, { x: 0, z: 0, vx: 0, vz: 0 }), true)
  assert.ok(ball.vx > 0 && ball.x >= 0.46 - 1e-9)
  const over: Ball = { x: 0.1, y: 2.5, z: 0, vx: -8, vy: 0, vz: 0 }
  assert.equal(bounceBody(over, 0.12, 0.2, { x: 0, z: 0, vx: 0, vz: 0 }), false)
})

test('football: a player who may not touch the ball blocks it with his body', () => {
  const game = freshGame(FOOTBALL)
  game.restart = { team: 'blue', until: T0 + 3000 }
  game.ball = { x: -3, y: 0.31, z: 0, vx: 10, vy: 0, vz: 0 }
  const red = athlete(1, 'red', 0, 0)
  run(game, FOOTBALL, [red], 0.5, T0)
  assert.equal(game.owner, null)
  assert.ok(game.ball.x < 0 && game.ball.vx <= 0)
})

test('free play: anyone takes the ball, a goal or a basket counts nothing, a steal works without teams', () => {
  const football = newGymGame(COURT, FOOTBALL, T0, 'free', { x: 21.5, z: 0 })
  const a = athlete(1, null, 21, 0, EAST)
  stepGym(football, FOOTBALL, [a], 1 / 60, T0)
  assert.equal(football.owner, 1)
  actGym(football, FOOTBALL, a, [a], 'shot_start', T0 + 10, () => 0.5)
  actGym(football, FOOTBALL, a, [a], 'shot_release', T0 + 900, () => 0.5)
  a.x = 0
  assert.deepEqual(scores(run(football, FOOTBALL, [a], 2, T0 + 950)), [])
  assert.deepEqual(football.score, { red: 0, blue: 0 })
  const basketball = newGymGame(COURT, BASKETBALL, T0, 'free')
  const carrier = athlete(2, null, 0, 0)
  const thief = athlete(3, null, 1, 0, WEST)
  basketball.owner = 2
  assert.deepEqual(actGym(basketball, BASKETBALL, thief, [carrier, thief], 'tackle', T0, () => 0.1), [{ kind: 'steal', accountId: 3, won: true }])
})

test('free play basketball: a shot goes to the hoop the player faces, side hoops included', () => {
  const game = newGymGame(COURT, BASKETBALL, T0, 'free')
  const a = athlete(4, null, -8, 8, Math.PI)
  game.owner = 4
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + 900, () => 0.5)
  assert.ok(game.ball.vz > 0 && Math.abs(game.ball.vx) < 0.5)
  a.x = 20
  let through = false
  for (let i = 0; i < 180 && !through; i++) {
    const before = { ...game.ball }
    stepGym(game, BASKETBALL, [a], 1 / 60, T0 + 900 + i * 16)
    through = droppedThroughRim(before, game.ball, { x: SIDE_HOOP.x, y: SIDE_HOOP.y, z: SIDE_HOOP.z, radius: SIDE_HOOP.rimRadius })
  }
  assert.ok(through)
})

test('basketball: a release in the green window always scores, even from deep with the aim off', () => {
  for (const [x, aimOff] of [[12, 0.2], [10, -0.25], [17, 0.1]] as const) {
    const { events } = shoot(x, 900, EAST + aimOff)
    assert.equal(events.length, 1, `from ${20.425 - x} m, aim off ${aimOff}`)
  }
})

test('basketball: the release is perfect at the top of the window, good below, early or late outside', () => {
  assert.equal(releaseOf(BASKETBALL, 900, 5), 'perfect')
  assert.equal(releaseOf(BASKETBALL, 900 * 0.8, 5), 'good')
  assert.equal(releaseOf(BASKETBALL, 300, 5), 'early')
  assert.equal(releaseOf(BASKETBALL, 1500, 5), 'late')
  const game = freshGame(BASKETBALL)
  const a = athlete(9, 'red', 16, 0)
  game.owner = 9
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + 900, () => 0.5), [{ kind: 'kick', accountId: 9, shot: true, release: 'perfect' }])
})

const PITCH: GymCourt = parseGymCourt(JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/athletics/pitch.json', import.meta.url), 'utf8')))

function restartTeam(game: GymGame): string | null {
  return game.restart?.team ?? null
}

function pitchGame(mode: 'match' | 'free' = 'match'): GymGame {
  const game = newGymGame(PITCH, FOOTBALL, T0, mode)
  game.restart = null
  return game
}

test('the outdoor pitch has no walls and no baskets', () => {
  assert.equal(PITCH.walls, false)
  assert.equal(PITCH.baskets, null)
  assert.throws(() => basketsOf(PITCH), /no baskets/)
  assert.throws(() => parseGymCourt({ ...PITCH, walls: undefined }), /walls/)
})

test('outdoors, a ball over the side line comes back on the line, for the team that did not touch it last', () => {
  const game = pitchGame()
  const { centre, court } = PITCH
  const a = athlete(1, 'red', centre.x, court.minZ + 1.5, 0)
  game.ball = { x: centre.x, y: PITCH.floorY + FOOTBALL.ball.radius, z: court.minZ + 1, vx: 0, vy: 0, vz: -10 }
  run(game, FOOTBALL, [], 2, T0)
  assert.equal(game.lastTouch, null)
  assert.equal(restartTeam(game), 'red')
  assert.ok(Math.abs(game.ball.z - (court.minZ + 0.3)) < 1e-9)
  assert.equal(game.ball.vz, 0)
  game.restart = null
  game.lastTouch = { accountId: a.accountId, team: 'red' }
  game.ball = { x: centre.x, y: PITCH.floorY + FOOTBALL.ball.radius, z: court.minZ + 1, vx: 0, vy: 0, vz: -10 }
  run(game, FOOTBALL, [], 2, T0 + 5000)
  assert.equal(restartTeam(game), 'blue')
})

test('outdoors, a carrier who runs off the pitch loses the ball to the other team', () => {
  const game = pitchGame()
  const { centre, court } = PITCH
  const a = athlete(1, 'blue', centre.x, court.maxZ - 0.5, Math.PI)
  game.ball = { x: centre.x, y: PITCH.floorY + FOOTBALL.ball.radius, z: court.maxZ - 0.5, vx: 0, vy: 0, vz: 0 }
  stepGym(game, FOOTBALL, [a], 1 / 60, T0)
  assert.equal(game.owner, 1)
  a.z = court.maxZ + 1
  stepGym(game, FOOTBALL, [a], 1 / 60, T0 + 20)
  assert.equal(game.owner, null)
  assert.equal(restartTeam(game), 'red')
  assert.ok(Math.abs(game.ball.z - (court.maxZ - 0.3)) < 1e-9)
})

test('in free play outdoors a ball that leaves the pitch rests on the line, with no restart', () => {
  const game = pitchGame('free')
  const { centre, court } = PITCH
  game.ball = { x: court.maxX - 0.5, y: PITCH.floorY + FOOTBALL.ball.radius, z: centre.z, vx: 10, vy: 0, vz: 0 }
  run(game, FOOTBALL, [], 2, T0)
  assert.equal(game.restart, null)
  assert.ok(Math.abs(game.ball.x - (court.maxX - 0.3)) < 1e-9)
})

test('indoors the side wall still bounces the ball back instead of a throw-in', () => {
  const game = freshGame(FOOTBALL)
  game.ball = { x: 0, y: COURT.floorY + FOOTBALL.ball.radius, z: 11.5, vx: 0, vy: 0, vz: 8 }
  run(game, FOOTBALL, [], 1, T0)
  assert.equal(game.restart, null)
})
