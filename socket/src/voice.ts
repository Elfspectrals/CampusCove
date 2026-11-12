import { AccessToken } from 'livekit-server-sdk'
import type { LiveKitConfig } from './config.ts'

export const VOICE_TOKEN_TTL = '6h'

export function voiceRoomName(cityRoomId: string): string {
  return `city-${cityRoomId}`
}

export async function voiceToken(config: LiveKitConfig, cityRoomId: string, sessionId: string, pseudo: string): Promise<{ url: string, token: string }> {
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity: sessionId, name: pseudo, ttl: VOICE_TOKEN_TTL })
  // canSubscribe must stay true: LiveKit refuses even the socket's UpdateSubscriptions for a participant without it.
  // The client joins with autoSubscribe off, so it only hears the voices the socket subscribes it to (docs/VOICE.md).
  token.addGrant({ room: voiceRoomName(cityRoomId), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false })
  return { url: config.url, token: await token.toJwt() }
}
