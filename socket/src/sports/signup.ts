import { KICKOFF_COUNTDOWN_MS, LOBBY_IDLE_CANCEL_MS } from './sportsConstants.ts'

export type Team = 'red' | 'blue'
export type SettingValue = string | number
export type Settings = Record<string, SettingValue>

export interface SettingSpec {
  key: string
  label: string
  options: readonly SettingValue[]
}

export interface SignupRules {
  teams: boolean
  settings: SettingSpec[]
}

export interface PlayerRange {
  min: number
  max: number
}

export interface EntrantInput {
  sessionId: string
  accountId: number
  name: string
  team: Team | null
}

export interface Entrant extends EntrantInput {
  order: number
}

export interface Lobby {
  venue: string
  coach: string
  phase: 'open' | 'countdown'
  settings: Settings
  range: PlayerRange
  entrants: Entrant[]
  nextOrder: number
  lastJoinAt: number
  kickoffAt: number | null
}

export interface MatchPlayer {
  accountId: number
  sessionId: string
  name: string
  team: Team | null
  awaySince: number | null
  out: boolean
}

export interface Match {
  id: string
  venue: string
  coach: string
  sport: string
  settings: Settings
  range: PlayerRange
  startedAt: number
  players: MatchPlayer[]
}

export type JoinResult = 'joined' | 'full' | 'already_signed'
export type LobbyDue = 'kickoff' | 'cancel' | null
export interface Forfeit {
  loser: Team | null
}

export const TEAMS: readonly Team[] = ['red', 'blue']

export function parseTeam(raw: unknown): Team | null {
  return raw === 'red' || raw === 'blue' ? raw : null
}

function parseSettingSpec(raw: unknown, what: string): SettingSpec {
  const { key, label, options } = (raw ?? {}) as { key?: unknown, label?: unknown, options?: unknown }
  const validOptions = Array.isArray(options) && options.length > 0 &&
    options.every((o) => typeof o === 'string' || (typeof o === 'number' && Number.isFinite(o)))
  if (typeof key !== 'string' || key === '' || typeof label !== 'string' || !validOptions) {
    throw new Error(`${what}: invalid signup setting ${JSON.stringify(raw)}`)
  }
  return { key, label, options: options as SettingValue[] }
}

export function parseSignupRules(rules: unknown, what: string): SignupRules {
  const signup = (rules as { signup?: { teams?: unknown, settings?: unknown } } | null)?.signup
  if (typeof signup?.teams !== 'boolean' || !Array.isArray(signup.settings)) throw new Error(`${what}: missing or invalid signup block`)
  const settings = signup.settings.map((s) => parseSettingSpec(s, what))
  if (new Set(settings.map((s) => s.key)).size !== settings.length) throw new Error(`${what}: duplicate signup setting key`)
  return { teams: signup.teams, settings }
}

export function validateSettings(spec: readonly SettingSpec[], raw: unknown): Settings | null {
  const given = raw === undefined && spec.length === 0 ? {} : raw
  if (!given || typeof given !== 'object' || Array.isArray(given)) return null
  const entries = Object.entries(given)
  if (entries.length !== spec.length) return null
  const settings: Settings = {}
  for (const { key, options } of spec) {
    const value = (given as Record<string, unknown>)[key]
    if (!options.some((o) => o === value)) return null
    settings[key] = value as SettingValue
  }
  return settings
}

export function assertRange(range: PlayerRange, what: string): PlayerRange {
  const { min, max } = range
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    throw new Error(`${what}: invalid player range ${JSON.stringify(range)}`)
  }
  return range
}

function applyHeadcount(lobby: Lobby, now: number): void {
  const count = lobby.entrants.length
  if (count >= lobby.range.max) {
    lobby.phase = 'countdown'
    lobby.kickoffAt = now
  } else if (count >= lobby.range.min && lobby.phase === 'open') {
    lobby.phase = 'countdown'
    lobby.kickoffAt = now + KICKOFF_COUNTDOWN_MS
  } else if (count < lobby.range.min) {
    lobby.phase = 'open'
    lobby.kickoffAt = null
  }
}

export function openLobby(venue: string, coach: string, settings: Settings, range: PlayerRange, first: EntrantInput, now: number): Lobby {
  const lobby: Lobby = {
    venue,
    coach,
    phase: 'open',
    settings,
    range,
    entrants: [{ ...first, order: 0 }],
    nextOrder: 1,
    lastJoinAt: now,
    kickoffAt: null
  }
  applyHeadcount(lobby, now)
  return lobby
}

export function joinLobby(lobby: Lobby, input: EntrantInput, now: number): JoinResult {
  if (lobby.entrants.some((e) => e.accountId === input.accountId)) return 'already_signed'
  if (lobby.entrants.length >= lobby.range.max) return 'full'
  lobby.entrants.push({ ...input, order: lobby.nextOrder++ })
  lobby.lastJoinAt = now
  applyHeadcount(lobby, now)
  return 'joined'
}

export function leaveLobby(lobby: Lobby, accountId: number, now: number): boolean {
  const before = lobby.entrants.length
  lobby.entrants = lobby.entrants.filter((e) => e.accountId !== accountId)
  if (lobby.entrants.length === before) return false
  applyHeadcount(lobby, now)
  return true
}

export function lobbyDue(lobby: Lobby, now: number): LobbyDue {
  if (lobby.kickoffAt !== null && now >= lobby.kickoffAt) return 'kickoff'
  if (lobby.phase === 'open' && now - lobby.lastJoinAt >= LOBBY_IDLE_CANCEL_MS) return 'cancel'
  return null
}

function teamSize(entrants: readonly Entrant[], team: Team): number {
  return entrants.filter((e) => e.team === team).length
}

export function rebalance(entrants: readonly Entrant[]): Entrant[] {
  const out = entrants.map((e) => ({ ...e }))
  if (out.some((e) => e.team === null)) return out
  for (;;) {
    const red = teamSize(out, 'red')
    const blue = teamSize(out, 'blue')
    if (Math.abs(red - blue) < 2) return out
    const bigger: Team = red > blue ? 'red' : 'blue'
    const last = out.filter((e) => e.team === bigger).reduce((a, b) => (b.order > a.order ? b : a))
    last.team = bigger === 'red' ? 'blue' : 'red'
  }
}

export function startMatch(lobby: Lobby, id: string, sport: string, now: number): Match {
  return {
    id,
    venue: lobby.venue,
    coach: lobby.coach,
    sport,
    settings: lobby.settings,
    range: lobby.range,
    startedAt: now,
    players: rebalance(lobby.entrants).map(({ accountId, sessionId, name, team }) => ({ accountId, sessionId, name, team, awaySince: null, out: false }))
  }
}

export function activePlayers(match: Match): MatchPlayer[] {
  return match.players.filter((p) => !p.out)
}

export function matchPlayer(match: Match, accountId: number): MatchPlayer | null {
  return match.players.find((p) => p.accountId === accountId && !p.out) ?? null
}

export function markAway(match: Match, accountId: number, now: number): boolean {
  const player = matchPlayer(match, accountId)
  if (!player || player.awaySince !== null) return false
  player.awaySince = now
  return true
}

export function markBack(match: Match, accountId: number, sessionId: string): boolean {
  const player = matchPlayer(match, accountId)
  if (!player) return false
  const changed = player.awaySince !== null || player.sessionId !== sessionId
  player.awaySince = null
  player.sessionId = sessionId
  return changed
}

export function expireAway(match: Match, now: number, graceMs: number): MatchPlayer[] {
  const expired = activePlayers(match).filter((p) => p.awaySince !== null && now - p.awaySince >= graceMs)
  for (const p of expired) p.out = true
  return expired
}

export function forfeit(match: Match, teams: boolean): Forfeit | null {
  const active = activePlayers(match)
  if (!teams) return active.length === 0 ? { loser: null } : null
  const empty = TEAMS.filter((team) => !active.some((p) => p.team === team))
  if (empty.length === 0) return null
  return { loser: empty.length === 1 ? empty[0] : null }
}
