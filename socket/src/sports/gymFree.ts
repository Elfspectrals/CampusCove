import type { ClientPayload, GameClient, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import type { GymCourt } from './gymCourt.ts'
import { type Athlete, type GymActionKind, type GymEvent, type GymGame, actGym, newGymGame, stepGym } from './gymMatch.ts'
import { MotionTracker } from './gymMotion.ts'
import type { GymRules } from './gymRules.ts'
import { hasLoan, lend, takeBack } from './loans.ts'
import { SPORTS_COACH_REACH } from './sportsConstants.ts'

export type GymSport = 'football' | 'basketball'
export const GYM_BALL_LOAN = 'gym_ball'
const GYM_SPORTS: readonly GymSport[] = ['football', 'basketball']
const STEP_S = 1 / 60
const MAX_TICK_S = 0.5
const FREE_REACH = 2
const BALL_SPAWN_IN = 1.2

interface FreeBall {
  sport: GymSport
  game: GymGame
  court: GymFreeCourt
}

interface FreeRoom {
  balls: Map<number, FreeBall>
  motion: MotionTracker
  lastAt: number | null
}

export interface GymFreeCourt {
  id: string
  court: GymCourt
  rules: Partial<Record<GymSport, GymRules>>
  zone: string
  busy: (room: GameRoom) => boolean
}

const courts = new Map<string, GymFreeCourt>()
const rooms = new WeakMap<GameRoom, FreeRoom>()

export function addGymFreeCourt(court: GymFreeCourt): void {
  if (courts.has(court.id)) throw new Error(`gym free play: duplicate court ${court.id}`)
  courts.set(court.id, court)
}

function rulesOf(ball: FreeBall): GymRules {
  const rules = ball.court.rules[ball.sport]
  if (!rules) throw new Error(`gym free play: ${ball.court.id} has no ${ball.sport}`)
  return rules
}

function roomOf(room: GameRoom): FreeRoom {
  let free = rooms.get(room)
  if (!free) {
    free = { balls: new Map(), motion: new MotionTracker(), lastAt: null }
    rooms.set(room, free)
  }
  return free
}

function inside(player: Player, court: GymCourt): boolean {
  const a = court.arena
  return player.x >= a.minX && player.x <= a.maxX && player.z >= a.minZ && player.z <= a.maxZ
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}

function sessionOf(room: GameRoom, accountId: number | null): string | null {
  if (accountId === null) return null
  for (const p of room.players.values()) if (p.accountId === accountId) return p.sessionId
  return null
}

function inGymZone(player: Player): boolean {
  return [...courts.values()].some((c) => {
    const b = worldSportsPassArea(c.zone)
    return b !== null && player.x >= b.minX && player.x <= b.maxX && player.z >= b.minZ && player.z <= b.maxZ
  })
}

function sendToGymZone(room: GameRoom, type: string, payload: unknown): void {
  room.forEachClient((c) => {
    const p = room.players.get(c.sessionId)
    if (p && inGymZone(p)) c.send(type, payload)
  })
}

function freeView(room: GameRoom, free: FreeRoom, now: number) {
  return {
    balls: [...free.balls.entries()].map(([lender, b]) => ({
      id: String(lender),
      court: b.court.id,
      sport: b.sport,
      lender: sessionOf(room, lender),
      ball: [b.game.ball.x, b.game.ball.y, b.game.ball.z, b.game.ball.vx, b.game.ball.vy, b.game.ball.vz].map(round),
      owner: sessionOf(room, b.game.owner)
    })),
    serverNow: now
  }
}

function eventView(room: GameRoom, event: GymEvent) {
  if (event.kind === 'score') throw new Error('gym free play: a free ball never scores')
  const { accountId, ...rest } = event
  return { venue: 'gym_free', ...rest, sessionId: sessionOf(room, accountId) }
}

function athletes(room: GameRoom, free: FreeRoom, now: number, court: GymCourt): Athlete[] {
  const out: Athlete[] = []
  for (const p of room.players.values()) {
    if (!inside(p, court)) continue
    const v = free.motion.track(p, now)
    out.push({ accountId: p.accountId, team: null, x: p.x, z: p.z, vx: v.vx, vz: v.vz, ry: p.ry })
  }
  return out
}

function removeBall(room: GameRoom, free: FreeRoom, lender: number): void {
  free.balls.delete(lender)
  for (const p of room.players.values()) if (p.accountId === lender) takeBack(room, p, GYM_BALL_LOAN)
}

function parseSport(payload: ClientPayload): GymSport | null {
  const sport = payload?.sport
  return typeof sport === 'string' && (GYM_SPORTS as readonly string[]).includes(sport) ? sport as GymSport : null
}

function nearCoach(player: Player, court: GymCourt): boolean {
  return Math.hypot(player.x - court.coach.x, player.z - court.coach.z) <= SPORTS_COACH_REACH
}

function spawnSpot(court: GymCourt): { x: number, z: number } {
  const a = court.arena
  return {
    x: Math.min(a.maxX - BALL_SPAWN_IN, Math.max(a.minX + BALL_SPAWN_IN, court.coach.x)),
    z: Math.min(a.maxZ - BALL_SPAWN_IN, Math.max(a.minZ + BALL_SPAWN_IN, court.coach.z))
  }
}

export function onGymBall(room: GameRoom, client: GameClient, payload: ClientPayload, now: number): void {
  const player = room.players.get(client.sessionId)
  const sport = parseSport(payload)
  if (!player || !sport) return
  const free = [...courts.values()].find((c) => nearCoach(player, c.court))
  if (!free) {
    client.send('gym_error', { code: 'gym_too_far', message: 'Walk up to the coach.' })
    return
  }
  const rules = free.rules[sport]
  if (!rules) {
    client.send('gym_error', { code: 'gym_no_sport', message: 'This coach has no ball for that sport.' })
    return
  }
  if (free.busy(room)) {
    client.send('gym_error', { code: 'gym_court_busy', message: 'A match is on. Come back after it.' })
    return
  }
  const state = roomOf(room)
  removeBall(room, state, player.accountId)
  if (!lend(room, player, GYM_BALL_LOAN, free.zone)) return
  state.balls.set(player.accountId, { sport, court: free, game: newGymGame(free.court, rules, now, 'free', spawnSpot(free.court)) })
  sendToGymZone(room, 'gym_free', freeView(room, state, now))
}

export function onGymBallReturn(room: GameRoom, client: GameClient, now: number): void {
  const player = room.players.get(client.sessionId)
  const free = rooms.get(room)
  if (!player || !free?.balls.has(player.accountId)) return
  removeBall(room, free, player.accountId)
  sendToGymZone(room, 'gym_free', freeView(room, free, now))
}

function ballFor(free: FreeRoom, actor: Athlete): FreeBall | null {
  let best: { ball: FreeBall, d: number } | null = null
  for (const ball of free.balls.values()) {
    if (ball.game.owner === actor.accountId) return ball
    if (ball.game.owner !== null) continue
    const d = Math.hypot(ball.game.ball.x - actor.x, ball.game.ball.z - actor.z)
    if (d <= FREE_REACH && (!best || d < best.d)) best = { ball, d }
  }
  return best?.ball ?? null
}

export function freeAction(room: GameRoom, player: Player, kind: GymActionKind, now: number): { game: GymGame, events: GymEvent[] } | null {
  const free = rooms.get(room)
  if (!free || free.balls.size === 0) return null
  const all = [...courts.values()].flatMap((c) => athletes(room, free, now, c.court))
  const actor = all.find((a) => a.accountId === player.accountId)
  if (!actor) return null
  const ball = ballFor(free, actor)
  if (!ball) return null
  const events = actGym(ball.game, rulesOf(ball), actor, all, kind, now, Math.random)
  for (const event of events) sendToGymZone(room, 'gym_event', eventView(room, event))
  return { game: ball.game, events }
}

export function tickGymFree(room: GameRoom, now: number): void {
  const free = rooms.get(room)
  if (!free || free.balls.size === 0) {
    if (free) free.lastAt = null
    return
  }
  const before = free.balls.size
  for (const lender of [...free.balls.keys()]) {
    const holder = [...room.players.values()].find((p) => p.accountId === lender)
    const ball = free.balls.get(lender) as FreeBall
    if (ball.court.busy(room) || !holder || !hasLoan(holder, GYM_BALL_LOAN)) removeBall(room, free, lender)
  }
  const span = free.lastAt === null ? 0 : Math.min(MAX_TICK_S, Math.max(0, (now - free.lastAt) / 1000))
  free.lastAt = now
  const steps = Math.ceil(span / STEP_S)
  const byCourt = new Map([...courts.values()].map((c) => [c.id, athletes(room, free, now, c.court)]))
  for (const ball of free.balls.values()) {
    const others = new Set([...free.balls.values()].filter((b) => b !== ball && b.game.owner !== null).map((b) => b.game.owner))
    const players = (byCourt.get(ball.court.id) ?? []).filter((a) => !others.has(a.accountId))
    for (let i = 0; i < steps; i++) stepGym(ball.game, rulesOf(ball), players, span / steps, now)
  }
  if (free.balls.size > 0 || before > 0) sendToGymZone(room, 'gym_free', freeView(room, free, now))
}
