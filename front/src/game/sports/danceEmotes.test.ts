import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { clipOf, parseEmoteDefs, wheelRows } from './danceEmotes.ts'

const RULES = JSON.parse(readFileSync(new URL('../../../public/assets/sports/rules/dance.json', import.meta.url), 'utf8'))
const defs = parseEmoteDefs(RULES)

test('the wheel lists the 4 free dances then the 3 unlockable ones on keys 1 to 7', () => {
  const rows = wheelRows(defs, null)
  assert.deepEqual(rows.map((r) => [r.id, r.key, r.locked]), [
    ['bounce', 'Digit1', false],
    ['sway', 'Digit2', false],
    ['robot', 'Digit3', false],
    ['shuffle', 'Digit4', false],
    ['spin', 'Digit5', true],
    ['disco', 'Digit6', true],
    ['twist', 'Digit7', true],
  ])
})

test('a dance unlocked by the server opens on the wheel', () => {
  const rows = wheelRows(defs, new Set(['bounce', 'sway', 'robot', 'shuffle', 'spin']))
  assert.deepEqual(rows.filter((r) => r.locked).map((r) => r.id), ['disco', 'twist'])
})

test('each emote id maps to its clip, unknown ids to nothing', () => {
  assert.equal(clipOf(defs, 'bounce'), 'Dance')
  assert.equal(clipOf(defs, 'twist'), 'DanceTwist')
  assert.equal(clipOf(defs, 'moonwalk'), null)
  assert.throws(() => parseEmoteDefs({ freeEmotes: [{ id: 'x' }], unlockableEmotes: [] }), /freeEmotes\[0\]/)
})
