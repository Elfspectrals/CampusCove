import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import type { RobotLevel } from './robots.ts'
import type { ShotKind } from './tennisConstants.ts'
import { type Match, joinLobby, markAway, markBack, openLobby, startMatch } from './signup.ts'
import { type FakeRoom, clientOf, fakeRoom, installWorld, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
await loadWorld()
const tennis = await import('./tennis.ts')
const C = await import('./tennisConstants.ts')
const { SPORTS_TICK_MS } = await import('./sportsConstants.ts')
const { addRobot } = await import('./robots.ts')
const { hit, serveWait, shoot, step, tossPeak } = await import('./tennisRally.ts')
const { TENNIS_ROBOT, netFacing, newTennisBrain, thinkTennis } = await import('./tennisRobot.ts')

type Rally = ReturnType<typeof serveWait>
type Spot = { x: number, z: number }
type Shot = { aim: Spot, shot: ShotKind }

const T0 = 9_000_000
const COURT = { cx: 0, netZ: 0, halfWidth: C.SINGLES_HALF_WIDTH }
const HOME = { x: 0, z: -(C.COURT_HALF_LENGTH + C.BASELINE_STANDBY_M) }
const FOE = { x: 0, z: C.COURT_HALF_LENGTH + C.BASELINE_STANDBY_M }
const LEVELS: RobotLevel[] = ['easy', 'normal', 'hard']
const steady = () => 0.5

function feed(target: Spot, speed: number): Rally {
  const { ball, netAt } = shoot(COURT, { x: 0, y: 1, z: 11 }, target, speed, T0, true)
  return { phase: 'flight', ball, hitter: 'red', bounces: 0, netAt, swing: null, shot: { sessionId: 'human', timing: 'good', kind: 'drive', knocked: false } }
}

function play(level: RobotLevel, start: Rally, from: Spot, random = steady, others: { mates?: Spot[], foes?: Spot[], cove?: { gauge: number } } = {}) {
  const robot = { sessionId: 'robot', team: 'blue' as const, x: from.x, z: from.z }
  const brain = newTennisBrain(level, HOME, T0)
  const steps: number[] = []
  const facings: number[] = []
  const shots: Shot[] = []
  const struck: { at: number, from: string }[] = []
  let rally = start
  for (let now = T0; now <= T0 + 15_000; now += SPORTS_TICK_MS) {
    rally = step(rally, now, COURT, () => robot)
    if (rally.phase === 'point') break
    for (const action of thinkTennis(brain, { rally, court: COURT, team: 'blue', sessionId: 'robot', at: robot, mates: others.mates ?? [], foes: others.foes ?? [FOE], now, random, cove: others.cove ?? null })) {
      if (action.kind === 'move') {
        steps.push(Math.hypot(action.x - robot.x, action.z - robot.z))
        facings.push(action.ry)
        Object.assign(robot, { x: action.x, z: action.z })
        continue
      }
      shots.push({ aim: action.aim, shot: action.shot })
      const next = hit(rally, robot, action.aim, action.shot, now, COURT)
      if (!next) continue
      struck.push({ at: now, from: rally.phase })
      rally = next
    }
  }
  return { rally: rally as Extract<Rally, { phase: 'point' }>, robot, steps, facings, shots, struck }
}

test('the robot waits a moment with the ball, tosses it, serves at the top of the toss without leaving its spot, and the serve lands in', () => {
  const { rally, steps, struck } = play('hard', serveWait('robot', 'blue', T0), HOME)
  assert.deepEqual(struck.map((s) => s.from), ['serve_wait', 'toss'])
  assert.ok(struck[0].at - T0 >= 1000 && struck[0].at - T0 <= 2000, `tossed after ${struck[0].at - T0} ms`)
  const peak = tossPeak({ x: HOME.x, y: C.TOSS_START_Y, z: HOME.z, vx: 0, vy: C.TOSS_SPEED, vz: 0, t: struck[0].at, keep: C.BOUNCE_KEEP, restitution: C.RESTITUTION })
  assert.ok(Math.abs(struck[1].at - peak) <= SPORTS_TICK_MS, `served ${struck[1].at - peak} ms from the top of the toss`)
  assert.equal(steps.length, 0)
  assert.deepEqual([rally.winner, rally.call], ['blue', 'double_bounce'])
})

test('a mistimed serve is still a serve: the robot never lets its toss fall', () => {
  for (const roll of [0, 0.999]) {
    const { rally, struck } = play('easy', serveWait('robot', 'blue', T0), HOME, () => roll)
    assert.deepEqual(struck.map((s) => s.from), ['serve_wait', 'toss'])
    assert.notEqual(rally.call, 'missed_toss')
  }
})

for (const level of LEVELS) {
  test(`${level}: the robot runs to a ball it can reach, never faster than its level, facing the net, and returns it into the court`, () => {
    const { rally, robot, steps, facings, struck } = play(level, feed({ x: 1.5, z: -8 }, 14), HOME)
    assert.deepEqual(struck.map((s) => s.from), ['flight'])
    assert.deepEqual([rally.winner, rally.call], ['blue', 'double_bounce'])
    const cap = (TENNIS_ROBOT[level].speedMps * SPORTS_TICK_MS) / 1000
    assert.ok(steps.length > 0 && steps.every((s) => s <= cap + 1e-9), `longest step ${Math.max(...steps)} over ${cap}`)
    assert.ok(Math.max(...steps) > cap - 1e-9)
    assert.ok(facings.every((ry) => ry === netFacing('blue')))
    assert.ok(Math.hypot(robot.x - HOME.x, robot.z - HOME.z) < 0.05, 'back to its place after the shot')
  })
}

test('a ball too far for its legs bounces twice: the robot runs for it at its speed but never swings', () => {
  const start = { x: -3.5, z: HOME.z }
  const { rally, robot, steps, shots } = play('easy', feed({ x: 3.6, z: -10.5 }, 19), start)
  assert.deepEqual([rally.winner, rally.call], ['red', 'double_bounce'])
  assert.equal(shots.length, 0)
  assert.ok(robot.x > start.x + 1, 'it went for the ball')
  assert.ok(steps.every((s) => s <= (TENNIS_ROBOT.easy.speedMps * SPORTS_TICK_MS) / 1000 + 1e-9))
})

test('the robot does not start before its reaction time', () => {
  const brain = newTennisBrain('easy', HOME, T0)
  const sight = { rally: feed({ x: 3, z: -8 }, 14), court: COURT, team: 'blue' as const, sessionId: 'robot', at: HOME, mates: [], foes: [FOE], random: steady, cove: null }
  assert.deepEqual(thinkTennis(brain, { ...sight, now: T0 }), [])
  assert.deepEqual(thinkTennis(brain, { ...sight, now: T0 + TENNIS_ROBOT.easy.reactMs - 1 }), [])
  assert.equal(thinkTennis(brain, { ...sight, now: T0 + TENNIS_ROBOT.easy.reactMs })[0]?.kind, 'move')
})

test('it leaves a ball that is going out, and wins the point', () => {
  const { rally, steps, shots } = play('hard', feed({ x: 0, z: -(C.COURT_HALF_LENGTH + 1.5) }, 16), HOME)
  assert.deepEqual([rally.winner, rally.call], ['blue', 'out'])
  assert.deepEqual([steps.length, shots.length], [0, 0])
})

test('a level lets some balls through: on a low roll the easy robot does not swing at a ball it reached, the hard robot does', () => {
  const lowRoll = () => 0.1
  const missed = play('easy', feed({ x: 0.5, z: -8 }, 14), HOME, lowRoll)
  assert.deepEqual([missed.rally.winner, missed.rally.call, missed.shots.length], ['red', 'double_bounce', 0])
  const returned = play('hard', feed({ x: 0.5, z: -8 }, 14), HOME, lowRoll)
  assert.deepEqual(returned.struck.map((s) => s.from), ['flight'])
})

test('aim by level: easy plays to the middle, hard plays to the side its opponent left open and lobs on a low roll', () => {
  const foes = [{ x: 3, z: FOE.z }]
  const easy = play('easy', feed({ x: 0.5, z: -8 }, 14), HOME, () => 0.9, { foes })
  assert.equal(easy.shots.length, 1)
  assert.ok(Math.abs(easy.shots[0].aim.x) <= COURT.halfWidth * TENNIS_ROBOT.easy.aimWidthShare)
  assert.equal(easy.shots[0].shot, 'drive')
  const hard = play('hard', feed({ x: 0.5, z: -8 }, 14), HOME, steady, { foes })
  assert.deepEqual(hard.shots.map((s) => [s.aim.x, s.shot]), [[-COURT.halfWidth * TENNIS_ROBOT.hard.aimWidthShare, 'drive']])
  const [depthFrom, depthTo] = TENNIS_ROBOT.hard.depthM
  assert.ok(hard.shots[0].aim.z >= depthFrom && hard.shots[0].aim.z <= depthTo, 'on the opponent half, at its level depth')
  const lobbed = play('hard', feed({ x: 0.5, z: -8 }, 14), HOME, () => 0.1, { foes: [{ x: -3, z: FOE.z }] })
  assert.deepEqual(lobbed.shots.map((s) => [s.aim.x, s.shot]), [[COURT.halfWidth * TENNIS_ROBOT.hard.aimWidthShare, 'lob']])
})

test('in doubles the partner nearer to the ball goes for it and the other keeps its place', () => {
  const ball = feed({ x: 3, z: -8 }, 14)
  const sight = { rally: ball, court: COURT, team: 'blue' as const, sessionId: 'robot', foes: [FOE], random: steady, cove: null }
  const left = { x: -2.5, z: HOME.z }
  const right = { x: 2.5, z: HOME.z }
  const far = newTennisBrain('normal', left, T0)
  thinkTennis(far, { ...sight, at: left, mates: [right], now: T0 })
  assert.deepEqual(thinkTennis(far, { ...sight, at: left, mates: [right], now: T0 + 1000 }), [])
  const near = newTennisBrain('normal', right, T0)
  thinkTennis(near, { ...sight, at: right, mates: [left], now: T0 })
  assert.equal(thinkTennis(near, { ...sight, at: right, mates: [left], now: T0 + 1000 })[0]?.kind, 'move')
})

const [COURT_1] = C.TENNIS_COURTS

async function robotMatch(mode: 'singles' | 'doubles', level: RobotLevel, rules = 'classic'): Promise<{ room: FakeRoom, match: Match, human: Player, robots: Player[] }> {
  const human = await makePlayer(1, COURT_1.cx + 3, C.TENNIS_NET_Z + 5)
  const room = await fakeRoom([human])
  const settings = { mode, format: 'tiebreak_7', rules }
  const lobby = openLobby(COURT_1.id, C.TENNIS_COACH.id, settings, tennis.playersFor(settings), { sessionId: human.sessionId, accountId: 1, name: 'P1', team: 'red' }, T0)
  lobby.robots = level
  const teams = mode === 'singles' ? ['blue' as const] : ['red' as const, 'blue' as const, 'blue' as const]
  const robots = teams.map((team) => {
    const robot = addRobot(room, { x: human.x, y: human.y, z: human.z }, C.TENNIS_COACH.id)
    joinLobby(lobby, { sessionId: robot.sessionId, accountId: robot.accountId, name: robot.pseudo, team }, T0)
    return robot
  })
  const match = startMatch(lobby, 'match-robots', 'tennis', T0)
  room.sports.matches.set(COURT_1.id, match)
  return { room, match, human, robots }
}

function tickUntil(room: FakeRoom, match: Match, from: number, done: () => boolean, limitMs = 20_000): number {
  let now = from
  for (; !done() && now <= from + limitMs; now += SPORTS_TICK_MS) tennis.runTennis(room, match, now)
  assert.ok(done(), 'the match got there in time')
  return now
}

test('a match against a robot: it is put on its baseline facing the net, serves by itself, and takes the point nobody returns', async () => {
  const { room, match, human, robots: [robot] } = await robotMatch('singles', 'hard')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0, steady)
  assert.deepEqual([robot.x, robot.z, robot.ry], [COURT_1.cx, C.TENNIS_NET_Z - C.COURT_HALF_LENGTH - C.BASELINE_STANDBY_M, Math.PI])
  assert.deepEqual(sentOf(clientOf(room, human), 'user_moved').at(-1), { sessionId: robot.sessionId, x: robot.x, y: robot.y, z: robot.z, ry: Math.PI })
  assert.equal(game.brains.size, 1)
  const phases = new Set<string>()
  tickUntil(room, match, T0, () => phases.add(game.rally.phase) && game.rally.phase === 'point')
  assert.deepEqual([...phases], ['serve_wait', 'toss', 'flight', 'point'])
  const point = game.rally as Extract<Rally, { phase: 'point' }>
  assert.deepEqual([point.winner, point.call], ['blue', 'double_bounce'])
  const state = sentOf(clientOf(room, human), 'tennis_state').at(-1) as { points: unknown, players: unknown }
  assert.deepEqual(state.points, { red: '0', blue: '1' })
  assert.deepEqual(state.players, [{ sessionId: human.sessionId, team: 'red' }, { sessionId: robot.sessionId, team: 'blue' }])
  assert.equal(robot.z, C.TENNIS_NET_Z - C.COURT_HALF_LENGTH - C.BASELINE_STANDBY_M)
})

test('the player serves and the robot returns the ball through the hit path of a player: cooldown stamped, shot in its name, ball back in the court', async () => {
  const { room, match, human, robots: [robot] } = await robotMatch('singles', 'normal')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'red', T0, steady)
  const aim = { aimX: COURT_1.cx + 1.5, aimZ: C.TENNIS_NET_Z - 8 }
  tennis.onTennisHit(room, clientOf(room, human), aim, T0 + 100)
  const peak = tossPeak((game.rally as Extract<Rally, { phase: 'toss' }>).ball)
  tennis.onTennisHit(room, clientOf(room, human), aim, peak)
  assert.deepEqual([game.rally.phase, (game.rally as Extract<Rally, { phase: 'flight' }>).hitter], ['flight', 'red'])
  const returned = () => game.rally.phase === 'flight' && game.rally.hitter === 'blue'
  const at = tickUntil(room, match, peak, returned)
  assert.equal((game.rally as Extract<Rally, { phase: 'flight' }>).shot?.sessionId, robot.sessionId)
  const stamped = game.lastHitAt.get(robot.accountId) as number
  assert.ok(stamped > peak && stamped < at)
  assert.ok(Math.abs(robot.x - (COURT_1.cx + 1.5)) < 2, 'it went to the ball')
  tickUntil(room, match, at, () => game.rally.phase === 'point')
  const point = game.rally as Extract<Rally, { phase: 'point' }>
  assert.deepEqual([point.winner, point.call], ['blue', 'double_bounce'])
})

test('the robot holds its serve while the player is away and serves once they are back', async () => {
  const { room, match, human } = await robotMatch('singles', 'easy')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0, steady)
  markAway(match, 1, T0 + 100)
  for (let now = T0 + 100; now <= T0 + 8000; now += SPORTS_TICK_MS) tennis.runTennis(room, match, now)
  assert.equal(game.rally.phase, 'serve_wait')
  markBack(match, 1, human.sessionId)
  tickUntil(room, match, T0 + 8100, () => game.rally.phase === 'toss', 3000)
})

test('doubles alone: three robots take the other places and a point is played to its end', async () => {
  const { room, match, human, robots } = await robotMatch('doubles', 'normal')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0, steady)
  assert.equal(game.brains.size, 3)
  assert.deepEqual(robots.map((r) => r.x - COURT_1.cx).sort((a, b) => a - b), [-C.DOUBLES_SPREAD_M, C.DOUBLES_SPREAD_M, C.DOUBLES_SPREAD_M])
  assert.equal(human.x, COURT_1.cx - C.DOUBLES_SPREAD_M)
  const end = tickUntil(room, match, T0, () => game.rally.phase === 'point', 60_000)
  const point = game.rally as Extract<Rally, { phase: 'point' }>
  assert.ok(end - T0 > 1500)
  assert.ok(point.winner === 'red' || point.winner === 'blue')
  assert.notEqual(point.call, 'missed_toss')
})

test('Tennis Cove robots mix their strokes, play the special on a full gauge by level (hard always, easy on a low roll) and stand still while knocked back', () => {
  assert.equal(play('hard', feed({ x: 0.5, z: -8 }, 14), HOME, steady, { cove: { gauge: 0 } }).shots[0].shot, 'flat')
  assert.equal(play('hard', feed({ x: 0.5, z: -8 }, 14), HOME, steady, { cove: { gauge: C.GAUGE_FULL } }).shots[0].shot, 'special')
  assert.equal(play('easy', feed({ x: 0.5, z: -8 }, 14), HOME, steady, { cove: { gauge: C.GAUGE_FULL } }).shots[0].shot, 'topspin')
  const brain = newTennisBrain('hard', HOME, T0)
  brain.stunnedUntil = T0 + C.KNOCK_ROOT_MS
  const sight = { rally: serveWait('x', 'red', T0), court: COURT, team: 'blue' as const, sessionId: 'robot', at: { x: 2, z: HOME.z }, mates: [], foes: [FOE], random: steady, cove: { gauge: 0 } }
  assert.deepEqual(thinkTennis(brain, { ...sight, now: T0 + C.KNOCK_ROOT_MS - 1 }), [])
  assert.equal(thinkTennis(brain, { ...sight, now: T0 + C.KNOCK_ROOT_MS + 100 })[0]?.kind, 'move')
})

test('Tennis Cove: a robot with a full gauge still serves, the special waits for a rally shot', async () => {
  const { room, match, robots: [robot] } = await robotMatch('singles', 'hard', 'cove')
  const game = tennis.startTennis(room, match, COURT_1.cx, 'blue', T0, steady)
  game.gauges?.set(robot.accountId, C.GAUGE_FULL)
  const phases = new Set<string>()
  tickUntil(room, match, T0, () => phases.add(game.rally.phase) && game.rally.phase === 'point')
  assert.deepEqual([...phases], ['serve_wait', 'toss', 'flight', 'point'])
  assert.equal(game.gauges?.get(robot.accountId), C.GAUGE_FULL)
})
