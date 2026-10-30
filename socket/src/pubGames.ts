import { callRealtimeBackend, errorPayload } from './backend.ts'
import { dartsScore } from './darts.ts'
import { forEachPubClient, isWithinPubReach, releaseSeat, sendPubError } from './pub.ts'
import {
  CHALLENGE_COOLDOWN_MS,
  CHALLENGE_COUNTDOWN_MS,
  CHALLENGE_FLOOR_TOLERANCE,
  CHALLENGE_REACH,
  CHALLENGE_TTL_MS,
  DARTS_LOBBY_MS,
  DARTS_MAX_OFFSET_CM,
  DARTS_MAX_PLAYERS,
  DARTS_THROWS,
  DARTS_TURN_MS,
  RACE_LOBBY_MS,
  RACE_MAX_PROGRESS_PER_S,
  RACE_MAX_SPILLS,
  RACE_SPILL_PENALTY_MS,
  RACE_PROGRESS_MIN_INTERVAL_MS,
  RACE_TIMEOUT_MS,
  SHOTS_MIN_MS
} from './pubConstants.ts'
import { addIntoxication } from './survivalStats.ts'
import type { ClientPayload, DartsGame, DartsPlayer, GameClient, GameRoom, Player, PubChallenge, PubRace, PubRacer } from './types.ts'
import { worldPub } from './world.ts'

const RACE_STATE_MIN_INTERVAL_MS = 200
const SHOTS_REACH = 2.5
const SHOTS_ABANDON_MS = 60_000
const SHOTS_EARLY_TOLERANCE_MS = 3000
const SHOTS_LATE_TOLERANCE_MS = 500
const DARTS_REACH = 3
const LOST_DART_CM = DARTS_MAX_OFFSET_CM

type PubGame = 'drink_fast' | 'meter_shot' | 'darts'

function warn(context: string, error: unknown): void {
  console.warn(`[pub] ${context}:`, error instanceof Error ? error.message : error)
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function isOnStool(player: Player): boolean {
  return player.seatId?.startsWith('stool_') === true
}

async function payEntry(client: GameClient, player: Player, game: PubGame): Promise<number | null> {
  try {
    const data = await callRealtimeBackend(player.token, '/pub/play', 'POST', { game })
    return Number(data?.alcohol) || 0
  } catch (error) {
    warn(`${game} entry failed`, error)
    client.send('pub_error', errorPayload(error, 'You could not join the game.', 'pub_play_failed'))
    return null
  }
}

async function payReward(room: GameRoom, sessionId: string, game: PubGame, placement: number, score: number): Promise<number> {
  const player = room.players.get(sessionId)
  if (!player) return 0
  try {
    const data = await callRealtimeBackend(player.token, '/pub/reward', 'POST', { game, placement, score })
    return Number(data?.coins) || 0
  } catch (error) {
    warn(`${game} reward failed`, error)
    clientOf(room, sessionId)?.send('pub_error', errorPayload(error, 'Your winnings could not be paid.', 'pub_reward_failed'))
    return 0
  }
}

function drink(room: GameRoom, sessionId: string, alcohol: number): void {
  const player = room.players.get(sessionId)
  if (player) player.intoxication = addIntoxication(player.intoxication, alcohol)
}

export function rewardPlacement(rank: number, participants: number): number {
  return participants === 1 ? 0 : rank + 1
}


export function standUp(room: GameRoom, player: Player): void {
  releaseSeat(room, player)
  forfeitRace(room, player)
  cancelChallengesOf(room, player.sessionId)
}

export function onStand(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (player) standUp(room, player)
}

export function leavePub(room: GameRoom, player: Player): void {
  player.pubShots = null
  standUp(room, player)
  leaveDarts(room, player)
}


function raceLobby(race: PubRace) {
  return { hostSessionId: race.hostSessionId, players: [...race.racers.keys()], startsAt: race.startsAt }
}

function broadcastRaceLobby(room: GameRoom, race: PubRace): void {
  const payload = raceLobby(race)
  forEachPubClient(room, (c) => c.send('pub_race_lobby', payload))
}

function newRacer(now: number): PubRacer {
  return { progress: 0, lastProgressAt: now, finishedAt: null, forfeited: false, alcohol: 0, spills: 0 }
}

function newRace(room: GameRoom, hostSessionId: string, racerIds: string[], countdownMs: number, now: number): PubRace {
  const race: PubRace = {
    hostSessionId,
    seed: newSeed(),
    startsAt: now + countdownMs,
    startedAt: null,
    racers: new Map(racerIds.map((id) => [id, newRacer(now)])),
    lastStateAt: 0
  }
  room.pub.race = race
  room.clock.setTimeout(() => startRace(room, race, Date.now()), countdownMs)
  return race
}

/** Re-reads room.pub.race after an await (TypeScript keeps the pre-await narrowing). */
function isCurrentRace(room: GameRoom, race: PubRace): boolean {
  return room.pub.race === race
}

/** Drops a racer whose entry could not be paid; false when nobody is left (the race is cancelled). */
function dropUnpaidRacer(room: GameRoom, race: PubRace, sessionId: string): boolean {
  race.racers.delete(sessionId)
  const nextHost = race.racers.keys().next().value
  if (nextHost === undefined) {
    room.pub.race = null
    return false
  }
  if (race.hostSessionId === sessionId) race.hostSessionId = nextHost
  return true
}

export async function onRaceOpen(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return
  if (!isOnStool(player)) {
    sendPubError(client, 'Sit on a bar stool to race.', 'race_not_on_stool')
    return
  }
  if (room.pub.race) {
    sendPubError(client, 'A race is already on.', 'race_in_progress')
    return
  }
  const race = newRace(room, player.sessionId, [player.sessionId], RACE_LOBBY_MS, now)
  const alcohol = await payEntry(client, player, 'drink_fast')
  if (!isCurrentRace(room, race)) return
  if (alcohol === null) {
    if (!dropUnpaidRacer(room, race, player.sessionId)) return
  } else {
    const racer = race.racers.get(player.sessionId)
    if (racer) racer.alcohol = alcohol
  }
  broadcastRaceLobby(room, race)
}

export async function onRaceJoin(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const race = room.pub.race
  if (!player?.token || now < player.knockedOutUntil) return
  if (!race || race.startedAt !== null || now >= race.startsAt) {
    sendPubError(client, 'There is no race to join right now.', 'race_not_open')
    return
  }
  if (!isOnStool(player)) {
    sendPubError(client, 'Sit on a bar stool to race.', 'race_not_on_stool')
    return
  }
  if (race.racers.has(player.sessionId)) return
  const racer = newRacer(now)
  race.racers.set(player.sessionId, racer)
  const alcohol = await payEntry(client, player, 'drink_fast')
  if (room.pub.race !== race) return
  if (alcohol === null) {
    race.racers.delete(player.sessionId)
    return
  }
  racer.alcohol = alcohol
  broadcastRaceLobby(room, race)
}

export function startRace(room: GameRoom, race: PubRace, now: number): void {
  if (room.pub.race !== race || race.startedAt !== null) return
  for (const [sessionId, racer] of race.racers) {
    const racerPlayer = room.players.get(sessionId)
    if (!racerPlayer || !isOnStool(racerPlayer) || now < racerPlayer.knockedOutUntil) racer.forfeited = true
  }
  if (activeRacers(race).length === 0) {
    room.pub.race = null
    return
  }
  race.startedAt = now
  for (const racer of race.racers.values()) racer.lastProgressAt = now
  const payload = { seed: race.seed, players: activeRacers(race).map(([sessionId]) => sessionId) }
  forEachPubClient(room, (c) => c.send('pub_race_start', payload))
  room.clock.setTimeout(() => void endRace(room, race), RACE_TIMEOUT_MS)
}

function activeRacers(race: PubRace): Array<[string, PubRacer]> {
  return [...race.racers].filter(([, racer]) => !racer.forfeited)
}

export function clampRaceProgress(previous: number, requested: number, dtSeconds: number): number {
  const reachable = previous + RACE_MAX_PROGRESS_PER_S * Math.max(0, dtSeconds)
  return Math.min(1, Math.max(previous, Math.min(requested, reachable)))
}

export function onRaceProgress(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const race = room.pub.race
  const racer = race?.racers.get(client.sessionId)
  if (!player || !race || race.startedAt === null || !racer || racer.forfeited || racer.finishedAt !== null) return
  if (!isOnStool(player)) {
    forfeitRace(room, player)
    return
  }
  const requested = payload?.progress
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return
  if (now - racer.lastProgressAt < RACE_PROGRESS_MIN_INTERVAL_MS) return
  const spills = payload?.spills
  const spillsBefore = racer.spills
  if (typeof spills === 'number' && Number.isInteger(spills)) racer.spills = Math.min(RACE_MAX_SPILLS, Math.max(racer.spills, spills))
  racer.progress = clampRaceProgress(racer.progress, requested, (now - racer.lastProgressAt) / 1000)
  racer.lastProgressAt = now
  if (racer.progress >= 1) racer.finishedAt = now
  if (activeRacers(race).every(([, r]) => r.finishedAt !== null)) {
    void endRace(room, race)
    return
  }
  // A new spill goes out at once so the others see it; plain progress stays throttled.
  if (racer.spills > spillsBefore || now - race.lastStateAt >= RACE_STATE_MIN_INTERVAL_MS) broadcastRaceState(room, race, now)
}

function broadcastRaceState(room: GameRoom, race: PubRace, now: number): void {
  race.lastStateAt = now
  const payload = { players: activeRacers(race).map(([sessionId, r]) => ({ sessionId, progress: r.progress, spills: r.spills })) }
  forEachPubClient(room, (c) => c.send('pub_race_state', payload))
}

/** Finishers by drinking time plus RACE_SPILL_PENALTY_MS per spill, fastest first. */
export function raceRanking(race: PubRace): Array<{ sessionId: string, ms: number, spills: number }> {
  const startedAt = race.startedAt ?? 0
  return activeRacers(race)
    .filter(([, r]) => r.finishedAt !== null)
    .map(([sessionId, r]) => ({ sessionId, ms: r.finishedAt! - startedAt + r.spills * RACE_SPILL_PENALTY_MS, spills: r.spills }))
    .sort((a, b) => a.ms - b.ms)
}

export async function endRace(room: GameRoom, race: PubRace): Promise<void> {
  if (room.pub.race !== race || race.startedAt === null) return
  room.pub.race = null
  const participants = activeRacers(race)
  const ranking = raceRanking(race)
  const rewards = await Promise.all(ranking.map(async ({ sessionId, ms }, rank) => ({
    sessionId,
    coins: await payReward(room, sessionId, 'drink_fast', rewardPlacement(rank, participants.length), ms)
  })))
  for (const [sessionId, racer] of participants) drink(room, sessionId, racer.alcohol)
  const payload = { ranking, rewards }
  forEachPubClient(room, (c) => c.send('pub_race_end', payload))
}

/** The player closed the race screen: out of the race, so a new one can be opened right away. */
export function onRaceLeave(room: GameRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (player) forfeitRace(room, player)
}

export function forfeitRace(room: GameRoom, player: Player): void {
  const race = room.pub.race
  const racer = race?.racers.get(player.sessionId)
  if (!race || !racer || racer.forfeited) return
  if (race.startedAt === null) {
    race.racers.delete(player.sessionId)
    if (race.racers.size === 0) room.pub.race = null
    else broadcastRaceLobby(room, race)
    return
  }
  if (racer.finishedAt !== null) return
  racer.forfeited = true
  const active = activeRacers(race)
  if (active.length === 0 || active.every(([, r]) => r.finishedAt !== null)) void endRace(room, race)
}


// ------------------------------------------------------------ Drink Fast challenges

function hasPendingChallenge(room: GameRoom, sessionId: string): boolean {
  for (const c of room.pub.challenges.values()) if (c.from === sessionId || c.to === sessionId) return true
  return false
}

function withinChallengeReach(a: Player, b: Player): boolean {
  // y is eye height for both, so the eye difference is the feet difference.
  return Math.hypot(a.x - b.x, a.z - b.z) <= CHALLENGE_REACH && Math.abs(a.y - b.y) <= CHALLENGE_FLOOR_TOLERANCE
}

function challengeCoolingDown(room: GameRoom, sessionId: string, now: number): boolean {
  const last = room.pub.challengeSentAt.get(sessionId)
  return last !== undefined && now - last < CHALLENGE_COOLDOWN_MS
}

function noteChallengeSent(room: GameRoom, sessionId: string, now: number): void {
  for (const [id, at] of room.pub.challengeSentAt) if (now - at >= CHALLENGE_COOLDOWN_MS) room.pub.challengeSentAt.delete(id)
  room.pub.challengeSentAt.set(sessionId, now)
}

export function onRaceChallenge(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) return
  const targetId = payload?.targetSessionId
  if (typeof targetId !== 'string') return
  if (challengeCoolingDown(room, player.sessionId, now)) {
    sendPubError(client, 'Wait a moment before challenging again.', 'challenge_cooldown')
    return
  }
  if (!isOnStool(player)) {
    sendPubError(client, 'Sit on a bar stool to challenge someone.', 'challenge_not_on_stool')
    return
  }
  if (room.pub.race) {
    sendPubError(client, 'A race is already on.', 'race_in_progress')
    return
  }
  const target = targetId === player.sessionId ? undefined : room.players.get(targetId)
  if (!target || !isOnStool(target) || now < target.knockedOutUntil) {
    sendPubError(client, 'They cannot take a challenge right now.', 'challenge_target_unavailable')
    return
  }
  if (!withinChallengeReach(player, target)) {
    sendPubError(client, 'They are too far away to challenge.', 'challenge_too_far')
    return
  }
  if (hasPendingChallenge(room, player.sessionId) || hasPendingChallenge(room, target.sessionId)) {
    sendPubError(client, 'A challenge is already waiting for an answer.', 'challenge_pending')
    return
  }
  const challenge: PubChallenge = { from: player.sessionId, to: target.sessionId, expiresAt: now + CHALLENGE_TTL_MS }
  room.pub.challenges.set(player.sessionId, challenge)
  noteChallengeSent(room, player.sessionId, now)
  clientOf(room, target.sessionId)?.send('pub_race_challenged', { fromSessionId: player.sessionId, expiresAt: challenge.expiresAt })
  client.send('pub_race_challenge_sent', { toSessionId: target.sessionId, expiresAt: challenge.expiresAt })
  room.clock.setTimeout(() => expireChallenge(room, challenge), CHALLENGE_TTL_MS)
}

function expireChallenge(room: GameRoom, challenge: PubChallenge): void {
  if (room.pub.challenges.get(challenge.from) !== challenge) return
  room.pub.challenges.delete(challenge.from)
  clientOf(room, challenge.from)?.send('pub_race_challenge_result', { toSessionId: challenge.to, accepted: false, reason: 'expired' })
  clientOf(room, challenge.to)?.send('pub_race_challenge_cancelled', { fromSessionId: challenge.from })
}

/** The player stood up, left or blacked out: drop their pending challenges and tell the other side. */
function cancelChallengesOf(room: GameRoom, sessionId: string): void {
  for (const challenge of [...room.pub.challenges.values()]) {
    if (challenge.from === sessionId) {
      room.pub.challenges.delete(challenge.from)
      clientOf(room, challenge.to)?.send('pub_race_challenge_cancelled', { fromSessionId: challenge.from })
    } else if (challenge.to === sessionId) {
      room.pub.challenges.delete(challenge.from)
      clientOf(room, challenge.from)?.send('pub_race_challenge_result', { toSessionId: challenge.to, accepted: false, reason: 'cancelled' })
    }
  }
}

export async function onRaceChallengeReply(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const fromId = payload?.fromSessionId
  if (typeof fromId !== 'string' || typeof payload?.accept !== 'boolean') return
  const challenge = room.pub.challenges.get(fromId)
  if (!challenge || challenge.to !== client.sessionId) return
  room.pub.challenges.delete(fromId)
  const challengerClient = clientOf(room, challenge.from)
  if (!payload.accept) {
    challengerClient?.send('pub_race_challenge_result', { toSessionId: challenge.to, accepted: false, reason: 'declined' })
    return
  }
  const challenger = room.players.get(challenge.from)
  const target = room.players.get(challenge.to)
  const playable = (p: Player | undefined): p is Player => !!p?.token && isOnStool(p) && now >= p.knockedOutUntil
  if (room.pub.race || !playable(challenger) || !playable(target) || !challengerClient) {
    challengerClient?.send('pub_race_challenge_result', { toSessionId: challenge.to, accepted: false, reason: 'busy' })
    if (room.pub.race) sendPubError(client, 'A race is already on.', 'race_in_progress')
    else sendPubError(client, 'Your challenger cannot race right now.', 'challenge_target_unavailable')
    return
  }
  const race = newRace(room, challenger.sessionId, [challenger.sessionId, target.sessionId], CHALLENGE_COUNTDOWN_MS, now)
  challengerClient.send('pub_race_challenge_result', { toSessionId: challenge.to, accepted: true })
  const paid = await Promise.all([
    payEntry(challengerClient, challenger, 'drink_fast'),
    payEntry(client, target, 'drink_fast')
  ])
  if (!isCurrentRace(room, race)) return
  const ids = [challenger.sessionId, target.sessionId]
  for (let i = 0; i < ids.length; i++) {
    const racer = race.racers.get(ids[i])
    if (!racer) continue
    const alcohol = paid[i]
    if (alcohol === null) {
      if (!dropUnpaidRacer(room, race, ids[i])) return
    } else {
      racer.alcohol = alcohol
    }
  }
  broadcastRaceLobby(room, race)
}


export async function onShotsStart(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const pub = worldPub()
  if (!player?.token || !pub || now < player.knockedOutUntil) return
  if (!isWithinPubReach(player, pub.shots.player, SHOTS_REACH)) {
    sendPubError(client, 'Stand in front of the shot plank.', 'pub_too_far')
    return
  }
  if (player.pubShots && now - player.pubShots.startedAt < SHOTS_ABANDON_MS) {
    sendPubError(client, 'Finish your shots first.', 'shots_in_progress')
    return
  }
  const shots = { startedAt: now, seed: newSeed(), alcohol: 0 }
  player.pubShots = shots
  const alcohol = await payEntry(client, player, 'meter_shot')
  if (player.pubShots !== shots) return
  if (alcohol === null) {
    player.pubShots = null
    return
  }
  shots.alcohol = alcohol
  shots.startedAt = Date.now()
  client.send('pub_shots_ready', { seed: shots.seed, startedAt: shots.startedAt })
}

export function shotsPlausible(ms: number, elapsedMs: number): boolean {
  return Number.isFinite(ms) && ms >= SHOTS_MIN_MS && ms >= elapsedMs - SHOTS_EARLY_TOLERANCE_MS && ms <= elapsedMs + SHOTS_LATE_TOLERANCE_MS
}

export async function onShotsDone(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const shots = player?.pubShots
  if (!player || !shots || now < player.knockedOutUntil) return
  player.pubShots = null
  const ms = typeof payload?.ms === 'number' ? payload.ms : NaN
  if (!shotsPlausible(ms, now - shots.startedAt)) {
    sendPubError(client, 'That was not how it went.', 'shots_implausible')
    return
  }
  drink(room, player.sessionId, shots.alcohol)
  const coins = await payReward(room, player.sessionId, 'meter_shot', 0, ms)
  client.send('pub_shots_result', { ms, coins })
  const action = { sessionId: player.sessionId, action: 'drink', code: 'drink_vodka' }
  room.forEachClient((c) => c.send('user_action', action), client)
}


function dartsLobby(game: DartsGame) {
  return { players: game.players.map((p) => p.sessionId), startsAt: game.startsAt }
}

function dartsState(game: DartsGame) {
  const current: DartsPlayer | undefined = game.started ? game.players[game.turn] : undefined
  return {
    players: game.players.map((p) => ({ sessionId: p.sessionId, darts: p.darts, total: dartsTotal(p) })),
    turn: current?.sessionId ?? null,
    throwsLeft: current ? DARTS_THROWS - current.darts.length : 0,
    turnEndsAt: current ? game.turnEndsAt : 0
  }
}

function dartsTotal(player: DartsPlayer): number {
  return player.darts.reduce((sum, d) => sum + d.score, 0)
}

function broadcastDartsState(room: GameRoom, game: DartsGame): void {
  const payload = dartsState(game)
  forEachPubClient(room, (c) => c.send('pub_darts_state', payload))
}

export async function onDartsJoin(room: GameRoom, client: GameClient, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const pub = worldPub()
  if (!player?.token || !pub || now < player.knockedOutUntil) return
  if (!isWithinPubReach(player, pub.darts.oche, DARTS_REACH)) {
    sendPubError(client, 'Stand at the oche to play darts.', 'pub_too_far')
    return
  }
  if (room.pub.darts?.started) {
    sendPubError(client, 'A darts game is already on.', 'darts_in_progress')
    return
  }
  if (room.pub.darts && room.pub.darts.players.length >= DARTS_MAX_PLAYERS) {
    sendPubError(client, 'The darts game is full.', 'darts_full')
    return
  }
  if (room.pub.darts?.players.some((p) => p.sessionId === player.sessionId)) return
  const opened = room.pub.darts === null
  const game: DartsGame = room.pub.darts ?? { startsAt: now + DARTS_LOBBY_MS, started: false, players: [], turn: 0, turnEndsAt: 0, turnSeq: 0 }
  room.pub.darts = game
  const entry: DartsPlayer = { sessionId: player.sessionId, darts: [], alcohol: 0 }
  game.players.push(entry)
  const alcohol = await payEntry(client, player, 'darts')
  if (room.pub.darts !== game) return
  if (alcohol === null) {
    removeDartsPlayer(room, game, player.sessionId)
    return
  }
  entry.alcohol = alcohol
  const lobby = dartsLobby(game)
  forEachPubClient(room, (c) => c.send('pub_darts_lobby', lobby))
  if (opened) room.clock.setTimeout(() => startDarts(room, game, Date.now()), DARTS_LOBBY_MS)
}

export function startDarts(room: GameRoom, game: DartsGame, now: number): void {
  if (room.pub.darts !== game || game.started) return
  game.players = game.players.filter((p) => {
    const player = room.players.get(p.sessionId)
    return player && now >= player.knockedOutUntil
  })
  if (game.players.length === 0) {
    room.pub.darts = null
    return
  }
  game.started = true
  game.turn = 0
  armTurn(room, game, now)
  broadcastDartsState(room, game)
}

function armTurn(room: GameRoom, game: DartsGame, now: number): void {
  game.turnEndsAt = now + DARTS_TURN_MS
  const seq = ++game.turnSeq
  room.clock.setTimeout(() => {
    if (room.pub.darts !== game || game.turnSeq !== seq) return
    const current = game.players[game.turn]
    while (current.darts.length < DARTS_THROWS) current.darts.push({ x: LOST_DART_CM, y: LOST_DART_CM, score: 0 })
    advanceTurn(room, game, Date.now())
  }, DARTS_TURN_MS)
}

function advanceTurn(room: GameRoom, game: DartsGame, now: number): void {
  game.turn++
  if (game.turn >= game.players.length) {
    void endDarts(room, game)
    return
  }
  armTurn(room, game, now)
  broadcastDartsState(room, game)
}

export function onDartsThrow(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const game = room.pub.darts
  if (!player || !game?.started || now < player.knockedOutUntil) return
  const current = game.players[game.turn]
  if (current.sessionId !== player.sessionId || current.darts.length >= DARTS_THROWS) return
  const x = payload?.x
  const y = payload?.y
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return
  if (Math.abs(x) > DARTS_MAX_OFFSET_CM || Math.abs(y) > DARTS_MAX_OFFSET_CM) return
  current.darts.push({ x, y, score: dartsScore(x, y) })
  if (current.darts.length >= DARTS_THROWS) {
    advanceTurn(room, game, now)
    return
  }
  broadcastDartsState(room, game)
}

export function dartsRanking(game: DartsGame): Array<{ sessionId: string, total: number }> {
  return game.players
    .map((p) => ({ sessionId: p.sessionId, total: dartsTotal(p) }))
    .sort((a, b) => b.total - a.total)
}

export async function endDarts(room: GameRoom, game: DartsGame): Promise<void> {
  if (room.pub.darts !== game) return
  room.pub.darts = null
  const ranking = dartsRanking(game)
  const rewards = await Promise.all(ranking.map(async ({ sessionId, total }, rank) => ({
    sessionId,
    coins: await payReward(room, sessionId, 'darts', rewardPlacement(rank, ranking.length), total)
  })))
  for (const p of game.players) drink(room, p.sessionId, p.alcohol)
  const payload = { ranking, rewards }
  forEachPubClient(room, (c) => c.send('pub_darts_end', payload))
}

function removeDartsPlayer(room: GameRoom, game: DartsGame, sessionId: string): void {
  const index = game.players.findIndex((p) => p.sessionId === sessionId)
  if (index === -1) return
  game.players.splice(index, 1)
  if (game.players.length === 0) {
    room.pub.darts = null
    return
  }
  if (!game.started) {
    const lobby = dartsLobby(game)
    forEachPubClient(room, (c) => c.send('pub_darts_lobby', lobby))
    return
  }
  if (index < game.turn) game.turn--
  else if (index === game.turn) {
    if (game.turn >= game.players.length) {
      void endDarts(room, game)
      return
    }
    armTurn(room, game, Date.now())
  }
  broadcastDartsState(room, game)
}

export function leaveDarts(room: GameRoom, player: Player): void {
  if (room.pub.darts) removeDartsPlayer(room, room.pub.darts, player.sessionId)
}
