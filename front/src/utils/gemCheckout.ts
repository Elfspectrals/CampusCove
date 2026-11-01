/**
 * Return page of Stripe Checkout (GemCheckoutReturnView): what to show from the order state the API reports.
 * The `result` query parameter only says which Stripe button the player used; it never proves a payment.
 */
import type { GemOrder } from '../api/gems'

export type ReturnPhase = 'checking' | 'success' | 'cancelled' | 'processing' | 'failed' | 'expired' | 'timeout'

/** Waits between two status lookups while the webhook may still be on its way (~30 s in total). */
export const POLL_DELAYS_MS: readonly number[] = [1000, 1500, 2000, 2000, 2500, 3000, 3000, 4000, 5000, 6000]

export function returnPhase(order: GemOrder | null, result: string | null, attempts: number): ReturnPhase {
  if (order === null) return 'checking'
  switch (order.status) {
    case 'paid':
      return 'success'
    case 'processing':
      return 'processing'
    case 'failed':
      return 'failed'
    case 'expired':
    case 'canceled':
      return result === 'cancel' ? 'cancelled' : 'expired'
    default:
      // still open: cancelled on Stripe's page, or paid and the confirmation is late
      if (result === 'cancel') return 'cancelled'
      return attempts < POLL_DELAYS_MS.length ? 'checking' : 'timeout'
  }
}

/** Final price as charged, e.g. "9,99 €" / "€9.99". */
export function formatPrice(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-IE', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}
