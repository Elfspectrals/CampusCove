const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getAuthHeaders(): HeadersInit {
  const raw = localStorage.getItem('campus_cove_auth')
  const auth = raw ? (JSON.parse(raw) as { token: string }) : null
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

export interface Friend {
  account_id: number
  display_name: string
  username: string
  status: 'online' | 'offline' | 'playing'
}

export interface PendingFriend {
  account_id: number
  display_name: string
  username: string
  incoming: boolean
}

export async function getFriends(): Promise<{ friends: Friend[] }> {
  const res = await fetch(`${API_BASE}/friends`, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error('Failed to load friends')
  return res.json()
}

export async function getPending(): Promise<{ pending: PendingFriend[] }> {
  const res = await fetch(`${API_BASE}/friends/pending`, { headers: getAuthHeaders() })
  if (!res.ok) throw new Error('Failed to load pending')
  return res.json()
}

export async function sendRequest(username: string, tag: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/request`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ username, tag }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data.errors?.username?.[0] ?? data.errors?.tag?.[0] ?? data.message ?? 'Failed to send request'
    throw new Error(msg)
  }
  return res.json()
}

export async function acceptRequest(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/accept/${accountId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to accept')
  return res.json()
}

export async function blockUser(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/block/${accountId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to block')
  return res.json()
}

export async function removeFriend(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/${accountId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!res.ok) throw new Error('Failed to remove')
  return res.json()
}
