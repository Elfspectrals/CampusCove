import { hasPower } from '../adminPowers.ts'
import { hurt } from '../survival.ts'
import type { Bounds, GameRoom, Player } from '../types.ts'
import { worldSportsPassArea } from '../world.ts'
import { ownedGear } from './gear.ts'
import {
  type Breath,
  type SwimPool,
  type SwimRejection,
  isSwimming,
  isUnderwater,
  newBreath,
  rescueDamage,
  rescuePoint,
  stepBreath,
  swimRejection
} from './poolSwim.ts'

export const SWIMSUIT = 'gear_swimsuit'
export const POOL_BREATH_TICK_MS = 250

let pool: SwimPool | null = null
let poolZone: string | null = null
const swimsuits = new WeakMap<Player, boolean | 'pending'>()
const breaths = new WeakMap<Player, Breath>()

export function configurePoolWater(swimPool: SwimPool, zone: string): void {
  pool = swimPool
  poolZone = zone
}

function inside(b: Bounds, x: number, z: number): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

export function inPoolWater(x: number, z: number): boolean {
  return pool !== null && pool.water.some((b) => inside(b, x, z))
}

function checkSwimsuit(player: Player): void {
  if (!player.token) {
    swimsuits.set(player, false)
    return
  }
  swimsuits.set(player, 'pending')
  ownedGear(player).then(
    (gear) => {
      if (swimsuits.get(player) === 'pending') swimsuits.set(player, gear.includes(SWIMSUIT))
    },
    (error: unknown) => {
      if (swimsuits.get(player) === 'pending') swimsuits.delete(player)
      console.warn('[sports] swimsuit check failed:', error instanceof Error ? error.message : error)
    }
  )
}

function refreshSwimsuit(player: Player): void {
  const zone = poolZone === null ? null : worldSportsPassArea(poolZone)
  if (!zone || !inside(zone, player.x, player.z)) swimsuits.delete(player)
  else if (!swimsuits.has(player)) checkSwimsuit(player)
}

export function entersPoolWaterWithoutSwimsuit(player: Player, x: number, z: number): boolean {
  if (pool === null) return false
  refreshSwimsuit(player)
  if (!inPoolWater(x, z) || inPoolWater(player.x, player.z)) return false
  return swimsuits.get(player) !== true
}

export function poolSwimRejection(player: Player, x: number, y: number, z: number, elapsedS: number, speedScale: number): SwimRejection | null {
  return pool === null ? null : swimRejection(pool, player, { x, y, z }, elapsedS, speedScale)
}

export function swimmingInPool(player: Player): boolean {
  return pool !== null && isSwimming(pool, player.x, player.y, player.z)
}

function rescue(room: GameRoom, player: Player, now: number): void {
  if (pool === null) return
  const point = rescuePoint(pool, player.x, player.z)
  if (!point) return
  Object.assign(player, { ...point, ry: Math.PI, fallPeakY: point.y, lastMoveAt: now })
  const client = room.clients.find((c) => c.sessionId === player.sessionId)
  if (!client) return
  client.send('teleported', { ...point, ry: Math.PI })
  room.broadcastMove(client, player)
  if (player.stats) hurt(room, client, player, rescueDamage(pool, player.stats.health), 'drown')
  client.send('pool_rescued', {})
}

export function tickPoolBreath(room: GameRoom, now: number): void {
  if (pool === null) return
  const maxMs = pool.breath.maxMs
  for (const player of room.players.values()) {
    const underwater = isUnderwater(pool, player.x, player.y, player.z) && now >= player.knockedOutUntil && !hasPower(player, 'fly')
    let breath = breaths.get(player)
    if (!breath) {
      if (!underwater) continue
      breath = newBreath(pool, now)
      breaths.set(player, breath)
    }
    stepBreath(pool, breath, underwater, now)
    if (underwater && breath.ms === 0) {
      rescue(room, player, now)
      breath.underwater = false
    }
    room.clients.find((c) => c.sessionId === player.sessionId)?.send('pool_breath', { breathMs: Math.round(breath.ms), maxMs, underwater: breath.underwater })
    if (!breath.underwater && breath.ms >= maxMs) breaths.delete(player)
  }
}
