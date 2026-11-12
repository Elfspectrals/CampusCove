import { AccessToken } from 'livekit-server-sdk'
import type { LiveKitConfig } from './config.ts'

export const VOICE_TOKEN_TTL = '6h'

export function voiceRoomName(cityRoomId: string): string {
  return `city-${cityRoomId}`
}

export async function voiceToken(config: LiveKitConfig, cityRoomId: string, sessionId: string, pseudo: string): Promise<{ url: string, token: string }> {
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity: sessionId, name: pseudo, ttl: VOICE_TOKEN_TTL })
  token.addGrant({ room: voiceRoomName(cityRoomId), roomJoin: true, canPublish: true, canSubscribe: false, canPublishData: false })
  return { url: config.url, token: await token.toJwt() }
}
