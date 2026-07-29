import { formatApiError, getStoredAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || '/api'

function getAuthHeaders(): HeadersInit {
  const auth = getStoredAuth()
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
  }
}

async function parseResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = formatApiError(data)
    throw new Error(message === 'Request failed' ? fallbackMessage : message)
  }
  return data as T
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
  return parseResponse(res, 'Failed to load friends')
}

export async function getPending(): Promise<{ pending: PendingFriend[] }> {
  const res = await fetch(`${API_BASE}/friends/pending`, { headers: getAuthHeaders() })
  return parseResponse(res, 'Failed to load pending requests')
}

export async function sendRequest(username: string, tag: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/request`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ username, tag }),
  })
  return parseResponse(res, 'Failed to send request')
}

export async function acceptRequest(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/accept/${accountId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return parseResponse(res, 'Failed to accept request')
}

export async function blockUser(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/block/${accountId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  return parseResponse(res, 'Failed to block user')
}

export async function removeFriend(accountId: number): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE}/friends/${accountId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  return parseResponse(res, 'Failed to remove friend')
}
