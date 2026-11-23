import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldPub } from '../world.ts'
import { inSecretVolume } from '../pub.ts'
import { stopEmote } from './danceEmotes.ts'
import { danceRules, isDancing } from './dance.ts'
import {
  type DanceGame,
  DIFFICULTIES,
  expireNotes,
  fullCombo,
  newDanceGame,
  pressLane,
  songOver
} from './danceGame.ts'

export const POLE_SHOW_VENUE = 'velvet_stage'
export const POLE_SHOW_TICK_MS = 200
export const POLE_SHOW_STAGE_REACH = 2.5
const POLE_SHOW_SONG = 'cove_groove'
const POLE_SHOW_DIFFICULTY = DIFFICULTIES[1]

const shows = new Map<string, DanceGame>()

function stageReached(player: Player): boolean {
  const pub = worldPub()
  const stage = pub?.stage
  if (!pub || !stage || !inSecretVolume(pub, player.x, player.y, player.z)) return false
  return Math.hypot(stage.x - player.x, stage.z - player.z) <= POLE_SHOW_STAGE_REACH
}

function lookTarget(): [number, number] {
  const basement = worldPub()?.basement
  if (!basement) throw new Error('pole show: the pub has no basement')
  return [(basement.minX + basement.maxX) / 2, (basement.minZ + basement.maxZ) / 2]
}

export function onPoleShowStart(room: GameRoom, client: GameClient, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil || shows.has(player.sessionId)) return
  if (!stageReached(player) || isDancing(room, player.accountId)) return
  const rules = danceRules()
  const song = rules.songs.find((s) => s.id === POLE_SHOW_SONG)
  if (!song) throw new Error(`pole show: unknown song ${POLE_SHOW_SONG}`)
  const game = newDanceGame('solo', song, POLE_SHOW_DIFFICULTY, now + rules.leadInMs, [
    { accountId: player.accountId, sessionId: player.sessionId, name: player.pseudo }
  ])
  shows.set(player.sessionId, game)
  stopEmote(room, player.sessionId)
  const stage = worldPub()!.stage!
  player.x = stage.x
  player.z = stage.z
  client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'dance_spot' })
  room.broadcastMove(client, player)
  client.send('dance_start', {
    venue: POLE_SHOW_VENUE,
    mode: game.mode,
    song: song.id,
    difficulty: game.difficulty,
    bpm: song.bpm,
    lengthMs: song.lengthSec * 1000,
    startAt: game.startAt,
    serverNow: now,
    notes: game.notes.map((n) => [n.t, n.lane]),
    dancers: game.dancers.map((d) => ({ sessionId: d.sessionId, name: d.name })),
    focus: lookTarget()
  })
}

function judgeView(game: DanceGame, index: number, sessionId: string) {
  const dancer = game.dancers[0]
  return {
    sessionId,
    index,
    lane: game.notes[index].lane,
    judgement: dancer.judged[index],
    score: dancer.score,
    combo: dancer.combo,
    synced: false,
    teamScore: null
  }
}

export function onPoleShowPress(client: GameClient, payload: ClientPayload, now = Date.now()): boolean {
  const game = shows.get(client.sessionId)
  if (!game) return false
  const outcome = pressLane(game, game.dancers[0], Number(payload?.lane), now, danceRules())
  if (outcome.kind === 'stray') client.send('dance_stray', { combo: 0 })
  if (outcome.kind === 'judged') client.send('dance_judge', judgeView(game, outcome.judged.index, client.sessionId))
  return true
}

function endShow(client: GameClient | undefined, sessionId: string, game: DanceGame): void {
  shows.delete(sessionId)
  const dancer = game.dancers[0]
  client?.send('dance_end', {
    venue: POLE_SHOW_VENUE,
    mode: game.mode,
    teamScore: null,
    dancers: [{
      sessionId,
      name: dancer.name,
      score: dancer.score,
      maxCombo: dancer.maxCombo,
      fullCombo: fullCombo(dancer),
      counts: dancer.counts,
      result: 'finished',
      place: null
    }]
  })
}

export function tickPoleShows(room: GameRoom, now: number): void {
  const rules = danceRules()
  for (const [sessionId, game] of shows) {
    const player = room.players.get(sessionId)
    if (!player) {
      shows.delete(sessionId)
      continue
    }
    const client = room.clients.find((c) => c.sessionId === sessionId)
    for (const missed of expireNotes(game, now, rules)) client?.send('dance_judge', judgeView(game, missed.index, sessionId))
    const pub = worldPub()
    const left = !pub || !inSecretVolume(pub, player.x, player.y, player.z)
    if (left || songOver(game, now, rules)) endShow(client, sessionId, game)
  }
}
