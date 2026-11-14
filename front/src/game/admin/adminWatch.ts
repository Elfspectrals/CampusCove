import type { AdminEvents, AdminMenuPayload, AdminMenuPlayer } from '../../types/gameRealtime.ts'

export type AdminPage =
  | { kind: 'home' }
  | { kind: 'players' }
  | { kind: 'player'; sessionId: string }
  | { kind: 'money'; sessionId: string }
  | { kind: 'item'; sessionId: string }
  | { kind: 'places' }
  | { kind: 'events' }
  | { kind: 'market' }

export const ADMIN_HOME: AdminPage = { kind: 'home' }

export const HOME_TILES = ['players', 'places', 'events', 'console'] as const
export type HomeTile = (typeof HOME_TILES)[number]
const HOME_COLUMNS = 2

export const MONEY_STEPS = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000] as const
export const QUICK_AMOUNTS = [100, 500, 1_000, 5_000] as const
export const MARKET_MINUTE_STEPS = [5, 10, 15, 30, 60, 120, 240] as const
export const HOLD_MS = 1_000

export type PlayerAction = 'goto' | 'bring' | 'money' | 'item'
export type EventRow = 'quiz' | 'storage' | 'market' | 'taxes'
export const EVENT_ROWS: readonly EventRow[] = ['quiz', 'storage', 'market', 'taxes']
export type MoneyRow = 'wallet' | 'amount' | 'give'
export const MONEY_ROWS: readonly MoneyRow[] = ['wallet', 'amount', 'give']
export type MarketRow = 'minutes' | 'open' | 'close'
export const MARKET_ROWS: readonly MarketRow[] = ['minutes', 'open', 'close']

export function parentPage(page: AdminPage): AdminPage | null {
  switch (page.kind) {
    case 'home':
      return null
    case 'player':
      return { kind: 'players' }
    case 'money':
    case 'item':
      return { kind: 'player', sessionId: page.sessionId }
    case 'market':
      return { kind: 'events' }
    default:
      return ADMIN_HOME
  }
}

export function playerActions(isMe: boolean): PlayerAction[] {
  return isMe ? ['money', 'item'] : ['goto', 'bring', 'money', 'item']
}

export function playersByDistance(players: readonly AdminMenuPlayer[]): AdminMenuPlayer[] {
  return [...players].sort((a, b) => a.distance - b.distance)
}

export function placesWithRecentFirst(destinations: AdminMenuPayload['destinations'], recentKey: string | null): AdminMenuPayload['destinations'] {
  const recent = destinations.find((d) => d.key === recentKey)
  return recent ? [recent, ...destinations.filter((d) => d !== recent)] : destinations
}

export function stepThrough(steps: readonly number[], value: number, direction: -1 | 1): number {
  if (direction === 1) return steps.find((s) => s > value) ?? steps[steps.length - 1]!
  return [...steps].reverse().find((s) => s < value) ?? steps[0]!
}

export function stepQuantity(quantity: number, direction: -1 | 1, max: number): number {
  return Math.min(Math.max(quantity + direction, 1), max)
}

export function moveOnHome(tile: number, key: 'up' | 'down' | 'left' | 'right'): number {
  const delta = { up: -HOME_COLUMNS, down: HOME_COLUMNS, left: -1, right: 1 }[key]
  const next = tile + delta
  return next >= 0 && next < HOME_TILES.length ? next : tile
}

export function isHoldRow(page: AdminPage, row: number): boolean {
  if (page.kind === 'events') return EVENT_ROWS[row] === 'taxes'
  if (page.kind === 'market') return MARKET_ROWS[row] === 'close'
  return false
}

export function editsSearch(key: string, query: string): boolean {
  if (key === 'Backspace') return query.length > 0
  return key.length === 1 && key !== ' '
}

export function typedQuery(query: string, key: string): string {
  return key === 'Backspace' ? query.slice(0, -1) : query + key
}

export type EventStatus =
  | { key: 'scheduled'; time: number }
  | { key: 'registration'; time: number }
  | { key: 'running' }
  | { key: 'box'; n: number; count: number }
  | { key: 'open'; time: string }
  | { key: 'closed'; time: string }
  | { key: 'unknown' }
  | { key: 'none' }

export function eventStatus(row: EventRow, events: AdminEvents): EventStatus {
  if (row === 'quiz') return events.quiz.state === 'running' ? { key: 'running' } : { key: events.quiz.state, time: events.quiz.startsAt }
  if (row === 'storage') return events.storage.state === 'running' ? { key: 'box', n: events.storage.index + 1, count: events.storage.count } : { key: 'scheduled', time: events.storage.startsAt }
  if (row === 'market') {
    if (!events.market) return { key: 'unknown' }
    return events.market.open ? { key: 'open', time: events.market.closesAt } : { key: 'closed', time: events.market.opensAt }
  }
  return { key: 'none' }
}

export function isLive(status: EventStatus): boolean {
  return status.key === 'running' || status.key === 'box' || status.key === 'open' || status.key === 'registration'
}
