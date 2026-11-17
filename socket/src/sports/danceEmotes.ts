import { callRealtimeBackend, errorPayload } from '../backend.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'

export const EMOTE_CANCEL_DISTANCE = 0.25
export const EMOTE_COOLDOWN_MS = 300
export const EMOTE_TIERS_TTL_MS = 60_000

export interface Emote {
  id: string
  clip: string
}

export interface UnlockableEmote extends Emote {
  task: string
  tier: number
}

export interface EmoteRules {
  free: Emote[]
  unlockable: UnlockableEmote[]
}

interface ActiveEmote {
  emote: string
  x: number
  z: number
}

interface PlayerEmoteState {
  lastAt: number
  tiers: { at: number, reached: ReadonlyMap<string, readonly number[]> } | null
  pending: boolean
}

let rules: EmoteRules | null = null
const active = new WeakMap<GameRoom, Map<string, ActiveEmote>>()
const players = new WeakMap<Player, PlayerEmoteState>()

function fail(what: string): never {
  throw new Error(`sports/rules/dance.json: invalid ${what}`)
}

function parseEmote(raw: unknown, what: string): Emote {
  const e = raw as { id?: unknown, clip?: unknown }
  if (typeof e?.id !== 'string' || !/^[a-z_]+$/.test(e.id) || typeof e.clip !== 'string' || e.clip === '') fail(what)
  return { id: e.id, clip: e.clip }
}

export function parseEmoteRules(raw: unknown): EmoteRules {
  const r = raw as { freeEmotes?: unknown, unlockableEmotes?: unknown }
  if (!Array.isArray(r?.freeEmotes) || r.freeEmotes.length === 0) fail('freeEmotes')
  if (!Array.isArray(r.unlockableEmotes)) fail('unlockableEmotes')
  const free = r.freeEmotes.map((e, i) => parseEmote(e, `freeEmotes[${i}]`))
  const unlockable = r.unlockableEmotes.map((e, i) => {
    const u = e as { task?: unknown, tier?: unknown }
    if (typeof u?.task !== 'string' || !Number.isInteger(u.tier) || (u.tier as number) < 1 || (u.tier as number) > 3) fail(`unlockableEmotes[${i}]`)
    return { ...parseEmote(e, `unlockableEmotes[${i}]`), task: u.task, tier: u.tier as number }
  })
  const ids = [...free, ...unlockable].map((e) => e.id)
  if (new Set(ids).size !== ids.length) fail('emote ids (duplicate)')
  return { free, unlockable }
}

export function setEmoteRules(loaded: EmoteRules): void {
  rules = loaded
}

function emoteRules(): EmoteRules {
  if (!rules) throw new Error('dance emote rules are not loaded')
  return rules
}

export function parseReachedTiers(raw: unknown): Map<string, number[]> {
  const tasks = (raw as { tasks?: unknown })?.tasks
  if (!Array.isArray(tasks)) throw new Error(`invalid tasks from the API: ${JSON.stringify(raw)}`)
  return new Map(tasks.map((t) => {
    const { task, reached } = t as { task?: unknown, reached?: unknown }
    if (typeof task !== 'string' || !Array.isArray(reached) || !reached.every(Number.isInteger)) throw new Error(`invalid task from the API: ${JSON.stringify(t)}`)
    return [task, reached as number[]]
  }))
}

export function allowedEmotes(loaded: EmoteRules, reached: ReadonlyMap<string, readonly number[]>): string[] {
  return [...loaded.free.map((e) => e.id), ...loaded.unlockable.filter((e) => reached.get(e.task)?.includes(e.tier)).map((e) => e.id)]
}

function stateOf(player: Player): PlayerEmoteState {
  let state = players.get(player)
  if (!state) {
    state = { lastAt: Number.NEGATIVE_INFINITY, tiers: null, pending: false }
    players.set(player, state)
  }
  return state
}

function activeOf(room: GameRoom): Map<string, ActiveEmote> {
  let map = active.get(room)
  if (!map) {
    map = new Map()
    active.set(room, map)
  }
  return map
}

async function reachedTiers(player: Player, now: number): Promise<ReadonlyMap<string, readonly number[]>> {
  const state = stateOf(player)
  if (state.tiers && now - state.tiers.at < EMOTE_TIERS_TTL_MS) return state.tiers.reached
  const reached = parseReachedTiers(await callRealtimeBackend(player.token, '/tasks', 'GET'))
  state.tiers = { at: now, reached }
  return reached
}

function broadcast(room: GameRoom, sessionId: string, emote: string | null): void {
  room.forEachClient((c) => c.send('user_emote', { sessionId, emote }))
}

export function stopEmote(room: GameRoom, sessionId: string): void {
  if (activeOf(room).delete(sessionId)) broadcast(room, sessionId, null)
}

export async function onEmotePlay(room: GameRoom, client: GameClient, payload: ClientPayload, busy: (player: Player) => boolean, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player) return
  const state = stateOf(player)
  if (state.pending || now - state.lastAt < EMOTE_COOLDOWN_MS) return
  state.lastAt = now
  const emote = payload?.emote
  if (emote === null) {
    stopEmote(room, client.sessionId)
    return
  }
  const loaded = emoteRules()
  if (typeof emote !== 'string' || ![...loaded.free, ...loaded.unlockable].some((e) => e.id === emote) || busy(player)) return
  if (!loaded.free.some((e) => e.id === emote)) {
    state.pending = true
    let allowed: string[]
    try {
      allowed = allowedEmotes(loaded, await reachedTiers(player, now))
    } catch (error) {
      const { code, message } = errorPayload(error, 'Your dances could not be checked.', 'emote_check_failed')
      client.send('emote_error', { code, message })
      return
    } finally {
      state.pending = false
    }
    if (room.players.get(client.sessionId) !== player) return
    if (!allowed.includes(emote)) {
      client.send('emote_error', { code: 'emote_locked', message: 'Dance more songs at the studio to unlock this dance.' })
      return
    }
  }
  activeOf(room).set(client.sessionId, { emote, x: player.x, z: player.z })
  broadcast(room, client.sessionId, emote)
}

export async function onEmoteList(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player) return
  const state = stateOf(player)
  if (state.pending) return
  state.pending = true
  try {
    client.send('emote_list', { unlocked: allowedEmotes(emoteRules(), await reachedTiers(player, now)) })
  } catch (error) {
    const { code, message } = errorPayload(error, 'Your dances could not be checked.', 'emote_check_failed')
    client.send('emote_error', { code, message })
  } finally {
    state.pending = false
  }
}

export function moveEmote(room: GameRoom, player: Player): void {
  const current = activeOf(room).get(player.sessionId)
  if (current && Math.hypot(player.x - current.x, player.z - current.z) > EMOTE_CANCEL_DISTANCE) stopEmote(room, player.sessionId)
}

export function sendEmotesOnJoin(room: GameRoom, client: GameClient): void {
  client.send('user_emotes', { emotes: [...activeOf(room)].map(([sessionId, { emote }]) => ({ sessionId, emote })) })
}
