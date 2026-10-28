/** GDPR self-service (data export, account deletion, terms acceptance) and player reports. */
import { apiFetch, apiRequest } from './http'

export type ReportReason = 'harassment' | 'hate' | 'cheating' | 'username' | 'scam' | 'other'
export const REPORT_REASONS: readonly ReportReason[] = ['harassment', 'hate', 'cheating', 'username', 'scam', 'other']

/** Downloads every stored record about the current account as a JSON file (GDPR art. 15 and 20). */
export async function downloadMyData(): Promise<void> {
  const res = await apiFetch('/account/export')
  if (!res.ok) throw new Error('Export failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `campuscove-data-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Erases the current account (GDPR art. 17). The password is checked server-side. */
export async function deleteMyAccount(password: string): Promise<void> {
  await apiRequest('/account', { method: 'DELETE', body: { password }, errorMessage: 'Deletion failed' })
}

/** Records the acceptance of the terms / privacy policy currently in force. */
export async function acceptCurrentTerms(): Promise<void> {
  await apiRequest('/account/terms', { method: 'POST', body: { accepted_terms: true }, errorMessage: 'Could not save' })
}

export async function reportPlayer(targetAccountId: number, reason: ReportReason, details: string): Promise<void> {
  await apiRequest('/reports', {
    method: 'POST',
    body: { target_account_id: targetAccountId, reason, details: details.trim() || undefined },
    errorMessage: 'Report failed',
  })
}
