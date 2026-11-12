import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_VOLUME, clampVolume, micLevel, parseMutedAccounts, parsePlayerVolumes, parseVoiceSettings, toggleMutedAccount, withPlayerVolume } from './voice.ts'

test('the voice settings default to push-to-talk, default devices and full volume', () => {
  const defaults = { mode: 'pushToTalk', inputDeviceId: null, outputDeviceId: null, inputVolume: 1, outputVolume: 1 }
  assert.deepEqual(parseVoiceSettings(null), defaults)
  assert.deepEqual(parseVoiceSettings('not json'), defaults)
  assert.deepEqual(parseVoiceSettings('{"mode":"shout"}'), defaults)
})

test('saved voice settings keep the open mic, the chosen devices and the volumes', () => {
  assert.deepEqual(parseVoiceSettings('{"mode":"openMic","inputDeviceId":"mic-2","outputDeviceId":"headset","inputVolume":1.5,"outputVolume":0.4}'), {
    mode: 'openMic',
    inputDeviceId: 'mic-2',
    outputDeviceId: 'headset',
    inputVolume: 1.5,
    outputVolume: 0.4,
  })
  assert.deepEqual(parseVoiceSettings('{"inputDeviceId":"","outputDeviceId":7}').inputDeviceId, null)
})

test('a volume stays between 0 and 200 % in 5 % steps', () => {
  assert.equal(clampVolume(0), 0)
  assert.equal(clampVolume(MAX_VOLUME), MAX_VOLUME)
  assert.equal(clampVolume(MAX_VOLUME + 1), MAX_VOLUME)
  assert.equal(clampVolume(-0.3), 0)
  assert.ok(Math.abs(clampVolume(0.73) - 0.75) < 1e-9)
  assert.equal(clampVolume(Number.NaN), 1)
})

test('the mic level is 0 in silence and full for a loud signal', () => {
  assert.equal(micLevel(new Float32Array(128)), 0)
  assert.equal(micLevel(new Float32Array(128).fill(0.5)), 1)
  assert.ok(Math.abs(micLevel(new Float32Array(128).fill(0.1)) - 0.4) < 1e-6)
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

test('a player volume is saved per account, and back to 100 % it is forgotten', () => {
  const louder = withPlayerVolume({}, '42', 1.5)
  assert.deepEqual(louder, { '42': 1.5 })
  assert.deepEqual(withPlayerVolume(louder, '7', 0.3), { '42': 1.5, '7': 0.3 })
  assert.deepEqual(withPlayerVolume(louder, '42', 1), {})
  assert.deepEqual(withPlayerVolume({}, '42', MAX_VOLUME + 3), { '42': MAX_VOLUME })
})

test('saved player volumes keep only account ids with a number, clamped', () => {
  assert.deepEqual(parsePlayerVolumes('{"42":0.5,"7":9,"bob":1,"8":"loud"}'), { '42': 0.5, '7': MAX_VOLUME })
  assert.deepEqual(parsePlayerVolumes('[0.5]'), {})
  assert.deepEqual(parsePlayerVolumes('nope'), {})
  assert.deepEqual(parsePlayerVolumes(null), {})
})
