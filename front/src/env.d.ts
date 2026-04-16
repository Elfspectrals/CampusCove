/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public site origin for canonical and OG URLs (e.g. https://example.com). Falls back to window.location.origin. */
  readonly VITE_PUBLIC_SITE_URL?: string
}
