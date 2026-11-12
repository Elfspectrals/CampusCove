import { RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { LiveKitConfig } from './config.ts'
import { unitAt } from './movement.ts'
import type { ClientPayload, GameClient, GameRoom } from './types.ts'
import { desiredVoices } from './voiceRange.ts'

export const VOICE_SYNC_MS = 500
const MAX_MUTED = 500

interface VoiceService {
  listParticipants(room: string): Promise<Array<{ identity: string, tracks: Array<{ sid: string, source: TrackSource }> }>>
  updateSubscriptions(room: string, identity: string, trackSids: string[], subscribe: boolean): Promise<void>
}

export function liveKitService(config: LiveKitConfig): VoiceService {
  return new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret)
}

export function onVoiceMute(room: GameRoom, client: GameClient, payload: ClientPayload): void {
  const player = room.players.get(client.sessionId)
  const accounts = payload?.accounts
  if (!player || !Array.isArray(accounts) || accounts.length > MAX_MUTED || !accounts.every((a) => typeof a === 'string' && /^\d{1,20}$/.test(a))) return
  player.voiceMuted = new Set(accounts)
}

export function createVoiceSync(room: GameRoom, service: VoiceService, roomName: string) {
  let heard = new Map<string, Set<string>>()
  let running = false

  async function sync(): Promise<void> {
    if (running) return
    running = true
    try {
      const participants = await service.listParticipants(roomName)
      const micOf = new Map(participants.map((p) => [p.identity, p.tracks.filter((t) => t.source === TrackSource.MICROPHONE).map((t) => t.sid)]))
      const players = [...room.players.values()]
        .filter((p) => micOf.has(p.sessionId))
        .map((p) => ({ sessionId: p.sessionId, accountId: String(p.accountId), x: p.x, z: p.z, unit: unitAt(room.housingUnits, p.x, p.z), muted: p.voiceMuted }))
      const desired = desiredVoices(players, heard)
      const next = new Map<string, Set<string>>()
      for (const [listener, speakers] of desired) {
        const before = heard.get(listener) ?? new Set<string>()
        const live = new Set([...speakers].filter((s) => (micOf.get(s) ?? []).length > 0))
        const added = [...live].filter((s) => !before.has(s)).flatMap((s) => micOf.get(s) ?? [])
        const removed = [...before].filter((s) => !live.has(s)).flatMap((s) => micOf.get(s) ?? [])
        if (added.length > 0) await service.updateSubscriptions(roomName, listener, added, true)
        if (removed.length > 0) await service.updateSubscriptions(roomName, listener, removed, false)
        next.set(listener, live)
      }
      heard = next
    } finally {
      running = false
    }
  }

  return { sync }
}
