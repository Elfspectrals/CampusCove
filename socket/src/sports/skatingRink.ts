import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { ownedGear } from './gear.ts'
import type { Match, SettingSpec } from './signup.ts'
import { activePlayers } from './signup.ts'
import {
  FULL_LAP,
  type SkatingRules,
  type SpeedState,
  advanceSpeed,
  applyPush,
  insideCones,
  insideRink,
  lapOf,
  newSpeedState,
  progressStep,
  raceTimeLimit,
  rankFinishers,
  setBraking,
  startProgress
} from './skatingSim.ts'
import { type MatchResult, endMatch, recordMatch, registerCoach, registerVenue } from './venues.ts'

export const SKATING_VENUE = 'rink_skating'
export const ICE_SKATES = 'gear_ice_skates'
const SKATE_SPEED_MARGIN = 1.25
const STILL_EPSILON_M = 0.3
const MIN_PUSH_INTERVAL_MS = 150

export type SkatingRejection = 'no_skates' | 'skate_start' | 'skate_fallen' | 'too_fast'

interface Racer {
  accountId: number
  sessionId: string
  name: string
  signedAt: number
  progress: number
  x: number
  z: number
  inside: boolean
  penaltyMs: number
  finishedMs: number | null
  dnf: boolean
}

interface Race {
  matchId: string
  laps: number
  goAt: number
  started: boolean
  racers: Map<number, Racer>
}

interface Skater {
  owns: boolean | null
  checking: boolean
  inZone: boolean
  speed: SpeedState | null
  acceptedDistance: number
  fallenUntil: number
  immuneUntil: number
}

let rules: SkatingRules | null = null
let zone = ''
const skaters = new WeakMap<Player, Skater>()
const races = new WeakMap<GameRoom, Race>()

function skaterOf(player: Player): Skater {
  let s = skaters.get(player)
  if (!s) {
    s = { owns: null, checking: false, inZone: false, speed: null, acceptedDistance: 0, fallenUntil: 0, immuneUntil: 0 }
    skaters.set(player, s)
  }
  return s
}

function inZone(x: number, z: number): boolean {
  const b = worldSportsPassArea(zone)
  return b !== null && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

function onIce(x: number, z: number): boolean {
  return rules !== null && insideRink(rules.rink, x, z)
}

function refreshSkates(player: Player, skater: Skater): void {
  if (skater.checking || !player.token) return
  skater.checking = true
  ownedGear(player)
    .then((gear) => {
      skater.owns = gear.includes(ICE_SKATES)
    })
    .catch((error) => {
      skater.owns = null
      console.warn('[skating] gear check failed:', error instanceof Error ? error.message : error)
    })
    .finally(() => {
      skater.checking = false
    })
}

function speedOf(skater: Skater, now: number): SpeedState {
  if (!skater.speed) skater.speed = newSpeedState(now)
  return skater.speed
}

function racerOf(room: GameRoom, player: Player): Racer | null {
  return races.get(room)?.racers.get(player.accountId) ?? null
}

export function skateSpeedCap(player: Player, x: number, z: number): number | null {
  if (!rules || skaters.get(player)?.owns !== true) return null
  return onIce(player.x, player.z) || onIce(x, z) ? rules.skate.maxSpeed * SKATE_SPEED_MARGIN : null
}

export function skatingRejection(room: GameRoom, player: Player, x: number, z: number, now: number): SkatingRejection | null {
  if (!rules) return null
  const skater = skaterOf(player)
  const entersZone = inZone(x, z)
  if (entersZone && !skater.inZone) refreshSkates(player, skater)
  skater.inZone = entersZone
  const wasOnIce = onIce(player.x, player.z)
  const toIce = onIce(x, z)
  if (toIce && !wasOnIce) {
    if (skater.owns === null) refreshSkates(player, skater)
    if (skater.owns !== true) return 'no_skates'
    skater.speed = newSpeedState(now)
    skater.acceptedDistance = 0
  }
  const racer = racerOf(room, player)
  if (!racer || racer.finishedMs !== null || racer.dnf) return null
  const moved = Math.hypot(x - player.x, z - player.z)
  const race = races.get(room) as Race
  if (now < race.goAt) return moved > STILL_EPSILON_M ? 'skate_start' : null
  if (now < skater.fallenUntil) return moved > STILL_EPSILON_M ? 'skate_fallen' : null
  const speed = speedOf(skater, now)
  advanceSpeed(rules.skate, speed, now)
  if (moved > speed.distance - skater.acceptedDistance + rules.skate.moveMarginM) return 'too_fast'
  skater.acceptedDistance = speed.distance
  return null
}

function sendToRink(room: GameRoom, type: string, payload: unknown, race: Race | null): void {
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    if (listener && (inZone(listener.x, listener.z) || race?.racers.has(listener.accountId))) c.send(type, payload)
  })
}

export function onSkatePush(room: GameRoom, client: GameClient, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!rules || !player || !onIce(player.x, player.z)) return
  const skater = skaterOf(player)
  if (skater.owns !== true || now < skater.fallenUntil) return
  const speed = speedOf(skater, now)
  if (speed.lastPushAt !== null && now - speed.lastPushAt < MIN_PUSH_INTERVAL_MS) return
  applyPush(rules.skate, speed, now)
}

export function onSkateBrake(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!rules || !player || typeof payload?.on !== 'boolean') return
  setBraking(rules.skate, speedOf(skaterOf(player), now), payload.on, now)
}

function raceView(race: Race, now: number) {
  return {
    venue: SKATING_VENUE,
    phase: now < race.goAt ? 'countdown' : 'racing',
    laps: race.laps,
    goAt: race.goAt,
    serverNow: now,
    racers: [...race.racers.values()].map((r) => ({
      sessionId: r.sessionId,
      name: r.name,
      lap: lapOf(r.progress, race.laps),
      penaltyMs: r.penaltyMs,
      finishedMs: r.finishedMs,
      dnf: r.dnf
    }))
  }
}

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function placeOnGrid(room: GameRoom, player: Player, spot: [number, number]): void {
  player.x = spot[0]
  player.z = spot[1]
  const client = clientOf(room, player.sessionId)
  if (!client) return
  client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'skate_grid' })
  room.broadcastMove(client, player)
}

function kickoff(room: GameRoom, match: Match): void {
  const r = rules as SkatingRules
  const goAt = match.startedAt + r.startCountdownMs
  const race: Race = { matchId: match.id, laps: Number(match.settings.laps), goAt, started: false, racers: new Map() }
  activePlayers(match).forEach((p, i) => {
    const player = room.players.get(p.sessionId)
    const spot = r.oval.grid[i]
    if (player && p.awaySince === null) placeOnGrid(room, player, spot)
    const skater = player ? skaterOf(player) : null
    if (skater) {
      skater.speed = newSpeedState(goAt)
      skater.acceptedDistance = 0
      skater.fallenUntil = 0
    }
    race.racers.set(p.accountId, {
      accountId: p.accountId,
      sessionId: p.sessionId,
      name: p.name,
      signedAt: i,
      progress: startProgress(r.oval, spot[0], spot[1]),
      x: spot[0],
      z: spot[1],
      inside: false,
      penaltyMs: 0,
      finishedMs: null,
      dnf: p.awaySince !== null
    })
  })
  races.set(room, race)
  sendToRink(room, 'skate_race', raceView(race, match.startedAt), race)
}

function running(r: Racer): boolean {
  return r.finishedMs === null && !r.dnf
}

function crash(room: GameRoom, race: Race, now: number): boolean {
  const r = rules as SkatingRules
  const live = [...race.racers.values()].filter(running).map((racer) => ({ racer, player: room.players.get(racer.sessionId) }))
  let changed = false
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i].player
      const b = live[j].player
      if (!a || !b || Math.hypot(a.x - b.x, a.z - b.z) >= r.crash.contactRadius) continue
      const sa = skaterOf(a)
      const sb = skaterOf(b)
      if (now < sa.immuneUntil || now < sb.immuneUntil) continue
      advanceSpeed(r.skate, speedOf(sa, now), now)
      advanceSpeed(r.skate, speedOf(sb, now), now)
      if (Math.max(speedOf(sa, now).speed, speedOf(sb, now).speed) < r.crash.speedThreshold) continue
      for (const [player, skater] of [[a, sa], [b, sb]] as const) {
        skater.fallenUntil = now + r.crash.fallMs
        skater.immuneUntil = now + r.crash.fallMs + r.crash.immuneMs
        const speed = speedOf(skater, now)
        speed.speed = 0
        speed.braking = false
        sendToRink(room, 'skate_fall', { sessionId: player.sessionId, until: skater.fallenUntil, serverNow: now }, race)
      }
      changed = true
    }
  }
  return changed
}

function advanceRacer(room: GameRoom, race: Race, racer: Racer, now: number): boolean {
  const r = rules as SkatingRules
  const player = room.players.get(racer.sessionId)
  if (!player) return false
  if (!onIce(player.x, player.z)) {
    racer.dnf = true
    return true
  }
  const lapBefore = lapOf(racer.progress, race.laps)
  racer.progress += progressStep(r.oval, racer.x, racer.z, player.x, player.z)
  racer.x = player.x
  racer.z = player.z
  const inside = insideCones(r.oval, player.x, player.z)
  const cut = inside && !racer.inside
  racer.inside = inside
  if (cut) racer.penaltyMs += r.cutPenaltyMs
  if (racer.progress >= race.laps * FULL_LAP) {
    racer.finishedMs = now - race.goAt + racer.penaltyMs
    return true
  }
  return cut || lapOf(racer.progress, race.laps) !== lapBefore
}

function tick(room: GameRoom, match: Match, elapsedMs: number): void {
  const race = races.get(room)
  if (!race || race.matchId !== match.id) return
  const now = match.startedAt + elapsedMs
  if (now < race.goAt) return
  let changed = !race.started
  race.started = true
  for (const racer of race.racers.values()) {
    if (running(racer) && advanceRacer(room, race, racer, now)) changed = true
  }
  if (crash(room, race, now)) changed = true
  const overTime = now - race.goAt >= raceTimeLimit(rules as SkatingRules, race.laps)
  if (overTime) for (const racer of race.racers.values()) if (running(racer)) racer.dnf = true
  if (changed || overTime) sendToRink(room, 'skate_race', raceView(race, now), race)
  if (![...race.racers.values()].some(running)) endMatch(room, SKATING_VENUE, { reason: 'finished' }, now)
}

function leave(room: GameRoom, _match: Match, accountId: number): void {
  const racer = races.get(room)?.racers.get(accountId)
  if (racer && running(racer)) racer.dnf = true
}

function raceResults(race: Race): { view: object[], records: MatchResult[] } {
  const finishers = rankFinishers([...race.racers.values()].filter((r) => r.finishedMs !== null).map((r) => ({ ...r, timeMs: r.finishedMs as number })))
  const places = new Map(finishers.map((f) => [f.accountId, f.place]))
  const racers = [...race.racers.values()]
  return {
    view: racers.map((r) => ({ sessionId: r.sessionId, name: r.name, place: places.get(r.accountId) ?? null, timeMs: r.finishedMs, penaltyMs: r.penaltyMs, dnf: r.finishedMs === null })),
    records: racers.map((r) => r.finishedMs === null
      ? { accountId: r.accountId, team: null, result: 'dnf' as const }
      : { accountId: r.accountId, team: null, result: 'finished' as const, place: places.get(r.accountId) as number, timeMs: r.finishedMs })
  }
}

function end(room: GameRoom, match: Match): void {
  const race = races.get(room)
  if (!race || race.matchId !== match.id) return
  races.delete(room)
  for (const racer of race.racers.values()) if (running(racer)) racer.dnf = true
  const { view, records } = raceResults(race)
  sendToRink(room, 'skate_result', { venue: SKATING_VENUE, laps: race.laps, results: view }, race)
  void recordMatch(room, match, records)
}

export function registerSkating(parsed: SkatingRules, venueZone: string, coach: { id: string, x: number, z: number }, settings: readonly SettingSpec[]): void {
  rules = parsed
  zone = venueZone
  const r = parsed
  registerVenue({
    id: SKATING_VENUE,
    sport: 'skating',
    zone: venueZone,
    coach,
    playArea: r.rink,
    gear: ICE_SKATES,
    teams: false,
    settings,
    players: () => ({ min: 1, max: r.maxPlayers }),
    rejoinGraceMs: 0,
    onKickoff: kickoff,
    onTick: tick,
    onLeave: leave,
    onEnd: end
  })
  registerCoach({ id: coach.id, x: coach.x, z: coach.z, venues: [SKATING_VENUE] })
}

export function racerIn(room: GameRoom, accountId: number): Readonly<Racer> | null {
  return races.get(room)?.racers.get(accountId) ?? null
}
