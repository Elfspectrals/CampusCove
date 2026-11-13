import type { AdminGrantedPayload, AdminItem, AdminMenuPayload, AdminResultPayload } from '../../types/gameRealtime.ts'

export const ADMIN_MAX_MONEY = 100_000
export const ADMIN_MAX_QUANTITY = 999
export const ADMIN_MAX_MARKET_MINUTES = 240

export interface AdminTarget {
  sessionId: string
  pseudo: string | null
}

export interface AdminMessage {
  key: string
  params: Record<string, string | number>
}

export function adminTargets(ownSessionId: string, players: AdminMenuPayload['players']): AdminTarget[] {
  return [{ sessionId: ownSessionId, pseudo: null }, ...players.filter((p) => p.sessionId !== ownSessionId).map((p) => ({ sessionId: p.sessionId, pseudo: p.pseudo }))]
}

export function filterAdminItems(items: AdminItem[], query: string): AdminItem[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return items
  return items.filter((item) => item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle))
}

export function wholeIn(raw: unknown, min: number, max: number): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

export function adminResultMessage(result: AdminResultPayload, itemName: (code: string) => string, clockTime: (iso: string) => string): AdminMessage {
  if (!result.ok) return { key: 'adminPanel.result.failed', params: { message: result.message } }
  switch (result.action) {
    case 'money':
      return { key: `adminPanel.result.money.${result.wallet}`, params: { amount: result.amount, name: result.pseudo } }
    case 'item':
      return { key: 'adminPanel.result.item', params: { quantity: result.quantity, item: itemName(result.code), name: result.pseudo } }
    case 'market_open':
      return { key: 'adminPanel.result.marketOpen', params: { time: clockTime(result.closesAt) } }
    case 'market_close':
      return { key: 'adminPanel.result.marketClose', params: { n: result.returned } }
    case 'taxes':
      return { key: 'adminPanel.result.taxes', params: { charged: result.charged, seized: result.seized } }
  }
}

export function adminGrantedMessage(granted: AdminGrantedPayload): AdminMessage {
  if (granted.kind === 'money') return { key: `adminPanel.granted.${granted.wallet}`, params: { amount: granted.amount, name: granted.byPseudo } }
  return { key: 'adminPanel.granted.item', params: { quantity: granted.quantity, name: granted.byPseudo } }
}
