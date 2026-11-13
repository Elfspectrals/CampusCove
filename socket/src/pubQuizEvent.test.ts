import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AdminRoom } from './admin.ts'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface Timer { fn: () => void, ms: number }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [{ key: 'pub', bounds: { minX: 40, maxX: 140, minZ: -180, maxZ: -80 }, buildings: [] }],
  pub: {
    bartender: [90, 0, -138], bartenderYaw: 0, bouncer: [100, 0, -142], quizmaster: [91, 0.2, -123.5],
    counter: [90, 0, -135], taps: [90, 1.05, -137], serve: [91, 1.05, -136], bell: [92, 1.9, -137],
    secretDoor: { position: [102, 0, -142], yaw: 0 },
    secretRoom: { minX: 100, maxX: 108, minZ: -150, maxZ: -143 },
    seats: [{ id: 'stool_01', kind: 'stool', position: [88, 0.72, -134], yaw: 0 }],
    darts: { board: [84, 1.73, -142], boardYaw: 0, oche: [84, 0, -139.6] },
    shots: { plank: [95, 1.05, -136], yaw: 0, player: [95, 0, -135] }
  }
}

const apiCalls: Array<{ token: string, path: string, body: any }> = []
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const token = String((init?.headers as Record<string, string>)?.Authorization ?? '').replace('Bearer ', '')
  apiCalls.push({ token, path: path.replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path.endsWith('/pub/quiz/reward')) return new Response(JSON.stringify({ coins: 8, pint: true, valid_contestants: 2 }))
  return new Response(JSON.stringify({}))
}

const { loadWorld } = await import('./world.ts')
const { onQuizAnswer, onQuizJoin, openRegistration, quizSnapshot, scheduleNextQuiz, startQuizSoon } = await import('./pubQuizEvent.ts')
const { onAdminQuizStart } = await import('./admin.ts')
const { leavePub } = await import('./pubGames.ts')
const { QUIZ_ADMIN_LEAD_MS, QUIZ_ANNOUNCE_MS, QUIZ_ANSWER_MS, QUIZ_LAST_CALL_MS, QUIZ_QUESTION_COUNT, QUIZ_REVEAL_MS } = await import('./pubConstants.ts')
await loadWorld()

const IN_PUB = { x: 91, z: -122 }
const FAR_FROM_HOST = { x: 90, z: -140 }
const OUTSIDE = { x: 0, z: 0 }

function fakePlayer(sessionId: string, at: { x: number, z: number }, isAdmin = false): Player {
  return {
    sessionId, accountId: sessionId.charCodeAt(0), pseudo: sessionId.toUpperCase(), token: `token-${sessionId}`, x: at.x, y: 1.6, z: at.z, ry: 0,
    seatId: null, pubShots: null, isAdmin, lastAdminActionAt: 0
  } as unknown as Player
}

function fakeRoom(...players: Player[]) {
  const clients: FakeClient[] = players.map((p) => {
    const sent: Sent[] = []
    return { sessionId: p.sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) }
  })
  const timers: Timer[] = []
  const room = {
    roomId: 'room-1',
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    seats: new Map<string, string>(),
    trades: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map(), quiz: null, quizSchedule: 0 },
    forEachClient: (fn: (c: GameClient) => void) => clients.forEach(fn),
    broadcastMove: () => undefined,
    clock: { setTimeout: (fn: () => void, ms: number) => void timers.push({ fn, ms }) }
  } as unknown as AdminRoom
  return { room, clients, timers }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

function runNext(timers: Timer[]): Timer {
  const timer = timers.shift()
  assert.ok(timer, 'a timer is pending')
  timer.fn()
  return timer
}

function openedAt(room: GameRoom): number {
  const phase = room.pub.quiz!.phase
  assert.equal(phase.kind, 'question')
  return phase.openedAt
}

test('the next quiz opens its registration ten minutes before 21:00 Paris time', () => {
  const { room, timers } = fakeRoom()
  const noon = Date.parse('2026-11-13T12:00:00Z')
  scheduleNextQuiz(room, noon)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].ms, Date.parse('2026-11-13T20:00:00Z') - QUIZ_ANNOUNCE_MS - noon)
  assert.equal(room.pub.quiz, null)
})

test('registration announces the quiz to the whole town, again one minute before', () => {
  const ana = fakePlayer('a', IN_PUB)
  const out = fakePlayer('o', OUTSIDE)
  const { room, clients, timers } = fakeRoom(ana, out)
  const now = 1_000_000
  const startsAt = now + QUIZ_ANNOUNCE_MS
  openRegistration(room, startsAt, 'q', now)
  assert.deepEqual(received(clients[1], 'pub_quiz_announce'), [{ startsAt }])
  assert.deepEqual(timers.map((t) => t.ms), [QUIZ_ANNOUNCE_MS - QUIZ_LAST_CALL_MS, QUIZ_ANNOUNCE_MS])
  runNext(timers)
  assert.equal(received(clients[1], 'pub_quiz_announce').length, 2)
  assert.deepEqual(quizSnapshot(room), { startsAt })
})

test('only players next to the quiz host can join, once', () => {
  const { room, clients } = fakeRoom(fakePlayer('a', IN_PUB), fakePlayer('o', OUTSIDE), fakePlayer('f', FAR_FROM_HOST))
  onQuizJoin(room, clients[0])
  assert.deepEqual(received(clients[0], 'pub_error'), [{ message: 'The quiz is not taking names right now.', code: 'quiz_closed' }])
  openRegistration(room, 2_000_000, 'q', 1_000_000)
  onQuizJoin(room, clients[1])
  assert.equal(received(clients[1], 'pub_error').at(-1).code, 'quiz_outside')
  onQuizJoin(room, clients[2])
  assert.equal(received(clients[2], 'pub_error').at(-1).code, 'quiz_outside')
  onQuizJoin(room, clients[0])
  assert.deepEqual(received(clients[0], 'pub_quiz_lobby').at(-1).contestants, [{ sessionId: 'a', pseudo: 'A' }])
  onQuizJoin(room, clients[0])
  assert.equal(received(clients[0], 'pub_error').at(-1).code, 'quiz_already_joined')
})

test('with fewer than two contestants the quiz is called off and the next one scheduled', () => {
  const { room, clients, timers } = fakeRoom(fakePlayer('a', IN_PUB))
  openRegistration(room, 1_000_000 + QUIZ_LAST_CALL_MS, 'q', 1_000_000)
  onQuizJoin(room, clients[0])
  runNext(timers)
  assert.deepEqual(received(clients[0], 'pub_quiz_cancelled'), [{ reason: 'not_enough_players' }])
  assert.equal(room.pub.quiz, null)
  assert.equal(timers.length, 1)
})

test('a full quiz: questions without their answer, timed answers, reveals, results, then the prize', async () => {
  const ana = fakePlayer('a', IN_PUB)
  const bob = fakePlayer('b', IN_PUB)
  const { room, clients, timers } = fakeRoom(ana, bob)
  openRegistration(room, 1_000_000 + QUIZ_LAST_CALL_MS, 'q', 1_000_000)
  onQuizJoin(room, clients[0])
  onQuizJoin(room, clients[1])
  runNext(timers)

  const [first] = received(clients[0], 'pub_quiz_question')
  assert.equal(first.index, 0)
  assert.equal(first.count, QUIZ_QUESTION_COUNT)
  assert.equal(first.answer, undefined)
  const right = room.pub.quiz!.questions[0].answer
  onQuizAnswer(room, clients[0], { choice: right }, openedAt(room))
  assert.deepEqual(received(clients[0], 'pub_quiz_answered'), [{ choice: right }])
  onQuizAnswer(room, clients[1], { choice: right }, openedAt(room) + QUIZ_ANSWER_MS)
  assert.equal(received(clients[1], 'pub_error').at(-1).code, 'quiz_too_late')

  assert.equal(runNext(timers).ms, QUIZ_ANSWER_MS)
  const [reveal] = received(clients[0], 'pub_quiz_reveal')
  assert.equal(reveal.answer, right)
  assert.deepEqual(reveal.ranking, [{ sessionId: 'a', pseudo: 'A', points: 1000 }, { sessionId: 'b', pseudo: 'B', points: 0 }])

  assert.equal(runNext(timers).ms, QUIZ_REVEAL_MS)
  while (received(clients[0], 'pub_quiz_results').length === 0) runNext(timers)
  assert.equal(received(clients[0], 'pub_quiz_question').length, QUIZ_QUESTION_COUNT)
  assert.equal(received(clients[0], 'pub_quiz_results')[0].ranking[0].sessionId, 'a')
  assert.equal(room.pub.quiz, null)

  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(apiCalls.at(-1), {
    token: 'token-a',
    path: '/pub/quiz/reward',
    body: { quiz_id: 'q', contestants: [{ account_id: 97, answered: 1 }, { account_id: 98, answered: 0 }] }
  })
  assert.deepEqual(received(clients[1], 'pub_quiz_prize'), [{ sessionId: 'a', pseudo: 'A', coins: 8, pint: true }])
})

test('a contestant who walks out of the pub is dropped at the next reveal', () => {
  const ana = fakePlayer('a', IN_PUB)
  const bob = fakePlayer('b', IN_PUB)
  const { room, clients, timers } = fakeRoom(ana, bob)
  openRegistration(room, 1_000_000 + QUIZ_LAST_CALL_MS, 'q', 1_000_000)
  onQuizJoin(room, clients[0])
  onQuizJoin(room, clients[1])
  runNext(timers)
  Object.assign(bob, OUTSIDE)
  runNext(timers)
  assert.deepEqual(received(clients[0], 'pub_quiz_reveal')[0].ranking.map((r: { sessionId: string }) => r.sessionId), ['a'])
})

test('leaving the pub through a teleport or a disconnect withdraws at once', () => {
  const ana = fakePlayer('a', IN_PUB)
  const { room, clients } = fakeRoom(ana, fakePlayer('b', IN_PUB))
  openRegistration(room, 2_000_000, 'q', 1_000_000)
  onQuizJoin(room, clients[0])
  leavePub(room, ana)
  assert.deepEqual(received(clients[1], 'pub_quiz_lobby').at(-1).contestants, [])
})

test('an answer must be one of the four choices', () => {
  const { room, clients, timers } = fakeRoom(fakePlayer('a', IN_PUB), fakePlayer('b', IN_PUB))
  openRegistration(room, 1_000_000 + QUIZ_LAST_CALL_MS, 'q', 1_000_000)
  onQuizJoin(room, clients[0])
  onQuizJoin(room, clients[1])
  runNext(timers)
  onQuizAnswer(room, clients[0], { choice: 4 }, openedAt(room))
  assert.equal(received(clients[0], 'pub_error').at(-1).code, 'quiz_invalid_choice')
})

test('an admin starts a quiz in 30 s and the timers of the old schedule do nothing', () => {
  const admin = fakePlayer('a', IN_PUB, true)
  const { room, clients, timers } = fakeRoom(admin, fakePlayer('b', IN_PUB))
  scheduleNextQuiz(room, 1_000_000)
  const stale = timers.shift()!
  onAdminQuizStart(room, clients[1], 5_000_000)
  assert.equal(room.pub.quiz, null)
  onAdminQuizStart(room, clients[0], 5_000_000)
  assert.equal(room.pub.quiz!.startsAt, 5_000_000 + QUIZ_ADMIN_LEAD_MS)
  const quiz = room.pub.quiz
  stale.fn()
  assert.equal(room.pub.quiz, quiz)
})

test('startQuizSoon replaces a quiz that is already open', () => {
  const { room } = fakeRoom(fakePlayer('a', IN_PUB))
  openRegistration(room, 2_000_000, 'q', 1_000_000)
  startQuizSoon(room, 1_500_000)
  assert.equal(room.pub.quiz!.startsAt, 1_500_000 + QUIZ_ADMIN_LEAD_MS)
})
