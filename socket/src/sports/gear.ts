import { callRealtimeBackend } from '../backend.ts'
import type { Player } from '../types.ts'

export function parseGear(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((code) => typeof code === 'string' && code !== '')) {
    throw new Error(`invalid sports gear from the API: ${JSON.stringify(raw)}`)
  }
  return raw
}

export async function ownedGear(player: Pick<Player, 'token'>): Promise<string[]> {
  const data = await callRealtimeBackend(player.token, '/sports/gear', 'GET')
  return parseGear(data?.gear)
}
