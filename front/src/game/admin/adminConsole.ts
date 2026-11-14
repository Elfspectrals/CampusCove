// Small rules of the admin console (GameAdminPanel.vue): quick amounts, held actions, places and event states.
import type { AdminEvents, AdminMenuPayload } from '../../types/gameRealtime.ts'

export const QUICK_AMOUNTS = [100, 500, 1_000, 5_000] as const
/** An action that cannot be undone in one click (taxes, closing the market, a house, a kick) is held this long. */
export const HOLD_MS = 1_000

export type EventRow = 'quiz' | 'storage' | 'market' | 'taxes'
export const EVENT_ROWS: readonly EventRow[] = ['quiz', 'storage', 'market', 'taxes']

export function placesWithRecentFirst(destinations: AdminMenuPayload['destinations'], recentKey: string | null): AdminMenuPayload['destinations'] {
  const recent = destinations.find((d) => d.key === recentKey)
  return recent ? [recent, ...destinations.filter((d) => d !== recent)] : destinations
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
