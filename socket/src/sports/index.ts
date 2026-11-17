import type { GameClient, GameRoom, Player } from '../types.ts'
import { lend, sendLoansOnJoin, takeBackAll, updateLoansOnMove } from './loans.ts'
import { loadSportsPass } from './pass.ts'
import { leaveSports, rejoinMatch, updateMatchesOnMove } from './venues.ts'
import './tennis.ts'
import './climbing.ts'

export { loadDanceVenue, moveDanceSpectator, onDanceEmotePlay, onDancePress } from './dance.ts'
export { moveEmote, onEmoteList, sendEmotesOnJoin, stopEmote } from './danceEmotes.ts'
export { onSportsPassBuy } from './pass.ts'
export { onBoxingBag, onBoxingBagCombo, onBoxingDodge, onBoxingGetUp, onBoxingGuard, onBoxingPress, onBoxingRelease, registerBoxing, tickBoxingBags } from './boxing.ts'
export { loadPetanque } from './petanque.ts'
export { SPORTS_TICK_MS } from './sportsConstants.ts'
export { loadSwimming } from './swimming.ts'
export { loadDiving } from './diving.ts'
export { assertVenueZones, newSportsState, onSportsCoachOpen, onSportsMatchLeave, onSportsSignup, onSportsSignupLeave, tickSports } from './venues.ts'

export async function joinSports(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  sendLoansOnJoin(room, client)
  for (const [key, area] of rejoinMatch(room, client, player, Date.now())) lend(room, player, key, area)
  if (player.token) await loadSportsPass(room, client, player)
}

export function moveInSports(room: GameRoom, player: Player, now: number): void {
  updateLoansOnMove(room, player, now)
  updateMatchesOnMove(room, player, now)
}

export function leaveSportsRoom(room: GameRoom, player: Player, now: number): void {
  leaveSports(room, player, now, [...player.sportsLoans])
  takeBackAll(room, player)
}

export function sportsDeath(room: GameRoom, player: Player): void {
  takeBackAll(room, player)
}
