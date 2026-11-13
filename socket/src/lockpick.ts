import { callRealtimeBackend, errorPayload } from './backend.ts'
import { canUseDoor, isWithinReach } from './doors.ts'
import type { ClientPayload, GameClient, GameRoom, HousingUnit, LockpickPin, LockpickSession, Player } from './types.ts'
import { reportCrime } from './wanted.ts'

const MAX_PINS = 9
export const PIN_SETTLE_MS = 8000
export const PIN_PERIOD_MIN_MS = 1200
export const PIN_PERIOD_MAX_MS = 2000
export const PIN_WINDOW = 0.12
export const PRESS_LAG_ALLOWANCE_MS = 150
export const LOCKPICK_NOISE_RADIUS = 12
export const ALARM_SIREN_RADIUS = 25

export type LockpickRoom = GameRoom & { pollHousingUnits(): Promise<void> }

export type LockpickNoise = 'pick_click' | 'pick_scrape'

function warn(context: string, error: unknown): void {
  console.warn(`[lockpick] ${context}:`, error instanceof Error ? error.message : error)
}

export function rollPin(now: number, random: () => number = Math.random): LockpickPin {
  return {
    period: PIN_PERIOD_MIN_MS + random() * (PIN_PERIOD_MAX_MS - PIN_PERIOD_MIN_MS),
    phase: random(),
    shownAt: now
  }
}

export function needlePosition(pin: LockpickPin, at: number): number {
  const turns = pin.phase + (at - pin.shownAt) / pin.period
  return turns - Math.floor(turns)
}

/** Whether the needle crossed the window (centred on 0) at any time in [from, to]. */
export function crossedWindow(pin: LockpickPin, from: number, to: number): boolean {
  const start = (needlePosition(pin, from) + PIN_WINDOW / 2) % 1
  const travelled = (to - from) / pin.period
  return start <= PIN_WINDOW || start + travelled >= 1
}

export function isHit(pin: LockpickPin, pressedAt: number): boolean {
  return crossedWindow(pin, Math.max(pin.shownAt, pressedAt - PRESS_LAG_ALLOWANCE_MS), pressedAt)
}

function sendError(client: GameClient, message: string, code: string): void {
  client.send('lockpick_error', { message, code })
}

function nextPin(client: GameClient, session: LockpickSession, now: number, random: () => number): void {
  session.pin = rollPin(now, random)
  session.readyAt = now + PIN_SETTLE_MS
  session.busy = false
  client.send('lockpick_pin', {
    pinsSet: session.pinsSet,
    pins: session.pins,
    period: session.pin.period,
    phase: session.pin.phase,
    window: PIN_WINDOW,
    readyInMs: PIN_SETTLE_MS
  })
}

function sendNoise(room: GameRoom, unit: HousingUnit, noise: LockpickNoise): void {
  if (!unit.model_key) return
  const payload = { door: unit.model_key, sound: noise }
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && Math.hypot(listener.x - unit.pos_x, listener.z - unit.pos_z) <= LOCKPICK_NOISE_RADIUS) c.send('door_sound', payload)
  })
}

function soundAlarm(room: GameRoom, unit: HousingUnit): void {
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (!listener) return
    if (Math.hypot(listener.x - unit.pos_x, listener.z - unit.pos_z) <= ALARM_SIREN_RADIUS) c.send('alarm_siren', { door: unit.model_key })
    if (listener.accountId === unit.occupant_account_id) c.send('house_alarm', { unitId: unit.public_id })
  })
}

function lockedUnit(room: GameRoom, unitId: unknown): HousingUnit | undefined {
  return room.housingUnits.find((u) => u.public_id === unitId && u.status === 'occupied' && u.door_locked)
}

function isActive(player: Player, now: number): boolean {
  return Boolean(player.token) && now >= player.knockedOutUntil
}

function abandon(player: Player, session: LockpickSession): void {
  if (player.lockpick === session) player.lockpick = null
  if (session.attemptId === null) return
  callRealtimeBackend(player.token, `/lockpicks/attempts/${session.attemptId}/abandon`).catch((error) => warn('abandon failed', error))
}

export async function onLockpickStart(room: GameRoom, client: GameClient, payload: ClientPayload, clock: () => number = Date.now, random: () => number = Math.random): Promise<void> {
  const now = clock()
  const player = room.players.get(client.sessionId)
  if (!player || !isActive(player, now) || player.lockpick) return
  const unit = lockedUnit(room, payload?.unitId)
  if (!unit) {
    sendError(client, 'This door is not locked.', 'door_not_locked')
    return
  }
  if (!isWithinReach(player, unit.pos_x, unit.pos_z)) {
    sendError(client, 'Get closer to the door.', 'lockpick_too_far')
    return
  }
  if (canUseDoor(unit, player.accountId)) {
    sendError(client, 'You have the keys to this house.', 'has_house_key')
    return
  }
  const session: LockpickSession = { unitId: unit.public_id, attemptId: null, pins: 0, pinsSet: 0, misses: 0, pin: rollPin(now, random), readyAt: now, busy: true }
  player.lockpick = session
  try {
    const data = await callRealtimeBackend(player.token, '/lockpicks/attempts', 'POST', { unit_public_id: unit.public_id })
    if (!Number.isInteger(data?.attempt_id)) throw new Error('invalid attempt id')
    if (!Number.isInteger(data?.pins) || data.pins < 1 || data.pins > MAX_PINS) throw new Error('invalid pin count')
    session.attemptId = data.attempt_id
    session.pins = data.pins
  } catch (error) {
    if (player.lockpick === session) player.lockpick = null
    client.send('lockpick_error', errorPayload(error, 'You cannot pick this lock.', 'lockpick_failed'))
    return
  }
  reportCrime(room, player, 'lockpick')
  if (player.lockpick !== session) {
    abandon(player, session)
    return
  }
  nextPin(client, session, clock(), random)
}

export async function onLockpickPress(room: LockpickRoom, client: GameClient, clock: () => number = Date.now, random: () => number = Math.random): Promise<void> {
  const now = clock()
  const player = room.players.get(client.sessionId)
  const session = player?.lockpick
  if (!player || !session || session.busy || session.attemptId === null) return
  const unit = lockedUnit(room, session.unitId)
  if (!unit || !isActive(player, now) || !isWithinReach(player, unit.pos_x, unit.pos_z)) {
    abandon(player, session)
    client.send('lockpick_result', { outcome: 'abandoned' })
    return
  }
  if (now < session.readyAt) {
    sendError(client, 'The lock is still settling.', 'lockpick_settling')
    return
  }
  const hit = isHit(session.pin, now)
  sendNoise(room, unit, hit ? 'pick_click' : 'pick_scrape')
  session.busy = true
  try {
    if (hit) {
      session.pinsSet += 1
      if (session.pinsSet >= session.pins) {
        const data = await callRealtimeBackend(player.token, `/lockpicks/attempts/${session.attemptId}/success`)
        if (data?.alarm === true) {
          soundAlarm(room, unit)
          reportCrime(room, player, 'alarm')
        }
        player.lockpick = null
        client.send('lockpick_result', { outcome: 'open' })
        await room.pollHousingUnits()
        return
      }
    } else {
      session.misses += 1
      session.pinsSet = Math.max(0, session.pinsSet - 1)
      const data = await callRealtimeBackend(player.token, `/lockpicks/attempts/${session.attemptId}/miss`, 'POST', { miss: session.misses })
      if (data?.alarm === true) {
        soundAlarm(room, unit)
        reportCrime(room, player, 'alarm')
      }
      if (data?.broke === true) {
        player.lockpick = null
        client.send('lockpick_result', { outcome: 'broke' })
        return
      }
    }
  } catch (error) {
    if (player.lockpick === session) player.lockpick = null
    client.send('lockpick_error', errorPayload(error, 'The lock jammed.', 'lockpick_failed'))
    return
  }
  if (player.lockpick !== session) return
  client.send('lockpick_result', { outcome: hit ? 'set' : 'miss' })
  nextPin(client, session, clock(), random)
}

export function onLockpickCancel(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (player?.lockpick) abandon(player, player.lockpick)
}

export async function onDoorReinforce(room: LockpickRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player || !isActive(player, now)) return
  const unit = room.housingUnits.find((u) => u.public_id === payload?.unitId && u.status === 'occupied')
  if (!unit || !isWithinReach(player, unit.pos_x, unit.pos_z)) {
    client.send('door_reinforce_error', { message: 'Get closer to the door.', code: 'lockpick_too_far' })
    return
  }
  try {
    await callRealtimeBackend(player.token, '/lockpicks/reinforced-lock', 'POST', { unit_public_id: unit.public_id })
  } catch (error) {
    client.send('door_reinforce_error', errorPayload(error, 'The lock did not fit.', 'reinforce_failed'))
    return
  }
  client.send('door_reinforced', { unitId: unit.public_id })
  await room.pollHousingUnits()
}
