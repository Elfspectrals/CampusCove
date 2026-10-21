/** Authentication endpoints. The session itself (token, user, wallet cache) lives in `./session`. */
import { apiFetch, apiRequest, isRecord } from './http'
import { clearAuth, getStoredAuth, mergeStoredUser, parseUser, type User } from './session'

export interface AuthResponse {
  user: User
  token: string
  token_type: string
}

function parseAuthPayload(data: unknown, errorText: string): AuthResponse {
  const user = isRecord(data) ? parseUser(data.user) : null
  if (!isRecord(data) || !user || typeof data.token !== 'string' || typeof data.token_type !== 'string') {
    throw new Error(errorText)
  }
  return { user, token: data.token, token_type: data.token_type }
}

export async function register(
  email: string,
  username: string,
  password: string,
  password_confirmation: string,
  referral_code?: string,
): Promise<AuthResponse> {
  const data = await apiRequest('/register', {
    method: 'POST',
    token: null,
    body: { email, username, password, password_confirmation, ...(referral_code ? { referral_code } : {}) },
  })
  return parseAuthPayload(data, 'Invalid registration response')
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiRequest('/login', { method: 'POST', token: null, body: { email, password } })
  return parseAuthPayload(data, 'Invalid login response')
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const data = await apiRequest('/forgot-password', { method: 'POST', token: null, body: { email } })
  if (isRecord(data) && typeof data.message === 'string') return { message: data.message }
  return { message: 'If an account exists with that email, you will receive a reset link.' }
}

export async function logout(token: string): Promise<void> {
  await apiFetch('/logout', { method: 'POST', token })
}

/**
 * GET /user with the stored token, merging the fresh user into the session. `null` when there is no
 * session, the token is rejected (401 clears the session) or the network fails.
 */
export async function fetchCurrentUser(): Promise<User | null> {
  if (!getStoredAuth()?.token) return null
  try {
    const res = await apiFetch('/user')
    const data: unknown = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401) clearAuth()
      return null
    }
    const user = isRecord(data) ? parseUser(data.user) : null
    if (user) mergeStoredUser(user)
    return user
  } catch {
    return null
  }
}

/** Returns true if the stored token is still accepted by the API; clears the session otherwise. */
export async function validateStoredAuth(): Promise<boolean> {
  const auth = getStoredAuth()
  if (!auth?.token) return false
  try {
    const res = await apiFetch('/user')
    const data: unknown = await res.json().catch(() => ({}))
    if (res.ok) {
      const user = isRecord(data) ? parseUser(data.user) : null
      if (user) mergeStoredUser(user)
      return true
    }
  } catch {
    // Network error or backend down
  }
  clearAuth()
  return false
}
