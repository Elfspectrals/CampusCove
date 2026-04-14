const API_BASE = import.meta.env.VITE_API_URL || '/api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Parses Laravel-style JSON error bodies (message + errors bag). */
export function formatApiError(data: unknown): string {
  if (!isRecord(data)) return 'Request failed'
  const d = data
  const message = d.message
  const errMsg = typeof message === 'string' ? message : undefined
  if (errMsg && d.errors === undefined) return errMsg
  const errors = d.errors
  if (errors && typeof errors === 'object' && errors !== null && !Array.isArray(errors)) {
    for (const v of Object.values(errors)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
    }
  }
  if (errMsg) return errMsg
  return 'Request failed'
}

function parseRoles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const roles: string[] = []
  for (const r of value) {
    if (typeof r === 'string') roles.push(r)
  }
  return roles.length > 0 ? roles : undefined
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
}

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false
  return user.is_admin === true
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
  return user
}

function parseAuthPayload(data: unknown): { user: User; token: string; token_type: string } | null {
  if (!isRecord(data)) return null
  if (typeof data.token !== 'string') return null
  if (typeof data.token_type !== 'string') return null
  const user = parseUser(data.user)
  if (!user) return null
  return { user, token: data.token, token_type: data.token_type }
}

function parseStoredAuthPayload(data: unknown): { user: User; token: string } | null {
  if (!isRecord(data)) return null
  if (typeof data.token !== 'string') return null
  const user = parseUser(data.user)
  if (!user) return null
  return { user, token: data.token }
}

export interface AuthResponse {
  user: User
  token: string
  token_type: string
}

export async function register(
  email: string,
  username: string,
  password: string,
  password_confirmation: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      username,
      password,
      password_confirmation,
    }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(formatApiError(data))
  }
  const parsed = parseAuthPayload(data)
  if (!parsed) throw new Error('Invalid registration response')
  return { user: parsed.user, token: parsed.token, token_type: parsed.token_type }
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(formatApiError(data))
  }
  const parsed = parseAuthPayload(data)
  if (!parsed) throw new Error('Invalid login response')
  return { user: parsed.user, token: parsed.token, token_type: parsed.token_type }
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data))
  if (isRecord(data) && typeof data.message === 'string') return { message: data.message }
  return { message: 'If an account exists with that email, you will receive a reset link.' }
}

export async function logout(token: string): Promise<void> {
  await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
}

export function getStoredAuth(): { user: User; token: string } | null {
  const raw = localStorage.getItem('campus_cove_auth')
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return parseStoredAuthPayload(parsed)
  } catch {
    return null
  }
}

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

const WALLET_BALANCE_KEY = 'campus_cove_wallet_balances'

export interface CachedWalletBalances {
  coins: number | null
  premium: number | null
}

function defaultBalances(): CachedWalletBalances {
  return { coins: null, premium: null }
}

function parseWalletSummary(value: unknown): { coins: number; premium: number } | null {
  if (!isRecord(value)) return null
  if (typeof value.coins !== 'number') return null
  if (typeof value.premium !== 'number') return null
  return { coins: value.coins, premium: value.premium }
}

function setCachedWalletBalances(next: { coins: number; premium: number }): void {
  localStorage.setItem(WALLET_BALANCE_KEY, JSON.stringify(next))
}

/** Cached wallet amounts (updated after purchases). Unknown until first purchase sync. */
export function getCachedWalletBalances(): CachedWalletBalances {
  const raw = localStorage.getItem(WALLET_BALANCE_KEY)
  if (!raw) return defaultBalances()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return defaultBalances()
    const coins = parsed.coins
    const premium = parsed.premium
    return {
      coins: typeof coins === 'number' ? coins : null,
      premium: typeof premium === 'number' ? premium : null,
    }
  } catch {
    return defaultBalances()
  }
}

/** Persists post-purchase balance for a currency and notifies subscribers. */
export function applyCachedBalanceAfterPurchase(currency: 'coins' | 'premium', balanceAfter: number): void {
  const cur = getCachedWalletBalances()
  const next: CachedWalletBalances = {
    ...cur,
    [currency]: balanceAfter,
  }
  localStorage.setItem(WALLET_BALANCE_KEY, JSON.stringify(next))
  notifyAuthListeners()
}

function clearCachedWalletBalances(): void {
  localStorage.removeItem(WALLET_BALANCE_KEY)
}

export function storeAuth(user: User, token: string): void {
  localStorage.setItem('campus_cove_auth', JSON.stringify({ user, token }))
  if (user.wallet_summary) setCachedWalletBalances(user.wallet_summary)
  notifyAuthListeners()
}

export function mergeStoredUser(updates: Partial<User>): void {
  const auth = getStoredAuth()
  if (!auth) return
  const user: User = {
    ...auth.user,
    ...updates,
  }
  localStorage.setItem('campus_cove_auth', JSON.stringify({ user, token: auth.token }))
  if (user.wallet_summary) setCachedWalletBalances(user.wallet_summary)
  notifyAuthListeners()
}

export function clearAuth(): void {
  localStorage.removeItem('campus_cove_auth')
  clearCachedWalletBalances()
  notifyAuthListeners()
}

/** Returns true if stored token is still valid (API accepts it), false otherwise. Clears auth if invalid or on error. */
export async function validateStoredAuth(): Promise<boolean> {
  const auth = getStoredAuth()
  if (!auth?.token) return false
  try {
    const res = await fetch(`${API_BASE}/user`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` },
    })
    const data: unknown = await res.json().catch(() => ({}))
    if (res.ok) {
      const user = parseUserEndpointPayload(data)
      if (user) mergeStoredUser(user)
      return true
    }
  } catch {
    // Network error or backend down
  }
  clearAuth()
  return false
}

function parseUserEndpointPayload(data: unknown): User | null {
  if (!isRecord(data)) return null
  return parseUser(data.user)
}

/**
 * Fetches the current user from GET /user and merges into local storage (including is_admin / roles when present).
 */
export async function fetchCurrentUser(): Promise<User | null> {
  const auth = getStoredAuth()
  if (!auth?.token) return null
  try {
    const res = await fetch(`${API_BASE}/user`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` },
    })
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) clearAuth()
      return null
    }
    const user = parseUserEndpointPayload(data)
    if (user) mergeStoredUser(user)
    return user
  } catch {
    return null
  }
}
