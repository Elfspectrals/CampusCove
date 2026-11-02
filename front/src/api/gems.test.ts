import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'

// in-memory localStorage and a fetch whose answers the test hands out itself, before loading the API modules
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
})

interface PendingRequest {
  method: string
  url: string
  authorization: string | undefined
  answer: (body: unknown, status?: number) => void
}
const requests: PendingRequest[] = []
globalThis.fetch = ((url: string, init?: RequestInit) =>
  new Promise((resolve) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    requests.push({
      method: init?.method ?? 'GET',
      url,
      authorization: headers.Authorization,
      answer: (body, status = 200) => resolve({ ok: status < 400, status, json: async () => body } as Response),
    })
  })) as typeof fetch

const { GemCheckoutPreparingError, PREPARING_POLL_DELAYS_MS, StaleSessionError, fetchGemOrder, fetchGemPacks, startGemCheckout } = await import('./gems.ts')
const { ApiError } = await import('./http.ts')
const { clearAuth, getCachedWalletBalances, getStoredAuth, storeAuth, storeWalletSummary } = await import('./session.ts')

/** The n-th request (0-based), once the code under test has sent it. */
async function request(n: number): Promise<PendingRequest> {
  for (let i = 0; i < 200 && requests.length <= n; i++) await new Promise((r) => setImmediate(r))
  assert.ok(requests[n], `request #${n} was never sent`)
  return requests[n]
}

function user(id: number, wallet: { coins: number; premium: number }) {
  return { account_id: id, public_id: `p${id}`, username: `u${id}`, tag: 1, display_name: `U${id}`, email: `u${id}@test.com`, wallet_summary: wallet }
}

/** GET /gems/orders/{id} answer for player A: 650 gems just delivered. */
const ANSWER_FOR_A = {
  order: { public_id: 'order-a', pack_code: 'gems_650', gems: 650, amount_cents: 999, currency: 'eur', status: 'paid', delivered: true },
  wallet_summary: { coins: 100, premium: 650 },
}

beforeEach(() => {
  store.clear()
  requests.length = 0
})

test('the answer refreshes the wallet when the session is still the same', async () => {
  storeAuth(user(1, { coins: 100, premium: 0 }), 'token-a')
  const pending = fetchGemOrder('order-a')
  requests[0].answer(ANSWER_FOR_A)

  assert.equal((await pending).status, 'paid')
  assert.deepEqual(getCachedWalletBalances(), { coins: 100, premium: 650 })
  assert.deepEqual(getStoredAuth()?.user.wallet_summary, { coins: 100, premium: 650 })
})

test('a late answer for A is ignored once B is logged in', async () => {
  storeAuth(user(1, { coins: 100, premium: 0 }), 'token-a')
  const pending = fetchGemOrder('order-a')
  assert.equal(requests[0].authorization, 'Bearer token-a')

  clearAuth()
  storeAuth(user(2, { coins: 5, premium: 7 }), 'token-b')
  requests[0].answer(ANSWER_FOR_A)

  await assert.rejects(pending, StaleSessionError)
  assert.deepEqual(getCachedWalletBalances(), { coins: 5, premium: 7 })
  assert.equal(getStoredAuth()?.user.account_id, 2)
  assert.deepEqual(getStoredAuth()?.user.wallet_summary, { coins: 5, premium: 7 })
})

test('a late answer after logout does not bring the wallet cache back', async () => {
  storeAuth(user(1, { coins: 100, premium: 0 }), 'token-a')
  const pending = fetchGemOrder('order-a')
  clearAuth()
  requests[0].answer(ANSWER_FOR_A)

  await assert.rejects(pending, StaleSessionError)
  assert.equal(store.size, 0)
  assert.deepEqual(getCachedWalletBalances(), { coins: null, premium: null })
  assert.equal(getStoredAuth(), null)
})

test('a new session of the same account does not take the old answer either', async () => {
  storeAuth(user(1, { coins: 100, premium: 0 }), 'token-a')
  const pending = fetchGemOrder('order-a')
  storeAuth(user(1, { coins: 100, premium: 0 }), 'token-a2')
  requests[0].answer(ANSWER_FOR_A)

  await assert.rejects(pending, StaleSessionError)
  assert.deepEqual(getCachedWalletBalances(), { coins: 100, premium: 0 })
})

test('storing a wallet while logged out writes nothing', () => {
  storeWalletSummary({ coins: 1, premium: 2 })
  assert.equal(store.size, 0)
})

// ---------------------------------------------------------------- payment page being prepared (202)

const creatingOrder = { public_id: 'order-a', pack_code: 'gems_650', gems: 650, amount_cents: 999, currency: 'eur', status: 'creating' }
const PREPARING = { code: 'checkout_preparing', order: creatingOrder, checkout_url: null, retry_after_ms: 1000 }
const PAGE = 'https://checkout.stripe.com/c/pay/cs_test_a'
const WALLET = { coins: 100, premium: 0 }

function recordSleeps(): { sleeps: number[]; sleep: (ms: number) => Promise<void> } {
  const sleeps: number[] = []
  return { sleeps, sleep: async (ms) => void sleeps.push(ms) }
}

test('a 202 "being prepared" is waited for, then the payment page is opened', async () => {
  storeAuth(user(1, WALLET), 'token-a')
  const { sleeps, sleep } = recordSleeps()
  const pending = startGemCheckout('gems_650', 'fr', sleep)

  ;(await request(0)).answer(PREPARING, 202)
  ;(await request(1)).answer({ order: creatingOrder, checkout_url: null, wallet_summary: WALLET })
  ;(await request(2)).answer({ order: { ...creatingOrder, status: 'open' }, checkout_url: PAGE, wallet_summary: WALLET })

  assert.equal(await pending, PAGE)
  assert.deepEqual(requests.map((r) => `${r.method} ${r.url.replace(/^.*\/api/, '')}`), ['POST /gems/orders', 'GET /gems/orders/order-a', 'GET /gems/orders/order-a'])
  assert.deepEqual(sleeps, [1000, 1000])
})

test('a page ready at once needs no waiting', async () => {
  storeAuth(user(1, WALLET), 'token-a')
  const { sleeps, sleep } = recordSleeps()
  const pending = startGemCheckout('gems_650', 'fr', sleep)
  ;(await request(0)).answer({ order: { ...creatingOrder, status: 'open' }, checkout_url: PAGE }, 201)

  assert.equal(await pending, PAGE)
  assert.equal(requests.length, 1)
  assert.deepEqual(sleeps, [])
})

test('the wait is bounded: one more order attempt, then a temporary notice instead of an endless spinner', async () => {
  storeAuth(user(1, WALLET), 'token-a')
  const { sleeps, sleep } = recordSleeps()
  const pending = startGemCheckout('gems_650', 'fr', sleep)

  let n = 0
  for (let round = 0; round < 2; round++) {
    ;(await request(n++)).answer(PREPARING, 202)
    for (let i = 0; i < PREPARING_POLL_DELAYS_MS.length; i++) (await request(n++)).answer({ order: creatingOrder, checkout_url: null, wallet_summary: WALLET })
  }

  await assert.rejects(pending, GemCheckoutPreparingError)
  assert.equal(requests.filter((r) => r.method === 'POST').length, 2)
  assert.equal(requests.length, 2 + 2 * PREPARING_POLL_DELAYS_MS.length)
  assert.ok(sleeps.reduce((a, b) => a + b, 0) <= 30_000)
})

test('an order closed while waiting is ordered again, and a refusal stays a real error', async () => {
  storeAuth(user(1, WALLET), 'token-a')
  const { sleep } = recordSleeps()
  const pending = startGemCheckout('gems_650', 'fr', sleep)

  ;(await request(0)).answer(PREPARING, 202)
  // Stripe refused the creation meanwhile: the server closed the order
  ;(await request(1)).answer({ order: { ...creatingOrder, status: 'canceled' }, checkout_url: null, wallet_summary: WALLET })
  ;(await request(2)).answer({ message: 'The payment service is unavailable.', code: 'payment_provider_unavailable' }, 502)

  await assert.rejects(pending, (e: unknown) => e instanceof ApiError && e.code === 'payment_provider_unavailable')
  assert.equal(requests[2].method, 'POST')
})

test('the catalogue says why this player cannot order', async () => {
  storeAuth(user(1, WALLET), 'token-a')
  const adminOnly = fetchGemPacks()
  ;(await request(0)).answer({ available: false, unavailable_reason: 'admin_only', demo: true, packs: [] })
  assert.deepEqual(await adminOnly, { available: false, unavailableReason: 'admin_only', packs: [] })

  const open = fetchGemPacks()
  ;(await request(1)).answer({ available: true, unavailable_reason: null, demo: true, packs: [] })
  assert.equal((await open).unavailableReason, null)

  const off = fetchGemPacks()
  ;(await request(2)).answer({ available: false, demo: true, packs: [] })
  assert.equal((await off).unavailableReason, 'disabled')
})
