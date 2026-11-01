// Admin tools on the watch: teleport to a public place, or bring a player next to you. Only accounts the API
// flags is_admin (GET /user at join) get an answer; everyone else is ignored.
import { leavePub } from './pubGames.ts'
import { type TradeRoom, checkTradeDistance } from './trade.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { type TeleportDestination, teleportDestinations } from './world.ts'

/** A summoned player lands this far in front of the admin, facing them. */
export const SUMMON_DISTANCE = 1.5
const ADMIN_ACTION_COOLDOWN_MS = 500

export type AdminRoom = GameRoom & TradeRoom

type Destinations = () => TeleportDestination[]

function adminOf(room: AdminRoom, client: GameClient): Player | null {
  const player = room.players.get(client.sessionId)
  return player?.isAdmin ? player : null
}

function sendError(client: GameClient, message: string): void {
  client.send('admin_error', { message })
}

/** Moves a player server-side and tells everyone: the player snaps there, the others see them jump (no glide). */
export function teleportPlayer(room: AdminRoom, player: Player, to: Vec3, yaw: number, now = Date.now()): void {
  leavePub(room, player)
  Object.assign(player, { x: to.x, y: to.y, z: to.z, ry: yaw, fallPeakY: to.y, lastMoveAt: now })
  const client = room.clients.find((c) => c.sessionId === player.sessionId)
  if (!client) return
  client.send('teleported', { x: to.x, y: to.y, z: to.z, ry: yaw })
  room.broadcastMove(client, player)
  checkTradeDistance(room, player)
}

/** 'admin_open': the places and the players the watch's admin app lists. */
export function onAdminOpen(room: AdminRoom, client: GameClient, destinations: Destinations = teleportDestinations): void {
  const admin = adminOf(room, client)
  if (!admin) return
  const players = [...room.players.values()]
    .filter((p) => p.sessionId !== admin.sessionId)
    .map((p) => ({ sessionId: p.sessionId, pseudo: p.pseudo, distance: Math.hypot(p.x - admin.x, p.z - admin.z) }))
    .sort((a, b) => a.pseudo.localeCompare(b.pseudo))
  client.send('admin_menu', { destinations: destinations().map(({ key, name }) => ({ key, name })), players })
}

function coolingDown(admin: Player, now: number): boolean {
  if (now - admin.lastAdminActionAt < ADMIN_ACTION_COOLDOWN_MS) return true
  admin.lastAdminActionAt = now
  return false
}

/** 'admin_teleport' { key }: the admin goes to one of the listed places. */
export function onAdminTeleport(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), destinations: Destinations = teleportDestinations): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const key = typeof payload?.key === 'string' ? payload.key : null
  const destination = destinations().find((d) => d.key === key)
  if (!destination) {
    sendError(client, 'Unknown place.')
    return
  }
  teleportPlayer(room, admin, destination.position, destination.yaw, now)
}

/** 'admin_summon' { sessionId }: the player appears in front of the admin, facing them. */
export function onAdminSummon(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const targetId = typeof payload?.sessionId === 'string' ? payload.sessionId : null
  const target = targetId ? room.players.get(targetId) : undefined
  if (!target || target.sessionId === admin.sessionId) {
    sendError(client, 'This player is no longer here.')
    return
  }
  // a knocked-out or bedridden player is held by the clinic; moving them would fight the recovery
  if (now < target.knockedOutUntil || target.clinicBedId) {
    sendError(client, `${target.pseudo} is at the clinic right now.`)
    return
  }
  const to = {
    x: admin.x - Math.sin(admin.ry) * SUMMON_DISTANCE,
    y: admin.y,
    z: admin.z - Math.cos(admin.ry) * SUMMON_DISTANCE
  }
  teleportPlayer(room, target, to, admin.ry + Math.PI, now)
  const targetClient = room.clients.find((c) => c.sessionId === target.sessionId)
  targetClient?.send('admin_summoned', { byPseudo: admin.pseudo })
}
