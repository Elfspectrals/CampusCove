import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseSportsBoard } from './sportsBoards.ts'

test('a core board parses its entries and last week champion', () => {
  const board = parseSportsBoard({
    board: { board: 'dance_cove_groove_hard_solo', week: '2026-W46', entries: [{ rank: 1, accountId: 7, name: 'Ana#0001', value: 12345 }], champion: { week: '2026-W45', accountId: 7, name: 'Ana#0001', value: 9000 } },
  })
  assert.equal(board.entries[0]?.value, 12345)
  assert.equal(board.champion?.week, '2026-W45')
})

test('a board with no champion and a malformed one', () => {
  assert.equal(parseSportsBoard({ board: { board: 'b', week: '2026-W46', entries: [], champion: null } }).champion, null)
  assert.throws(() => parseSportsBoard({ board: { board: 'b', week: '2026-W46', entries: [{ rank: 1, accountId: 1, name: 'x', value: 1.5 }], champion: null } }), /value/)
  assert.throws(() => parseSportsBoard({ week: '2026-W46' }), /response/)
})
