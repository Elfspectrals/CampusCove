import type { Bounds, ClientPayload, GameClient, GameRoom } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import {
  type FigureEvent,
  type FigureKey,
  type FigureRules,
  type FigureRun,
  type FigureSkater,
  advanceFigure,
  figureOver,
  figurePlaces,
  figurePosition,
  newFigureRun,
  pressFigure,
  releaseFigure
} from './figureSkating.ts'
import { type Match, type SettingSpec, activePlayers } from './signup.ts'
import { endMatch, registerVenue } from './venues.ts'

const PRESS_GAP_MS = 30
const KEYS: readonly FigureKey[] = ['jump', 'left', 'right', 'hold']

interface Routine {
  matchId: string
  venue: string
  run: FigureRun
  lastPressAt: Map<number, number>
}

const routines = new WeakMap<GameRoom, Routine>()
let rules: FigureRules | null = null
let zone = ''

function inside(area: Bounds, x: number, z: number): boolean {
  return x >= area.minX && x <= area.maxX && z >= area.minZ && z <= area.maxZ
}

function sendToRink(room: GameRoom, routine: Routine, type: string, payload: unknown): void {
  const area = worldSportsPassArea(zone)
  room.forEachClient((c) => {
    const listener = room.players.get(c.sessionId)
    const skating = routine.run.skaters.some((s) => s.sessionId === c.sessionId)
    if (listener && (skating || (area !== null && inside(area, listener.x, listener.z)))) c.send(type, payload)
  })
}

function place(room: GameRoom, skater: FigureSkater, routineMs: number, reason: string | null): void {
  const player = room.players.get(skater.sessionId)
  const client = room.clients.find((c) => c.sessionId === skater.sessionId)
  if (!player || !client || player.accountId !== skater.accountId) return
  const spot = figurePosition((rules as FigureRules).route, skater.lane, routineMs)
  player.x = spot.x
  player.z = spot.z
  player.ry = spot.ry
  if (reason) client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason })
  room.broadcastMove(client, player)
}

function stateView(routine: Routine, now: number) {
  return {
    venue: routine.venue,
    serverNow: now,
    startAt: routine.run.startAt,
    skaters: routine.run.skaters.map((s) => ({
      sessionId: s.sessionId,
      score: s.score,
      next: s.next,
      air: s.air,
      spinning: s.spin.presses > 0,
      holding: s.hold !== null,
      out: s.out
    }))
  }
}

function sendEvent(room: GameRoom, routine: Routine, skater: FigureSkater, event: FigureEvent): void {
  sendToRink(room, routine, 'figure_event', { venue: routine.venue, sessionId: skater.sessionId, score: skater.score, ...event })
}

function kickoff(room: GameRoom, match: Match): void {
  const r = rules as FigureRules
  const entrants = activePlayers(match).map(({ accountId, sessionId, name }) => ({ accountId, sessionId, name }))
  const routine: Routine = { matchId: match.id, venue: match.venue, run: newFigureRun(entrants, match.startedAt + r.countdownMs), lastPressAt: new Map() }
  routines.set(room, routine)
  for (const skater of routine.run.skaters) place(room, skater, 0, 'figure_start')
  sendToRink(room, routine, 'figure_start', {
    venue: match.venue,
    startAt: routine.run.startAt,
    serverNow: match.startedAt,
    skaters: routine.run.skaters.map(({ sessionId, name, lane }) => ({ sessionId, name, lane }))
  })
}

function tick(room: GameRoom, match: Match, elapsedMs: number): void {
  const routine = routines.get(room)
  if (!routine || routine.matchId !== match.id) return
  const r = rules as FigureRules
  const now = match.startedAt + elapsedMs
  for (const { skater, event } of advanceFigure(routine.run, now, r)) sendEvent(room, routine, skater, event)
  const routineMs = Math.max(0, now - routine.run.startAt)
  for (const skater of routine.run.skaters) if (!skater.out) place(room, skater, routineMs, null)
  sendToRink(room, routine, 'figure_state', stateView(routine, now))
  if (figureOver(routine.run, now, r)) endMatch(room, match.venue, { reason: 'finished' }, now)
}

function leave(room: GameRoom, match: Match, accountId: number): void {
  const routine = routines.get(room)
  const skater = routine?.matchId === match.id ? routine.run.skaters.find((s) => s.accountId === accountId) : undefined
  if (skater) skater.out = true
}

function end(room: GameRoom, match: Match): void {
  const routine = routines.get(room)
  if (!routine || routine.matchId !== match.id) return
  routines.delete(room)
  const places = figurePlaces(routine.run)
  sendToRink(room, routine, 'figure_end', {
    venue: match.venue,
    results: routine.run.skaters.map((s) => ({ sessionId: s.sessionId, name: s.name, score: s.score, place: places.get(s.accountId) ?? null, judged: s.judged }))
  })
}

function skaterFor(room: GameRoom, client: GameClient): { routine: Routine, skater: FigureSkater } | null {
  const player = room.players.get(client.sessionId)
  const routine = routines.get(room)
  const skater = player && routine ? routine.run.skaters.find((s) => s.accountId === player.accountId && s.sessionId === client.sessionId) : undefined
  return routine && skater ? { routine, skater } : null
}

export function onFigurePress(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const key = KEYS.find((k) => k === payload?.key)
  const found = key && rules ? skaterFor(room, client) : null
  if (!key || !rules || !found) return
  const { routine, skater } = found
  if (now - (routine.lastPressAt.get(skater.accountId) ?? -Infinity) < PRESS_GAP_MS) return
  routine.lastPressAt.set(skater.accountId, now)
  const event = pressFigure(routine.run, skater, key, now, rules)
  if (event) sendEvent(room, routine, skater, event)
}

export function onFigureRelease(room: GameRoom, client: GameClient, now = Date.now()): void {
  const found = rules ? skaterFor(room, client) : null
  if (!rules || !found) return
  const event = releaseFigure(found.routine.run, found.skater, now, rules)
  if (event) sendEvent(room, found.routine, found.skater, event)
}

export function registerFigureSkating(parsed: FigureRules, venue: string, venueZone: string, coach: { x: number, z: number }, rink: Bounds, playAreaId: string, gear: string, settings: readonly SettingSpec[]): void {
  const lanes = parsed.route.laneOffsetsM.length
  if (settings.length !== 1 || settings[0].key !== 'skaters' || settings[0].options.some((n) => typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > lanes)) {
    throw new Error(`figure skating rules: the only setting is skaters, from 1 to ${lanes}`)
  }
  rules = parsed
  zone = venueZone
  registerVenue({
    id: venue,
    sport: 'figure_skating',
    zone: venueZone,
    coach,
    playArea: rink,
    playAreaId,
    gear,
    teams: false,
    settings,
    players: (chosen) => ({ min: Number(chosen.skaters), max: Number(chosen.skaters) }),
    rejoinGraceMs: 0,
    onKickoff: kickoff,
    onTick: tick,
    onLeave: leave,
    onEnd: end
  })
}
