import { broadcastAppearance } from '../police.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import {
  type Foot,
  type Race,
  type RunningRules,
  advanceRace,
  applyLook,
  applyStep,
  createRace,
  disqualify,
  raceOver,
  raceResults,
  runnerOf
} from './runningRace.ts'
import { type Match, type SignupRules, activePlayers } from './signup.ts'
import { type VenueSpec, endMatch, recordMatch } from './venues.ts'

export const RUNNING_VENUE = 'athletics_track'
export const RUNNING_COACH = 'athletics_coach'
export const RUNNING_ZONE = 'sports_athletics'
export const RUNNING_GEAR = 'gear_running_spikes'
export const ATHLETICS_FIELD = 'athletics_field'
export const RUNNING_SPIKES_WORN = { model: '/assets/wear/shoes/running_spikes/model.glb', hex: '#f4f2ec' }

interface LiveRace {
  race: Race
  rules: RunningRules
}

const races = new WeakMap<GameRoom, LiveRace>()

function clientOf(room: GameRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function listeners(room: GameRoom, race: Race): GameClient[] {
  const zone = worldSportsPassArea(RUNNING_ZONE)
  const accounts = new Set(race.runners.map((r) => r.accountId))
  const out: GameClient[] = []
  room.forEachClient((c) => {
    const p = room.players.get(c.sessionId)
    if (!p) return
    const near = zone !== null && p.x >= zone.minX && p.x <= zone.maxX && p.z >= zone.minZ && p.z <= zone.maxZ
    if (near || accounts.has(p.accountId)) out.push(c)
  })
  return out
}

function phaseOf(race: Race, now: number): 'marks' | 'set' | 'running' {
  if (now >= race.beepAt) return 'running'
  return now >= race.setAt ? 'set' : 'marks'
}

export function raceView(room: GameRoom, race: Race, now: number) {
  const gates = race.course.gates
  return {
    venue: RUNNING_VENUE,
    distanceM: race.course.distanceM,
    laps: race.course.laps,
    gateCount: gates.length,
    phase: phaseOf(race, now),
    beepAt: now >= race.beepAt ? race.beepAt : null,
    endsAt: now >= race.beepAt ? race.endsAt : null,
    serverNow: now,
    goodStepMs: race.stride.goodStepMs,
    toleranceMs: race.stride.toleranceMs,
    runners: race.runners.map((r) => {
      const next = gates[r.nextGate]
      return {
        sessionId: r.sessionId,
        name: room.players.get(r.sessionId)?.pseudo ?? '',
        lane: r.lane + 1,
        x: r.x,
        z: r.z,
        ry: r.ry,
        speed: r.speed,
        quality: r.quality,
        lastStepAt: r.lastStepAt,
        state: r.state,
        gate: r.nextGate,
        lap: next ? next.lap + 1 : race.course.laps,
        next: next && (r.state === 'set' || r.state === 'running') ? { x: next.x, z: next.z } : null,
        timeMs: r.timeMs,
        dnf: r.dnf
      }
    })
  }
}

function broadcast(room: GameRoom, race: Race, type: string, payload: unknown): void {
  for (const c of listeners(room, race)) c.send(type, payload)
}

function wearSpikes(room: GameRoom, sessionId: string, on: boolean): void {
  const player = room.players.get(sessionId)
  if (!player || (player.sportsWear.shoes !== undefined) === on) return
  if (on) player.sportsWear.shoes = RUNNING_SPIKES_WORN
  else delete player.sportsWear.shoes
  broadcastAppearance(room, player)
}

function placeRunners(room: GameRoom, race: Race, correct: boolean): void {
  for (const r of race.runners) {
    const player = room.players.get(r.sessionId)
    const client = clientOf(room, r.sessionId)
    if (!player || !client) continue
    player.x = r.x
    player.z = r.z
    player.ry = r.ry
    if (correct) client.send('position_correction', { x: player.x, y: player.y, z: player.z, reason: 'race_start' })
    room.broadcastMove(client, player)
  }
}

export function runningVenue(rules: RunningRules, signup: SignupRules, random: () => number = Math.random): VenueSpec {
  return {
    id: RUNNING_VENUE,
    sport: 'running',
    zone: RUNNING_ZONE,
    coach: rules.coach,
    playArea: rules.playArea,
    playAreaId: ATHLETICS_FIELD,
    teams: signup.teams,
    settings: signup.settings,
    players: () => ({ min: 1, max: rules.maxPlayers }),
    rejoinGraceMs: 0,
    gear: RUNNING_GEAR,
    onKickoff(room: GameRoom, match: Match) {
      const now = match.startedAt
      const runners = activePlayers(match).filter((p) => p.awaySince === null)
      const race = createRace(rules, Number(match.settings.distanceM), runners, now, random)
      races.set(room, { race, rules })
      for (const r of race.runners) wearSpikes(room, r.sessionId, true)
      placeRunners(room, race, true)
      broadcast(room, race, 'sports_run_state', raceView(room, race, now))
    },
    onTick(room: GameRoom, match: Match, elapsedMs: number) {
      const race = races.get(room)?.race
      if (!race) return
      const now = match.startedAt + elapsedMs
      for (const r of race.runners) {
        const player = room.players.get(r.sessionId)
        if (player && now < player.knockedOutUntil) disqualify(r, 'knocked_out')
      }
      advanceRace(rules, race, now)
      placeRunners(room, race, false)
      broadcast(room, race, 'sports_run_state', raceView(room, race, now))
      if (raceOver(race)) endMatch(room, RUNNING_VENUE, { reason: 'finished' }, now)
    },
    onLeave(room: GameRoom, _match: Match, accountId: number) {
      const race = races.get(room)?.race
      const runner = race && runnerOf(race, accountId)
      if (!runner) return
      disqualify(runner, 'left')
      wearSpikes(room, runner.sessionId, false)
    },
    onEnd(room: GameRoom, match: Match) {
      const race = races.get(room)?.race
      if (!race) return
      races.delete(room)
      for (const r of race.runners) {
        disqualify(r, 'left')
        wearSpikes(room, r.sessionId, false)
      }
      const results = raceResults(race)
      broadcast(room, race, 'sports_run_result', { venue: RUNNING_VENUE, distanceM: race.course.distanceM, results: results.map((res) => {
        const runner = race.runners.find((r) => r.accountId === res.accountId)
        return { sessionId: runner?.sessionId ?? '', name: room.players.get(runner?.sessionId ?? '')?.pseudo ?? '', ...res, dnf: runner?.dnf ?? null }
      }) })
      void recordMatch(room, match, results.map((res) => ({ ...res, team: null })), race.simAt)
    }
  }
}

export function isRacing(room: GameRoom, player: Player): boolean {
  const race = races.get(room)?.race
  const runner = race ? runnerOf(race, player.accountId) : null
  return runner !== null && (runner.state === 'set' || runner.state === 'running')
}

function parseFoot(raw: unknown): Foot | null {
  return raw === 'left' || raw === 'right' ? raw : null
}

export function onRunStep(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  const live = races.get(room)
  const foot = parseFoot(payload?.foot)
  if (!player || !live || !foot) return
  const runner = runnerOf(live.race, player.accountId)
  if (runner && runner.sessionId === client.sessionId) applyStep(live.rules, live.race, runner, foot, now)
}

export function onRunLook(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  const player = room.players.get(client.sessionId)
  const race = races.get(room)?.race
  const ry = payload?.ry
  if (!player || !race || typeof ry !== 'number' || !Number.isFinite(ry)) return
  const runner = runnerOf(race, player.accountId)
  if (runner && runner.sessionId === client.sessionId) applyLook(runner, Math.atan2(Math.sin(ry), Math.cos(ry)))
}
