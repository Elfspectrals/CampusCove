import { apiRequest, isRecord } from './http.ts'
import { applyCachedBalanceAfterPurchase, getStoredAuth } from './session.ts'

export interface BankOperation {
  reason: string
  delta: number
  at: string
  from: string | null
  to: string | null
}

export interface BankScreen {
  cash: number
  bank: number
  history: BankOperation[]
}

function parseOperation(raw: unknown): BankOperation {
  if (!isRecord(raw) || typeof raw.reason !== 'string' || typeof raw.delta !== 'number' || typeof raw.at !== 'string') throw new Error('Invalid bank operation')
  return {
    reason: raw.reason,
    delta: raw.delta,
    at: raw.at,
    from: typeof raw.from === 'string' ? raw.from : null,
    to: typeof raw.to === 'string' ? raw.to : null,
  }
}

export async function fetchBankScreen(): Promise<BankScreen> {
  const token = getStoredAuth()?.token ?? null
  const data = await apiRequest('/bank', { token, errorMessage: 'Could not load your money' })
  if (!isRecord(data) || typeof data.cash !== 'number' || typeof data.bank !== 'number' || !Array.isArray(data.history)) throw new Error('Invalid bank response')
  applyCachedBalanceAfterPurchase('cash', data.cash)
  applyCachedBalanceAfterPurchase('coins', data.bank)
  return { cash: data.cash, bank: data.bank, history: data.history.map(parseOperation) }
}

export async function refreshCashAndBank(): Promise<void> {
  await fetchBankScreen()
}
