import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseCoreBoard, skatingBoard } from './skatingBoard.ts'

const reply = (entries: number[], champion: number | null) => ({
  board: {
    board: 'skate_3',
    week: '2026-W47',
    entries: entries.map((value, i) => ({ rank: i + 1, accountId: i + 1, name: `P${i + 1}`, value })),
    champion: champion === null ? null : { week: '2026-W46', accountId: 9, name: 'Champ', value: champion },
  },
})

test('the three core boards become the skating lap boards, top 5 each, with last week champions', () => {
  const board = skatingBoard([reply([21000], null), reply([58000, 59000, 60000, 61000, 62000, 63000], 57000), reply([], 95000)].map(parseCoreBoard))
  assert.equal(board.week, '2026-W47')
  assert.deepEqual(board.boards.map((b) => [b.laps, b.entries.length]), [[1, 1], [3, 5], [5, 0]])
  assert.deepEqual(board.champions, [{ laps: 3, name: 'Champ', timeMs: 57000 }, { laps: 5, name: 'Champ', timeMs: 95000 }])
})

test('a malformed core board is refused', () => {
  assert.throws(() => parseCoreBoard({ board: { week: '2026-W47', entries: [{ name: 'A' }], champion: null } }), /entry/)
  assert.throws(() => parseCoreBoard({}), /Invalid skating board/)
  assert.throws(() => skatingBoard([]), /count/)
})
