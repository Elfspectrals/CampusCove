import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ATM_MAX_AMOUNT, parseAmount, parseRecipient } from './bank.ts'

test('a recipient is a name and a tag of up to four digits, as shown above players', () => {
  assert.deepEqual(parseRecipient('playtester2#0829'), { username: 'playtester2', tag: 829 })
  assert.deepEqual(parseRecipient('  Jean Paul # 7 '), { username: 'Jean Paul', tag: 7 })
})

test('a recipient without a tag or with a five-digit tag is refused', () => {
  assert.equal(parseRecipient('playtester2'), null)
  assert.equal(parseRecipient('playtester2#12345'), null)
  assert.equal(parseRecipient('#0829'), null)
})

test('an amount is a whole number from 1 to the ATM maximum', () => {
  assert.equal(parseAmount('1'), 1)
  assert.equal(parseAmount(String(ATM_MAX_AMOUNT)), ATM_MAX_AMOUNT)
  assert.equal(parseAmount(String(ATM_MAX_AMOUNT + 1)), null)
  assert.equal(parseAmount('0'), null)
  assert.equal(parseAmount('2.5'), null)
  assert.equal(parseAmount('-3'), null)
  assert.equal(parseAmount(''), null)
})
