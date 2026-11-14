import type { SportsLobbyPayload, SportsLobbyPlayer } from '../../types/gameRealtime'

export const SPORTS_TEAMS = ['red', 'blue'] as const
export type SportsTeam = (typeof SPORTS_TEAMS)[number]
export type SettingValue = string | number

export const COACH_REACH = 3

export interface SettingSpec {
  key: string
  label: string
  options: SettingValue[]
}

export interface SignupSpec {
  teams: boolean
  settings: SettingSpec[]
}

export interface SportsCoachSpot {
  coach: string
  position: [number, number, number]
}

export interface SignupMessage {
  coach: string
  venue: string
  team?: SportsTeam
  settings?: Record<string, SettingValue>
}

export function sportRulesUrl(sport: string): string {
  return `/assets/sports/rules/${sport}.json`
}

function fail(sport: string, path: string, expected: string): never {
  throw new Error(`sports/rules/${sport}.json ${path}: expected ${expected}`)
}

function settingAt(raw: unknown, sport: string, path: string): SettingSpec {
  if (typeof raw !== 'object' || raw === null) fail(sport, path, 'an object')
  const { key, label, options } = raw as Record<string, unknown>
  if (typeof key !== 'string' || key === '') fail(sport, `${path}.key`, 'a key')
  if (typeof label !== 'string' || label === '') fail(sport, `${path}.label`, 'a label')
  if (!Array.isArray(options) || !options.every((o) => typeof o === 'string' || (typeof o === 'number' && Number.isFinite(o)))) {
    fail(sport, `${path}.options`, 'a list of strings or numbers')
  }
  return { key, label, options: options as SettingValue[] }
}

export function parseSignupSpec(raw: unknown, sport: string): SignupSpec {
  if (typeof raw !== 'object' || raw === null) fail(sport, '', 'an object')
  const signup = (raw as { signup?: unknown }).signup
  if (typeof signup !== 'object' || signup === null) fail(sport, 'signup', 'a coach sign-up block')
  const { teams, settings } = signup as Record<string, unknown>
  if (typeof teams !== 'boolean') fail(sport, 'signup.teams', 'true or false')
  if (!Array.isArray(settings)) fail(sport, 'signup.settings', 'a list')
  return { teams, settings: settings.map((s, i) => settingAt(s, sport, `signup.settings[${i}]`)) }
}

export function choosableSettings(spec: SignupSpec): SettingSpec[] {
  return spec.settings.filter((s) => s.options.length > 0)
}

export function defaultSettings(spec: SignupSpec): Record<string, SettingValue> {
  return Object.fromEntries(choosableSettings(spec).map((s) => [s.key, s.options[0]!]))
}

export function lobbyPlayer(lobby: SportsLobbyPayload, sessionId: string | null): SportsLobbyPlayer | null {
  return lobby.players.find((p) => p.sessionId === sessionId) ?? null
}

export function choosesSettings(lobby: SportsLobbyPayload, sessionId: string | null): boolean {
  return lobby.phase === 'open' && lobby.players.length === 0 && lobbyPlayer(lobby, sessionId) === null
}

export function canSignUp(lobby: SportsLobbyPayload, sessionId: string | null): boolean {
  return lobby.phase !== 'playing' && lobby.players.length < lobby.max && lobbyPlayer(lobby, sessionId) === null
}

export function teamRoster(lobby: SportsLobbyPayload): Record<SportsTeam, SportsLobbyPlayer[]> {
  return { red: lobby.players.filter((p) => p.team === 'red'), blue: lobby.players.filter((p) => p.team === 'blue') }
}

export function signupMessage(coach: string, venue: string, spec: SignupSpec, team: SportsTeam | null, settings: Record<string, SettingValue> | null): SignupMessage {
  if (spec.teams && team === null) throw new Error('pick red or blue before signing up')
  return {
    coach,
    venue,
    ...(spec.teams && team !== null ? { team } : {}),
    ...(settings === null ? {} : { settings }),
  }
}

export function kickoffSeconds(kickoffAt: number | null, clientNow: number, clockOffset: number): number | null {
  if (kickoffAt === null) return null
  return Math.max(0, Math.ceil((kickoffAt - (clientNow + clockOffset)) / 1000))
}

export interface VenueChoice {
  venue: string
  sport: string
  court: number | null
  lobby: SportsLobbyPayload
}

export function venueChoices(lobbies: Iterable<SportsLobbyPayload>, coach: string): VenueChoice[] {
  const ofCoach = [...lobbies].filter((l) => l.coach === coach).sort((a, b) => a.venue.localeCompare(b.venue, 'en', { numeric: true }))
  return ofCoach.map((lobby) => {
    const sameSport = ofCoach.filter((l) => l.sport === lobby.sport)
    return { venue: lobby.venue, sport: lobby.sport, court: sameSport.length > 1 ? sameSport.indexOf(lobby) + 1 : null, lobby }
  })
}

export function shownLobby(choices: readonly VenueChoice[], picked: string | null, sessionId: string | null): SportsLobbyPayload | null {
  const mine = choices.find((c) => lobbyPlayer(c.lobby, sessionId) !== null)
  if (mine) return mine.lobby
  const chosen = choices.find((c) => c.venue === picked)
  if (chosen) return chosen.lobby
  return choices.length === 1 ? choices[0]!.lobby : null
}
