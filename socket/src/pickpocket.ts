import { callRealtimeBackend, errorPayload } from './backend.ts'
import { unitAt } from './movement.ts'
import { isOnDuty } from './police.ts'
import {
  PICKPOCKET_CONE_DEG,
  PICKPOCKET_GAME_MS,
  PICKPOCKET_HALF_SWEEP_MS,
  PICKPOCKET_HEIGHT_REACH,
  PICKPOCKET_LAG_ALLOWANCE_MS,
  PICKPOCKET_LOOT_MS,
  PICKPOCKET_MISSING_DELAY_MS,
  PICKPOCKET_REACH,
  PICKPOCKET_START_COOLDOWN_MS,
  PICKPOCKET_WINDOW_MARGIN,
  PICKPOCKET_WINDOW_WIDTHS,
  WITNESS_CONE_DEG,
  WITNESS_REACH
} from './policeConstants.ts'
import type { ClientPayload, GameClient, GameRoom, PickpocketGame, PickpocketLootItem, PickpocketWindow, Player } from './types.ts'
import { reportCrime } from './wanted.ts'

export type PickpocketFail = 'missed' | 'out_of_position' | 'timeout' | 'cancelled'

type PlayingGame = Extract<PickpocketGame, { phase: 'playing' }>
type LootingGame = Extract<PickpocketGame, { phase: 'looting' }>

interface Refusal {
  code: string
  message: string
}

const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/
const BEHIND_COS = Math.cos((PICKPOCKET_CONE_DEG / 2) * Math.PI / 180)
const WITNESS_COS = Math.cos((WITNESS_CONE_DEG / 2) * Math.PI / 180)

function warn(context: string, error: unknown): void {
  console.warn(`[pickpocket] ${context}:`, error instanceof Error ? error.message : error)
}

function clientOf(room: Pick<GameRoom, 'clients'>, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

function playerOfAccount(room: Pick<GameRoom, 'players'>, accountId: number): Player | undefined {
  return [...room.players.values()].find((p) => p.accountId === accountId)
}

function sameUnit(room: GameRoom, a: Player, b: Player): boolean {
  return unitAt(room.housingUnits, a.x, a.z) === unitAt(room.housingUnits, b.x, b.z)
}

export function behindVictim(room: GameRoom, thief: Player, victim: Player): boolean {
  const dx = thief.x - victim.x
  const dz = thief.z - victim.z
  const dist = Math.hypot(dx, dz)
  if (dist === 0 || dist > PICKPOCKET_REACH || Math.abs(thief.y - victim.y) > PICKPOCKET_HEIGHT_REACH) return false
  const behind = (Math.sin(victim.ry) * dx + Math.cos(victim.ry) * dz) / dist
  return behind >= BEHIND_COS && sameUnit(room, thief, victim)
}

export function sees(room: GameRoom, witness: Player, subject: Player): boolean {
  const dx = subject.x - witness.x
  const dz = subject.z - witness.z
  const dist = Math.hypot(dx, dz)
  if (dist > WITNESS_REACH || !sameUnit(room, witness, subject)) return false
  if (dist === 0) return true
  return (-Math.sin(witness.ry) * dx - Math.cos(witness.ry) * dz) / dist >= WITNESS_COS
}

export function witnessesOf(room: GameRoom, thief: Player, victim: Player, now: number): Player[] {
  return [...room.players.values()].filter((p) => p !== thief && p !== victim && p.stats !== null && now >= p.knockedOutUntil && sees(room, p, thief))
}

export function pickpocketRefusal(room: GameRoom, thief: Player, victim: Player, now: number): Refusal | null {
  if (isOnDuty(thief)) return { code: 'pickpocket_on_duty', message: 'Not while on duty.' }
  if (thief.jail) return { code: 'pickpocket_jailed', message: 'Not from a cell.' }
  if (thief.cuffedBy) return { code: 'pickpocket_cuffed', message: 'Not in handcuffs.' }
  if (now < thief.knockedOutUntil) return { code: 'pickpocket_knocked_out', message: 'You are knocked out.' }
  if (victim.jail) return { code: 'pickpocket_victim_jailed', message: 'This player is in a cell.' }
  if (!behindVictim(room, thief, victim)) return { code: 'pickpocket_position', message: 'Get right behind them.' }
  return null
}

export function cursorAt(elapsedMs: number): number {
  const phase = (Math.max(0, elapsedMs) / PICKPOCKET_HALF_SWEEP_MS) % 2
  return phase <= 1 ? phase : 2 - phase
}

function cursorRange(fromMs: number, toMs: number): { min: number, max: number } {
  const values = [cursorAt(fromMs), cursorAt(toMs)]
  for (let k = Math.ceil(fromMs / PICKPOCKET_HALF_SWEEP_MS); k * PICKPOCKET_HALF_SWEEP_MS < toMs; k++) values.push(k % 2)
  return { min: Math.min(...values), max: Math.max(...values) }
}

export function stopHits(window: PickpocketWindow, elapsedMs: number): boolean {
  const { min, max } = cursorRange(Math.max(0, elapsedMs - PICKPOCKET_LAG_ALLOWANCE_MS), Math.max(0, elapsedMs))
  return max >= window.center - window.width / 2 && min <= window.center + window.width / 2
}

export function rollWindows(random: () => number = Math.random): PickpocketWindow[] {
  return PICKPOCKET_WINDOW_WIDTHS.map((width) => {
    const free = 1 - 2 * PICKPOCKET_WINDOW_MARGIN - width
    return { center: PICKPOCKET_WINDOW_MARGIN + width / 2 + random() * free, width }
  })
}

export function parseLoot(raw: unknown): PickpocketLootItem[] {
  if (!Array.isArray(raw)) throw new Error(`invalid loot from the API: ${JSON.stringify(raw)}`)
  return raw.map((row) => {
    const { code, name, kind, quantity, preview_image: previewImage } = (row ?? {}) as Record<string, unknown>
    const valid = typeof code === 'string' && ITEM_CODE.test(code) && typeof name === 'string' && typeof kind === 'string'
      && Number.isInteger(quantity) && (quantity as number) > 0 && (previewImage === null || typeof previewImage === 'string')
    if (!valid) throw new Error(`invalid loot from the API: ${JSON.stringify(row)}`)
    return { code, name, kind, quantity: quantity as number, previewImage: previewImage as string | null }
  })
}

function settle(thief: Player, attemptId: number, outcome: 'failed' | 'succeeded') {
  return callRealtimeBackend(thief.token, `/pickpocket/attempts/${attemptId}/outcome`, 'POST', { outcome })
}

export function onPickpocketStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now(), random: () => number = Math.random): void {
  const thief = room.players.get(client.sessionId)
  const targetSessionId = typeof payload?.targetSessionId === 'string' ? payload.targetSessionId : null
  const victim = targetSessionId ? room.players.get(targetSessionId) : undefined
  if (!thief?.stats || !victim || victim === thief || victim.accountId === thief.accountId) return
  if (thief.pickpocket || now - thief.lastPickpocketAt < PICKPOCKET_START_COOLDOWN_MS) return
  thief.lastPickpocketAt = now
  const refusal = pickpocketRefusal(room, thief, victim, now)
  if (refusal) {
    client.send('pickpocket_error', refusal)
    return
  }
  const game: PickpocketGame = { phase: 'checking', victimSessionId: victim.sessionId, victimAccountId: victim.accountId, victimPseudo: victim.pseudo }
  thief.pickpocket = game
  void openAttempt(room, thief, game, random)
}

async function openAttempt(room: GameRoom, thief: Player, game: PickpocketGame, random: () => number): Promise<void> {
  let attemptId: number
  try {
    const data = await callRealtimeBackend(thief.token, '/pickpocket/attempts', 'POST', { victim_account_id: game.victimAccountId })
    attemptId = data?.attempt?.id
    if (!Number.isInteger(attemptId)) throw new Error(`invalid attempt from the API: ${JSON.stringify(data)}`)
  } catch (error) {
    if (thief.pickpocket === game) thief.pickpocket = null
    clientOf(room, thief)?.send('pickpocket_error', errorPayload(error, 'You cannot try that now.', 'pickpocket_failed_to_start'))
    return
  }
  if (thief.pickpocket !== game || room.players.get(thief.sessionId) !== thief) return
  const playing: PlayingGame = { ...game, phase: 'playing', attemptId, windows: rollWindows(random), startedAt: Date.now(), stops: 0 }
  thief.pickpocket = playing
  const verdict = judgeState(room, thief, playing, playing.startedAt)
  if (verdict) {
    fail(room, thief, playing, verdict)
    return
  }
  clientOf(room, thief)?.send('pickpocket_started', {
    victimSessionId: playing.victimSessionId,
    windows: playing.windows,
    halfSweepMs: PICKPOCKET_HALF_SWEEP_MS,
    durationMs: PICKPOCKET_GAME_MS
  })
  room.clock.setTimeout(() => {
    if (thief.pickpocket === playing) fail(room, thief, playing, 'timeout')
  }, PICKPOCKET_GAME_MS + PICKPOCKET_LAG_ALLOWANCE_MS)
}

function judgeState(room: GameRoom, thief: Player, game: PlayingGame, now: number): PickpocketFail | null {
  const victim = room.players.get(game.victimSessionId)
  if (!victim) return 'cancelled'
  const refusal = pickpocketRefusal(room, thief, victim, now)
  if (!refusal) return null
  return refusal.code === 'pickpocket_position' ? 'out_of_position' : 'cancelled'
}

export function onPickpocketStop(room: GameRoom, client: GameClient, now = Date.now()): void {
  const thief = room.players.get(client.sessionId)
  const game = thief?.pickpocket
  if (!thief || game?.phase !== 'playing') return
  const elapsed = now - game.startedAt
  const verdict = judgeState(room, thief, game, now)
    ?? (elapsed > PICKPOCKET_GAME_MS + PICKPOCKET_LAG_ALLOWANCE_MS ? 'timeout' : null)
    ?? (stopHits(game.windows[game.stops], elapsed) ? null : 'missed')
  if (verdict) {
    fail(room, thief, game, verdict)
    return
  }
  game.stops += 1
  client.send('pickpocket_progress', { stops: game.stops })
  if (game.stops === game.windows.length) succeed(room, thief, game, now)
}

export function onPickpocketMove(room: GameRoom, mover: Player): void {
  for (const thief of room.players.values()) {
    const game = thief.pickpocket
    if (game?.phase !== 'playing' || (thief !== mover && game.victimSessionId !== mover.sessionId)) continue
    const victim = room.players.get(game.victimSessionId)
    if (victim && !behindVictim(room, thief, victim)) fail(room, thief, game, 'out_of_position')
  }
}

function alert(room: GameRoom, to: Player | undefined, payload: object): void {
  if (to) clientOf(room, to)?.send('pickpocket_alert', payload)
}

function fail(room: GameRoom, thief: Player, game: PlayingGame, reason: PickpocketFail): void {
  if (thief.pickpocket === game) thief.pickpocket = null
  clientOf(room, thief)?.send('pickpocket_failed', { reason })
  settle(thief, game.attemptId, 'failed').catch((error) => warn('failed outcome not saved', error))
  if (reason === 'cancelled') return
  reportCrime(room, thief, 'pickpocket_failed', game.victimAccountId)
  alert(room, room.players.get(game.victimSessionId), { kind: 'failed', thiefSessionId: thief.sessionId, thiefPseudo: thief.pseudo, victimPseudo: game.victimPseudo })
}

function succeed(room: GameRoom, thief: Player, game: PlayingGame, now: number): void {
  const victim = room.players.get(game.victimSessionId)
  const witnesses = victim ? witnessesOf(room, thief, victim, now) : []
  const witnessed = witnesses.length > 0
  const looting: LootingGame = { ...game, phase: 'looting', witnessed, loot: null, endsAt: Number.POSITIVE_INFINITY, taking: false }
  thief.pickpocket = looting
  clientOf(room, thief)?.send('pickpocket_succeeded', { witnessed })
  if (witnessed) {
    reportCrime(room, thief, 'pickpocket_seen', game.victimAccountId)
    const seen = { thiefSessionId: thief.sessionId, thiefPseudo: thief.pseudo, victimPseudo: game.victimPseudo }
    alert(room, victim, { kind: 'seen', ...seen })
    for (const witness of witnesses) alert(room, witness, { kind: 'witness', ...seen })
  }
  void openLoot(room, thief, looting)
}

async function openLoot(room: GameRoom, thief: Player, game: LootingGame): Promise<void> {
  let loot: PickpocketLootItem[]
  try {
    const data = await settle(thief, game.attemptId, 'succeeded')
    loot = parseLoot(data?.loot)
  } catch (error) {
    warn('loot failed', error)
    if (thief.pickpocket === game) thief.pickpocket = null
    clientOf(room, thief)?.send('pickpocket_error', errorPayload(error, 'Your hands came back empty.', 'pickpocket_loot_failed'))
    return
  }
  if (thief.pickpocket !== game) return
  game.loot = loot
  game.endsAt = Date.now() + PICKPOCKET_LOOT_MS + PICKPOCKET_LAG_ALLOWANCE_MS
  clientOf(room, thief)?.send('pickpocket_loot', { items: loot, durationMs: PICKPOCKET_LOOT_MS })
  room.clock.setTimeout(() => {
    if (thief.pickpocket !== game || game.taking) return
    thief.pickpocket = null
    clientOf(room, thief)?.send('pickpocket_loot_closed', {})
  }, PICKPOCKET_LOOT_MS + PICKPOCKET_LAG_ALLOWANCE_MS)
}

export function onPickpocketTake(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const thief = room.players.get(client.sessionId)
  const game = thief?.pickpocket
  const code = typeof payload?.code === 'string' ? payload.code : null
  if (!thief || game?.phase !== 'looting' || game.taking || !game.loot || now > game.endsAt) return
  if (!code || !game.loot.some((item) => item.code === code)) return
  game.taking = true
  void take(room, thief, game, code)
}

export function parseTaken(raw: unknown): { code: string, name: string, quantity: number } {
  const { code, name, quantity } = (raw ?? {}) as Record<string, unknown>
  if (typeof code !== 'string' || typeof name !== 'string' || !Number.isInteger(quantity) || (quantity as number) < 1) {
    throw new Error(`invalid taken item from the API: ${JSON.stringify(raw)}`)
  }
  return { code, name, quantity: quantity as number }
}

async function take(room: GameRoom, thief: Player, game: LootingGame, code: string): Promise<void> {
  let taken: { code: string, name: string, quantity: number }
  try {
    const data = await callRealtimeBackend(thief.token, `/pickpocket/attempts/${game.attemptId}/take`, 'POST', { item_code: code })
    taken = parseTaken(data?.taken)
  } catch (error) {
    game.taking = false
    if (Date.now() > game.endsAt && thief.pickpocket === game) {
      thief.pickpocket = null
      clientOf(room, thief)?.send('pickpocket_loot_closed', {})
    }
    clientOf(room, thief)?.send('pickpocket_error', errorPayload(error, 'You could not take that.', 'pickpocket_take_failed'))
    return
  }
  if (thief.pickpocket === game) thief.pickpocket = null
  clientOf(room, thief)?.send('pickpocket_taken', taken)
  const missing = { name: taken.name, quantity: taken.quantity }
  if (game.witnessed) {
    const victim = playerOfAccount(room, game.victimAccountId)
    if (victim) clientOf(room, victim)?.send('pickpocket_missing', { ...missing, thiefPseudo: thief.pseudo })
    return
  }
  room.clock.setTimeout(() => {
    const victim = playerOfAccount(room, game.victimAccountId)
    if (victim) clientOf(room, victim)?.send('pickpocket_missing', { ...missing, thiefPseudo: null })
  }, PICKPOCKET_MISSING_DELAY_MS)
}

export function leavePickpocket(room: GameRoom, player: Player): void {
  const game = player.pickpocket
  if (game?.phase === 'playing') fail(room, player, game, 'timeout')
  player.pickpocket = null
  for (const thief of room.players.values()) {
    const other = thief.pickpocket
    if (other?.phase === 'playing' && other.victimSessionId === player.sessionId) fail(room, thief, other, 'cancelled')
  }
}
