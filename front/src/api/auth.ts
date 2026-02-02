const API_BASE = import.meta.env.VITE_API_URL || '/api'

function errorMessage(data: { message?: string; errors?: Record<string, string[]> }): string {
  if (data.message && !data.errors) return data.message
  if (data.errors) {
    const first = Object.values(data.errors).flat()[0]
    if (first) return first
  }
  return 'Request failed'
}

export interface User {
  account_id: number
  public_id: string
  username: string
  tag: number
  display_name: string
  email: string
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
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(errorMessage(data))
  }
  return res.json()
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(errorMessage(data))
  }
  return res.json()
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(errorMessage(data))
  }
  return res.json()
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
    return JSON.parse(raw) as { user: User; token: string }
  } catch {
    return null
  }
}

export function storeAuth(user: User, token: string): void {
  localStorage.setItem('campus_cove_auth', JSON.stringify({ user, token }))
}

export function clearAuth(): void {
  localStorage.removeItem('campus_cove_auth')
}

/** Returns true if stored token is still valid (API accepts it), false otherwise. Clears auth if invalid or on error. */
export async function validateStoredAuth(): Promise<boolean> {
  const auth = getStoredAuth()
  if (!auth?.token) return false
  try {
    const res = await fetch(`${API_BASE}/user`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth.token}` },
    })
    if (res.ok) return true
  } catch {
    // Network error or backend down
  }
  clearAuth()
  return false
}
