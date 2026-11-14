import type { SportsLoansPayload } from '../../types/gameRealtime'

const loansBySession = new Map<string, readonly string[]>()

export function applySportsLoans({ sessionId, loans }: SportsLoansPayload): void {
  if (loans.length === 0) loansBySession.delete(sessionId)
  else loansBySession.set(sessionId, [...loans])
}

export function sportsLoansOf(sessionId: string): readonly string[] {
  return loansBySession.get(sessionId) ?? []
}

export function hasSportsLoan(sessionId: string, key: string): boolean {
  return sportsLoansOf(sessionId).includes(key)
}

export function forgetSportsLoans(sessionId: string): void {
  loansBySession.delete(sessionId)
}

export function clearSportsLoans(): void {
  loansBySession.clear()
}
