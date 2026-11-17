import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { type Ball, bounceBody, droppedThroughRim, launchToward, stepBall } from './gymBall.ts'
import { type GymCourt, basketsOf, courtObstacles, parseGymCourt } from './gymCourt.ts'
import { type Athlete, type GymEvent, type GymGame, actGym, carryAhead, chargeOf, contestShare, dunkRange, goodWindow, meterOf, newGymGame, outcomeFor, passTarget, releaseOf, stepGym } from './gymMatch.ts'
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
  assert.deepEqual(gymPlayerRules(rulesFile('football'), 'football'), { minPlayers: 4, rejoinGraceMs: 10_000, coachId: 'gym_coach' })
  assert.throws(() => parseFootballRules({ ...rulesFile('football'), passPower: null }), /passPower/)
  assert.throws(() => parseBasketballRules({ ...rulesFile('basketball'), shove: { ...rulesFile('basketball').shove, reachM: -1 } }), /shove.reachM/)
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

function near(actual: number, expected: number, what: string, within = 1e-6): void {
  assert.ok(Math.abs(actual - expected) <= within, `${what}: ${actual} is not ${expected}`)
}

function carrying(a: Athlete): GymGame {
  const game = freshGame(FOOTBALL)
  game.owner = a.accountId
  game.ball = { x: a.x + 0.55, y: 0.2 + FOOTBALL.ball.radius, z: a.z, vx: 0, vy: 0, vz: 0 }
  return game
}

test('football: a pass goes to the team-mate most in front within 35 degrees, faster the further he is, never to an opponent', () => {
  const passer = athlete(1, 'red', 0, 0)
  const mate = athlete(2, 'red', 10, 2)
  const wide = athlete(3, 'red', 5, -8)
  const rival = athlete(4, 'blue', 8, 0)
  assert.equal(passTarget(passer, [passer, mate, wide, rival], FOOTBALL.passAssist), mate)
  assert.equal(passTarget(passer, [passer, wide, rival], FOOTBALL.passAssist), null)
  assert.equal(passTarget(passer, [passer, athlete(5, 'red', 31, 0)], FOOTBALL.passAssist), null)
  const game = carrying(passer)
  actGym(game, FOOTBALL, passer, [passer, mate, wide, rival], 'pass', T0, () => 0.5)
  const d = Math.hypot(10, 2)
  near(Math.hypot(game.ball.vx, game.ball.vz), 8 + d * 0.35, 'speed')
  near(game.ball.vz / game.ball.vx, 0.2, 'towards the team-mate')
  const far = carrying(passer)
  actGym(far, FOOTBALL, passer, [passer, athlete(6, 'red', 29, 0)], 'pass', T0, () => 0.5)
  near(Math.hypot(far.ball.vx, far.ball.vz), 16, 'speed capped')
})

test('football: a pass leads a running team-mate, and with nobody in front it goes straight at the base speed', () => {
  const passer = athlete(1, 'red', 0, 0)
  const runner = { ...athlete(2, 'red', 10, 0), vz: 4 }
  const game = carrying(passer)
  actGym(game, FOOTBALL, passer, [passer, runner], 'pass', T0, () => 0.5)
  const flight = 10 / (8 + 10 * 0.35)
  near(game.ball.vz / game.ball.vx, (4 * flight) / 10, 'aimed where he will be')
  const alone = carrying(passer)
  actGym(alone, FOOTBALL, passer, [passer], 'pass', T0, () => 0.5)
  near(alone.ball.vx, 8, 'straight')
  near(alone.ball.vz, 0, 'no drift')
})

test('football: the pass button held under 250 ms is a ground pass, held longer a lob that lands 10 to 30 m ahead of the passer or on the team-mate', () => {
  const passer = athlete(1, 'red', 0, 0)
  const range = (game: GymGame) => (Math.hypot(game.ball.vx, game.ball.vz) * 2 * game.ball.vy) / 9.81
  const tap = carrying(passer)
  actGym(tap, FOOTBALL, passer, [passer], 'pass_start', T0, () => 0.5)
  actGym(tap, FOOTBALL, passer, [passer], 'pass_release', T0 + 249, () => 0.5)
  near(tap.ball.vy, FOOTBALL.passLift, 'ground pass')
  for (const [heldMs, metres] of [[250, 10], [625, 20], [1000, 30], [3000, 30]] as const) {
    const game = carrying(passer)
    actGym(game, FOOTBALL, passer, [passer], 'pass_start', T0, () => 0.5)
    actGym(game, FOOTBALL, passer, [passer], 'pass_release', T0 + heldMs, () => 0.5)
    near(range(game), metres - 0.55, `lob held ${heldMs} ms`, 0.05)
  }
  const mate = athlete(2, 'red', 15, 0)
  const toMate = carrying(passer)
  actGym(toMate, FOOTBALL, passer, [passer, mate], 'pass_start', T0, () => 0.5)
  actGym(toMate, FOOTBALL, passer, [passer, mate], 'pass_release', T0 + 1000, () => 0.5)
  near(range(toMate), 15 - 0.55, 'lob to the team-mate', 0.05)
  const none = carrying(passer)
  actGym(none, FOOTBALL, passer, [passer], 'pass_release', T0 + 400, () => 0.5)
  assert.equal(none.owner, 1)
})

test('football: the ball runs further ahead of a sprinting carrier, 0.55 m walking to 1.15 m at full sprint', () => {
  for (const [speed, ahead] of [[0, 0.55], [5, 0.55], [6.75, 0.85], [8.5, 1.15], [12, 1.15]] as const) {
    near(carryAhead(FOOTBALL, athlete(1, 'red', 0, 0, EAST, speed)), ahead, `at ${speed} m/s`)
  }
  near(carryAhead(BASKETBALL, athlete(1, 'red', 0, 0, EAST, 8.5)), BASKETBALL.carryAheadM, 'basketball')
})

test('football: a shot up to 2.5 m wide of a post is pulled 0.35 m inside it; further wide, facing away or in free play it keeps its line', () => {
  const shot = (ry: number, mode: 'match' | 'free' = 'match') => {
    const shooter = athlete(1, mode === 'match' ? 'red' : null, 12, 0, ry)
    const game = mode === 'match' ? carrying(shooter) : { ...carrying(shooter), mode }
    actGym(game, FOOTBALL, shooter, [shooter], 'shot_start', T0, () => 0.5)
    actGym(game, FOOTBALL, shooter, [shooter], 'shot_release', T0 + 500, () => 0.5)
    return game.ball.vz / game.ball.vx
  }
  const facingZ = (zAtLine: number) => Math.atan2(-10, -zAtLine)
  near(shot(facingZ(0.5)), 0.05, 'on target, untouched')
  near(shot(facingZ(2.5)), 0.115, '1 m wide, pulled inside the post')
  near(shot(facingZ(-3.9)), -0.115, '2.4 m wide on the other side')
  near(shot(facingZ(4.1)), 0.41, '2.6 m wide, left alone')
  near(shot(facingZ(2.5), 'free'), 0.25, 'free play')
  near(shot(WEST), 0, 'facing away')
})

test('football: a shot charged to 90 % or more lifts 3 m/s more and flies over the bar from 12 m', () => {
  const lift = (heldMs: number) => {
    const shooter = athlete(1, 'red', 12, 0)
    const game = carrying(shooter)
    actGym(game, FOOTBALL, shooter, [shooter], 'shot_start', T0, () => 0.5)
    actGym(game, FOOTBALL, shooter, [shooter], 'shot_release', T0 + heldMs, () => 0.5)
    return game
  }
  near(lift(890).ball.vy, 1 + 3 * 0.89, 'under the limit')
  near(lift(900).ball.vy, 1 + 3 * 0.9 + 3, 'at the limit')
  const over = lift(1000)
  const toLine = (22 - over.ball.x) / over.ball.vx
  assert.ok(over.ball.y - 0.2 + over.ball.vy * toLine - (9.81 * toLine * toLine) / 2 > 2)
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

test('football: a sliding tackle in front takes the ball; a miss puts the player down and the cooldown holds', () => {
  const game = freshGame(FOOTBALL)
  const carrier = athlete(1, 'red', 0, 0, EAST)
  const defender = athlete(2, 'blue', 2.0, 0, WEST, -7)
  stepGym(game, FOOTBALL, [carrier], 1 / 60, T0)
  stepGym(game, FOOTBALL, [carrier], 1 / 60, T0 + 5)
  assert.equal(game.owner, 1)
  assert.deepEqual(actGym(game, FOOTBALL, defender, [carrier, defender], 'tackle', T0 + 10, () => 0.5), [{ kind: 'tackle', accountId: 2, won: true, slide: true }])
  assert.equal(game.owner, 2)
  assert.deepEqual(actGym(game, FOOTBALL, defender, [carrier, defender], 'tackle', T0 + 1000, () => 0.5), [])
  const behind = athlete(3, 'red', 6, 0, EAST, 7)
  assert.deepEqual(actGym(game, FOOTBALL, behind, [carrier, defender, behind], 'tackle', T0 + 20, () => 0.5), [{ kind: 'tackle', accountId: 3, won: false, slide: true }])
  assert.deepEqual(actGym(game, FOOTBALL, behind, [carrier, defender, behind], 'pass', T0 + 500, () => 0.5), [])
})

test('football: under 6.5 m/s the tackle is a standing one: 1.1 m of reach, no fall on a miss, 1 s of cooldown', () => {
  const tackled = (x: number, vx: number) => {
    const game = carrying(athlete(1, 'red', 0, 0, EAST))
    const defender = athlete(2, 'blue', x, 0, WEST, vx)
    return { game, defender, events: actGym(game, FOOTBALL, defender, [athlete(1, 'red', 0, 0, EAST), defender], 'tackle', T0 + 10, () => 0.5) }
  }
  const ballX = carryAhead(FOOTBALL, athlete(1, 'red', 0, 0, EAST))
  const won = tackled(ballX + 1.05, 0)
  assert.deepEqual(won.events, [{ kind: 'tackle', accountId: 2, won: true, slide: false }])
  assert.equal(won.game.owner, 2)
  const missed = tackled(ballX + 1.15, 0)
  assert.deepEqual(missed.events, [{ kind: 'tackle', accountId: 2, won: false, slide: false }])
  assert.equal(missed.game.groundedUntil.get(2), undefined)
  assert.deepEqual(actGym(missed.game, FOOTBALL, missed.defender, [missed.defender], 'tackle', T0 + 1009, () => 0.5), [])
  assert.equal(actGym(missed.game, FOOTBALL, missed.defender, [missed.defender], 'tackle', T0 + 1010, () => 0.5).length, 1)
  assert.equal((tackled(ballX + 1.5, -6.4).events[0] as { slide: boolean }).slide, false)
  assert.deepEqual(tackled(ballX + 1.5, -6.5).events, [{ kind: 'tackle', accountId: 2, won: true, slide: true }])
})

test('football: a through ball goes 5 m ahead of the running team-mate at 13 m/s, past a standing one, straight ahead with nobody', () => {
  const passer = athlete(1, 'red', 0, 0, EAST)
  const thrown = (mates: Athlete[]) => {
    const game = carrying(passer)
    const events = actGym(game, FOOTBALL, passer, [passer, ...mates], 'through', T0 + 10, () => 0.5)
    return { events, vx: game.ball.vx, vz: game.ball.vz, owner: game.owner }
  }
  const running = thrown([{ ...athlete(2, 'red', 10, 2, EAST), vx: 0, vz: 5 }])
  assert.deepEqual(running.events, [{ kind: 'kick', accountId: 1, shot: false }])
  near(running.vx, (13 * 10) / Math.hypot(10, 7), 'towards the spot 5 m further along his run')
  near(running.vz, (13 * 7) / Math.hypot(10, 7), 'towards the spot 5 m further along his run')
  assert.equal(running.owner, null)
  const standing = thrown([athlete(2, 'red', 10, 0, EAST)])
  near(standing.vx, 13, 'past a standing team-mate, on the line to him')
  near(standing.vz, 0, 'no side speed')
  const alone = thrown([athlete(2, 'blue', 10, 0, EAST)])
  near(alone.vx, 13, 'straight ahead, never to an opponent')
  assert.deepEqual(actGym(freshGame(FOOTBALL), FOOTBALL, athlete(9, 'red', 30, 9, EAST), [], 'through', T0, () => 0.5), [])
})

test('basketball: the meter rises then falls, and the good window narrows with distance', () => {
  assert.deepEqual(meterOf(450, 900), { value: 0.5, rising: true })
  assert.deepEqual(meterOf(1350, 900), { value: 0.5, rising: false })
  assert.equal(goodWindow(BASKETBALL, 0), BASKETBALL.shotMeter.windowNear)
  assert.equal(goodWindow(BASKETBALL, 50), BASKETBALL.shotMeter.windowFar)
})

const TOP = BASKETBALL.shotMeter.riseMs

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
  assert.equal(TOP, 450)
  assert.deepEqual(shoot(16, TOP).events, [{ kind: 'score', team: 'red', scorer: 5, points: 2, dunk: false }])
  const three = shoot(12.5, TOP - 10)
  assert.deepEqual(three.events, [{ kind: 'score', team: 'red', scorer: 5, points: 3, dunk: false }])
  assert.equal(three.game.threes.get(5), 1)
})

test('basketball: good timing corrects a small aim error, bad timing misses', () => {
  assert.equal(shoot(16, TOP, EAST + 0.05).events.length, 1)
  assert.equal(shoot(16, TOP / 3).events.length, 0)
})

test('basketball: the shot never follows the look, with the back to the basket a good release scores and a bad one stays on the line to the rim', () => {
  assert.equal(shoot(16, TOP, WEST).events.length, 1)
  const game = freshGame(BASKETBALL)
  const sideways = athlete(5, 'red', 16, 0, 0)
  game.owner = 5
  actGym(game, BASKETBALL, sideways, [sideways], 'shot_start', T0, () => 1)
  assert.deepEqual(actGym(game, BASKETBALL, sideways, [sideways], 'shot_release', T0 + TOP / 3, () => 1), [{ kind: 'kick', accountId: 5, shot: true, release: 'early' }])
  assert.ok(game.ball.vx > 0)
  assert.ok(Math.abs(Math.atan2(game.ball.vz, game.ball.vx)) <= 0.05 + 1e-9, `off the line by ${Math.atan2(game.ball.vz, game.ball.vx)} rad`)
})

test('basketball: after a basket the other team restarts under it', () => {
  const { game } = shoot(16, TOP)
  assert.equal(game.restart?.team, 'blue')
  assert.ok(Math.abs(game.ball.x - (basketsOf(COURT).red.x - 1.2)) < 1e-9)
})

test('basketball: a shove from the front within 1.6 m knocks the carrier down 0.7 s and frees the ball; it has a 2.5 s cooldown', () => {
  const game = freshGame(BASKETBALL)
  const carrier = athlete(1, 'red', 0, 0)
  const defender = athlete(2, 'blue', 1, 0, WEST)
  game.owner = 1
  game.restart = null
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0, () => 0.9), [{ kind: 'steal', accountId: 2, won: true, target: 1 }])
  assert.equal(game.owner, null)
  assert.equal(game.groundedUntil.get(1), T0 + 700)
  assert.ok(game.ball.vx < 0 && game.ball.x < 0)
  stepGym(game, BASKETBALL, [carrier], 1 / 60, T0 + 100)
  assert.equal(game.owner, null)
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0 + 2499, () => 0.1), [])
  assert.deepEqual(actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0 + 2500, () => 0.1), [{ kind: 'steal', accountId: 2, won: false, target: null }])
})

test('basketball: a shove misses from too far, from behind, on a team-mate, and while the ball is protected after a basket', () => {
  const shoved = (defender: Athlete, restart = false) => {
    const game = freshGame(BASKETBALL)
    const carrier = athlete(1, 'red', 0, 0)
    game.owner = 1
    game.restart = restart ? { team: 'red', until: T0 + 3000 } : null
    return { events: actGym(game, BASKETBALL, defender, [carrier, defender], 'tackle', T0, () => 0.5), game }
  }
  const missed = (id: number) => [{ kind: 'steal', accountId: id, won: false, target: null }]
  assert.equal((shoved(athlete(2, 'blue', 1.59, 0, WEST)).events[0] as { won: boolean }).won, true)
  assert.deepEqual(shoved(athlete(2, 'blue', 1.61, 0, WEST)).events, missed(2))
  assert.deepEqual(shoved(athlete(2, 'blue', 1, 0, EAST)).events, missed(2))
  assert.deepEqual(shoved(athlete(3, 'red', 1, 0, WEST)).events, missed(3))
  const protectedBall = shoved(athlete(2, 'blue', 1, 0, WEST), true)
  assert.deepEqual(protectedBall.events, missed(2))
  assert.equal(protectedBall.game.owner, 1)
})

test('basketball: a player on the floor after a shove cannot shoot or pass', () => {
  const game = freshGame(BASKETBALL)
  const a = athlete(1, 'red', 16, 0)
  game.owner = 1
  game.groundedUntil.set(1, T0 + 700)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'pass', T0 + 100, () => 0.5), [])
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0 + 100, () => 0.5)
  assert.equal(game.shotStartedAt.size, 0)
  assert.equal(actGym(game, BASKETBALL, a, [a], 'pass', T0 + 700, () => 0.5).length, 1)
})

test('basketball: the dunk reaches 3 m from 4 m/s and 4.5 m at a sprint of 7 m/s or more, and is told as a dunk', () => {
  assert.deepEqual([3.9, 4, 6.9, 7, 9].map((speed) => dunkRange(BASKETBALL, speed)), [0, 3, 3, 4.5, 4.5])
  const rim = basketsOf(COURT).red.x
  const dunked = (metres: number, speed: number, roll: number) => {
    const game = newGymGame(COURT, BASKETBALL, T0, 'free')
    const a = athlete(1, null, rim - metres, 0, EAST, speed)
    game.owner = 1
    actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => roll)
    return actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + 100, () => roll)
  }
  assert.deepEqual(dunked(4.4, 7, 0.5), [{ kind: 'kick', accountId: 1, shot: true, dunk: true }])
  assert.deepEqual(dunked(4.4, 7, 0.99), [{ kind: 'kick', accountId: 1, shot: true, dunk: true }])
  assert.equal((dunked(4.4, 6.9, 0.5)[0] as { dunk?: boolean }).dunk, undefined)
  assert.equal((dunked(2.9, 4, 0.5)[0] as { dunk?: boolean }).dunk, true)
})

test('basketball: three baskets in a row by one player set them on fire, which doubles their green window, until the other team scores', () => {
  const game = freshGame(BASKETBALL)
  const red = athlete(1, 'red', basketsOf(COURT).red.x - 1, 0, EAST, 6)
  const blue = athlete(2, 'blue', basketsOf(COURT).blue.x + 1, 0, WEST, -6)
  const dunk = (a: Athlete, at: number) => {
    game.owner = a.accountId
    game.restart = null
    actGym(game, BASKETBALL, a, [red, blue], 'shot_start', at, () => 0)
    return actGym(game, BASKETBALL, a, [red, blue], 'shot_release', at + 100, () => 0)
  }
  dunk(red, T0)
  dunk(red, T0 + 5000)
  assert.equal(game.fire, null)
  dunk(red, T0 + 10_000)
  assert.deepEqual(game.fire, { accountId: 1, team: 'red' })
  assert.equal(releaseOf(BASKETBALL, TOP * 0.8, 12), 'early')
  assert.equal(releaseOf(BASKETBALL, TOP * 0.8, 12, BASKETBALL.fire.windowFactor), 'good')
  dunk(blue, T0 + 15_000)
  assert.equal(game.fire, null)
  assert.deepEqual(game.streak, { accountId: 2, count: 1 })
})

test('basketball: a defender who jumps with the release blocks the shot', () => {
  const game = freshGame(BASKETBALL)
  const shooter = athlete(1, 'red', 14, 0)
  const defender = athlete(2, 'blue', 15, 0, WEST)
  game.owner = 1
  actGym(game, BASKETBALL, shooter, [shooter, defender], 'shot_start', T0, () => 0.5)
  actGym(game, BASKETBALL, defender, [shooter, defender], 'jump', T0 + TOP - 200, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, shooter, [shooter, defender], 'shot_release', T0 + TOP, () => 0.5), [{ kind: 'block', accountId: 2 }])
  assert.equal(game.lastShot, null)
})

test('basketball: a running shot near the rim is a dunk that almost always scores', () => {
  const game = freshGame(BASKETBALL)
  const a = athlete(1, 'red', 19.5, 0, EAST, 6)
  game.owner = 1
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + 100, () => 0.5), [{ kind: 'score', team: 'red', scorer: 1, points: 2, dunk: true }])
})

test('basketball: a defender within 2 m narrows the good window, down to 45 % of it from 0.8 m', () => {
  for (const [distance, share] of [[null, 1], [2.5, 1], [2, 1], [1.4, 0.725], [0.8, 0.45], [0.3, 0.45]] as const) {
    near(contestShare(BASKETBALL, distance), share, `defender at ${distance}`)
  }
  near(goodWindow(BASKETBALL, 0, 0.45), BASKETBALL.shotMeter.windowNear * 0.45, 'guarded window')
  assert.equal(releaseOf(BASKETBALL, TOP * 0.8, 4.425), 'good')
  assert.equal(releaseOf(BASKETBALL, TOP * 0.8, 4.425, 0.45), 'early')
  const game = freshGame(BASKETBALL)
  const shooter = athlete(1, 'red', 16, 0)
  const guard = athlete(2, 'blue', 16.5, 0, WEST)
  const mate = athlete(3, 'red', 16.2, 0.2)
  game.owner = 1
  actGym(game, BASKETBALL, shooter, [shooter, guard, mate], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, shooter, [shooter, guard, mate], 'shot_release', T0 + TOP * 0.8, () => 0.5), [{ kind: 'kick', accountId: 1, shot: true, release: 'early' }])
  const open = freshGame(BASKETBALL)
  open.owner = 1
  actGym(open, BASKETBALL, shooter, [shooter, mate], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(open, BASKETBALL, shooter, [shooter, mate], 'shot_release', T0 + TOP * 0.8, () => 0.5), [{ kind: 'kick', accountId: 1, shot: true, release: 'good' }])
})

test('basketball: a moving release within 3.5 m of the rim is a lay-up, 85 % open and 50 % under a tight defender, whatever the meter', () => {
  const layup = (roll: number, guarded: boolean, speed = 3) => {
    const game = freshGame(BASKETBALL)
    const a = athlete(1, 'red', 17.5, 0, EAST, speed)
    const others = guarded ? [athlete(2, 'blue', 18, 0, WEST)] : []
    game.owner = 1
    actGym(game, BASKETBALL, a, [a, ...others], 'shot_start', T0, () => roll)
    return actGym(game, BASKETBALL, a, [a, ...others], 'shot_release', T0 + 100, () => roll)
  }
  const made = [{ kind: 'score', team: 'red', scorer: 1, points: 2, dunk: false }]
  const missed = [{ kind: 'kick', accountId: 1, shot: true }]
  assert.deepEqual(layup(0.84, false), made)
  assert.deepEqual(layup(0.86, false), missed)
  assert.deepEqual(layup(0.49, true), made)
  assert.deepEqual(layup(0.51, true), missed)
  assert.deepEqual(layup(0.5, false, 2.4), [{ kind: 'kick', accountId: 1, shot: true, release: 'early' }])
})

test('basketball: a pass goes to the team-mate in front, led and lifted so it arrives at the height it left', () => {
  const game = freshGame(BASKETBALL)
  const passer = athlete(1, 'red', 0, 0)
  const mate = athlete(2, 'red', 8, 3)
  const rival = athlete(3, 'blue', 6, 0)
  game.owner = 1
  assert.deepEqual(actGym(game, BASKETBALL, passer, [passer, mate, rival], 'pass', T0, () => 0.5), [{ kind: 'kick', accountId: 1, shot: false }])
  const d = Math.hypot(8, 3)
  const speed = BASKETBALL.passSpeed + d * 0.3
  near(Math.hypot(game.ball.vx, game.ball.vz), speed, 'speed')
  near(game.ball.vz / game.ball.vx, 3 / 8, 'towards the team-mate')
  near(game.ball.vy, (9.81 * d) / speed / 2, 'lift')
  const alone = freshGame(BASKETBALL)
  alone.owner = 1
  actGym(alone, BASKETBALL, passer, [passer, rival], 'pass', T0, () => 0.5)
  near(alone.ball.vx, BASKETBALL.passSpeed, 'straight')
  near(alone.ball.vy, BASKETBALL.passLift, 'usual lift')
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
  assert.deepEqual(actGym(basketball, BASKETBALL, thief, [carrier, thief], 'tackle', T0, () => 0.1), [{ kind: 'steal', accountId: 3, won: true, target: 2 }])
})

test('free play basketball: a shot goes to the hoop the player faces, side hoops included', () => {
  const game = newGymGame(COURT, BASKETBALL, T0, 'free')
  const a = athlete(4, null, -8, 8, Math.PI)
  game.owner = 4
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + TOP, () => 0.5)
  assert.ok(game.ball.vz > 0 && Math.abs(game.ball.vx) < 0.5)
  a.x = 20
  let through = false
  for (let i = 0; i < 180 && !through; i++) {
    const before = { ...game.ball }
    stepGym(game, BASKETBALL, [a], 1 / 60, T0 + TOP + i * 16)
    through = droppedThroughRim(before, game.ball, { x: SIDE_HOOP.x, y: SIDE_HOOP.y, z: SIDE_HOOP.z, radius: SIDE_HOOP.rimRadius })
  }
  assert.ok(through)
})

test('basketball: a release in the green window always scores, even from deep with the aim off', () => {
  for (const [x, aimOff] of [[12, 0.2], [10, -0.25], [17, 0.1]] as const) {
    const { events } = shoot(x, TOP, EAST + aimOff)
    assert.equal(events.length, 1, `from ${20.425 - x} m, aim off ${aimOff}`)
  }
})

test('basketball: the release is perfect at the top of the window, good below, early or late outside', () => {
  assert.equal(releaseOf(BASKETBALL, TOP, 5), 'perfect')
  assert.equal(releaseOf(BASKETBALL, TOP * 0.8, 5), 'good')
  assert.equal(releaseOf(BASKETBALL, TOP / 3, 5), 'early')
  assert.equal(releaseOf(BASKETBALL, (TOP * 5) / 3, 5), 'late')
  const game = freshGame(BASKETBALL)
  const a = athlete(9, 'red', 16, 0)
  game.owner = 9
  actGym(game, BASKETBALL, a, [a], 'shot_start', T0, () => 0.5)
  assert.deepEqual(actGym(game, BASKETBALL, a, [a], 'shot_release', T0 + TOP, () => 0.5), [{ kind: 'kick', accountId: 9, shot: true, release: 'perfect' }])
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
