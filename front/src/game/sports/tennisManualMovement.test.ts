import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..', '..', '..')

function frontCode(): string[] {
  return readdirSync(join(ROOT, 'front/src'), { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.(ts|vue)$/.test(name) && !name.endsWith('tennisManualMovement.test.ts'))
    .map((name) => join('front/src', name))
}

test('nothing moves a tennis player but their own movement keys: no auto-run toward the ball', () => {
  const offenders = frontCode().filter((path) => /autoRun|AUTO_RUN|runStep\(|recoverySpot\(/.test(readFileSync(join(ROOT, path), 'utf8')))
  assert.deepEqual(offenders, [])
})
