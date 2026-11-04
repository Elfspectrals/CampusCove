import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.CLOUDFLARE_ORIGIN_SECRET = 'origin-secret'
const { clientIp } = await import('./backend.ts')

const cloudflare = { 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '1.2.3.4, 172.70.0.1' }

test('reads the Cloudflare client IP only with the origin secret', () => {
  assert.equal(clientIp(new Headers({ ...cloudflare, 'x-origin-secret': 'origin-secret' }), '10.0.0.1'), '1.2.3.4')
  assert.equal(clientIp(new Headers({ ...cloudflare, 'x-origin-secret': 'wrong' }), '10.0.0.1'), '172.70.0.1')
  assert.equal(clientIp(new Headers(cloudflare), '10.0.0.1'), '172.70.0.1')
})

test('falls back to the last forwarded hop, then to the peer', () => {
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '9.9.9.9, 5.5.5.5', 'cf-connecting-ip': '6.6.6.6' }), '10.0.0.1'), '5.5.5.5')
  assert.equal(clientIp(new Headers(), '10.0.0.1'), '10.0.0.1')
  assert.equal(clientIp(new Headers(), ['10.0.0.2']), '10.0.0.2')
})
