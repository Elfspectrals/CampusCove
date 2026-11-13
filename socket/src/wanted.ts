import { callRealtimeBackend } from './backend.ts'
import { isOnDuty } from './police.ts'
import type { GameClient, GameRoom, Player } from './types.ts'

export type CrimeKind = 'assault' | 'murder' | 'bag_theft' | 'pickpocket_seen' | 'pickpocket_failed' | 'lockpick' | 'alarm'

export const CRIME_STARS: Readonly<Record<CrimeKind, number>> = {
  assault: 1,
  murder: 3,
  bag_theft: 2,
  pickpocket_seen: 2,
  pickpocket_failed: 1,
  lockpick: 1,
  alarm: 2
}
export const MAX_WANTED_STARS = 5
export const WANTED_DECAY_MS = 4 * 60_000
export const WANTED_TICK_MS = 1000
export const PUBLIC_WANTED_STARS = 3
export const ON_DUTY_WANTED_STARS = 1
export const SELF_DEFENCE_MS = 60_000
export const ASSAULT_REPEAT_MS = 60_000

export interface WantedState {
  stars: number
  decayMs: number
}

function warn(context: string, error: unknown): void {
  console.warn(`[wanted] ${context}:`, error instanceof Error ? error.message : error)
}

export function addCrimeStars(stars: number, kind: CrimeKind): number {
  return Math.min(MAX_WANTED_STARS, stars + CRIME_STARS[kind])
}

export function decayWanted(state: WantedState, elapsedMs: number): WantedState {
  let { stars, decayMs } = state
  let left = elapsedMs
  while (stars > 0 && left >= decayMs) {
    left -= decayMs
    stars -= 1
    decayMs = WANTED_DECAY_MS
  }
  return stars > 0 ? { stars, decayMs: decayMs - left } : { stars: 0, decayMs: WANTED_DECAY_MS }
}

export function starsSeenBy(viewer: Player, subject: Player, stars: number): number {
  const shownFrom = isOnDuty(viewer) ? ON_DUTY_WANTED_STARS : PUBLIC_WANTED_STARS
  return viewer.sessionId === subject.sessionId || stars >= shownFrom ? stars : 0
}

function broadcastWanted(room: GameRoom, subject: Player, starsBefore: number): void {
  room.forEachClient((client) => {
    const viewer = room.players.get(client.sessionId)
    if (!viewer) return
    const seen = starsSeenBy(viewer, subject, subject.wantedStars)
    const isSubject = viewer.sessionId === subject.sessionId
    if (isSubject || seen !== starsSeenBy(viewer, subject, starsBefore)) {
      client.send('wanted', { sessionId: subject.sessionId, stars: seen })
    }
  })
}

function setWanted(room: GameRoom, player: Player, next: WantedState): void {
  const starsBefore = player.wantedStars
  player.wantedStars = next.stars
  player.wantedDecayMs = next.decayMs
  player.wantedDirty = true
  if (next.stars !== starsBefore) broadcastWanted(room, player, starsBefore)
  void saveWanted(player)
}

export function clearWanted(room: GameRoom, player: Player): void {
  setWanted(room, player, { stars: 0, decayMs: WANTED_DECAY_MS })
}

export function reportCrime(room: GameRoom, player: Player, kind: CrimeKind, victimAccountId: number | null = null): void {
  setWanted(room, player, { stars: addCrimeStars(player.wantedStars, kind), decayMs: WANTED_DECAY_MS })
  callRealtimeBackend(player.token, '/crimes', 'POST', { kind, stars: CRIME_STARS[kind], victim_account_id: victimAccountId })
    .catch((error) => warn('crime record failed', error))
}

export function reportAssault(room: GameRoom, attacker: Player, victim: Player, now: number): void {
  const victimHitAttackerAt = victim.lastHitAt.get(attacker.accountId) ?? Number.NEGATIVE_INFINITY
  const reportedAt = attacker.lastAssaultAt.get(victim.accountId) ?? Number.NEGATIVE_INFINITY
  attacker.lastHitAt.set(victim.accountId, now)
  if (isOnDuty(attacker)) return
  if (now - victimHitAttackerAt < SELF_DEFENCE_MS || now - reportedAt < ASSAULT_REPEAT_MS) return
  attacker.lastAssaultAt.set(victim.accountId, now)
  reportCrime(room, attacker, 'assault', victim.accountId)
}

export function tickWanted(room: GameRoom, elapsedMs: number): void {
  for (const player of room.players.values()) {
    if (player.wantedStars === 0) continue
    const next = decayWanted({ stars: player.wantedStars, decayMs: player.wantedDecayMs }, elapsedMs)
    if (next.stars !== player.wantedStars) {
      setWanted(room, player, next)
      continue
    }
    player.wantedDecayMs = next.decayMs
    player.wantedDirty = true
  }
}

export function sendWantedOnJoin(room: GameRoom, client: GameClient, newcomer: Player): void {
  for (const other of room.players.values()) {
    if (other === newcomer) continue
    const stars = starsSeenBy(newcomer, other, other.wantedStars)
    if (stars > 0) client.send('wanted', { sessionId: other.sessionId, stars })
  }
}

export function sendWantedView(room: GameRoom, client: GameClient, viewer: Player): void {
  for (const other of room.players.values()) {
    if (other === viewer || other.wantedStars === 0) continue
    client.send('wanted', { sessionId: other.sessionId, stars: starsSeenBy(viewer, other, other.wantedStars) })
  }
}

export function parseWantedState(raw: unknown): WantedState {
  const { stars, decay_ms: decayMs } = (raw ?? {}) as { stars?: unknown, decay_ms?: unknown }
  const validStars = Number.isInteger(stars) && (stars as number) >= 0 && (stars as number) <= MAX_WANTED_STARS
  const validDecay = Number.isInteger(decayMs) && (decayMs as number) > 0 && (decayMs as number) <= WANTED_DECAY_MS
  if (!validStars || !validDecay) throw new Error(`invalid wanted state from the API: ${JSON.stringify(raw)}`)
  return { stars: stars as number, decayMs: decayMs as number }
}

export async function loadWanted(room: GameRoom, player: Player): Promise<void> {
  let state: WantedState
  try {
    const data = await callRealtimeBackend(player.token, '/wanted', 'GET')
    state = parseWantedState(data?.wanted)
  } catch (error) {
    warn('load failed', error)
    return
  }
  if (room.players.get(player.sessionId) !== player) return
  const starsBefore = player.wantedStars
  player.wantedStars = state.stars
  player.wantedDecayMs = state.decayMs
  broadcastWanted(room, player, starsBefore)
}

export async function saveWanted(player: Player): Promise<void> {
  if (!player.wantedDirty || !player.token) return
  player.wantedDirty = false
  try {
    await callRealtimeBackend(player.token, '/wanted', 'PUT', { stars: player.wantedStars, decay_ms: Math.ceil(player.wantedDecayMs) })
  } catch (error) {
    player.wantedDirty = true
    warn('save failed', error)
  }
}
