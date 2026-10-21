/**
 * Single HTTP client for the Laravel API (`VITE_API_URL`, `/api` by default): JSON in/out, bearer token
 * from the stored session, and Laravel error bodies turned into readable messages.
 */
import { getStoredAuth, isRecord } from './session'

export { isRecord }

export const API_BASE = import.meta.env.VITE_API_URL || '/api'

/** Parses Laravel-style JSON error bodies (message + errors bag). */
function formatApiError(data: unknown, fallback = 'Request failed'): string {
  if (!isRecord(data)) return fallback
  const message = typeof data.message === 'string' ? data.message : undefined
  if (message && data.errors === undefined) return message
  const errors = data.errors
  if (isRecord(errors) && !Array.isArray(errors)) {
    for (const v of Object.values(errors)) {
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0]
    }
  }
  return message ?? fallback
}

type QueryValue = string | number | boolean | null | undefined

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Sent as JSON, or as multipart when it is a FormData. */
  body?: unknown
  /** Empty strings, null and undefined are skipped; booleans become 1 / 0. */
  query?: Record<string, QueryValue>
  /** Explicit token (defaults to the stored session's). `null` sends no Authorization header. */
  token?: string | null
  /** Error message when the API gives none. */
  errorMessage?: string
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return ''
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    q.set(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Raw request with the API headers, for callers that need the response status. */
export function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const token = options.token === undefined ? (getStoredAuth()?.token ?? null) : options.token
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  return fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  })
}

/** Request that resolves with the parsed JSON body (`{}` when empty) and throws the API's message on failure. */
export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<unknown> {
  const res = await apiFetch(path, options)
  const data: unknown = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(formatApiError(data, options.errorMessage))
  return data
}
