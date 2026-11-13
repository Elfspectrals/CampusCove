// Admin tools on the watch: teleport to a public place, or bring a player next to you. Only accounts the API
// flags is_admin (GET /user at join) get an answer; everyone else is ignored.
import { randomUUID } from 'node:crypto'
import { callRealtimeBackend, errorPayload, parseAccountId } from './backend.ts'
import { intIn, refreshMarket } from './market.ts'
import { leavePub } from './pubGames.ts'
import { startQuizSoon } from './pubQuizEvent.ts'
import { type TradeRoom, checkTradeDistance } from './trade.ts'
import type { ClientPayload, GameClient, GameRoom, Player, Vec3 } from './types.ts'
import { type TeleportDestination, teleportDestinations } from './world.ts'

/** A summoned player lands this far in front of the admin, facing them. */
export const SUMMON_DISTANCE = 1.5
const ADMIN_ACTION_COOLDOWN_MS = 500
export const ADMIN_MAX_MONEY = 100_000
export const ADMIN_MAX_QUANTITY = 999
export const ADMIN_MAX_MARKET_MINUTES = 240
const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/
const WALLETS = ['cash', 'bank'] as const
type AdminAction = 'items' | 'money' | 'item' | 'market_open' | 'market_close' | 'taxes'

export type AdminRoom = GameRoom & TradeRoom
export type AdminPanelRoom = AdminRoom & { pollHousingUnits(): Promise<void> }

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

export function onAdminQuizStart(room: AdminRoom, client: GameClient, now = Date.now()): void {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  startQuizSoon(room, now)
}

function sendFailure(client: GameClient, action: AdminAction, error: unknown, fallback: string): void {
  console.warn(`[admin] ${action} failed:`, error instanceof Error ? error.message : error)
  client.send('admin_result', { action, ok: false, message: errorPayload(error, fallback, 'admin_failed').message })
}

function refuse(client: GameClient, action: AdminAction, message: string): void {
  client.send('admin_result', { action, ok: false, message })
}

function grantTarget(room: AdminRoom, payload: ClientPayload): { player: Player, accountId: number } | null {
  const sessionId = typeof payload?.sessionId === 'string' ? payload.sessionId : null
  const player = sessionId ? room.players.get(sessionId) : undefined
  const accountId = parseAccountId(player?.accountId)
  return player && accountId !== null ? { player, accountId } : null
}

function clientOf(room: AdminRoom, player: Player): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === player.sessionId)
}

export async function onAdminItems(room: AdminRoom, client: GameClient, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  try {
    const data = await callRealtimeBackend(admin.token, '/admin/game/items', 'GET')
    client.send('admin_items', { items: Array.isArray(data?.items) ? data.items : [] })
  } catch (error) {
    sendFailure(client, 'items', error, 'Could not load the items.')
  }
}

export async function onAdminGiveMoney(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const wallet = WALLETS.find((w) => w === payload?.wallet) ?? null
  const amount = intIn(payload?.amount, 1, ADMIN_MAX_MONEY)
  if (wallet === null || amount === null) return refuse(client, 'money', 'This amount is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'money', 'This player is no longer here.')
  const ref = newRef()
  try {
    const balances = await callRealtimeBackend(admin.token, '/admin/game/money', 'POST', { account_id: target.accountId, wallet, amount, ref })
    client.send('admin_result', { action: 'money', ok: true, pseudo: target.player.pseudo, wallet, amount })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'money', byPseudo: admin.pseudo, wallet, amount, cash: balances.cash, bank: balances.bank })
  } catch (error) {
    sendFailure(client, 'money', error, 'Could not give the money.')
  }
}

export async function onAdminGiveItem(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now(), newRef: () => string = randomUUID): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  const code = typeof payload?.code === 'string' && ITEM_CODE.test(payload.code) ? payload.code : null
  const quantity = intIn(payload?.quantity, 1, ADMIN_MAX_QUANTITY)
  if (code === null || quantity === null) return refuse(client, 'item', 'This item or quantity is not valid.')
  const target = grantTarget(room, payload)
  if (!target) return refuse(client, 'item', 'This player is no longer here.')
  const ref = newRef()
  try {
    await callRealtimeBackend(admin.token, '/admin/game/items', 'POST', { account_id: target.accountId, code, quantity, ref })
    client.send('admin_result', { action: 'item', ok: true, pseudo: target.player.pseudo, code, quantity })
    clientOf(room, target.player)?.send('admin_granted', { kind: 'item', byPseudo: admin.pseudo, code, quantity })
  } catch (error) {
    sendFailure(client, 'item', error, 'Could not give the item.')
  }
}

export async function onAdminMarket(room: AdminRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin?.token || coolingDown(admin, now)) return
  if (payload?.action === 'open') {
    const minutes = intIn(payload.minutes, 1, ADMIN_MAX_MARKET_MINUTES)
    if (minutes === null) return refuse(client, 'market_open', 'Choose between 1 and 240 minutes.')
    try {
      const market = await callRealtimeBackend(admin.token, '/admin/game/market/open', 'POST', { minutes })
      client.send('admin_result', { action: 'market_open', ok: true, closesAt: market.closes_at })
    } catch (error) {
      return sendFailure(client, 'market_open', error, 'Could not open the market.')
    }
  } else if (payload?.action === 'close') {
    try {
      const closed = await callRealtimeBackend(admin.token, '/admin/game/market/close', 'POST')
      client.send('admin_result', { action: 'market_close', ok: true, returned: closed.returned })
    } catch (error) {
      return sendFailure(client, 'market_close', error, 'Could not close the market.')
    }
  } else {
    return
  }
  await refreshMarket(room, admin.token)
}

export async function onAdminTaxes(room: AdminPanelRoom, client: GameClient, now = Date.now()): Promise<void> {
  const admin = adminOf(room, client)
  if (!admin || coolingDown(admin, now)) return
  try {
    const summary = await callRealtimeBackend(admin.token, '/admin/game/taxes/collect', 'POST')
    client.send('admin_result', { action: 'taxes', ok: true, charged: summary.charged, seized: summary.seized })
  } catch (error) {
    return sendFailure(client, 'taxes', error, 'Could not collect the taxes.')
  }
  await room.pollHousingUnits()
}
