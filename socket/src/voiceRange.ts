export const VOICE_RANGE = 30
export const VOICE_RELEASE_RANGE = 34

export interface VoiceListener {
  sessionId: string
  accountId: string
  x: number
  z: number
  unit: unknown
  muted: ReadonlySet<string>
}

export function desiredVoices(players: readonly VoiceListener[], current: ReadonlyMap<string, ReadonlySet<string>>): Map<string, Set<string>> {
  const desired = new Map<string, Set<string>>()
  for (const listener of players) {
    const heard = new Set<string>()
    const already = current.get(listener.sessionId)
    for (const speaker of players) {
      if (speaker.sessionId === listener.sessionId || listener.muted.has(speaker.accountId) || speaker.unit !== listener.unit) continue
      const range = already?.has(speaker.sessionId) ? VOICE_RELEASE_RANGE : VOICE_RANGE
      if (Math.hypot(speaker.x - listener.x, speaker.z - listener.z) <= range) heard.add(speaker.sessionId)
    }
    desired.set(listener.sessionId, heard)
  }
  return desired
}
