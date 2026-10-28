/**
 * Logged-in session kept in localStorage: the user + API token, and the cached wallet balances.
 * Listeners are notified on every change (login, logout, purchase).
 */

const AUTH_KEY = 'campus_cove_auth'
const WALLET_BALANCE_KEY = 'campus_cove_wallet_balances'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export interface User {
  account_id: number
  public_id: string
  username: string
  tag: number
  display_name: string
  email: string
  /** When the API exposes admin flag (e.g. GET /user). */
  is_admin?: boolean
  /** When the API exposes roles (e.g. GET /user). */
  roles?: string[]
  /** Wallet summary from API user payload. */
  wallet_summary?: { coins: number; premium: number }
  /** False when the terms / privacy policy changed since the player accepted them (TermsUpdateDialog asks again). */
  terms_current?: boolean
  /** Consent to e-mail news, withdrawable from the profile (PrivacyPanel). */
  marketing_opt_in?: boolean
}

export function isAdminUser(user: User | null | undefined): boolean {
  return user?.is_admin === true
}

function parseRoles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const roles = value.filter((r): r is string => typeof r === 'string')
  return roles.length > 0 ? roles : undefined
}

function parseWalletSummary(value: unknown): { coins: number; premium: number } | null {
  if (!isRecord(value)) return null
  if (typeof value.coins !== 'number') return null
  if (typeof value.premium !== 'number') return null
  return { coins: value.coins, premium: value.premium }
}

export function parseUser(raw: unknown): User | null {
  if (!isRecord(raw)) return null
  if (typeof raw.account_id !== 'number') return null
  if (!(typeof raw.public_id === 'string' || typeof raw.public_id === 'number')) return null
  if (typeof raw.username !== 'string') return null
  if (typeof raw.tag !== 'number') return null
  if (typeof raw.display_name !== 'string') return null
  if (typeof raw.email !== 'string') return null

  const user: User = {
    account_id: raw.account_id,
    public_id: String(raw.public_id),
    username: raw.username,
    tag: raw.tag,
    display_name: raw.display_name,
    email: raw.email,
  }
  if (typeof raw.is_admin === 'boolean') user.is_admin = raw.is_admin
  const roles = parseRoles(raw.roles)
  if (roles !== undefined) user.roles = roles
  const walletSummary = parseWalletSummary(raw.wallet_summary)
  if (walletSummary !== null) user.wallet_summary = walletSummary
  if (typeof raw.terms_current === 'boolean') user.terms_current = raw.terms_current
  if (typeof raw.marketing_opt_in === 'boolean') user.marketing_opt_in = raw.marketing_opt_in
  return user
}

// ---------------------------------------------------------------- listeners

type AuthListener = () => void
const authListeners = new Set<AuthListener>()

/** Subscribe to auth or cached wallet changes (localStorage). */
export function subscribeAuth(listener: AuthListener): () => void {
  authListeners.add(listener)
  return () => {
    authListeners.delete(listener)
  }
}

function notifyAuthListeners(): void {
  for (const fn of authListeners) fn()
}

// ---------------------------------------------------------------- wallet cache

export interface CachedWalletBalances {
  coins: number | null
  premium: number | null
}

function setCachedWalletBalances(next: { coins: number; premium: number }): void {
  localStorage.setItem(WALLET_BALANCE_KEY, JSON.stringify(next))
}

/** Cached wallet amounts (updated after purchases). Unknown until first purchase sync. */
export function getCachedWalletBalances(): CachedWalletBalances {
  const empty: CachedWalletBalances = { coins: null, premium: null }
  const raw = localStorage.getItem(WALLET_BALANCE_KEY)
  if (!raw) return empty
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return empty
    return {
      coins: typeof parsed.coins === 'number' ? parsed.coins : null,
      premium: typeof parsed.premium === 'number' ? parsed.premium : null,
    }
  } catch {
    return empty
  }
}

/** Persists post-purchase balance for a currency and notifies subscribers. */
export function applyCachedBalanceAfterPurchase(currency: 'coins' | 'premium', balanceAfter: number): void {
  const next: CachedWalletBalances = { ...getCachedWalletBalances(), [currency]: balanceAfter }
  localStorage.setItem(WALLET_BALANCE_KEY, JSON.stringify(next))
  notifyAuthListeners()
}

// ---------------------------------------------------------------- auth

export function getStoredAuth(): { user: User; token: string } | null {
  const raw = localStorage.getItem(AUTH_KEY)
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || typeof data.token !== 'string') return null
    const user = parseUser(data.user)
    return user ? { user, token: data.token } : null
  } catch {
    return null
  }
}

export function storeAuth(user: User, token: string): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ user, token }))
  if (user.wallet_summary) setCachedWalletBalances(user.wallet_summary)
  notifyAuthListeners()
}

/** Merge fresh user fields (GET /user) into the stored session. */
export function mergeStoredUser(updates: Partial<User>): void {
  const auth = getStoredAuth()
  if (!auth) return
  storeAuth({ ...auth.user, ...updates }, auth.token)
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(WALLET_BALANCE_KEY)
  notifyAuthListeners()
}
