/**
 * Gem shop demo API (docs/STRIPE.md), authenticated. Stripe runs in test mode only: payments are simulated with
 * Stripe test cards and no money is ever charged, but the game's premium wallet is really credited.
 * - GET  /gems/packs          — packs and prices from the server catalogue, and whether the demo is on
 * - POST /gems/orders         — order a pack, returns the Stripe Checkout URL to go to
 * - GET  /gems/orders         — the player's order history
 * - GET  /gems/orders/{id}    — real state of one order + fresh wallet (the cache is updated from it)
 *
 * Gems are never added in the browser: the wallet only changes from what the API returns.
 */
import { apiRequest, isRecord } from './http'
import { parseWalletSummary, storeWalletSummary } from './session'

export type GemOrderStatus = 'creating' | 'open' | 'processing' | 'paid' | 'failed' | 'expired' | 'canceled'

export interface GemPack {
  code: string
  gems: number
  amount_cents: number
  currency: string
}

export interface GemPackCatalog {
  /** Demo switched on server side (GEMS_CHECKOUT_MODE=test with Stripe test keys). */
  available: boolean
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
  return {
    available: data.available === true,
    packs: data.packs.map(parsePack).filter((p): p is GemPack => p !== null),
  }
}

/** Only the pack and the language of the Stripe page: the server decides everything else. */
export async function createGemOrder(pack: string, locale: string): Promise<{ order: GemOrder; checkoutUrl: string }> {
  const data = await apiRequest('/gems/orders', {
    method: 'POST',
    body: { pack, locale },
    errorMessage: 'Could not start the payment',
  })
  const checkoutUrl = isRecord(data) && typeof data.checkout_url === 'string' ? data.checkout_url : ''
  // the Stripe-hosted page (checkout.stripe.com, or the custom domain set up in Stripe), never a plain-http URL
  if (!checkoutUrl.startsWith('https://')) throw new Error('Invalid payment page')
  return { order: requireOrder(data), checkoutUrl }
}

/** Real state of the order; the wallet cache is refreshed from the same response. */
export async function fetchGemOrder(publicId: string): Promise<GemOrder> {
  const data = await apiRequest(`/gems/orders/${encodeURIComponent(publicId)}`, { errorMessage: 'Could not load the order' })
  const wallet = isRecord(data) ? parseWalletSummary(data.wallet_summary) : null
  if (wallet) storeWalletSummary(wallet)
  return requireOrder(data)
}

export async function fetchGemOrders(): Promise<GemOrder[]> {
  const data = await apiRequest('/gems/orders', { errorMessage: 'Could not load your orders' })
  if (!isRecord(data) || !Array.isArray(data.orders)) throw new Error('Invalid orders response')
  return data.orders.map(parseOrder).filter((o): o is GemOrder => o !== null)
}
