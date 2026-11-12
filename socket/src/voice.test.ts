import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TokenVerifier } from 'livekit-server-sdk'
import { voiceRoomName, voiceToken } from './voice.ts'

const config = { url: 'ws://localhost:7880', apiUrl: 'http://localhost:7880', apiKey: 'devkey', apiSecret: 'secret-at-least-32-characters-long!' }

test('the token only opens the voice room of this city instance, as this session, and cannot subscribe on its own', async () => {
  const { url, token } = await voiceToken(config, 'abc123', 'session-1', 'Bob#0420')
  const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(token)
  assert.equal(url, 'ws://localhost:7880')
  assert.equal(claims.sub, 'session-1')
  assert.equal(claims.name, 'Bob#0420')
  assert.deepEqual(
    { room: claims.video?.room, roomJoin: claims.video?.roomJoin, canPublish: claims.video?.canPublish, canSubscribe: claims.video?.canSubscribe, canPublishData: claims.video?.canPublishData },
    { room: voiceRoomName('abc123'), roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false }
  )
})

test('a token signed with another secret is rejected', async () => {
  const { token } = await voiceToken(config, 'abc123', 'session-1', 'Bob#0420')
  await assert.rejects(new TokenVerifier(config.apiKey, 'another-secret-of-at-least-32-chars').verify(token))
})
