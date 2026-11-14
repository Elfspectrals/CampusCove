import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Decision 2026-11-14: shops have no price tags, tag posts or prompt bubble; aiming at an item shows only the item
// card. A branch written before that decision must not bring them back on merge.
const ROOT = join(import.meta.dirname, '..', '..', '..', '..')

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' }).filter(keep).map((name) => join(dir, name))
}

function offenders(paths: string[], pattern: RegExp): string[] {
  return paths.filter((path) => pattern.test(readFileSync(join(ROOT, path), 'utf8')))
}

test('no zone or store layout carries a price tag', () => {
  const data = [
    ...files('front/public/assets/zones', (n) => n.endsWith('.json')),
    ...files('front/public/assets/store', (n) => n.endsWith('.layout.json')),
  ]
  assert.deepEqual(offenders(data, /"priceTags"|"tag"\s*:/), [])
})

test('no front code or build script draws a price tag or its post', () => {
  const code = [
    ...files('front/src', (n) => /\.(ts|vue)$/.test(n) && !n.endsWith('noPriceTags.test.ts')),
    ...files('map-src/CampusCove', (n) => n.endsWith('.py') && n.split(/[\\/]/)[0] !== 'out'),
  ]
  assert.deepEqual(offenders(code, /priceTags?\b|PriceTag|createPriceTag|TagPost|TagFoot|price_tag|tag_at\(/), [])
})
