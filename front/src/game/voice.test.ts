import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMutedAccounts, parseVoiceSettings, toggleMutedAccount } from './voice.ts'

test('the voice mode defaults to push-to-talk and keeps a saved open mic', () => {
  assert.deepEqual(parseVoiceSettings(null), { mode: 'pushToTalk' })
  assert.deepEqual(parseVoiceSettings('{"mode":"openMic"}'), { mode: 'openMic' })
  assert.deepEqual(parseVoiceSettings('{"mode":"shout"}'), { mode: 'pushToTalk' })
  assert.deepEqual(parseVoiceSettings('not json'), { mode: 'pushToTalk' })
})

test('muting an account adds it once and muting it again lets it be heard', () => {
  const muted = toggleMutedAccount([], '42')
  assert.deepEqual(muted, ['42'])
  assert.deepEqual(toggleMutedAccount(muted, '7'), ['42', '7'])
  assert.deepEqual(toggleMutedAccount(muted, '42'), [])
})

test('saved muted accounts keep only account ids, once each', () => {
  assert.deepEqual(parseMutedAccounts('["42","42",7,"", "9"]'), ['42', '9'])
  assert.deepEqual(parseMutedAccounts('{"42":true}'), [])
  assert.deepEqual(parseMutedAccounts(null), [])
  assert.deepEqual(parseMutedAccounts('nope'), [])
})
