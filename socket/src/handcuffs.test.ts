import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }
interface ApiCall { path: string, method: string, body: any }

process.env.WORLD_MANIFEST_URL = 'http://handcuffs-world.test/world.manifest.json'

const cell = (id: string, z: number) => ({
  id,
  position: [109.4, 1.8, z],
  door: [108.4, 0.2, z + 1],
  tap: [111.8, 1.06, z],
  hatch: [108.4, 1.14, z - 0.5],
  bounds: { minX: 108.5, maxX: 112, minZ: z - 1.9, maxZ: z + 1.5 }
})
const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
  zones: [{
    key: 'police',
    bounds: { minX: 44.6, maxX: 122, minZ: -10, maxZ: 40 },
    buildings: [{ kind: 'work', key: 'police', name: 'Cove Police', position: [100, 0, 12], rotationY: -1.5708, door: [87.6, 1.25, 12] }]
  }],
  police: { desk: [94.6, 0.2, 12], officer: [95.5, 0.2, 12], lockers: [93, 0.2, 1.5], cells: [cell('cell_01', 8.6), cell('cell_02', 12.2)] }
}

const apiCalls: ApiCall[] = []
let bountyAnswer: object = { bounty: { paid: 45, stars: 3, reason: null, cash: 45 } }
globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  if (String(url) === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  const path = String(url).replace(/^.*\/api/, '')
  apiCalls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
  if (path === '/police/bounty') return new Response(JSON.stringify(bountyAnswer))
  return new Response(JSON.stringify({}))
}

const { loadWorld, worldPolice } = await import('./world.ts')
const { CUFF_HOLD_MS, CUFF_MAX_MS, CUFF_REACH, CUFF_STILL_MS, ESCORT_DISTANCE, OFFICER_HOLD_MS } = await import('./policeConstants.ts')
const {
  cuffRefusal,
  escortPosition,
  leaveCuffs,
  onCuffCancel,
  onCuffStart,
  onCuffsMove,
  onPoliceCell,
  onUncuff,
  parseBounty,
  tickCuffs
} = await import('./handcuffs.ts')
const { createPlayer } = await import('./players.ts')
const { endDuty } = await import('./police.ts')
const { moveRejection } = await import('./movement.ts')
const { canPunchNow, onPunch } = await import('./punch.ts')
const { hurt } = await import('./survival.ts')
const { onJailPay, tickJail } = await import('./jail.ts')
await loadWorld()

function setup() {
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const timers: (() => void)[] = []
  const moves: string[] = []
  const room = {
    players,
    clients,
    trades: new Map(),
    cashBags: new Map(),
    housingUnits: [],
    clinicBeds: new Map(),
    seats: new Map(),
    pub: { secretOpen: false, race: null, darts: null, challenges: new Map(), challengeSentAt: new Map() },
    clock: { setTimeout: (fn: () => void) => void timers.push(fn) },
    forEachClient: (fn: (c: GameClient) => void, except?: GameClient) => clients.forEach((c) => {
      if (c.sessionId !== except?.sessionId) fn(c)
    }),
    broadcastMove: (client: GameClient) => void moves.push(client.sessionId)
  }
  const join = (sessionId: string, accountId: number, extra: Partial<Player> = {}) => {
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    const player = Object.assign(
      createPlayer({ sessionId, auth: { accountId, pseudo: sessionId, token: `token-${sessionId}` } } as any, {}, 0, { x: 0, y: 1.6, z: 0 }),
      { stats: { health: 100, hunger: 100, thirst: 100 }, lastStepAt: 0 },
      extra
    )
    players.set(sessionId, player)
    clients.push(client)
    return { player, client }
  }
  apiCalls.length = 0
  bountyAnswer = { bounty: { paid: 45, stars: 3, reason: null, cash: 45 } }
  return { room: room as any, join, timers, moves }
}

const sentOf = (client: FakeClient, type: string) => client.sent.filter((m) => m.type === type).map((m) => m.payload)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function officerAndSuspect(suspectExtra: Partial<Player> = {}) {
  const ctx = setup()
  const officer = ctx.join('cop', 1, { onDuty: true, policeLicence: true })
  const suspect = ctx.join('sus', 2, { z: -1.5, ...suspectExtra })
  return { ...ctx, officer, suspect }
}

function cuffed(suspectExtra: Partial<Player> = {}) {
  const ctx = officerAndSuspect(suspectExtra)
  onCuffStart(ctx.room, ctx.officer.client, { targetSessionId: 'sus' })
  ctx.timers.forEach((fn) => fn())
  ctx.timers.length = 0
  return ctx
}

function walk(room: any, player: Player, to: { x: number, z: number, ry?: number }, now = Date.now()) {
  const dist = Math.hypot(to.x - player.x, to.z - player.z)
  Object.assign(player, to)
  onCuffsMove(room, player, dist, now)
}

test('a still player within 2 m is handcuffed after the officer holds for 2 s', () => {
  const { room, officer, suspect, timers } = officerAndSuspect()

  onCuffStart(room, officer.client, { targetSessionId: 'sus' })

  assert.equal(CUFF_HOLD_MS, 2000)
  assert.equal(suspect.player.cuffedBy, null)
  assert.deepEqual(sentOf(officer.client, 'police_cuff_started'), [{ officerSessionId: 'cop', suspectSessionId: 'sus', durationMs: 2000 }])
  assert.equal(sentOf(suspect.client, 'police_cuff_started').length, 1)
  timers.forEach((fn) => fn())
  assert.equal(room.players.get('sus')!.cuffedBy?.officerSessionId, 'cop')
  const cuffs = { officerSessionId: 'cop', suspectSessionId: 'sus', cuffed: true, reason: null }
  assert.deepEqual(sentOf(officer.client, 'police_cuffs'), [cuffs])
  assert.deepEqual(sentOf(suspect.client, 'police_cuffs'), [cuffs])
})

test('a player who moved or punched in the last 3 s cannot be handcuffed', () => {
  const now = 100_000
  const { room, officer, suspect } = officerAndSuspect()
  assert.equal(CUFF_STILL_MS, 3000)

  suspect.player.lastStepAt = now - 2999
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_moving')
  suspect.player.lastStepAt = now - 3000
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now), null)
  suspect.player.lastPunchAt = now - 1000
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_moving')
})

test('handcuffs need the officer on duty, 2 m at most, and a free, standing, uncuffed target', () => {
  const now = 100_000
  const { room, officer, suspect } = officerAndSuspect()
  assert.equal(CUFF_REACH, 2)

  suspect.player.z = -2
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now), null)
  suspect.player.z = -2.01
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_too_far')
  suspect.player.z = -1.5
  suspect.player.jail = { kind: 'npc', stars: 1, msLeft: 1000, cellId: 'cell_01' }
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_jailed')
  suspect.player.jail = null
  suspect.player.knockedOutUntil = now + 1
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_knocked_out')
  suspect.player.knockedOutUntil = 0
  suspect.player.cuffedBy = { officerSessionId: 'other', since: now }
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'cuff_already')
  suspect.player.cuffedBy = null
  officer.player.onDuty = false
  assert.equal(cuffRefusal(room, officer.player, suspect.player, now)?.code, 'police_not_on_duty')
})

test('a refused attempt tells the officer why and starts nothing', () => {
  const { room, officer, suspect, timers } = officerAndSuspect({ lastStepAt: Date.now() })

  onCuffStart(room, officer.client, { targetSessionId: 'sus' })

  assert.equal(sentOf(officer.client, 'police_error')[0].code, 'cuff_moving')
  assert.equal(officer.player.cuffAttempt, null)
  assert.equal(timers.length, 0)
  assert.equal(suspect.player.cuffedBy, null)
})

test('the attempt is cancelled when the target moves, punches or walks away, or the officer lets go or walks away', () => {
  const cases: [string, (ctx: ReturnType<typeof officerAndSuspect>) => void, string][] = [
    ['target moves', ({ room, suspect }) => walk(room, suspect.player, { x: 0.3, z: -1.5 }), 'moved'],
    ['target punches', ({ room, suspect }) => onPunch(room, suspect.client, { targetSessionId: null }), 'punched'],
    ['officer lets go', ({ room, officer }) => onCuffCancel(room, officer.client), 'released'],
    ['officer walks away', ({ room, officer }) => walk(room, officer.player, { x: 0, z: 1 }), 'too_far']
  ]
  for (const [name, act, reason] of cases) {
    const ctx = officerAndSuspect()
    onCuffStart(ctx.room, ctx.officer.client, { targetSessionId: 'sus' })
    act(ctx)
    assert.equal(sentOf(ctx.officer.client, 'police_cuff_cancelled').at(-1)?.reason, reason, name)
    assert.equal(sentOf(ctx.suspect.client, 'police_cuff_cancelled').length, 1, name)
    ctx.timers.forEach((fn) => fn())
    assert.equal(ctx.suspect.player.cuffedBy, null, name)
  }
})

test('a tiny jitter does not count as moving', () => {
  const { room, officer, suspect, timers } = officerAndSuspect()
  onCuffStart(room, officer.client, { targetSessionId: 'sus' })
  walk(room, suspect.player, { x: 0.04, z: -1.5 })
  timers.forEach((fn) => fn())
  assert.equal(suspect.player.cuffedBy?.officerSessionId, 'cop')
})

test('the suspect follows 1 m behind the officer and cannot walk alone', () => {
  const { room, officer, suspect, moves } = cuffed()
  moves.length = 0
  suspect.client.sent.length = 0

  walk(room, officer.player, { x: 10, z: 5, ry: Math.PI / 2 })

  const expected = escortPosition(officer.player)
  assert.equal(ESCORT_DISTANCE, 1)
  assert.ok(Math.abs(expected.x - 11) < 1e-9 && Math.abs(expected.z - 5) < 1e-9)
  assert.deepEqual([suspect.player.x, suspect.player.z], [expected.x, expected.z])
  assert.deepEqual(sentOf(suspect.client, 'position_correction').at(-1), { x: expected.x, y: officer.player.y, z: expected.z })
  assert.deepEqual(moves, ['sus'])
  assert.equal(moveRejection(room, suspect.player, suspect.player.x + 1, 1.6, suspect.player.z, Date.now()), 'cuffed')
})

test('a handcuffed player cannot punch', () => {
  const { suspect } = cuffed()
  assert.equal(canPunchNow(suspect.player, Date.now()), false)
})

test('the officer frees the suspect with E', () => {
  const { room, officer, suspect } = cuffed()
  onUncuff(room, officer.client)
  assert.equal(suspect.player.cuffedBy, null)
  assert.equal(sentOf(suspect.client, 'police_cuffs').at(-1).reason, 'uncuffed')
})

test('the suspect is freed when the officer goes off duty, is knocked out or leaves, or after 5 minutes', () => {
  let ctx = cuffed()
  endDuty(ctx.room, ctx.officer.player, 'off')
  assert.equal(ctx.suspect.player.cuffedBy, null)
  assert.equal(sentOf(ctx.suspect.client, 'police_cuffs').at(-1).reason, 'off_duty')

  ctx = cuffed()
  hurt(ctx.room, ctx.officer.client, ctx.officer.player, 200, 'fall')
  assert.equal(ctx.suspect.player.cuffedBy, null)
  assert.equal(sentOf(ctx.suspect.client, 'police_cuffs').at(-1).reason, 'officer_down')

  ctx = cuffed()
  leaveCuffs(ctx.room, ctx.officer.player)
  assert.equal(sentOf(ctx.suspect.client, 'police_cuffs').at(-1).reason, 'officer_left')

  ctx = cuffed()
  const since = ctx.suspect.player.cuffedBy!.since
  assert.equal(CUFF_MAX_MS, 300_000)
  tickCuffs(ctx.room, since + CUFF_MAX_MS - 1)
  assert.notEqual(ctx.suspect.player.cuffedBy, null)
  tickCuffs(ctx.room, since + CUFF_MAX_MS)
  assert.equal(sentOf(ctx.suspect.client, 'police_cuffs').at(-1).reason, 'timeout')
})

test('a suspect who leaves or is knocked out is freed and the officer is told', () => {
  let ctx = cuffed()
  leaveCuffs(ctx.room, ctx.suspect.player)
  assert.equal(sentOf(ctx.officer.client, 'police_cuffs').at(-1).reason, 'suspect_left')

  ctx = cuffed()
  hurt(ctx.room, ctx.suspect.client, ctx.suspect.player, 200, 'fall')
  assert.equal(ctx.suspect.player.cuffedBy, null)
  assert.equal(sentOf(ctx.officer.client, 'police_cuffs').at(-1).reason, 'suspect_down')
})

const atCellDoor = (cellIndex: number) => {
  const { door } = worldPolice()!.cells[cellIndex]
  return { x: door.x - 1, z: door.z, ry: 0 }
}

test('at a cell door the officer locks up the suspect for 15 minutes, uncuffed, stars cleared, bounty asked', async () => {
  const { room, officer, suspect } = cuffed({ wantedStars: 3 })
  walk(room, officer.player, atCellDoor(1))

  onPoliceCell(room, officer.client, Date.now() + 1000)

  assert.equal(OFFICER_HOLD_MS, 900_000)
  assert.deepEqual(suspect.player.jail, { kind: 'officer', stars: 0, msLeft: 900_000, cellId: 'cell_02' })
  assert.equal(suspect.player.cuffedBy, null)
  assert.equal(sentOf(suspect.client, 'police_cuffs').at(-1).reason, 'cell')
  assert.equal(suspect.player.wantedStars, 0)
  const { bounds } = worldPolice()!.cells[1]
  assert.ok(suspect.player.z >= bounds.minZ && suspect.player.z <= bounds.maxZ && suspect.player.x >= bounds.minX)
  assert.deepEqual(sentOf(suspect.client, 'jail_state').at(-1), { kind: 'officer', msLeft: 900_000, fine: 0, stars: 0 })
  assert.deepEqual(apiCalls.find((c) => c.path === '/jail')?.body, { kind: 'officer', stars: 0, ms_left: 900_000 })
  await flush()
  const bounty = apiCalls.find((c) => c.path === '/police/bounty')!
  assert.equal(bounty.body.suspect_account_id, 2)
  assert.equal(bounty.body.stars, 3)
  assert.equal(typeof bounty.body.ref, 'string')
  assert.deepEqual(sentOf(officer.client, 'police_bounty'), [{ paid: 45, stars: 3, reason: null, cash: 45 }])
})

test('a suspect with no star is locked up without asking for a bounty', async () => {
  const { room, officer, suspect } = cuffed()
  walk(room, officer.player, atCellDoor(0))
  onPoliceCell(room, officer.client, Date.now() + 1000)
  await flush()
  assert.equal(suspect.player.jail?.kind, 'officer')
  assert.equal(apiCalls.some((c) => c.path === '/police/bounty'), false)
  assert.deepEqual(sentOf(officer.client, 'police_bounty'), [{ paid: 0, stars: 0, reason: 'not_wanted', cash: null }])
})

test('away from a cell door nothing happens', () => {
  const { room, officer, suspect } = cuffed()
  onPoliceCell(room, officer.client, Date.now() + 1000)
  assert.equal(suspect.player.jail, null)
  assert.notEqual(suspect.player.cuffedBy, null)
})

test('an officer at the door lets out the officer-held prisoners of that cell only', () => {
  const ctx = setup()
  const officer = ctx.join('cop', 1, { onDuty: true, ...atCellDoor(0) })
  const held = ctx.join('held', 2, { x: 110, z: 8.6, jail: { kind: 'officer', stars: 0, msLeft: 500_000, cellId: 'cell_01' } })
  const npc = ctx.join('npc', 3, { x: 110, z: 8.6, jail: { kind: 'npc', stars: 2, msLeft: 100_000, cellId: 'cell_01' } })
  const other = ctx.join('other', 4, { x: 110, z: 12.2, jail: { kind: 'officer', stars: 0, msLeft: 500_000, cellId: 'cell_02' } })

  onPoliceCell(ctx.room, officer.client)

  assert.equal(held.player.jail, null)
  assert.equal(sentOf(held.client, 'jail_released').at(-1).reason, 'released')
  assert.notEqual(npc.player.jail, null)
  assert.notEqual(other.player.jail, null)
})

test('a player off duty cannot use the cell door', () => {
  const ctx = setup()
  const visitor = ctx.join('v', 1, { onDuty: false, ...atCellDoor(0) })
  const held = ctx.join('held', 2, { x: 110, z: 8.6, jail: { kind: 'officer', stars: 0, msLeft: 500_000, cellId: 'cell_01' } })
  onPoliceCell(ctx.room, visitor.client)
  assert.notEqual(held.player.jail, null)
})

test('an officer hold ends by itself after 15 minutes of connected time and has no fine', async () => {
  const ctx = setup()
  const held = ctx.join('held', 2, { x: 110, z: 8.6, jail: { kind: 'officer', stars: 0, msLeft: OFFICER_HOLD_MS, cellId: 'cell_01' } })

  await onJailPay(ctx.room, held.client)
  assert.equal(sentOf(held.client, 'jail_error').at(-1).code, 'jail_held_by_officer')
  assert.equal(apiCalls.some((c) => c.path === '/jail/pay'), false)

  tickJail(ctx.room, OFFICER_HOLD_MS - 1000)
  assert.notEqual(held.player.jail, null)
  tickJail(ctx.room, 1000)
  assert.equal(held.player.jail, null)
  assert.equal(sentOf(held.client, 'jail_released').at(-1).reason, 'served')
})

test('a broken bounty answer is refused', () => {
  assert.deepEqual(parseBounty({ paid: 0, stars: 0, reason: 'friends', cash: 10 }), { paid: 0, stars: 0, reason: 'friends', cash: 10 })
  assert.throws(() => parseBounty({ paid: -1, stars: 0, reason: null, cash: 0 }))
  assert.throws(() => parseBounty({ paid: 15, stars: 6, reason: null, cash: 0 }))
  assert.throws(() => parseBounty(null))
})
