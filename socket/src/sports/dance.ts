import { callRealtimeBackend } from '../backend.ts'
import type { ClientPayload, GameClient, GameRoom } from '../types.ts'
import { readSportRules, worldSportsPassArea } from '../world.ts'
import {
  type DanceGame,
  type DanceMode,
  type DanceRules,
  type Difficulty,
  type JudgedNote,
  DANCE_MODES,
  DIFFICULTIES,
  danceResults,
  danceRunRecord,
  expireNotes,
  fullCombo,
  newDanceGame,
  parseDanceRules,
  pressLane,
  songOver,
  teamScore
} from './danceGame.ts'
import { onEmotePlay, parseEmoteRules, setEmoteRules, stopEmote } from './danceEmotes.ts'
import { type Match, type Settings, activePlayers, parseSignupRules } from './signup.ts'
import { endMatch, recordMatch, registerVenue } from './venues.ts'

export const DANCE_VENUE = 'dance_studio'
export const DANCE_ZONE = 'sports_dance'

const games = new Map<string, DanceGame>()
let rules: DanceRules | null = null

function danceRules(): DanceRules {
  if (!rules) throw new Error('dance rules are not loaded')
  return rules
}

function modeOf(settings: Settings): DanceMode {
  const mode = DANCE_MODES.find((m) => m === settings.mode)
  if (!mode) throw new Error(`dance: unknown mode ${String(settings.mode)}`)
  return mode
}

function inStudio(room: GameRoom, sessionId: string): boolean {
  const zone = worldSportsPassArea(DANCE_ZONE)
  const player = room.players.get(sessionId)
  return zone !== null && player !== undefined && player.x >= zone.minX && player.x <= zone.maxX && player.z >= zone.minZ && player.z <= zone.maxZ
}

function sendToStudio(room: GameRoom, game: DanceGame, type: string, payload: unknown): void {
  const dancers = new Set(game.dancers.map((d) => d.sessionId))
  room.forEachClient((c) => {
    if (dancers.has(c.sessionId) || inStudio(room, c.sessionId)) c.send(type, payload)
  })
}

function judgeView(game: DanceGame, j: JudgedNote) {
  return {
    sessionId: j.dancer.sessionId,
    index: j.index,
    lane: game.notes[j.index].lane,
    judgement: j.judgement,
    score: j.dancer.score,
    combo: j.dancer.combo,
    synced: j.synced,
    teamScore: game.mode === 'team' ? teamScore(game) : null
  }
}

function placeDancers(room: GameRoom, game: DanceGame): void {
  const { spots } = danceRules().venue
  game.dancers.forEach((d, i) => {
    const player = room.players.get(d.sessionId)
    const client = room.clients.find((c) => c.sessionId === d.sessionId)
    if (!player || !client || !inStudio(room, d.sessionId)) return
    player.x = spots[i].x
    player.z = spots[i].z
    client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'dance_spot' })
    room.broadcastMove(client, player)
  })
}

export function startDance(room: GameRoom, match: Match): DanceGame {
  const r = danceRules()
  const song = r.songs.find((s) => s.id === match.settings.song)
  const difficulty = DIFFICULTIES.find((d) => d === match.settings.difficulty) as Difficulty | undefined
  if (!song || !difficulty) throw new Error(`dance: invalid settings ${JSON.stringify(match.settings)}`)
  const game = newDanceGame(modeOf(match.settings), song, difficulty, match.startedAt + r.leadInMs, match.players)
  games.set(match.id, game)
  for (const d of game.dancers) stopEmote(room, d.sessionId)
  placeDancers(room, game)
  sendToStudio(room, game, 'dance_start', {
    venue: DANCE_VENUE,
    mode: game.mode,
    song: song.id,
    difficulty,
    bpm: song.bpm,
    lengthMs: song.lengthSec * 1000,
    startAt: game.startAt,
    serverNow: match.startedAt,
    notes: game.notes.map((n) => [n.t, n.lane]),
    dancers: game.dancers.map((d) => ({ sessionId: d.sessionId, name: d.name }))
  })
  return game
}

function currentGame(room: GameRoom): { match: Match, game: DanceGame } | null {
  const match = room.sports.matches.get(DANCE_VENUE)
  const game = match ? games.get(match.id) : undefined
  return match && game ? { match, game } : null
}

export function onDancePress(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const current = currentGame(room)
  if (!current) return
  const player = room.players.get(client.sessionId)
  const active = activePlayers(current.match).find((p) => p.sessionId === client.sessionId)
  const dancer = current.game.dancers.find((d) => d.accountId === player?.accountId)
  if (!player || !active || !dancer) return
  const outcome = pressLane(current.game, dancer, Number(payload?.lane), now, danceRules())
  if (outcome.kind === 'stray') client.send('dance_stray', { combo: 0 })
  if (outcome.kind === 'judged') sendToStudio(room, current.game, 'dance_judge', judgeView(current.game, outcome.judged))
}

export function tickDance(room: GameRoom, match: Match, now: number): void {
  const game = games.get(match.id)
  if (!game) return
  for (const missed of expireNotes(game, now, danceRules())) sendToStudio(room, game, 'dance_judge', judgeView(game, missed))
  if (songOver(game, now, danceRules())) endMatch(room, DANCE_VENUE, { reason: 'finished' }, now)
}

export function dancerLeft(match: Match, accountId: number): void {
  const dancer = games.get(match.id)?.dancers.find((d) => d.accountId === accountId)
  if (dancer) dancer.out = true
}

export function finishDance(room: GameRoom, match: Match, now = Date.now()): void {
  const game = games.get(match.id)
  if (!game) return
  games.delete(match.id)
  const results = danceResults(game)
  sendToStudio(room, game, 'dance_end', {
    venue: DANCE_VENUE,
    mode: game.mode,
    teamScore: game.mode === 'team' ? teamScore(game) : null,
    dancers: game.dancers.map((d) => {
      const r = results.find((x) => x.accountId === d.accountId)
      return { sessionId: d.sessionId, name: d.name, score: d.score, maxCombo: d.maxCombo, fullCombo: fullCombo(d), counts: d.counts, result: r?.result ?? 'dnf', place: r?.place ?? null }
    })
  })
  void recordMatch(room, match, results, now).then(() => recordDanceRun(room, game, match, now))
}

async function recordDanceRun(room: GameRoom, game: DanceGame, match: Match, endedAt: number): Promise<void> {
  const tokens = [...room.players.values()].filter((p) => p.token)
  const token = (tokens.find((p) => game.dancers.some((d) => d.accountId === p.accountId)) ?? tokens[0])?.token ?? null
  try {
    await callRealtimeBackend(token, '/sports/dance/runs', 'POST', danceRunRecord(game, match.id, endedAt))
  } catch (error) {
    console.warn(`[sports] dance run ${match.id} not recorded:`, error instanceof Error ? error.message : error)
  }
}

export function registerDanceVenue(raw: unknown): void {
  const loaded = parseDanceRules(raw)
  const settings = parseSignupRules(raw, 'sports/rules/dance.json').settings
  const songOptions = settings.find((s) => s.key === 'song')?.options ?? []
  if (songOptions.length !== loaded.songs.length || !loaded.songs.every((s) => songOptions.includes(s.id))) {
    throw new Error('sports/rules/dance.json: signup song options must list every song id')
  }
  const emotes = parseEmoteRules(raw)
  rules = loaded
  setEmoteRules(emotes)
  const { venue, maxPlayers } = loaded
  registerVenue({
    id: DANCE_VENUE,
    sport: 'dance',
    zone: DANCE_ZONE,
    coach: venue.coach,
    playArea: venue.playArea,
    teams: false,
    settings,
    players: (settings) => (settings.mode === 'solo' ? { min: 1, max: 1 } : { min: 2, max: maxPlayers }),
    rejoinGraceMs: 0,
    onKickoff: (room, match) => void startDance(room, match),
    onTick: (room, match, elapsedMs) => tickDance(room, match, match.startedAt + elapsedMs),
    onLeave: (_room, match, accountId) => dancerLeft(match, accountId),
    onEnd: (room, match) => finishDance(room, match)
  })
}

export function isDancing(room: GameRoom, accountId: number): boolean {
  const current = currentGame(room)
  return current !== null && current.game.dancers.some((d) => d.accountId === accountId && !d.out)
}

export function onDanceEmotePlay(room: GameRoom, client: GameClient, payload: ClientPayload): Promise<void> {
  return onEmotePlay(room, client, payload, (player) => isDancing(room, player.accountId))
}

export async function loadDanceVenue(): Promise<void> {
  registerDanceVenue(await readSportRules('dance'))
}
