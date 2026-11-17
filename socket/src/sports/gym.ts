import { callRealtimeBackend } from '../backend.ts'
import { EYE_HEIGHT } from '../houseObjects.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import type { GymCourt } from './gymCourt.ts'
import { freeAction, onGymBall as freeBall, onGymBallReturn as freeBallReturn, tickGymFree } from './gymFree.ts'
import { type Athlete, type GymActionKind, type GymEvent, type GymGame, GYM_ACTIONS, actGym, dropOwner, newGymGame, outcomeFor, restartHalf, stepGym } from './gymMatch.ts'
import { type Motion, MotionTracker } from './gymMotion.ts'
import { type GymRobotBrain, kickoffSpot, newGymRobotBrain, thinkGymRobot } from './gymRobot.ts'
import { type GymRules, halvesOf } from './gymRules.ts'
import { isRobot, placeRobot, sportsPlayer } from './robots.ts'
import { type Match, type SettingSpec, type Team, TEAMS } from './signup.ts'
import { type MatchEnd, type MatchResult, endMatch, recordMatch, registerVenue } from './venues.ts'

export const GYM_ZONE = 'sports_gym'
export const GYM_COURT_AREA = 'gym_court'
const STEP_S = 1 / 60
const MAX_TICK_S = 0.5
const ACTION_GAP_MS = 60

interface Live {
  game: GymGame
  rules: GymRules
  durationMs: number
  halves: number
  half: number
  lastAt: number
  motion: MotionTracker
  brains: Map<number, GymRobotBrain>
}

export interface GymVenueSpec {
  id: string
  zone: string
  playAreaId: string
  court: GymCourt
  rules: GymRules
  settings: readonly SettingSpec[]
  minPlayers: number
  rejoinGraceMs: number
  robots?: boolean
}

const lives = new WeakMap<GameRoom, Map<string, Live>>()
const venues = new Map<string, { zone: string, playAreaId: string }>()
const lastActionAt = new Map<number, number>()

function livesOf(room: GameRoom): Map<string, Live> {
  let map = lives.get(room)
  if (!map) {
    map = new Map()
    lives.set(room, map)
  }
  return map
}

function inZone(zone: string, x: number, z: number): boolean {
  const b = worldSportsPassArea(zone)
  return b !== null && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

function sendToGym(room: GameRoom, match: Match, type: string, payload: unknown): void {
  const accounts = new Set(match.players.map((p) => p.accountId))
  const venue = venues.get(match.venue)
  if (!venue) throw new Error(`gym venue ${match.venue}: unknown`)
  room.forEachClient((c) => {
    const p = room.players.get(c.sessionId)
    if (p && (accounts.has(p.accountId) || inZone(venue.zone, p.x, p.z))) c.send(type, payload)
  })
}

function sessionOf(match: Match, accountId: number | null): string | null {
  return accountId === null ? null : match.players.find((p) => p.accountId === accountId)?.sessionId ?? null
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function stateView(match: Match, live: Live, now: number) {
  const { game } = live
  const b = game.ball
  return {
    venue: match.venue,
    sport: live.rules.sport,
    ball: [b.x, b.y, b.z, b.vx, b.vy, b.vz].map(round),
    owner: sessionOf(match, game.owner),
    score: { ...game.score },
    half: live.half,
    halves: live.halves,
    endsAt: match.startedAt + live.durationMs,
    restartTeam: game.restart?.team ?? null,
    fire: sessionOf(match, game.fire?.accountId ?? null),
    players: match.players.filter((p) => !p.out).map(({ sessionId, team }) => ({ sessionId, team })),
    serverNow: now
  }
}

function eventView(match: Match, event: GymEvent) {
  if (event.kind === 'score') {
    const scorer = event.scorer === null ? null : match.players.find((p) => p.accountId === event.scorer) ?? null
    return { venue: match.venue, kind: 'score', team: event.team, points: event.points, dunk: event.dunk, scorer: scorer?.name ?? null, sessionId: scorer?.sessionId ?? null }
  }
  if (event.kind === 'steal') return { venue: match.venue, kind: 'steal', won: event.won, sessionId: sessionOf(match, event.accountId), targetSessionId: sessionOf(match, event.target) }
  const { accountId, ...rest } = event
  return { venue: match.venue, ...rest, sessionId: sessionOf(match, accountId) }
}

function broadcastEvents(room: GameRoom, match: Match, events: readonly GymEvent[]): void {
  for (const event of events) sendToGym(room, match, 'gym_event', eventView(match, event))
}

function athletesOf(room: GameRoom, match: Match, live: Live, now: number): Athlete[] {
  const out: Athlete[] = []
  for (const p of match.players) {
    if (p.out || p.awaySince !== null || p.team === null) continue
    const player = sportsPlayer(room, p.sessionId)
    if (!player) continue
    const v: Motion = live.brains.get(p.accountId) ?? live.motion.track(player, now)
    out.push({ accountId: p.accountId, team: p.team, x: player.x, z: player.z, vx: v.vx, vz: v.vz, ry: player.ry })
  }
  return out
}

function halfAt(live: Live, elapsedMs: number): number {
  return Math.min(live.halves, Math.floor(elapsedMs / (live.durationMs / live.halves)) + 1)
}

function results(match: Match, live: Live, end: MatchEnd): MatchResult[] {
  const loser = end.reason === 'forfeit' ? end.loser : undefined
  return match.players.map((p) => ({
    accountId: p.accountId,
    team: p.team,
    result: p.out ? 'dnf' : outcomeFor(p.team as Team, live.game.score, loser),
    score: live.game.tallies.get(p.accountId) ?? 0
  }))
}

function taskRecord(match: Match, live: Live) {
  const feat = live.rules.sport === 'football' ? live.game.tallies : live.game.threes
  const key = live.rules.sport === 'football' ? 'goals' : 'threes'
  return {
    ref: match.id,
    sport: live.rules.sport,
    players: match.players.filter((p) => !p.out && !isRobot(p.accountId)).map((p) => ({ accountId: p.accountId, [key]: feat.get(p.accountId) ?? 0 }))
  }
}

async function recordWithTasks(room: GameRoom, match: Match, live: Live, end: MatchEnd): Promise<void> {
  await recordMatch(room, match, results(match, live, end))
  const record = taskRecord(match, live)
  if (record.players.length === 0) return
  const token = [...room.players.values()].find((p) => p.token && match.players.some((m) => m.accountId === p.accountId))?.token ?? null
  try {
    await callRealtimeBackend(token, '/sports/gym/tasks', 'POST', record)
  } catch (error) {
    console.warn(`[sports] gym tasks of match ${match.id} not counted:`, error instanceof Error ? error.message : error)
  }
}

function placeRobotsForKickoff(room: GameRoom, match: Match, live: Live): void {
  const { court } = live.game
  for (const team of TEAMS) {
    const robots = match.players.filter((p) => p.team === team && live.brains.has(p.accountId))
    robots.forEach((p, slot) => {
      const robot = sportsPlayer(room, p.sessionId)
      const at = kickoffSpot(court, team, slot, robots.length)
      if (robot) placeRobot(room, robot, at.x, court.floorY + EYE_HEIGHT, at.z, at.ry, match.startedAt)
    })
  }
}

function driveRobots(room: GameRoom, match: Match, live: Live, athletes: readonly Athlete[], now: number): void {
  for (const [accountId, brain] of live.brains) {
    const self = athletes.find((a) => a.accountId === accountId)
    const robot = self && sportsPlayer(room, sessionOf(match, accountId) ?? '')
    if (!self || !robot) continue
    const step = thinkGymRobot(brain, { game: live.game, rules: live.rules, self, athletes, now, random: Math.random })
    if (step.x !== robot.x || step.z !== robot.z || step.ry !== robot.ry) placeRobot(room, robot, step.x, robot.y, step.z, step.ry, now)
    Object.assign(self, { x: step.x, z: step.z, ry: step.ry, vx: brain.vx, vz: brain.vz })
    for (const act of step.acts) {
      const events = actGym(live.game, live.rules, self, athletes, act.kind, act.at, Math.random)
      lockIfDown(room, robot, live.game, events)
      broadcastEvents(room, match, events)
    }
  }
}

function winnerOf(live: Live, end: MatchEnd): Team | null {
  if (end.reason === 'forfeit') return end.loser === null ? null : end.loser === 'red' ? 'blue' : 'red'
  const { red, blue } = live.game.score
  return red === blue ? null : red > blue ? 'red' : 'blue'
}

export function registerGymVenue(spec: GymVenueSpec): void {
  if (spec.rules.sport === 'basketball' && !spec.court.baskets) throw new Error(`gym venue ${spec.id}: basketball needs a court with baskets`)
  venues.set(spec.id, { zone: spec.zone, playAreaId: spec.playAreaId })
  registerVenue({
    id: spec.id,
    sport: spec.rules.sport,
    zone: spec.zone,
    coach: spec.court.coach,
    playArea: spec.court.playArea,
    playAreaId: spec.playAreaId,
    confined: true,
    teams: true,
    settings: spec.settings,
    robots: spec.robots === true,
    players: (settings) => ({ min: spec.minPlayers, max: 2 * Number(settings.teamSize) }),
    rejoinGraceMs: spec.rejoinGraceMs,
    onKickoff(room, match) {
      const durationSec = Number(match.settings.durationSec)
      const live: Live = {
        game: newGymGame(spec.court, spec.rules, match.startedAt),
        rules: spec.rules,
        durationMs: durationSec * 1000,
        halves: halvesOf(spec.rules, durationSec),
        half: 1,
        lastAt: match.startedAt,
        motion: new MotionTracker(),
        brains: new Map(match.players.filter((p) => isRobot(p.accountId)).map((p) => [p.accountId, newGymRobotBrain(match.robots ?? 'normal', match.startedAt)]))
      }
      livesOf(room).set(match.venue, live)
      placeRobotsForKickoff(room, match, live)
      sendToGym(room, match, 'gym_state', stateView(match, live, match.startedAt))
    },
    onTick(room, match, elapsedMs) {
      const live = livesOf(room).get(match.venue)
      if (!live) throw new Error(`gym match ${match.id}: no live state`)
      const now = match.startedAt + elapsedMs
      if (elapsedMs >= live.durationMs) {
        endMatch(room, match.venue, { reason: 'finished' }, now)
        return
      }
      const half = halfAt(live, elapsedMs)
      if (half > live.half) {
        live.half = half
        restartHalf(live.game, live.rules, 'blue', now)
        sendToGym(room, match, 'gym_event', { venue: match.venue, kind: 'half', half, sessionId: null })
      }
      const athletes = athletesOf(room, match, live, now)
      driveRobots(room, match, live, athletes, now)
      const span = Math.min(MAX_TICK_S, Math.max(0, (now - live.lastAt) / 1000))
      live.lastAt = now
      const steps = Math.ceil(span / STEP_S)
      const events: GymEvent[] = []
      for (let i = 0; i < steps; i++) events.push(...stepGym(live.game, live.rules, athletes, span / steps, now))
      broadcastEvents(room, match, events)
      sendToGym(room, match, 'gym_state', stateView(match, live, now))
    },
    onLeave(room, match, accountId) {
      const live = livesOf(room).get(match.venue)
      if (live) dropOwner(live.game, accountId)
    },
    onEnd(room, match, end) {
      const live = livesOf(room).get(match.venue)
      if (!live) throw new Error(`gym match ${match.id}: no live state at the end`)
      livesOf(room).delete(match.venue)
      sendToGym(room, match, 'gym_end', { venue: match.venue, sport: spec.rules.sport, score: { ...live.game.score }, winner: winnerOf(live, end), reason: end.reason })
      void recordWithTasks(room, match, live, end)
    }
  })
}

function parseKind(payload: ClientPayload): GymActionKind | null {
  const kind = payload?.kind
  return typeof kind === 'string' && (GYM_ACTIONS as readonly string[]).includes(kind) ? kind as GymActionKind : null
}

function lockIfDown(room: GameRoom, player: Player, game: GymGame, events: readonly GymEvent[]): void {
  if (events.some((e) => e.kind === 'tackle' && !e.won && e.accountId === player.accountId)) player.sportsDownUntil = game.groundedUntil.get(player.accountId) ?? 0
  for (const event of events) {
    if (event.kind !== 'steal' || event.target === null) continue
    const shoved = [...room.players.values()].find((p) => p.accountId === event.target)
    if (shoved) shoved.sportsDownUntil = game.groundedUntil.get(shoved.accountId) ?? 0
  }
}

export function gymAreaBusy(room: GameRoom, playAreaId: string): boolean {
  return [...venues].some(([id, venue]) => venue.playAreaId === playAreaId && room.sports.matches.has(id))
}

export function onGymAction(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const kind = parseKind(payload)
  if (!player || !kind) return
  if (now - (lastActionAt.get(player.accountId) ?? -Infinity) < ACTION_GAP_MS && kind !== 'shot_release' && kind !== 'pass_release') return
  lastActionAt.set(player.accountId, now)
  for (const venue of venues.keys()) {
    const match = room.sports.matches.get(venue)
    const live = livesOf(room).get(venue)
    if (!match || !live) continue
    const athletes = athletesOf(room, match, live, now)
    const actor = athletes.find((a) => a.accountId === player.accountId && match.players.some((p) => p.accountId === a.accountId && p.sessionId === client.sessionId))
    if (!actor) continue
    const events = actGym(live.game, live.rules, actor, athletes, kind, now, Math.random)
    lockIfDown(room, player, live.game, events)
    broadcastEvents(room, match, events)
    return
  }
  const free = freeAction(room, player, kind, now)
  if (free) lockIfDown(room, player, free.game, free.events)
}

export function onGymBall(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  freeBall(room, client, payload, now)
}

export function onGymBallReturn(room: GameRoom, client: GameClient, now = Date.now()): void {
  freeBallReturn(room, client, now)
}

export function tickGym(room: GameRoom, now = Date.now()): void {
  tickGymFree(room, now)
}
