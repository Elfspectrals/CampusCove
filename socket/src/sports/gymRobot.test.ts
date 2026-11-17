import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Ball } from './gymBall.ts'
import { type GymCourt, basketsOf, parseGymCourt } from './gymCourt.ts'
import { type Athlete, type GymEvent, type GymGame, actGym, newGymGame, stepGym } from './gymMatch.ts'
import { type GymRobotBrain, GYM_ROBOT, kickoffSpot, newGymRobotBrain, thinkGymRobot } from './gymRobot.ts'
import { type BasketballRules, type FootballRules, parseBasketballRules, parseFootballRules } from './gymRules.ts'
import type { RobotLevel } from './robots.ts'
import type { Match, Team } from './signup.ts'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const { registerGymVenue, onGymAction } = await import('./gym.ts')
const { onSportsRobots, onSportsSignup, tickSports } = await import('./venues.ts')
await loadWorld()

const rulesFile = (sport: string) => JSON.parse(readFileSync(new URL(`../../../front/public/assets/sports/rules/${sport}.json`, import.meta.url), 'utf8'))
const FOOTBALL_RAW = rulesFile('football')
const BASKETBALL_RAW = rulesFile('basketball')
const FOOTBALL = parseFootballRules(FOOTBALL_RAW)
const BASKETBALL = parseBasketballRules(BASKETBALL_RAW)
const EAST = -Math.PI / 2
const WEST = Math.PI / 2
const PLAYER_SPRINT_MPS = 8.5
const TICK_MS = 100
const T0 = 1_000_000

function basket(side: 1 | -1) {
  const board = { minX: side * 20.8 - 0.025, maxX: side * 20.8 + 0.025, minY: 3.1, maxY: 4.15, minZ: -0.9, maxZ: 0.9 }
  return { x: side * 20.425, y: 3.25, z: 0, rimRadius: 0.225, board, threePointRadius: 6.75 }
}

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
  sideBaskets: []
})

function athlete(accountId: number, team: Team, x: number, z: number, ry = EAST): Athlete {
  return { accountId, team, x, z, vx: 0, vz: 0, ry }
}

function brainsOf(levels: Record<number, RobotLevel>): Map<number, GymRobotBrain> {
  return new Map(Object.entries(levels).map(([id, level]) => [Number(id), newGymRobotBrain(level, T0)]))
}

function freshGame(rules: FootballRules | BasketballRules, owner: number | null = null): GymGame {
  const game = newGymGame(COURT, rules, T0)
  game.restart = null
  game.owner = owner
  return game
}

function scripted(rolls: number[], then: number): () => number {
  const left = [...rolls]
  return () => left.shift() ?? then
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Played {
  events: GymEvent[]
  shots: Ball[]
  endedAt: number
}

function play(game: GymGame, rules: FootballRules | BasketballRules, brains: Map<number, GymRobotBrain>, athletes: Athlete[], from: number, to: number, random: () => number, stop: () => boolean = () => false): Played {
  const played: Played = { events: [], shots: [], endedAt: to }
  const area = COURT.playArea
  for (let now = from; now <= to; now += TICK_MS) {
    for (const self of athletes) {
      const brain = brains.get(self.accountId)
      if (!brain) continue
      const step = thinkGymRobot(brain, { game, rules, self, athletes, now, random })
      const speed = Math.hypot(step.x - self.x, step.z - self.z) / (TICK_MS / 1000)
      assert.ok(speed <= GYM_ROBOT[brain.level].speedMps + 1e-6, `robot ${self.accountId} ran at ${speed} m/s`)
      assert.ok(step.x >= area.minX && step.x <= area.maxX && step.z >= area.minZ && step.z <= area.maxZ, `robot ${self.accountId} left the play area at ${step.x}, ${step.z}`)
      Object.assign(self, { x: step.x, z: step.z, ry: step.ry, vx: brain.vx, vz: brain.vz })
      for (const act of step.acts) {
        const made = actGym(game, rules, self, athletes, act.kind, act.at, random)
        if (made.some((e) => e.kind === 'kick' && e.shot)) played.shots.push({ ...game.ball })
        played.events.push(...made)
      }
    }
    for (let i = 0; i < 6; i++) played.events.push(...stepGym(game, rules, athletes, TICK_MS / 6000, now))
    if (stop()) return { ...played, endedAt: now }
  }
  return played
}

function gap(a: { x: number, z: number }, b: { x: number, z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

test('no level runs faster than a sprinting player, and each level is quicker, sharper and more eager than the one below', () => {
  const { easy, normal, hard } = GYM_ROBOT
  for (const skill of [easy, normal, hard]) assert.ok(skill.speedMps <= PLAYER_SPRINT_MPS)
  assert.ok(easy.speedMps < 5, 'a walking player outruns an easy robot')
  assert.ok(easy.speedMps < normal.speedMps && normal.speedMps < hard.speedMps)
  assert.ok(easy.reactMs > normal.reactMs && normal.reactMs > hard.reactMs)
  assert.ok(easy.shotErrorMs > normal.shotErrorMs && normal.shotErrorMs > hard.shotErrorMs)
  assert.ok(easy.shotErrorRad > normal.shotErrorRad && normal.shotErrorRad > hard.shotErrorRad)
  assert.ok(easy.passErrorRad > normal.passErrorRad && normal.passErrorRad > hard.passErrorRad)
  assert.ok(easy.tackleChance < normal.tackleChance && normal.tackleChance < hard.tackleChance && hard.tackleChance < 1)
})

test('at kick-off the robots of a team line up across their own half, facing the goal they attack', () => {
  const red = [0, 1, 2].map((slot) => kickoffSpot(COURT, 'red', slot, 3))
  const blue = kickoffSpot(COURT, 'blue', 0, 1)
  assert.deepEqual(red.map((s) => [s.x, s.z, s.ry]), [[-5, -6, EAST], [-5, 0, EAST], [-5, 6, EAST]])
  assert.deepEqual([blue.x, blue.z, blue.ry], [5, 0, WEST])
})

test('the nearest robot of a team waits its reaction time, runs to a free ball and takes it; its team-mate covers the goal instead', () => {
  const game = freshGame(FOOTBALL)
  const [near, far, foe] = [athlete(-1, 'red', -6, 0), athlete(-2, 'red', -12, 3), athlete(9, 'blue', 18, 6, WEST)]
  const athletes = [near, far, foe]
  const brains = brainsOf({ [-1]: 'normal', [-2]: 'normal' })
  play(game, FOOTBALL, brains, athletes, T0 + TICK_MS, T0 + GYM_ROBOT.normal.reactMs, () => 0.5)
  assert.deepEqual([near.x, near.z, game.owner], [-6, 0, null])
  const { endedAt } = play(game, FOOTBALL, brains, athletes, T0 + GYM_ROBOT.normal.reactMs + TICK_MS, T0 + 4000, () => 0.5, () => game.owner !== null)
  assert.equal(game.owner, -1)
  assert.ok(endedAt - T0 < 1800, `took the ball after ${endedAt - T0} ms`)
  assert.ok(gap(far, game.ball) > 5 && far.x < near.x, 'the second robot stays between the ball and its goal')
})

test('a robot chasing a ball that rests outside the play area stops at the edge of it', () => {
  const game = freshGame(FOOTBALL)
  game.ball = { x: 5, y: COURT.floorY + FOOTBALL.ball.radius, z: 13.5, vx: 0, vz: 0, vy: 0 }
  const robot = athlete(-1, 'red', 5, 8)
  play(game, FOOTBALL, brainsOf({ [-1]: 'hard' }), [robot, athlete(9, 'blue', -15, 0)], T0 + TICK_MS, T0 + 3000, () => 0.5)
  assert.ok(Math.abs(robot.z - (COURT.playArea.maxZ - 0.3)) < 1e-6)
  assert.equal(game.owner, null)
})

test('football: a carrier dribbles at the goal, charges a shot that stays under the overcharge zone and scores', () => {
  const overchargeLift = FOOTBALL.shotLift[0] + (FOOTBALL.shotLift[1] - FOOTBALL.shotLift[0]) * FOOTBALL.overcharge.from
  for (const roll of [0.5, 0.999]) {
    const game = freshGame(FOOTBALL, -1)
    const robot = athlete(-1, 'red', 0, 0)
    const { events, shots } = play(game, FOOTBALL, brainsOf({ [-1]: 'normal' }), [robot, athlete(9, 'blue', -15, 6)], T0 + TICK_MS, T0 + 8000, () => roll, () => game.score.red > 0)
    assert.equal(shots.length >= 1, true)
    assert.ok(shots[0].vy < overchargeLift, `lift ${shots[0].vy} with a roll of ${roll}`)
    assert.ok(shots[0].vx > FOOTBALL.shotSpeed[0])
    if (roll === 0.5) assert.deepEqual(events.filter((e) => e.kind === 'score'), [{ kind: 'score', team: 'red', scorer: -1, points: 1, dunk: false }])
  }
})

test('football: a robot passes to its human team-mate who is open and better placed; an easy robot at its worst sends the pass astray', () => {
  const setup = () => {
    const game = freshGame(FOOTBALL, -1)
    const [robot, human, foe] = [athlete(-1, 'red', 0, 0), athlete(7, 'red', 8, 5), athlete(9, 'blue', -15, 0)]
    return { game, human, athletes: [robot, human, foe] }
  }
  const good = setup()
  const { events } = play(good.game, FOOTBALL, brainsOf({ [-1]: 'normal' }), good.athletes, T0 + TICK_MS, T0 + 3000, scripted([0, 0.5], 0.5), () => good.game.owner === 7)
  assert.deepEqual(events.filter((e) => e.kind === 'kick'), [{ kind: 'kick', accountId: -1, shot: false }])
  assert.equal(good.game.owner, 7)
  const astray = setup()
  const lost = play(astray.game, FOOTBALL, brainsOf({ [-1]: 'easy' }), astray.athletes, T0 + TICK_MS, T0 + 3000, scripted([0, 0], 0.5))
  assert.deepEqual(lost.events.filter((e) => e.kind === 'kick'), [{ kind: 'kick', accountId: -1, shot: false }])
  assert.notEqual(astray.game.owner, 7)
  assert.ok(gap(astray.game.ball, astray.human) > 3)
})

test('football: the nearest defender runs at the carrier and tackles in reach, sliding when it is fast enough; a failed roll leaves the ball alone', () => {
  const setup = (level: RobotLevel) => {
    const game = freshGame(FOOTBALL, 9)
    const robot = athlete(-1, 'red', -8, 0)
    return { game, robot, athletes: [robot, athlete(9, 'blue', 0, 0, WEST)], brains: brainsOf({ [-1]: level }) }
  }
  const slide = setup('hard')
  const slid = play(slide.game, FOOTBALL, slide.brains, slide.athletes, T0 + TICK_MS, T0 + 4000, () => 0, () => slide.game.owner === -1)
  assert.deepEqual(slid.events, [{ kind: 'tackle', accountId: -1, won: true, slide: true }])
  const standing = setup('normal')
  const stood = play(standing.game, FOOTBALL, standing.brains, standing.athletes, T0 + TICK_MS, T0 + 4000, () => 0, () => standing.game.owner === -1)
  assert.deepEqual(stood.events, [{ kind: 'tackle', accountId: -1, won: true, slide: false }])
  const shy = setup('hard')
  const waited = play(shy.game, FOOTBALL, shy.brains, shy.athletes, T0 + TICK_MS, T0 + 4000, () => 0.99)
  assert.deepEqual(waited.events, [])
  assert.equal(shy.game.owner, 9)
  assert.ok(gap(shy.robot, shy.game.ball) < 0.1)
})

test('basketball: a driving robot dunks from as far as its speed allows, and an easy one, too slow to dunk, lays the ball up', () => {
  const drive = (level: RobotLevel) => {
    const game = freshGame(BASKETBALL, -1)
    const robot = athlete(-1, 'red', 0, 0)
    const { events } = play(game, BASKETBALL, brainsOf({ [-1]: level }), [robot, athlete(9, 'blue', -15, 5)], T0 + TICK_MS, T0 + 9000, () => 0, () => game.score.red > 0)
    return { score: events.filter((e) => e.kind === 'score'), toRim: gap(robot, basketsOf(COURT).red) }
  }
  const hard = drive('hard')
  assert.deepEqual(hard.score, [{ kind: 'score', team: 'red', scorer: -1, points: 2, dunk: true }])
  assert.ok(hard.toRim > BASKETBALL.dunkRangeM && hard.toRim <= BASKETBALL.turboDunk.rangeM)
  const normal = drive('normal')
  assert.deepEqual(normal.score, [{ kind: 'score', team: 'red', scorer: -1, points: 2, dunk: true }])
  assert.ok(normal.toRim <= BASKETBALL.dunkRangeM)
  const easy = drive('easy')
  assert.deepEqual(easy.score, [{ kind: 'score', team: 'red', scorer: -1, points: 2, dunk: false }])
  assert.ok(easy.toRim <= BASKETBALL.layup.rangeM)
})

test('basketball: a jump shot is let go at the top of the jump and scores; with an easy robot at its worst timing it leaves early and misses', () => {
  const jumper = (level: RobotLevel, timingRoll: number) => {
    const game = freshGame(BASKETBALL, -1)
    const athletes = [athlete(-1, 'red', 0, 0), athlete(9, 'blue', -15, 5)]
    const brains = brainsOf({ [-1]: level })
    const random = scripted([0.9, 0.5, timingRoll], 0.5)
    const shot = play(game, BASKETBALL, brains, athletes, T0 + TICK_MS, T0 + 9000, random, () => game.owner === null)
    const flight = play(game, BASKETBALL, brains, athletes, shot.endedAt + TICK_MS, shot.endedAt + 1500, random)
    return [...shot.events, ...flight.events]
  }
  assert.deepEqual(jumper('normal', 0.5), [{ kind: 'kick', accountId: -1, shot: true, release: 'perfect' }, { kind: 'score', team: 'red', scorer: -1, points: 2, dunk: false }])
  assert.deepEqual(jumper('easy', 0), [{ kind: 'kick', accountId: -1, shot: true, release: 'early' }])
})

test('basketball: a defender waits at the halfway line while its man is in his backcourt, then stays between him and the rim and shoves him in reach', () => {
  const game = freshGame(BASKETBALL, 9)
  const [robot, man] = [athlete(-1, 'red', -5, 0, EAST), athlete(9, 'blue', 10, 2, WEST)]
  const brains = brainsOf({ [-1]: 'hard' })
  const waiting = play(game, BASKETBALL, brains, [robot, man], T0 + TICK_MS, T0 + 3000, () => 0)
  assert.deepEqual(waiting.events, [])
  assert.ok(Math.abs(robot.x) < 1e-6 && Math.abs(robot.z - 1.343) < 0.01, `waits at ${robot.x}, ${robot.z}`)
  Object.assign(man, { x: -8, z: 0 })
  const guarding = play(game, BASKETBALL, brains, [robot, man], T0 + 3000 + TICK_MS, T0 + 6000, () => 0.99)
  assert.deepEqual(guarding.events, [])
  assert.ok(Math.abs(robot.x + 9.1) < 1e-6 && Math.abs(robot.z) < 1e-6, `guards from ${robot.x}, ${robot.z}`)
  const { events, endedAt } = play(game, BASKETBALL, brains, [robot, man], T0 + 6000 + TICK_MS, T0 + 8000, () => 0, () => game.owner !== 9)
  assert.deepEqual(events, [{ kind: 'steal', accountId: -1, won: true, target: 9 }])
  assert.equal(game.groundedUntil.get(9), endedAt + BASKETBALL.shove.downMs)
})

test('basketball: a defender in reach of a shooter jumps so that a release at the top of the jump is blocked', () => {
  const game = freshGame(BASKETBALL, 9)
  const [robot, man] = [athlete(-1, 'red', -13.1, 0, EAST), athlete(9, 'blue', -12, 0, WEST)]
  const athletes = [robot, man]
  const brains = brainsOf({ [-1]: 'hard' })
  const random = scripted([0.99, 0.1], 0.99)
  play(game, BASKETBALL, brains, athletes, T0 + TICK_MS, T0 + 400, random)
  const pressedAt = T0 + 450
  actGym(game, BASKETBALL, man, athletes, 'shot_start', pressedAt, random)
  play(game, BASKETBALL, brains, athletes, T0 + 500, T0 + 800, random)
  assert.equal(game.jumpedAt.get(-1), pressedAt + BASKETBALL.shotMeter.riseMs - BASKETBALL.blockWindowMs / 2)
  assert.deepEqual(actGym(game, BASKETBALL, man, athletes, 'shot_release', pressedAt + BASKETBALL.shotMeter.riseMs, random), [{ kind: 'block', accountId: -1 }])
})

test('a robot on the floor after a shove neither moves nor acts', () => {
  const game = freshGame(BASKETBALL)
  const robot = athlete(-1, 'red', 2, 0)
  const brain = newGymRobotBrain('hard', T0)
  game.groundedUntil.set(-1, T0 + 700)
  const step = thinkGymRobot(brain, { game, rules: BASKETBALL, self: robot, athletes: [robot, athlete(9, 'blue', 5, 0)], now: T0 + 600, random: () => 0 })
  assert.deepEqual(step, { x: 2, z: 0, ry: EAST, acts: [] })
  assert.deepEqual([brain.vx, brain.vz], [0, 0])
})

test('full teams of robots of every level play a whole match of both sports inside the play area, under their speed caps, and the score moves', () => {
  for (const rules of [FOOTBALL, BASKETBALL]) {
    const game = newGymGame(COURT, rules, T0)
    const levels: RobotLevel[] = ['easy', 'normal', 'hard']
    const athletes = (['red', 'blue'] as const).flatMap((team, t) => levels.map((_, slot) => {
      const at = kickoffSpot(COURT, team, slot, levels.length)
      return athlete(-(t * 3 + slot + 1), team, at.x, at.z, at.ry)
    }))
    const brains = brainsOf(Object.fromEntries(athletes.map((a, i) => [a.accountId, levels[i % 3]])))
    play(game, rules, brains, athletes, T0 + TICK_MS, T0 + 240_000, seeded(7))
    assert.ok(game.score.red + game.score.blue > 0, `${rules.sport}: ${JSON.stringify(game.score)}`)
  }
})

const HALL = parseGymCourt({
  walls: true,
  floorY: 0.2,
  ceilingY: 9,
  arena: { minX: -379, maxX: -361, minZ: -178, maxZ: -162 },
  playArea: { minX: -378.5, maxX: -361.5, minZ: -177, maxZ: -163 },
  court: { minX: -378, maxX: -362, minZ: -177, maxZ: -163 },
  centre: { x: -370, z: -170 },
  coach: { x: -370, z: -177.5 },
  goals: { red: { lineX: -362, inward: 1, minZ: -171.5, maxZ: -168.5, height: 2, depth: 1 }, blue: { lineX: -378, inward: -1, minZ: -171.5, maxZ: -168.5, height: 2, depth: 1 } },
  baskets: {
    red: { x: -363.5, y: 3.25, z: -170, rimRadius: 0.225, board: { minX: -363.125, maxX: -363.075, minY: 3.1, maxY: 4.15, minZ: -170.9, maxZ: -169.1 }, threePointRadius: 6.75 },
    blue: { x: -376.5, y: 3.25, z: -170, rimRadius: 0.225, board: { minX: -376.925, maxX: -376.875, minY: 3.1, maxY: 4.15, minZ: -170.9, maxZ: -169.1 }, threePointRadius: 6.75 }
  },
  sideBaskets: []
})
registerGymVenue({ id: 'gym_robot_basketball', zone: 'sports_gym', playAreaId: 'gym_robot_court', court: HALL, rules: BASKETBALL, settings: BASKETBALL_RAW.signup.settings, minPlayers: 2, rejoinGraceMs: 10_000, robots: true })
registerGymVenue({ id: 'gym_robot_football', zone: 'sports_gym', playAreaId: 'gym_robot_court', court: HALL, rules: FOOTBALL, settings: FOOTBALL_RAW.signup.settings, minPlayers: 4, rejoinGraceMs: 10_000, robots: true })

const NOW = 9_000_000
const KICKOFF = NOW + 2000

type Moved = { sessionId: string, x: number, y: number, z: number, ry: number }
type State = { score: Record<Team, number>, players: { sessionId: string, team: Team }[], owner: string | null }
type Scored = { kind: string, team: Team, scorer: string | null, sessionId: string | null }

async function robotMatch(accountId: number, venue: string, teamSize: number, level: RobotLevel) {
  Math.random = seeded(11)
  api.calls.length = 0
  api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
  api.replies.set('POST /sports/gym/tasks', () => json({ counted: [accountId] }))
  const human = await makePlayer(accountId, -370, -176)
  human.sportsPassUntil = NOW * 10
  const room = await fakeRoom([human])
  const client = clientOf(room, human)
  await onSportsSignup(room, client, { coach: venue, venue, team: 'red', settings: { teamSize, durationSec: 240 } }, NOW)
  onSportsRobots(room, client, { level }, KICKOFF)
  return { room, human, client, match: room.sports.matches.get(venue) as Match }
}

async function recorded() {
  await new Promise((resolve) => setImmediate(resolve))
  await new Promise((resolve) => setImmediate(resolve))
  return {
    matches: api.calls.filter((c) => c.url === '/sports/matches').map((c) => (c.body as { players: { accountId: number }[] }).players),
    tasks: api.calls.filter((c) => c.url === '/sports/gym/tasks').map((c) => (c.body as { players: unknown[] }).players)
  }
}

test('one against a robot at basketball: the robot is put on its half at kick-off, plays through the venue tick and scores; the record names the human only', async () => {
  const { room, client, match } = await robotMatch(501, 'gym_robot_basketball', 1, 'hard')
  assert.deepEqual(match.players.map((p) => [p.sessionId, p.team]), [['s501', 'red'], ['robot:1', 'blue']])
  assert.deepEqual(sentOf(client, 'user_moved')[0], { sessionId: 'robot:1', x: -365, y: 1.8, z: -170, ry: WEST })
  assert.deepEqual((sentOf(client, 'gym_state')[0] as State).players, [{ sessionId: 's501', team: 'red' }, { sessionId: 'robot:1', team: 'blue' }])
  for (let t = KICKOFF + TICK_MS; t <= KICKOFF + 60_000; t += TICK_MS) tickSports(room, t)
  const area = HALL.playArea
  for (const m of sentOf(client, 'user_moved') as Moved[]) assert.ok(m.x >= area.minX && m.x <= area.maxX && m.z >= area.minZ && m.z <= area.maxZ)
  const baskets = (sentOf(client, 'gym_event') as Scored[]).filter((e) => e.kind === 'score')
  assert.ok(baskets.length > 0)
  assert.deepEqual([baskets[0].team, baskets[0].scorer, baskets[0].sessionId], ['blue', 'Robot 1', 'robot:1'])
  const state = sentOf(client, 'gym_state').at(-1) as State
  assert.ok(state.score.blue > 0 && state.score.red === 0)
  tickSports(room, KICKOFF + 240_000)
  assert.equal(room.sports.robots.size, 0)
  const { matches, tasks } = await recorded()
  assert.deepEqual(matches, [[{ accountId: 501, team: 'red', result: 'loss', score: 0 }]])
  assert.deepEqual(tasks, [[{ accountId: 501, threes: 0 }]])
})

test('two a side at football with a robot team-mate against two robots: the human scores against them, the robots play on, and only the human goal reaches the tasks', async () => {
  const { room, human, client, match } = await robotMatch(502, 'gym_robot_football', 2, 'easy')
  assert.deepEqual(match.players.map((p) => [p.sessionId, p.team]), [['s502', 'red'], ['robot:1', 'red'], ['robot:2', 'blue'], ['robot:3', 'blue']])
  const placed = (sentOf(client, 'user_moved') as Moved[]).map((m) => [m.sessionId, m.x, m.z])
  assert.deepEqual(placed, [['robot:1', -375, -170], ['robot:2', -365, -177 + 14 / 3], ['robot:3', -365, -177 + 28 / 3]])
  Object.assign(human, { x: -370.3, z: -170, ry: EAST })
  tickSports(room, KICKOFF + TICK_MS)
  assert.equal((sentOf(client, 'gym_state').at(-1) as State).owner, 's502')
  onGymAction(room, client, { kind: 'shot_start' }, KICKOFF + 150)
  onGymAction(room, client, { kind: 'shot_release' }, KICKOFF + 550)
  Object.assign(human, { x: -370, z: -176.5 })
  for (let t = KICKOFF + 2 * TICK_MS; t <= KICKOFF + 2000; t += TICK_MS) tickSports(room, t)
  const goals = (sentOf(client, 'gym_event') as Scored[]).filter((e) => e.kind === 'score')
  assert.deepEqual(goals.map((g) => [g.team, g.sessionId]), [['red', 's502']])
  for (let t = KICKOFF + 2000 + TICK_MS; t < KICKOFF + 240_000; t += TICK_MS) tickSports(room, t)
  const robotKicks = (sentOf(client, 'gym_event') as Scored[]).filter((e) => e.kind === 'kick' && e.sessionId?.startsWith('robot:'))
  assert.ok(robotKicks.length > 0)
  const final = (sentOf(client, 'gym_state').at(-1) as State).score
  assert.ok(final.red + final.blue > 1, JSON.stringify(final))
  tickSports(room, KICKOFF + 240_000)
  const { matches, tasks } = await recorded()
  assert.deepEqual(matches.map((players) => players.map((p) => p.accountId)), [[502]])
  assert.deepEqual(tasks, [[{ accountId: 502, goals: 1 }]])
})
