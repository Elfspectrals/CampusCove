import assert from 'node:assert/strict'
import { test } from 'node:test'
import { wrapChatLines } from './chatBubble.ts'

const oneUnitPerChar = (s: string) => s.length

test('a short message stays on one line', () => {
  assert.deepEqual(wrapChatLines('hello there', 20, oneUnitPerChar), ['hello there'])
})

test('a line exactly at the width is kept, one more word wraps', () => {
  assert.deepEqual(wrapChatLines('aaaa bbbbb', 10, oneUnitPerChar), ['aaaa bbbbb'])
  assert.deepEqual(wrapChatLines('aaaa bbbbb c', 10, oneUnitPerChar), ['aaaa bbbbb', 'c'])
})

test('a word longer than the width is cut across lines', () => {
  assert.deepEqual(wrapChatLines('abcdefghij', 4, oneUnitPerChar), ['abcd', 'efgh', 'ij'])
})

test('a long word after a short one starts on its own line', () => {
  assert.deepEqual(wrapChatLines('hi abcdefgh', 4, oneUnitPerChar), ['hi', 'abcd', 'efgh'])
})
