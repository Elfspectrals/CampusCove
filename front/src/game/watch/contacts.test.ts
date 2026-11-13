import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactRows, type ContactPlayer } from './contacts.ts'

const player = (accountId: string, distance: number): ContactPlayer => ({ sessionId: `s${accountId}`, accountId, pseudo: `p${accountId}#1`, distance })

test('order: requests received, friends in town by distance, nearby players, friends elsewhere', () => {
  const rows = contactRows(
    [
      { accountId: '1', name: 'Lou' },
      { accountId: '2', name: 'Sami' },
      { accountId: '3', name: 'Nora' },
    ],
    [{ accountId: '9', name: 'Kim', incoming: true }],
    [player('2', 320), player('1', 45), player('5', 10)],
  )
  assert.deepEqual(
    rows.map((r) => [r.kind, 'name' in r ? r.name : r.pseudo]),
    [
      ['request', 'Kim'],
      ['friendHere', 'Lou'],
      ['friendHere', 'Sami'],
      ['stranger', 'p5#1'],
      ['friendAway', 'Nora'],
    ],
  )
})

test('nearby players: within 30 m on the ground, the edge included', () => {
  const rows = contactRows([], [], [player('5', 30), player('6', 30.1)])
  assert.deepEqual(rows.map((r) => (r.kind === 'stranger' ? r.pseudo : null)), ['p5#1'])
})

test('a player already asked is marked, one who asked you is only listed as a request', () => {
  const rows = contactRows([], [{ accountId: '5', name: 'p5', incoming: false }, { accountId: '6', name: 'p6', incoming: true }], [player('5', 5), player('6', 5)])
  assert.deepEqual(rows, [
    { kind: 'request', accountId: '6', name: 'p6' },
    { kind: 'stranger', sessionId: 's5', pseudo: 'p5#1', distance: 5, asked: true },
  ])
})

test('nobody around and no friends: no rows', () => {
  assert.deepEqual(contactRows([], [], []), [])
})
