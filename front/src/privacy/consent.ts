/**
 * Consent manager (CNIL / ePrivacy). Today CampusCove sets no tracker that needs consent, so the banner never
 * shows on its own; the "Manage cookies" dialog stays reachable from the footer.
 *
 * Adding a tracker later: set `inUse: true` on its category, and load it only inside `whenConsented(...)`.
 * The banner then asks every visitor, with "Reject all" as easy as "Accept all", and asks again after 6 months.
 */
import { computed, ref } from 'vue'

export type ConsentCategory = 'analytics'

export const CONSENT_CATEGORIES: Record<ConsentCategory, { inUse: boolean }> = {
  analytics: { inUse: false },
}

interface StoredConsent {
  choices: Record<ConsentCategory, boolean>
  decidedAt: string
}

const CONSENT_KEY = 'cc_consent'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 182 // 6 months, CNIL recommendation

function read(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredConsent
    if (Date.now() - new Date(parsed.decidedAt).getTime() > MAX_AGE_MS) return null
    return parsed
  } catch {
    return null
  }
}

const stored = ref<StoredConsent | null>(read())
const dialogOpen = ref(false)
const listeners: Array<{ category: ConsentCategory; run: () => void }> = []

const anyInUse = Object.values(CONSENT_CATEGORIES).some((c) => c.inUse)

export function useConsent() {
  const bannerVisible = computed(() => anyInUse && stored.value === null && !dialogOpen.value)
  const choices = computed(() => stored.value?.choices ?? { analytics: false })
  return { bannerVisible, dialogOpen, choices }
}

export function openConsentDialog() {
  dialogOpen.value = true
}

export function saveConsent(choices: Record<ConsentCategory, boolean>) {
  const next: StoredConsent = { choices, decidedAt: new Date().toISOString() }
  stored.value = next
  dialogOpen.value = false
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(next))
  } catch {
    // not persisted: the banner will ask again next visit
  }
  for (const l of listeners) if (choices[l.category]) l.run()
}

/**
 * Runs `run` once the visitor has accepted `category` (now or later). Never before.
 * @public entry point for the first tracker that needs consent; unused while none is in use.
 */
export function whenConsented(category: ConsentCategory, run: () => void) {
  if (stored.value?.choices[category]) run()
  else listeners.push({ category, run })
}
