const API_BASE = import.meta.env.VITE_API_URL || '/api'

function parseApiBaseUrl(): URL | null {
  try {
    if (typeof window !== 'undefined') {
      return new URL(API_BASE, window.location.origin)
    }
    return new URL(API_BASE)
  } catch {
    return null
  }
}

const API_BASE_URL = parseApiBaseUrl()

/** Paths served from the front's own public/ folder (e.g. GLBs from `npm run optimize`), not the API. */
const FRONT_PUBLIC_PREFIXES = ['/models/', '/maps/']

export function normalizeApiAssetUrl(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null
  const trimmed = path.trim()
  if (trimmed === '') return null

  if (/^(?:https?:)?\/\//i.test(trimmed) || /^(?:data|blob):/i.test(trimmed)) {
    if (trimmed.startsWith('//') && typeof window !== 'undefined') {
      return `${window.location.protocol}${trimmed}`
    }
    return trimmed
  }

  if (FRONT_PUBLIC_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    if (typeof window !== 'undefined') {
      return new URL(trimmed, window.location.origin).toString()
    }
    return trimmed
  }

  try {
    if (API_BASE_URL) {
      return new URL(trimmed, API_BASE_URL).toString()
    }
    if (typeof window !== 'undefined') {
      return new URL(trimmed, window.location.origin).toString()
    }
    return trimmed
  } catch {
    return trimmed
  }
}
