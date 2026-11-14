import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSkatingBoard } from './skatingBoard.ts'

test('a skating board parses its lap boards and last week champions', () => {
  const raw = { week: '2026-W47', boards: [{ laps: 3, entries: [{ name: 'Ana#0001', timeMs: 58000 }] }], champions: [{ laps: 5, name: 'Ben#0002', timeMs: 95000 }] }
  assert.deepEqual(parseSkatingBoard(raw), raw)
})

test('a malformed skating board is refused', () => {
  assert.throws(() => parseSkatingBoard({ week: '2026-W47', boards: [{ laps: '3', entries: [] }], champions: [] }), /lap count/)
  assert.throws(() => parseSkatingBoard({ week: '2026-W47', boards: [{ laps: 3, entries: [{ name: 'Ana' }] }], champions: [] }), /entry/)
  assert.throws(() => parseSkatingBoard(null), /Invalid skating board/)
})
