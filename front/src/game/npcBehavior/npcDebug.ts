import type { BbValue } from './npcBehavior.ts'

export const NPC_DEBUG_URL = '/__editor/npc-debug'
const SUBTREE_SEPARATOR = '/'

type Result = { status: 'success' | 'failure'; at: number }

export interface NpcDebugEntry {
  id: string
  active: string[]
  results: Record<string, Result>
  values: Record<string, BbValue>
  target: string | null
  clip: string
  say: string | null
}

export interface NpcDebugResponse {
  now: number
  instances: Array<{ roomId: string; npcs: NpcDebugEntry[] }>
}

export interface NpcDebugView {
  now: number
  roomId: string
  active: Set<string>
  results: Map<string, Result>
  entry: NpcDebugEntry
}

function shownId(id: string): string {
  return id.split(SUBTREE_SEPARATOR)[0]!
}

export function debugView(response: NpcDebugResponse, npcId: string): NpcDebugView | null {
  for (const instance of response.instances) {
    const entry = instance.npcs.find((n) => n.id === npcId)
    if (!entry) continue
    const results = new Map(Object.entries(entry.results).filter(([id]) => shownId(id) === id))
    return { now: response.now, roomId: instance.roomId, active: new Set(entry.active.map(shownId)), results, entry }
  }
  return null
}
