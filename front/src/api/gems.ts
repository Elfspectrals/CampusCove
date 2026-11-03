/**
 * Gem shop demo API (docs/STRIPE.md), authenticated. Stripe runs in test mode only: payments are simulated with
 * Stripe test cards and no money is ever charged, but the game's premium wallet is really credited.
 * - GET  /gems/packs          — packs and prices from the server catalogue, and whether the demo is on
 * - POST /gems/orders         — order a pack, returns the Stripe Checkout URL to go to, or 202 `checkout_preparing`
 *                                while another request of the player is creating it (then the order is polled)
 * - GET  /gems/orders         — the player's order history
 * - GET  /gems/orders/{id}    — real state of one order + fresh wallet (the cache is updated from it)
 *
 * Gems are never added in the browser: the wallet only changes from what the API returns.
 */
import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth, parseWalletSummary, storeWalletSummary } from './session.ts'

export type GemOrderStatus = 'creating' | 'open' | 'processing' | 'paid' | 'failed' | 'expired' | 'canceled'

export interface GemPack {
  code: string
  gems: number
  amount_cents: number
  currency: string
}

/** Why this player cannot order: demo off, or a production server where it is reserved to administrators. */
type GemShopUnavailableReason = 'disabled' | 'admin_only'

export interface GemPackCatalog {
  /** This player may order (GEMS_CHECKOUT_MODE=test with Stripe test keys, and an admin on a production server). */
  available: boolean
  unavailableReason: GemShopUnavailableReason | null
  packs: GemPack[]
}

export interface GemOrder {
  public_id: string
  pack_code: string
  gems: number
  amount_cents: number
  currency: string
  status: GemOrderStatus
  livemode: boolean
  delivered: boolean
  created_at: string | null
  paid_at: string | null
  refund: { status: 'none' | 'partial' | 'full'; refunded_cents: number; gems_reversed: number }
  disputed: boolean
}

const STATUSES: readonly GemOrderStatus[] = ['creating', 'open', 'processing', 'paid', 'failed', 'expired', 'canceled']

function parsePack(raw: unknown): GemPack | null {
  if (!isRecord(raw)) return null
  if (typeof raw.code !== 'string' || typeof raw.gems !== 'number' || typeof raw.amount_cents !== 'number' || typeof raw.currency !== 'string') return null
  return { code: raw.code, gems: raw.gems, amount_cents: raw.amount_cents, currency: raw.currency }
}

function parseOrder(raw: unknown): GemOrder | null {
  if (!isRecord(raw)) return null
  if (typeof raw.public_id !== 'string' || typeof raw.pack_code !== 'string') return null
  if (typeof raw.gems !== 'number' || typeof raw.amount_cents !== 'number' || typeof raw.currency !== 'string') return null
  const status = STATUSES.find((s) => s === raw.status)
  if (!status) return null
  const refund = isRecord(raw.refund) ? raw.refund : {}
  const refundStatus = refund.status === 'partial' || refund.status === 'full' ? refund.status : 'none'
  return {
    public_id: raw.public_id,
    pack_code: raw.pack_code,
    gems: raw.gems,
    amount_cents: raw.amount_cents,
    currency: raw.currency,
    status,
    livemode: raw.livemode === true,
    delivered: raw.delivered === true,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : null,
    paid_at: typeof raw.paid_at === 'string' ? raw.paid_at : null,
    refund: {
      status: refundStatus,
      refunded_cents: typeof refund.refunded_cents === 'number' ? refund.refunded_cents : 0,
      gems_reversed: typeof refund.gems_reversed === 'number' ? refund.gems_reversed : 0,
    },
    disputed: raw.disputed === true,
  }
}

function requireOrder(data: unknown): GemOrder {
  const order = isRecord(data) ? parseOrder(data.order) : null
  if (!order) throw new Error('Invalid order response')
  return order
}

export async function fetchGemPacks(): Promise<GemPackCatalog> {
  const data = await apiRequest('/gems/packs', { errorMessage: 'Could not load the gem packs' })
  if (!isRecord(data) || !Array.isArray(data.packs)) throw new Error('Invalid gem pack response')
  const available = data.available === true
  const reason = data.unavailable_reason === 'admin_only' ? 'admin_only' : 'disabled'
  return {
    available,
    unavailableReason: available ? null : reason,
    packs: data.packs.map(parsePack).filter((p): p is GemPack => p !== null),
  }
}

/** The Stripe-hosted page (checkout.stripe.com, or the custom domain set up in Stripe), never a plain-http URL. */
function checkoutUrlOf(data: unknown): string | null {
  const url = isRecord(data) && typeof data.checkout_url === 'string' ? data.checkout_url : ''
  if (url === '') return null
  if (!url.startsWith('https://')) throw new Error('Invalid payment page')
  return url
}

/** Only the pack and the language of the Stripe page: the server decides everything else. `checkoutUrl` null: preparing. */
async function postGemOrder(pack: string, locale: string): Promise<{ order: GemOrder; checkoutUrl: string | null }> {
  const data = await apiRequest('/gems/orders', {
    method: 'POST',
    body: { pack, locale },
    errorMessage: 'Could not start the payment',
  })
  const order = requireOrder(data)
  // 202 checkout_preparing: another request of this player is creating the session right now
  if (isRecord(data) && data.code === 'checkout_preparing') return { order, checkoutUrl: null }
  const checkoutUrl = checkoutUrlOf(data)
  if (checkoutUrl === null) throw new Error('Invalid payment page')
  return { order, checkoutUrl }
}

/** The payment page is still being prepared after the bounded wait: temporary, a new click a bit later works. */
export class GemCheckoutPreparingError extends Error {
  constructor() {
    super('The payment page is still being prepared')
  }
}

/**
 * Waits between two lookups of an order whose payment page is being prepared (~12 s), then one more POST: it
 * takes the creation over if the request that started it died (its server-side lease has run out by then or soon).
 */
export const PREPARING_POLL_DELAYS_MS: readonly number[] = [1000, 1000, 1000, 1500, 1500, 2000, 2000, 2000]

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Orders a pack and resolves with the Stripe Checkout URL to go to. A `checkout_preparing` answer is not an error:
 * the order is polled until its page exists. Throws GemCheckoutPreparingError if it is still not ready after the
 * bounded wait, an ApiError for a real refusal.
 */
export async function startGemCheckout(pack: string, locale: string, sleep: (ms: number) => Promise<void> = wait): Promise<string> {
  for (let round = 0; round < 2; round++) {
    const attempt = await postGemOrder(pack, locale)
    if (attempt.checkoutUrl !== null) return attempt.checkoutUrl
    for (const delay of PREPARING_POLL_DELAYS_MS) {
      await sleep(delay)
      const state = await fetchGemOrderState(attempt.order.public_id)
      if (state.checkoutUrl !== null) return state.checkoutUrl
      // closed meanwhile (Stripe refused the creation): the next round orders again
      if (state.order.status !== 'creating' && state.order.status !== 'open') break
    }
  }
  throw new GemCheckoutPreparingError()
}

/** The player logged out or switched account while the request was on its way: its answer belongs to nobody now. */
export class StaleSessionError extends Error {
  constructor() {
    super('The session changed during the request')
  }
}

/** Real state of the order (+ its payment page while open); the wallet cache is refreshed if it is still the same session. */
async function fetchGemOrderState(publicId: string): Promise<{ order: GemOrder; checkoutUrl: string | null }> {
  const token = getStoredAuth()?.token ?? null
  const data = await apiRequest(`/gems/orders/${encodeURIComponent(publicId)}`, { token, errorMessage: 'Could not load the order' })
  if (token === null || getStoredAuth()?.token !== token) throw new StaleSessionError()
  const wallet = isRecord(data) ? parseWalletSummary(data.wallet_summary) : null
  if (wallet) storeWalletSummary(wallet)
  return { order: requireOrder(data), checkoutUrl: checkoutUrlOf(data) }
}

/** Real state of the order; the wallet cache is refreshed from the same response, if it is still the same session. */
export async function fetchGemOrder(publicId: string): Promise<GemOrder> {
  return (await fetchGemOrderState(publicId)).order
}

export async function fetchGemOrders(): Promise<GemOrder[]> {
  const data = await apiRequest('/gems/orders', { errorMessage: 'Could not load your orders' })
  if (!isRecord(data) || !Array.isArray(data.orders)) throw new Error('Invalid orders response')
  return data.orders.map(parseOrder).filter((o): o is GemOrder => o !== null)
}
