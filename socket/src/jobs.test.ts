import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, JobShift, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, body: any }
type ApiAnswer = { status: number, body: unknown }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

// Tech Hub as in the real manifest (turned by π, interiorOffset applied by apply-jobs.mjs), plus a desk on an upper
// floor and a second building, for the floor / building checks.
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [
    {
      key: 'work_district',
      buildings: [
        { kind: 'work', key: 'tech_hub', name: 'Tech Hub', job: 'dev', position: [-20, 0, 73], rotationY: Math.PI, door: [-20, 1.25, 66], footprint: [16, 14.81] },
        { kind: 'work', key: 'cafe', name: 'Campus Cafe', job: 'resto', position: [20, 0, 72.5], rotationY: Math.PI, door: [20, 1.25, 66], footprint: [16, 14.81] }
      ]
    }
  ],
  jobs: {
    stations: [
      { id: 'station_dev_01', job: 'dev', building: 'tech_hub', seat: [-14.8, 0.71, 71.955], seatHeight: 0.51, yaw: Math.PI, lookAt: [-14.8, 1.2, 72.905] },
      { id: 'station_dev_02', job: 'dev', building: 'tech_hub', seat: [-18.2, 0.71, 71.955], seatHeight: 0.51, yaw: Math.PI, lookAt: [-18.2, 1.2, 72.905] },
      { id: 'station_dev_99', job: 'dev', building: 'tech_hub', seat: [-25, 4.71, 75], seatHeight: 0.51, yaw: Math.PI, lookAt: [-25, 5.2, 76] }
    ]
  }
}

const FLOOR_EYE = 0.2 + 1.6
const apiCalls: ApiCall[] = []
let nextShiftId = 100
let answer: (call: ApiCall) => ApiAnswer | Promise<ApiAnswer> = defaultAnswer

function defaultAnswer(call: ApiCall): ApiAnswer {
  if (call.path === '/jobs/shifts') {
    return { status: 201, body: { shift_id: nextShiftId++, job: 'dev', salary_coins: 10, period_seconds: 60, survival_drain_factor: 0.25 } }
  }
  const salary = /^\/jobs\/shifts\/(\d+)\/salary$/.exec(call.path)
  if (salary) return { status: 200, body: { shift_id: Number(salary[1]), period: call.body.period, coins: 10, already_paid: false, balance_after: 500 } }
  if (call.path.endsWith('/end')) return { status: 200, body: { ended: true } }
  return { status: 200, body: {} }
}

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const call = { path: path.replace(/^.*\/api/, ''), body: typeof init?.body === 'string' ? JSON.parse(init.body) : null }
  apiCalls.push(call)
  const { status, body } = await answer(call)
  return new Response(JSON.stringify(body), { status })
}

const { loadWorld, jobStation } = await import('./world.ts')
const { endJob, onJobStart, onJobStop, onWorkerMove, tickJobs } = await import('./jobs.ts')
const { MAX_BACKLOG_PERIODS, completedPeriods, survivalDrainFactor } = await import('./jobRules.ts')
const { teleportPlayer } = await import('./admin.ts')
const { hurt, tickSurvival } = await import('./survival.ts')
const { publicPlayer } = await import('./players.ts')
await loadWorld()

function fakeClient(sessionId: string): FakeClient {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

/** A player standing on the Tech Hub floor, `dx` metres beside desk 01's chair (default: right behind it). */
function fakePlayer(sessionId: string, at: { x: number, y?: number, z: number } = { x: -14.8, z: 71 }): Player {
  return {
    sessionId,
    accountId: Number(sessionId.replace(/\D/g, '')) || 1,
    pseudo: `Pseudo ${sessionId}`,
    token: `token-${sessionId}`,
    x: at.x,
    y: at.y ?? FLOOR_EYE,
    z: at.z,
    ry: 0,
    stats: { health: 100, hunger: 100, thirst: 100 },
    knockedOutUntil: 0,
    speedBoostUntil: 0,
    lastMoveAt: 0,
    fallPeakY: FLOOR_EYE,
    healOverTime: null,
    lastStatsSavedAt: Date.now(),
    seatId: null,
    clinicBedId: null,
    intoxication: 0,
    pubShots: null,
    tradeId: null,
    job: null
  } as unknown as Player
}

function fakeRoom(...players: Player[]) {
  const clients = players.map((p) => fakeClient(p.sessionId))
  const room = {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    housingUnits: [],
    houseFurniture: [],
    clinicBeds: new Map(),
    seats: new Map<string, string>(),
    trades: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    jobStations: new Map<string, string>(),
    jobShifts: new Set<JobShift>(),
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.filter((c) => c !== except && room.players.has(c.sessionId)).forEach(fn),
    broadcastMove: () => undefined,
    clock: { setTimeout: () => undefined }
  } as unknown as GameRoom & { clients: FakeClient[] }
  return { room, clients }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve))
}

function reset(): void {
  apiCalls.length = 0
  answer = defaultAnswer
}

function calls(pattern: RegExp): ApiCall[] {
  return apiCalls.filter((c) => pattern.test(c.path))
}

/** Starts a shift for `player` and puts its clock at `t0`. */
async function startWork(room: GameRoom, client: FakeClient, player: Player, stationId = 'station_dev_01', t0 = 1_000_000): Promise<JobShift> {
  await onJobStart(room, client, { stationId })
  assert.ok(player.job?.shiftId, `${player.sessionId} should be working: ${JSON.stringify(received(client, 'job_error'))}`)
  player.job.startedAt = t0
  player.job.lastTickAt = t0
  return player.job
}

/** Ticks every second from `from` (excluded) to `to` (included), letting the payments resolve between ticks. */
async function tickUntil(room: GameRoom, from: number, to: number): Promise<void> {
  for (let t = from + 1000; t <= to; t += 1000) {
    tickJobs(room, t)
    await settle()
  }
}

test('taking a free desk in reach opens a shift, sits the player down and tells everyone', async () => {
  reset()
  const me = fakePlayer('p1')
  const other = fakePlayer('p2', { x: 0, z: 0 })
  const { room, clients } = fakeRoom(me, other)

  await onJobStart(room, clients[0], { stationId: 'station_dev_01' })

  assert.deepEqual(calls(/^\/jobs\/shifts$/).map((c) => c.body), [{ job: 'dev', building: 'tech_hub', station: 'station_dev_01' }])
  assert.equal(room.jobStations.get('station_dev_01'), 'p1')
  assert.equal(me.job?.salaryCoins, 10)
  assert.equal(me.job?.periodMs, 60_000)
  assert.deepEqual([me.x, me.z, me.ry], [-14.8, 71.955, Math.PI])
  assert.ok(Math.abs(me.y - (0.71 + 0.88)) < 1e-9)
  assert.deepEqual(received(clients[0], 'job_started').map((m) => [m.stationId, m.salaryCoins, m.periodMs]), [['station_dev_01', 10, 60_000]])
  for (const client of clients) assert.deepEqual(received(client, 'user_working'), [{ sessionId: 'p1', stationId: 'station_dev_01' }])
  assert.equal(publicPlayer(me).stationId, 'station_dev_01')
  assert.equal(publicPlayer(other).stationId, null)
})

test('a desk is refused from too far, from outside the building, from another floor, and unknown desks', async () => {
  reset()
  const far = fakePlayer('p1', { x: -14.8, z: 68 })
  const outside = fakePlayer('p2', { x: -14.8, z: 63 })
  const otherBuilding = fakePlayer('p3', { x: 20, z: 72 })
  const upstairs = fakePlayer('p4', { x: -14.8, y: FLOOR_EYE + 4, z: 71 })
  const downstairs = fakePlayer('p5', { x: -25, z: 74.5 })
  const { room, clients } = fakeRoom(far, outside, otherBuilding, upstairs, downstairs)

  await onJobStart(room, clients[0], { stationId: 'station_dev_01' })
  await onJobStart(room, clients[1], { stationId: 'station_dev_01' })
  await onJobStart(room, clients[2], { stationId: 'station_dev_01' })
  await onJobStart(room, clients[3], { stationId: 'station_dev_01' })
  await onJobStart(room, clients[4], { stationId: 'station_dev_99' })
  await onJobStart(room, clients[0], { stationId: 'station_dev_42' })
  await onJobStart(room, clients[0], { stationId: '../../admin' })

  const codes = clients.map((c) => received(c, 'job_error').map((e) => e.code))
  assert.deepEqual(codes, [['station_too_far', 'station_unknown', 'station_unknown'], ['not_in_building'], ['not_in_building'], ['wrong_floor'], ['wrong_floor']])
  assert.equal(apiCalls.length, 0)
  assert.equal(room.jobStations.size, 0)
})

test('a taken desk is refused with the name of who works there', async () => {
  reset()
  const worker = fakePlayer('p1')
  const late = fakePlayer('p2', { x: -15.2, z: 71 })
  const { room, clients } = fakeRoom(worker, late)
  await startWork(room, clients[0], worker)

  await onJobStart(room, clients[1], { stationId: 'station_dev_01' })

  assert.deepEqual(received(clients[1], 'job_error'), [{ message: 'Someone already works at this desk.', code: 'station_taken', occupant: 'Pseudo p1' }])
  assert.equal(late.job, null)
  assert.equal(calls(/^\/jobs\/shifts$/).length, 1)
})

test('two players racing for the same desk: only one gets it, even while the API is still answering', async () => {
  reset()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  answer = async (call) => {
    if (call.path === '/jobs/shifts') await gate
    return defaultAnswer(call)
  }
  const a = fakePlayer('p1')
  const b = fakePlayer('p2', { x: -15.2, z: 71 })
  const { room, clients } = fakeRoom(a, b)

  // both handlers run before the API answered the first one
  const racing = Promise.all([onJobStart(room, clients[0], { stationId: 'station_dev_01' }), onJobStart(room, clients[1], { stationId: 'station_dev_01' })])
  await settle()
  assert.equal(calls(/^\/jobs\/shifts$/).length, 1)
  release()
  await racing

  assert.equal(a.job?.shiftId !== null && a.job !== null, true)
  assert.equal(b.job, null)
  assert.deepEqual(received(clients[1], 'job_error').map((e) => e.code), ['station_taken'])
  assert.equal(room.jobStations.get('station_dev_01'), 'p1')
})

test('one job per player: a second desk is refused, even asked in the same tick', async () => {
  reset()
  const me = fakePlayer('p1', { x: -16.5, z: 71 })
  const { room, clients } = fakeRoom(me)

  await Promise.all([onJobStart(room, clients[0], { stationId: 'station_dev_01' }), onJobStart(room, clients[0], { stationId: 'station_dev_02' })])
  await onJobStart(room, clients[0], { stationId: 'station_dev_02' })

  assert.equal(me.job?.stationId, 'station_dev_01')
  assert.deepEqual(received(clients[0], 'job_error').map((e) => e.code), ['already_working', 'already_working'])
  assert.deepEqual([...room.jobStations.keys()], ['station_dev_01'])
  assert.equal(calls(/^\/jobs\/shifts$/).length, 1)
})

test('several players work at different desks and are each paid for their own shift', async () => {
  reset()
  const a = fakePlayer('p1')
  const b = fakePlayer('p2', { x: -18.2, z: 71 })
  const { room, clients } = fakeRoom(a, b)
  const shiftA = await startWork(room, clients[0], a, 'station_dev_01', 0)
  const shiftB = await startWork(room, clients[1], b, 'station_dev_02', 0)

  await tickUntil(room, 0, 60_000)

  assert.deepEqual(calls(/salary$/).map((c) => [c.path, c.body.period]).sort(), [
    [`/jobs/shifts/${shiftA.shiftId}/salary`, 1],
    [`/jobs/shifts/${shiftB.shiftId}/salary`, 1]
  ])
  assert.deepEqual([shiftA.earned, shiftB.earned], [10, 10])
  assert.deepEqual(received(clients[0], 'job_paid').map((m) => [m.period, m.coins, m.earned, m.balanceAfter]), [[1, 10, 10, 500]])
})

test('the first salary comes after one full period, then one per period, each period asked once', async () => {
  reset()
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)

  await tickUntil(room, 0, 59_000)
  assert.equal(calls(/salary$/).length, 0)
  await tickUntil(room, 59_000, 60_000)
  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [1])
  await tickUntil(room, 60_000, 180_500)

  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [1, 2, 3])
  assert.equal(shift.earned, 30)
  const paid = received(clients[0], 'job_paid')
  assert.deepEqual(paid.map((m) => m.earned), [10, 20, 30])
  assert.ok(paid.every((m) => m.nextPaymentInMs > 0 && m.nextPaymentInMs <= 60_000))
})

test('ticks during a payment in flight never ask for the same period twice', async () => {
  reset()
  let release: () => void = () => undefined
  answer = async (call) => {
    if (call.path.endsWith('/salary')) await new Promise<void>((resolve) => { release = resolve })
    return defaultAnswer(call)
  }
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)

  await tickUntil(room, 0, 65_000)
  assert.equal(calls(/salary$/).length, 1)
  release()
  await settle()
  await tickUntil(room, 65_000, 70_000)

  assert.equal(calls(/salary$/).length, 1)
  assert.equal(shift.earned, 10)
})

test('a failed payment is not shown as earned, is retried, and a lost answer is not counted twice', async () => {
  reset()
  let attempt = 0
  answer = (call) => {
    if (!call.path.endsWith('/salary')) return defaultAnswer(call)
    attempt += 1
    if (attempt === 1) return { status: 500, body: { message: 'Server Error' } }
    // the second attempt reached the API but its answer was lost: the third gets already_paid
    if (attempt === 2) throw new Error('socket hang up')
    return { status: 200, body: { period: call.body.period, coins: 10, already_paid: true, balance_after: 510 } }
  }
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)

  await tickUntil(room, 0, 60_000)
  assert.equal(shift.earned, 0)
  assert.deepEqual(received(clients[0], 'job_payment_delayed').map((m) => [m.period, m.retryInMs]), [[1, 2000]])
  assert.equal(received(clients[0], 'job_paid').length, 0)
  await tickUntil(room, 60_000, 90_000)

  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [1, 1, 1])
  assert.equal(shift.earned, 10)
  assert.deepEqual(received(clients[0], 'job_paid').map((m) => [m.period, m.earned, m.balanceAfter]), [[1, 10, 510]])
})

test('a long API outage only catches up the last few periods', async () => {
  reset()
  let down = true
  answer = (call) => (down && call.path.endsWith('/salary') ? { status: 503, body: {} } : defaultAnswer(call))
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)

  await tickUntil(room, 0, 600_000)
  down = false
  apiCalls.length = 0
  await tickUntil(room, 600_000, 640_000)

  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [6, 7, 8, 9, 10])
  assert.equal(MAX_BACKLOG_PERIODS, 5)
  assert.equal(shift.forfeitedPeriods, 5)
  assert.equal(shift.earned, 50)
})

test('a server stall (asleep for hours) does not count as work', async () => {
  reset()
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)
  await tickUntil(room, 0, 30_000)

  tickJobs(room, 30_000 + 3 * 3600_000)
  await settle()

  assert.equal(completedPeriods(shift, 30_000 + 3 * 3600_000), 0)
  assert.equal(calls(/salary$/).length, 0)
  await tickUntil(room, 30_000 + 3 * 3600_000, 30_000 + 3 * 3600_000 + 30_000)
  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [1])
})

test('leaving mid-period pays the completed periods only, frees the desk and closes the shift', async () => {
  reset()
  const me = fakePlayer('p1')
  const watcher = fakePlayer('p2', { x: 0, z: 0 })
  const { room, clients } = fakeRoom(me, watcher)
  const shift = await startWork(room, clients[0], me, 'station_dev_01', 0)
  await tickUntil(room, 0, 59_000)

  // period 1 is complete at 60 s, but the tick has not paid it yet when the player stands up at 90 s
  endJob(room, me, 'stopped', 90_000)
  await settle()
  await tickUntil(room, 90_000, 900_000)

  assert.equal(me.job, null)
  assert.equal(room.jobStations.size, 0)
  assert.equal(room.jobShifts.size, 0)
  assert.deepEqual(calls(/salary$/).map((c) => c.body.period), [1])
  assert.deepEqual(calls(/\/end$/).map((c) => [c.path, c.body.reason]), [[`/jobs/shifts/${shift.shiftId}/end`, 'stopped']])
  assert.deepEqual(received(clients[0], 'job_ended'), [{ reason: 'stopped', stationId: 'station_dev_01', earned: 0 }])
  assert.deepEqual(received(clients[1], 'user_working').at(-1), { sessionId: 'p1', stationId: null })
  // the desk can be taken again right away, as a new shift
  await onJobStart(room, clients[0], { stationId: 'station_dev_01' })
  const resumed = me.job as JobShift | null
  assert.ok(resumed && resumed.shiftId !== shift.shiftId)
  assert.equal(resumed.nextPeriod, 1)
})

test('job_stop and a step away end the shift; a move that stays on the chair does not', async () => {
  reset()
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  await startWork(room, clients[0], me)

  assert.equal(onWorkerMove(room, me, -14.7, 71.9), 'stays')
  assert.ok(me.job)
  assert.equal(onWorkerMove(room, me, -14.8, 70.5), 'left')
  assert.equal(me.job, null)
  await startWork(room, clients[0], me)
  onJobStop(room, clients[0])
  onJobStop(room, clients[0])

  assert.deepEqual(received(clients[0], 'job_ended').map((m) => m.reason), ['left_station', 'stopped'])
})

test('no salary after a disconnection, and nothing while offline', async () => {
  reset()
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  await startWork(room, clients[0], me, 'station_dev_01', 0)
  await tickUntil(room, 0, 30_000)

  // CityRoom.onLeave
  room.players.delete('p1')
  endJob(room, me, 'disconnected', 30_000)
  await tickUntil(room, 30_000, 3600_000)

  assert.equal(calls(/salary$/).length, 0)
  assert.deepEqual(calls(/\/end$/).map((c) => c.body.reason), ['disconnected'])
  assert.equal(room.jobStations.size, 0)
  assert.equal(room.jobShifts.size, 0)
})

test('a shift the API opens after the player already left is closed at once and frees nothing else', async () => {
  reset()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  answer = async (call) => {
    if (call.path === '/jobs/shifts' && call.body.station === 'station_dev_01' && apiCalls.filter((c) => c.path === '/jobs/shifts').length === 1) await gate
    return defaultAnswer(call)
  }
  const first = fakePlayer('p1')
  const second = fakePlayer('p2', { x: -15.2, z: 71 })
  const { room, clients } = fakeRoom(first, second)

  const pending = onJobStart(room, clients[0], { stationId: 'station_dev_01' })
  await settle()
  room.players.delete('p1')
  endJob(room, first, 'disconnected')
  await startWork(room, clients[1], second)
  release()
  await pending

  assert.equal(first.job, null)
  assert.equal(room.jobStations.get('station_dev_01'), 'p2')
  assert.deepEqual(calls(/\/end$/).map((c) => c.body.reason), ['disconnected'])
  assert.deepEqual(received(clients[0], 'job_ended').map((m) => m.reason), ['disconnected'])
})

test('an admin teleport and a knock-out end the shift', async () => {
  reset()
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  await startWork(room, clients[0], me)

  teleportPlayer(room as never, me, { x: 0, y: 1.6, z: 0 }, 0)
  assert.equal(me.job, null)
  Object.assign(me, { x: -14.8, y: FLOOR_EYE, z: 71 })
  await startWork(room, clients[0], me)
  hurt(room, clients[0], me, 1000, 'punch')

  assert.equal(me.job, null)
  assert.equal(room.jobStations.size, 0)
  assert.deepEqual(received(clients[0], 'job_ended').map((m) => m.reason), ['teleported', 'knocked_out'])
  // knocked out: no new shift until recovered
  Object.assign(me, { x: -14.8, y: FLOOR_EYE, z: 71 })
  await onJobStart(room, clients[0], { stationId: 'station_dev_01' })
  assert.deepEqual(received(clients[0], 'job_error').map((e) => e.code), ['busy'])
})

test('a banned account or a closed shift stops the work at the next payment', async () => {
  reset()
  answer = (call) => (call.path.endsWith('/salary') ? { status: 403, body: { message: 'Account is banned.', code: 'account_banned' } } : defaultAnswer(call))
  const banned = fakePlayer('p1')
  const closed = fakePlayer('p2', { x: -18.2, z: 71 })
  const { room, clients } = fakeRoom(banned, closed)
  await startWork(room, clients[0], banned, 'station_dev_01', 0)
  await tickUntil(room, 0, 60_000)
  answer = (call) => (call.path.endsWith('/salary') ? { status: 409, body: { message: 'This shift is over.', code: 'shift_ended' } } : defaultAnswer(call))
  await startWork(room, clients[1], closed, 'station_dev_02', 60_000)
  await tickUntil(room, 60_000, 200_000)

  assert.deepEqual(received(clients[0], 'job_ended').map((m) => m.reason), ['account_inactive'])
  assert.deepEqual(received(clients[1], 'job_ended').map((m) => m.reason), ['shift_closed'])
  assert.equal(calls(/salary$/).length, 2)
  assert.equal(room.jobStations.size, 0)
  assert.equal(room.jobShifts.size, 0)
})

test('hunger and thirst drop at a quarter of the speed during a shift only', async () => {
  reset()
  const worker = fakePlayer('p1')
  const idle = fakePlayer('p2', { x: 0, z: 0 })
  const { room, clients } = fakeRoom(worker, idle)
  await startWork(room, clients[0], worker)
  assert.equal(survivalDrainFactor(worker), 0.25)
  assert.equal(survivalDrainFactor(idle), 1)

  tickSurvival(room, 600)
  const workerLoss = 100 - worker.stats!.hunger
  const idleLoss = 100 - idle.stats!.hunger
  assert.ok(Math.abs(workerLoss - idleLoss * 0.25) < 1e-9, `${workerLoss} vs ${idleLoss}`)
  assert.ok(Math.abs((100 - worker.stats!.thirst) - (100 - idle.stats!.thirst) * 0.25) < 1e-9)

  onJobStop(room, clients[0])
  const before = { worker: worker.stats!.hunger, idle: idle.stats!.hunger }
  tickSurvival(room, 600)
  assert.equal(survivalDrainFactor(worker), 1)
  assert.ok(Math.abs((before.worker - worker.stats!.hunger) - (before.idle - idle.stats!.hunger)) < 1e-9)
})

test('a desk still opening on the API does not slow hunger nor show the player as working', async () => {
  reset()
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  answer = async (call) => {
    if (call.path === '/jobs/shifts') await gate
    return defaultAnswer(call)
  }
  const me = fakePlayer('p1')
  const { room, clients } = fakeRoom(me)
  const pending = onJobStart(room, clients[0], { stationId: 'station_dev_01' })
  await settle()

  assert.equal(survivalDrainFactor(me), 1)
  assert.equal(publicPlayer(me).stationId, null)
  assert.equal(received(clients[0], 'user_working').length, 0)
  release()
  await pending
  assert.equal(survivalDrainFactor(me), 0.25)
})

test('the manifest stations are read with their building and chair', () => {
  const station = jobStation('station_dev_01')
  assert.deepEqual(station && [station.job, station.building, station.seat, station.seatHeight], ['dev', 'tech_hub', { x: -14.8, y: 0.71, z: 71.955 }, 0.51])
  assert.equal(jobStation('nope'), null)
})
