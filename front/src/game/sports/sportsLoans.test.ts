import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { applySportsLoans, clearSportsLoans, forgetSportsLoans, hasSportsLoan, sportsLoansOf } from './sportsLoans.ts'

beforeEach(() => clearSportsLoans())

test('the last sports_loans of a player replaces their loans', () => {
  applySportsLoans({ sessionId: 'a', loans: ['climbing_shoes'] })
  applySportsLoans({ sessionId: 'a', loans: ['climbing_shoes', 'football'] })
  assert.deepEqual(sportsLoansOf('a'), ['climbing_shoes', 'football'])
  assert.equal(hasSportsLoan('a', 'football'), true)
  assert.equal(hasSportsLoan('b', 'football'), false)
})

test('an empty list, a player leaving or a new room takes the loans back', () => {
  applySportsLoans({ sessionId: 'a', loans: ['football'] })
  applySportsLoans({ sessionId: 'b', loans: ['basketball'] })
  applySportsLoans({ sessionId: 'c', loans: ['tennis_ball'] })
  applySportsLoans({ sessionId: 'a', loans: [] })
  forgetSportsLoans('b')
  assert.deepEqual([sportsLoansOf('a'), sportsLoansOf('b'), sportsLoansOf('c')], [[], [], ['tennis_ball']])
  clearSportsLoans()
  assert.deepEqual(sportsLoansOf('c'), [])
})
