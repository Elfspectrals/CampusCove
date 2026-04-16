import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
    guest?: boolean
    requiresAuth?: boolean
    requiresAdmin?: boolean
    fullBleed?: boolean
    /** Primary meta description; falls back to a site default when omitted. */
    description?: string
    /** Path segment for canonical URL (must start with /). Defaults to matched path (with Vite base). */
    canonicalPath?: string
    /** Comma-separated robots directive, e.g. index,follow or noindex,nofollow */
    robots?: string
  }
}

export {}
