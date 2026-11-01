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
  authorization: string | undefined
  answer: (body: unknown) => void
}
const requests: PendingRequest[] = []
globalThis.fetch = ((_url: string, init?: RequestInit) =>
  new Promise((resolve) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    requests.push({
      authorization: headers.Authorization,
      answer: (body) => resolve({ ok: true, status: 200, json: async () => body } as Response),
    })
  })) as typeof fetch

const { StaleSessionError, fetchGemOrder } = await import('./gems.ts')
const { clearAuth, getCachedWalletBalances, getStoredAuth, storeAuth, storeWalletSummary } = await import('./session.ts')

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
