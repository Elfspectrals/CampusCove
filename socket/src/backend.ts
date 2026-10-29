// Laravel API calls made on behalf of a player (their bearer token): the API stays authoritative for
// identity, apartments, inventory and housing.
import { BACKEND_API_URL, REALTIME_SHARED_SECRET } from './config.ts'
import type { Identity } from './types.ts'

/** Unvalidated JSON from the API or a client: callers check every field they read. */
export type Json = any

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export function parseAccountId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return parseInt(raw, 10)
  return null
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

// The account id always comes from the backend-validated token, never from client options.
export async function resolveIdentity(options: Json): Promise<Identity> {
  const token = typeof options?.token === 'string' ? options.token.trim() : ''
  if (!token) throw new Error('missing auth token')
  const res = await fetch(`${BACKEND_API_URL}/user`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`auth failed (${res.status})`)
  const data: Json = await res.json()
  const accountId = parseAccountId(data?.user?.account_id)
  if (accountId === null) throw new Error('invalid account id in auth payload')
  const pseudo = firstNonEmpty(data?.user?.display_name, data?.user?.username) ?? `User_${accountId}`
  return { accountId, pseudo, token }
}

// JSON request; rejects with the API's message (and `code`) on a non-2xx answer.
export async function callBackendJson(
  token: string | null,
  path: string,
  method: HttpMethod = 'POST',
  body: unknown = null,
  extraHeaders: Record<string, string> = {}
): Promise<Json> {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('missing auth token')
  }
  const res = await fetch(`${BACKEND_API_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...extraHeaders
    },
    body: body !== null ? JSON.stringify(body) : undefined
  })
  const data: Json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = typeof data?.message === 'string' ? data.message : `backend error ${res.status}`
    throw Object.assign(new Error(message), { code: typeof data?.code === 'string' ? data.code : 'backend_error' })
  }
  return data
}

// Same call on a route reserved to this server (the API checks the shared secret).
export function callRealtimeBackend(token: string | null, path: string, method: HttpMethod = 'POST', body: unknown = null): Promise<Json> {
  return callBackendJson(token, path, method, body, { 'X-Realtime-Secret': REALTIME_SHARED_SECRET })
}

// Error payload sent back to the client for a failed backend call.
export function errorPayload(error: unknown, fallbackMessage: string, fallbackCode: string): { message: string, code: string } {
  return {
    message: error instanceof Error ? error.message : fallbackMessage,
    code: (error as { code?: string } | null)?.code ?? fallbackCode
  }
}
