import type { ClientPayload, GameClient, GameRoom } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { SWIMSUIT } from './poolWater.ts'
import { parseSignupRules, type Match } from './signup.ts'
import {
  type PoolRules,
  type Race,
  type StrokeSide,
  type Swimmer,
  advanceRace,
  createRace,
  dropSwimmer,
  fireBeep,
  lanePosition,
  parsePoolRules,
  places,
  pressDive,
  pressStroke,
  raceOver,
  swimmerOf
} from './swimRace.ts'
import { type MatchResult, endMatch, recordMatch } from './venues.ts'

export const POOL_ZONE = 'sports_pool'
const EYE_HEIGHT = 1.6

const races = new WeakMap<GameRoom, { match: Match, race: Race }>()
let poolRules: PoolRules | null = null

export function usePoolRules(rules: PoolRules): void {
  poolRules = rules
}

export function poolVenueSpec(raw: unknown, random: () => number = Math.random) {
  const rules = parsePoolRules(raw)
  const signup = parseSignupRules(raw, 'swimming rules')
  const { coachId, coachPosition } = raw as { coachId?: unknown, coachPosition?: unknown }
  if (typeof coachId !== 'string' || !Array.isArray(coachPosition) || coachPosition.length !== 3 || !coachPosition.every(Number.isFinite)) {
    throw new Error('swimming rules: invalid coachId or coachPosition')
  }
  const lane1 = rules.lanes[0]
  const basin = rules.water.find((b) => lane1.z >= b.minZ && lane1.z <= b.maxZ && rules.startX >= b.minX - 1e-6 && rules.startX <= b.maxX + 1e-6)
  if (!basin) throw new Error('swimming rules: no water volume holds the lanes')
  return {
    rules,
    spec: {
      id: coachId,
      sport: 'swimming',
      zone: POOL_ZONE,
      coach: { x: coachPosition[0] as number, z: coachPosition[2] as number },
      playArea: basin,
      teams: false,
      settings: signup.settings,
      players: () => ({ min: 1, max: rules.lanes.length }),
      rejoinGraceMs: 0,
      gear: SWIMSUIT,
      onKickoff: (room: GameRoom, match: Match) => startRace(room, match, rules, random),
      onTick: (room: GameRoom, match: Match) => tickRace(room, match, rules),
      onLeave: (room: GameRoom, match: Match, accountId: number) => {
        const live = races.get(room)
        if (live?.match === match) dropSwimmer(live.race, accountId)
      },
      onEnd: (room: GameRoom, match: Match) => finishRace(room, match, rules)
    }
  }
}

function inPool(room: GameRoom, sessionId: string): boolean {
  const zone = worldSportsPassArea(POOL_ZONE)
  const p = room.players.get(sessionId)
  return zone !== null && p !== undefined && p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ
}

function sendToPool(room: GameRoom, race: Race, type: string, payload: unknown): void {
  room.forEachClient((c) => {
    if (race.swimmers.some((s) => s.sessionId === c.sessionId) || inPool(room, c.sessionId)) c.send(type, payload)
  })
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function placeSwimmer(room: GameRoom, s: Swimmer, x: number, y: number, z: number, reason: string | null): void {
  const player = room.players.get(s.sessionId)
  if (!player || player.accountId !== s.accountId) return
  player.x = x
  player.y = y
  player.z = z
  const client = clientOf(room, s.sessionId)
  if (!client) return
  if (reason) client.send('position_correction', { x, y, z, reason })
  room.broadcastMove(client, player)
}

function startRace(room: GameRoom, match: Match, rules: PoolRules, random: () => number): void {
  const now = Date.now()
  const [lo, hi] = rules.beepDelayMs
  const race = createRace(match.players.map(({ accountId, sessionId, name }) => ({ accountId, sessionId, name })), Number(match.settings.distanceM), now, Math.round(lo + (hi - lo) * random()))
  races.set(room, { match, race })
  for (const s of race.swimmers) {
    const [x, y, z] = rules.lanes[s.lane - 1].block
    placeSwimmer(room, s, x, y + EYE_HEIGHT, z, 'pool_block')
  }
  sendToPool(room, race, 'pool_race_start', {
    venue: match.venue,
    distanceM: race.distanceM,
    lengthM: rules.lengthM,
    lanes: race.swimmers.map(({ sessionId, name, lane }) => ({ sessionId, name, lane })),
    serverNow: now
  })
}

function swimmerView(s: Swimmer, rules: PoolRules, race: Race) {
  const { x, length } = lanePosition(rules, s.distanceM)
  return {
    sessionId: s.sessionId,
    lane: s.lane,
    phase: s.phase,
    distanceM: Math.round(s.distanceM * 100) / 100,
    x: Math.round(x * 100) / 100,
    z: rules.lanes[s.lane - 1].z,
    length,
    lengths: race.distanceM / rules.lengthM,
    speedMps: Math.round(s.speedMps * 100) / 100,
    reactionMs: s.reactionMs,
    timeMs: s.timeMs
  }
}

function tickRace(room: GameRoom, match: Match, rules: PoolRules): void {
  const live = races.get(room)
  if (!live || live.match !== match) return
  const { race } = live
  const now = Date.now()
  if (fireBeep(race, now)) sendToPool(room, race, 'pool_race_beep', { venue: match.venue, serverNow: now })
  advanceRace(race, now, rules)
  for (const s of race.swimmers) {
    if (s.phase !== 'swimming' && !(s.phase === 'finished' && s.at === now)) continue
    const { x } = lanePosition(rules, s.distanceM)
    placeSwimmer(room, s, x, rules.wadeY + EYE_HEIGHT, rules.lanes[s.lane - 1].z, null)
  }
  sendToPool(room, race, 'pool_race_state', {
    venue: match.venue,
    clockMs: race.beepAt === null ? null : now - race.beepAt,
    swimmers: race.swimmers.map((s) => swimmerView(s, rules, race))
  })
  if (raceOver(race)) endMatch(room, match.venue, { reason: 'finished' }, now)
}

export function raceResults(race: Race): MatchResult[] {
  const placed = places(race)
  return race.swimmers.map((s) => {
    const place = placed.get(s.accountId)
    if (place === undefined || s.timeMs === null) return { accountId: s.accountId, team: null, result: 'dnf' }
    return { accountId: s.accountId, team: null, result: 'finished', place, timeMs: s.timeMs }
  })
}

function finishRace(room: GameRoom, match: Match, rules: PoolRules): void {
  const live = races.get(room)
  if (!live || live.match !== match) return
  races.delete(room)
  const { race } = live
  const now = Date.now()
  advanceRace(race, now, rules)
  for (const s of race.swimmers) if (s.phase === 'marks' || s.phase === 'swimming') s.phase = 'dnf'
  const results = raceResults(race)
  sendToPool(room, race, 'pool_race_result', {
    venue: match.venue,
    distanceM: race.distanceM,
    results: race.swimmers.map((s, i) => ({
      sessionId: s.sessionId,
      name: s.name,
      lane: s.lane,
      status: s.phase,
      place: results[i].place ?? null,
      timeMs: results[i].timeMs ?? null,
      reactionMs: s.reactionMs
    }))
  })
  void recordMatch(room, match, results, now)
}

function swimmerFor(room: GameRoom, client: GameClient): { race: Race, swimmer: Swimmer } | null {
  const player = room.players.get(client.sessionId)
  const live = races.get(room)
  if (!player || !live) return null
  const swimmer = swimmerOf(live.race, player.accountId)
  return swimmer && swimmer.sessionId === client.sessionId ? { race: live.race, swimmer } : null
}

export function onPoolDive(room: GameRoom, client: GameClient, now = Date.now()): void {
  const rules = poolRules
  const found = swimmerFor(room, client)
  if (!rules || !found) return
  const result = pressDive(found.race, found.swimmer, now, rules)
  if (result !== 'ignored') client.send('pool_stroke_result', { result, reactionMs: found.swimmer.reactionMs })
}

function parseSide(raw: unknown): StrokeSide | null {
  return raw === 'left' || raw === 'right' ? raw : null
}

export function onPoolStroke(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const rules = poolRules
  const side = parseSide(payload?.side)
  const found = side && swimmerFor(room, client)
  if (!rules || !side || !found) return
  const result = pressStroke(found.race, found.swimmer, side, now, rules)
  if (result !== 'ignored') client.send('pool_stroke_result', { result, reactionMs: found.swimmer.reactionMs })
}
