import type { Client } from 'colyseus'
import type { GameClient, GameRoom, Player } from '../types.ts'

export const MANIFEST_URL = 'http://world.test/world.manifest.json'
export const API = 'http://localhost:8000/api'

export const SITE = { minX: -400, maxX: -300, minZ: -200, maxZ: -100 }
export const GYM = { minX: -380, maxX: -360, minZ: -180, maxZ: -160 }
export const COURT = { minX: -378, maxX: -362, minZ: -178, maxZ: -162 }
export const DESK = { x: -410, y: 0, z: -145 }

export const manifest = {
  spawn: [0, 1.6, 13],
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  zones: [
    { key: 'sports_reception', bounds: { minX: -420, maxX: -405, minZ: -150, maxZ: -140 } },
    { key: 'sports_complex', sportsPass: true, bounds: SITE },
    { key: 'sports_gym', sportsPass: true, bounds: GYM },
    { key: 'sports_road', sportsPass: false, bounds: { minX: -430, maxX: -401, minZ: -152, maxZ: -140 } }
  ]
}

export interface ApiCall {
  url: string
  method: string
  body: unknown
}

export const api = {
  calls: [] as ApiCall[],
  replies: new Map<string, () => Response>(),
  files: new Map<string, unknown>([
    ['zones/index.json', { zones: ['sports_reception'] }],
    ['zones/sports_reception.json', { props: [{ id: 'clerk', kind: 'npc', sportsPassDesk: true, position: [DESK.x, DESK.y, DESK.z] }] }]
  ])
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

export function installWorld(): void {
  process.env.WORLD_MANIFEST_URL = MANIFEST_URL
  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url === MANIFEST_URL) return json(manifest)
    const file = [...api.files].find(([path]) => url === new URL(path, MANIFEST_URL).href)
    if (file) return json(file[1])
    if (url.startsWith(API)) {
      const path = url.slice(API.length)
      const method = init?.method ?? 'GET'
      api.calls.push({ url: path, method, body: init?.body ? JSON.parse(String(init.body)) : null })
      const reply = api.replies.get(`${method} ${path}`)
      if (reply) return reply()
    }
    return json({ message: `unexpected ${url}` }, 404)
  }
}

export interface FakeClient extends GameClient {
  sent: { type: string, payload: unknown }[]
}

export function fakeClient(sessionId: string): FakeClient {
  const sent: { type: string, payload: unknown }[] = []
  return { sessionId, sent, send: (type, payload) => void sent.push({ type, payload }) }
}

export function sentOf(client: FakeClient, type: string): unknown[] {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

export async function makePlayer(accountId: number, x: number, z: number): Promise<Player> {
  const { createPlayer } = await import('../players.ts')
  const client = { sessionId: `s${accountId}`, auth: { accountId, pseudo: `P${accountId}`, token: `t${accountId}`, badges: [] } } as unknown as Client
  const player = createPlayer(client, {}, 0, { x, y: 1.6, z })
  player.lastMoveAt = 0
  return player
}

export type FakeRoom = GameRoom & { clients: FakeClient[], moves: string[] }

export async function fakeRoom(players: Player[]): Promise<FakeRoom> {
  const { newSportsState } = await import('./venues.ts')
  const clients = players.map((p) => fakeClient(p.sessionId))
  const moves: string[] = []
  const room = {
    roomId: 'room-1',
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients,
    moves,
    housingUnits: [],
    openDoors: new Set<string>(),
    sports: newSportsState(),
    forEachClient(callback: (client: GameClient) => void, except?: GameClient) {
      for (const c of clients) if (c.sessionId !== except?.sessionId && room.players.has(c.sessionId)) callback(c)
    },
    broadcastMove: (client: GameClient) => void moves.push(client.sessionId)
  }
  return room as unknown as FakeRoom
}

export function clientOf(room: FakeRoom, player: Player): FakeClient {
  return room.clients.find((c) => c.sessionId === player.sessionId) as FakeClient
}
