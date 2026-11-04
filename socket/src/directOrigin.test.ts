import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.CLOUDFLARE_ORIGIN_SECRET = 'origin-secret'
process.env.CLOUDFLARE_ENFORCE_ORIGIN = 'true'
const { isDirectOrigin } = await import('./backend.ts')

test('only joins that came through Cloudflare pass when enforced', () => {
  assert.equal(isDirectOrigin(new Headers({ 'x-origin-secret': 'origin-secret', 'cf-connecting-ip': '1.2.3.4' })), false)
  assert.equal(isDirectOrigin(new Headers({ 'x-origin-secret': 'wrong', 'cf-connecting-ip': '1.2.3.4' })), true)
  assert.equal(isDirectOrigin(new Headers({ 'x-forwarded-for': '1.2.3.4' })), true)
})
