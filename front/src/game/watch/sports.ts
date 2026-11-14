import { passValid } from '../sports/sportsPass.ts'
import { lobbyPlayer } from '../sports/sportsSignup.ts'
import type { SportsLobbyPayload } from '../../types/gameRealtime.ts'

export interface SportsWatchLobby {
  venue: string
  sport: string
  team: 'red' | 'blue' | null
  phase: SportsLobbyPayload['phase']
  players: number
  min: number
  max: number
  secondsLeft: number | null
}

export interface SportsWatchScreen {
  passUntil: number | null
  lobbies: SportsWatchLobby[]
}

export function sportsWatchScreen(
  validUntil: number | null,
  lobbies: Iterable<SportsLobbyPayload>,
  sessionId: string | null,
  serverNow: number,
): SportsWatchScreen {
  const mine = [...lobbies].flatMap((lobby) => {
    const me = lobbyPlayer(lobby, sessionId)
    if (!me) return []
    const secondsLeft = lobby.phase === 'countdown' && lobby.kickoffAt !== null ? Math.max(0, Math.ceil((lobby.kickoffAt - serverNow) / 1000)) : null
    return [{ venue: lobby.venue, sport: lobby.sport, team: me.team, phase: lobby.phase, players: lobby.players.length, min: lobby.min, max: lobby.max, secondsLeft }]
  })
  return { passUntil: passValid(validUntil, serverNow) ? validUntil : null, lobbies: mine }
}
