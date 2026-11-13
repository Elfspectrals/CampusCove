import { type AdminRoom, teleportPlayer } from './admin.ts'
import { callRealtimeBackend, errorPayload } from './backend.ts'
import { cellSpawn, release, saveJail, sendJailState } from './jail.ts'
import { isOnDuty } from './police.ts'
import {
  CELL_DOOR_REACH,
  CUFF_HOLD_MS,
  CUFF_MAX_MS,
  CUFF_REACH,
  CUFF_STILL_MS,
  ESCORT_DISTANCE,
  OFFICER_HOLD_MS,
  POLICE_ACTION_COOLDOWN_MS,
  POLICE_HEIGHT_REACH,
  STILL_STEP
} from './policeConstants.ts'
import { leavePub } from './pubGames.ts'
import type { ClientPayload, CuffAttempt, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { MAX_WANTED_STARS, clearWanted } from './wanted.ts'
import { type PoliceCell, worldPolice } from './world.ts'

export type CuffCancel = 'released' | 'moved' | 'punched' | 'too_far' | 'gone' | 'off_duty'
export type CuffRelease = 'uncuffed' | 'cell' | 'off_duty' | 'officer_down' | 'officer_left' | 'suspect_down' | 'suspect_left' | 'timeout'

export interface Bounty {
  paid: number
  stars: number
  reason: string | null
  cash: number
}

interface Refusal {
  code: string
  message: string
}

function clientOf(room: Pick<GameRoom, 'clients'>, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

function sendTo(room: GameRoom, players: (Player | undefined)[], type: string, payload: unknown): void {
  for (const player of players) if (player) clientOf(room, player)?.send(type, payload)
}

function withinReach(a: Vec3, b: Vec3, reach: number): boolean {
  return Math.hypot(a.x - b.x, a.z - b.z) <= reach && Math.abs(a.y - b.y) <= POLICE_HEIGHT_REACH
}

export function lastActiveAt(player: Player): number {
  return Math.max(player.lastStepAt, player.lastPunchAt)
}

export function escortOf(room: Pick<GameRoom, 'players'>, officer: Player): Player | null {
  return [...room.players.values()].find((p) => p.cuffedBy?.officerSessionId === officer.sessionId) ?? null
}

export function cuffRefusal(room: GameRoom, officer: Player, target: Player, now: number): Refusal | null {
  if (!isOnDuty(officer)) return { code: 'police_not_on_duty', message: 'Only an officer on duty can use handcuffs.' }
  if (escortOf(room, officer)) return { code: 'cuff_busy', message: 'You are already escorting someone.' }
  if (!withinReach(officer, target, CUFF_REACH)) return { code: 'cuff_too_far', message: 'Get closer to handcuff them.' }
  if (target.jail) return { code: 'cuff_jailed', message: 'This player is already in a cell.' }
  if (now < target.knockedOutUntil) return { code: 'cuff_knocked_out', message: 'This player is knocked out.' }
  if (target.cuffedBy) return { code: 'cuff_already', message: 'This player is already handcuffed.' }
  if (now - lastActiveAt(target) < CUFF_STILL_MS) return { code: 'cuff_moving', message: 'They must stand still for 3 seconds first.' }
  return null
}

export function onCuffStart(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const officer = room.players.get(client.sessionId)
  const targetSessionId = typeof payload?.targetSessionId === 'string' ? payload.targetSessionId : null
  const target = targetSessionId ? room.players.get(targetSessionId) : undefined
  if (!officer || !target || target === officer || officer.cuffAttempt) return
  if (now - officer.lastPoliceActionAt < POLICE_ACTION_COOLDOWN_MS) {
    client.send('police_error', { code: 'police_busy', message: 'Wait a moment.' })
    return
  }
  officer.lastPoliceActionAt = now
  const refusal = cuffRefusal(room, officer, target, now)
  if (refusal) {
    client.send('police_error', refusal)
    return
  }
  const attempt: CuffAttempt = { targetSessionId: target.sessionId, startedAt: now }
  officer.cuffAttempt = attempt
  sendTo(room, [officer, target], 'police_cuff_started', { officerSessionId: officer.sessionId, suspectSessionId: target.sessionId, durationMs: CUFF_HOLD_MS })
  room.clock.setTimeout(() => completeCuff(room, officer, attempt), CUFF_HOLD_MS)
}

export function cancelCuff(room: GameRoom, officer: Player, reason: CuffCancel): void {
  const attempt = officer.cuffAttempt
  if (!attempt) return
  officer.cuffAttempt = null
  const target = room.players.get(attempt.targetSessionId)
  sendTo(room, [officer, target], 'police_cuff_cancelled', { officerSessionId: officer.sessionId, suspectSessionId: attempt.targetSessionId, reason })
}

export function cancelCuffsOn(room: GameRoom, target: Player, reason: CuffCancel): void {
  for (const officer of room.players.values()) {
    if (officer.cuffAttempt?.targetSessionId === target.sessionId) cancelCuff(room, officer, reason)
  }
}

export function onCuffCancel(room: GameRoom, client: GameClient): void {
  const officer = room.players.get(client.sessionId)
  if (officer) cancelCuff(room, officer, 'released')
}

export function completeCuff(room: GameRoom, officer: Player, attempt: CuffAttempt, now = Date.now()): void {
  if (officer.cuffAttempt !== attempt || room.players.get(officer.sessionId) !== officer) return
  const target = room.players.get(attempt.targetSessionId)
  if (!target) {
    cancelCuff(room, officer, 'gone')
    return
  }
  const refusal = cuffRefusal(room, officer, target, now)
  if (refusal || lastActiveAt(target) > attempt.startedAt - CUFF_STILL_MS) {
    cancelCuff(room, officer, refusal?.code === 'cuff_too_far' ? 'too_far' : 'moved')
    return
  }
  officer.cuffAttempt = null
  dropCuffsOf(room, target, 'officer_down')
  leavePub(room, target)
  target.cuffedBy = { officerSessionId: officer.sessionId, since: now }
  sendTo(room, [officer, target], 'police_cuffs', { officerSessionId: officer.sessionId, suspectSessionId: target.sessionId, cuffed: true, reason: null })
  escortStep(room, officer, now)
}

export function releaseCuffs(room: GameRoom, suspect: Player, reason: CuffRelease): void {
  const cuffs = suspect.cuffedBy
  if (!cuffs) return
  suspect.cuffedBy = null
  const officer = room.players.get(cuffs.officerSessionId)
  sendTo(room, [officer, suspect], 'police_cuffs', { officerSessionId: cuffs.officerSessionId, suspectSessionId: suspect.sessionId, cuffed: false, reason })
}

export function dropCuffsOf(room: GameRoom, officer: Player, reason: CuffRelease): void {
  cancelCuff(room, officer, 'off_duty')
  const suspect = escortOf(room, officer)
  if (suspect) releaseCuffs(room, suspect, reason)
}

export function escortPosition(officer: Player): Vec3 & { ry: number } {
  return {
    x: officer.x + Math.sin(officer.ry) * ESCORT_DISTANCE,
    y: officer.y,
    z: officer.z + Math.cos(officer.ry) * ESCORT_DISTANCE,
    ry: officer.ry
  }
}

function escortStep(room: GameRoom, officer: Player, now: number): void {
  const suspect = escortOf(room, officer)
  if (!suspect) return
  const at = escortPosition(officer)
  Object.assign(suspect, at, { fallPeakY: at.y, lastMoveAt: now })
  const client = clientOf(room, suspect)
  if (!client) return
  client.send('position_correction', { x: at.x, y: at.y, z: at.z })
  room.broadcastMove(client, suspect)
}

export function onCuffsMove(room: GameRoom, player: Player, distXZ: number, now: number): void {
  if (distXZ > STILL_STEP) {
    player.lastStepAt = now
    cancelCuffsOn(room, player, 'moved')
  }
  const attempt = player.cuffAttempt
  if (attempt) {
    const target = room.players.get(attempt.targetSessionId)
    if (!target || !withinReach(player, target, CUFF_REACH)) cancelCuff(room, player, 'too_far')
  }
  escortStep(room, player, now)
}

export function onUncuff(room: GameRoom, client: GameClient): void {
  const officer = room.players.get(client.sessionId)
  const suspect = officer ? escortOf(room, officer) : null
  if (suspect) releaseCuffs(room, suspect, 'uncuffed')
}

export function cellAtDoor(at: Vec3): PoliceCell | null {
  const cells = worldPolice()?.cells ?? []
  const near = cells.filter((cell) => withinReach(at, cell.door, CELL_DOOR_REACH))
  return near.reduce<PoliceCell | null>((best, cell) => {
    if (!best) return cell
    return Math.hypot(cell.door.x - at.x, cell.door.z - at.z) < Math.hypot(best.door.x - at.x, best.door.z - at.z) ? cell : best
  }, null)
}

export function onPoliceCell(room: AdminRoom, client: GameClient, now = Date.now()): void {
  const officer = room.players.get(client.sessionId)
  if (!officer || !isOnDuty(officer) || now - officer.lastPoliceActionAt < POLICE_ACTION_COOLDOWN_MS) return
  const cell = cellAtDoor(officer)
  if (!cell) return
  officer.lastPoliceActionAt = now
  const suspect = escortOf(room, officer)
  if (suspect) {
    lockUp(room, officer, suspect, cell, now)
    return
  }
  for (const prisoner of room.players.values()) {
    if (prisoner.jail?.kind === 'officer' && prisoner.jail.cellId === cell.id) release(room, prisoner, 'released')
  }
}

function lockUp(room: AdminRoom, officer: Player, suspect: Player, cell: PoliceCell, now: number): void {
  const stars = suspect.wantedStars
  releaseCuffs(room, suspect, 'cell')
  suspect.jail = { kind: 'officer', stars: 0, msLeft: OFFICER_HOLD_MS, cellId: cell.id }
  suspect.mealTrayInMs = 0
  suspect.jailDirty = true
  void saveJail(suspect)
  if (stars > 0) clearWanted(room, suspect)
  const spawn = cellSpawn(cell)
  teleportPlayer(room, suspect, spawn, spawn.ry, now)
  const suspectClient = clientOf(room, suspect)
  if (suspectClient) sendJailState(suspectClient, suspect)
  if (stars === 0) {
    clientOf(room, officer)?.send('police_bounty', { paid: 0, stars: 0, reason: 'not_wanted', cash: null })
    return
  }
  void payBounty(room, officer, suspect.accountId, stars, `arrest:${officer.accountId}:${suspect.accountId}:${now}`)
}

export function parseBounty(raw: unknown): Bounty {
  const { paid, stars, reason, cash } = (raw ?? {}) as { paid?: unknown, stars?: unknown, reason?: unknown, cash?: unknown }
  const valid = Number.isInteger(paid) && (paid as number) >= 0
    && Number.isInteger(stars) && (stars as number) >= 0 && (stars as number) <= MAX_WANTED_STARS
    && (reason === null || typeof reason === 'string')
    && Number.isInteger(cash)
  if (!valid) throw new Error(`invalid bounty from the API: ${JSON.stringify(raw)}`)
  return { paid: paid as number, stars: stars as number, reason: reason as string | null, cash: cash as number }
}

async function payBounty(room: GameRoom, officer: Player, suspectAccountId: number, stars: number, ref: string): Promise<void> {
  try {
    const data = await callRealtimeBackend(officer.token, '/police/bounty', 'POST', { suspect_account_id: suspectAccountId, stars, ref })
    clientOf(room, officer)?.send('police_bounty', parseBounty(data?.bounty))
  } catch (error) {
    console.warn('[handcuffs] bounty failed:', error instanceof Error ? error.message : error)
    clientOf(room, officer)?.send('police_error', errorPayload(error, 'The bounty could not be paid.', 'police_bounty_failed'))
  }
}

export function tickCuffs(room: GameRoom, now = Date.now()): void {
  for (const suspect of room.players.values()) {
    if (suspect.cuffedBy && now - suspect.cuffedBy.since >= CUFF_MAX_MS) releaseCuffs(room, suspect, 'timeout')
  }
}

export function leaveCuffs(room: GameRoom, player: Player): void {
  releaseCuffs(room, player, 'suspect_left')
  dropCuffsOf(room, player, 'officer_left')
  cancelCuffsOn(room, player, 'gone')
}
