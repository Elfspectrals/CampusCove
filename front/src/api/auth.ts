const API_BASE = import.meta.env.VITE_API_URL || '/api'

export interface User {
  id: number
  email: string
  pseudo: string
}

export interface AuthResponse {
  user: User
  token: string
  token_type: string
}

export async function register(
  email: string,
  pseudo: string,
  password: string,
  password_confirmation: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      email,
      pseudo,
      password,
      password_confirmation,
    }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.message || data.errors ? JSON.stringify(data.errors) : 'Registration failed')
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
    throw new Error(data.message || data.errors ? JSON.stringify(data.errors) : 'Login failed')
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
