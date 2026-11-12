// Room side of the NPC behavior trees (docs/NPC_BEHAVIOR.md): loads npc/behavior.json and the zones it names,
// ticks every brain and broadcasts what changed. Re-reads the file every few seconds so the admin editor's saves
// show up in a running game.
import type { Json } from './backend.ts'
import { parseNpcBehavior, type CropKind, type NpcBehaviorFile, type Vec3Tuple } from './npcBehavior.ts'
import { NpcBrain, type NpcHome, type NpcShop, type NpcState, type PlantSource } from './npcBrain.ts'
import { shopNav } from './shopNav.ts'
import { CheckoutLine, shopLayout } from './shopSpots.ts'
import type { GameClient, Player } from './types.ts'
import { readWorldFile, worldCropPlants, worldOrchard } from './world.ts'

export const NPC_RELOAD_MS = 5000
export const MAX_POINT_DISTANCE = 60
const BEHAVIOR_FILE = 'npc/behavior.json'
const PARIS_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: 'numeric', hourCycle: 'h23' })

export interface NpcRoom {
  players: Map<string, Player>
  forEachClient(callback: (client: GameClient) => void): void
}

/** The NPC's spot in its zone file; refuses NPCs that sell, buy or hold a staff role. */
export function zoneNpcHome(zone: string, decor: Json, npcId: string): NpcHome {
  const props: Json[] = Array.isArray(decor?.props) ? decor.props : []
  const npc = props.find((p) => p?.kind === 'npc' && p.id === npcId)
  if (!npc) throw new Error(`no NPC "${npcId}" in zones/${zone}.json`)
  if (npc.role !== undefined) throw new Error(`${zone}/${npcId} is the ${npc.role}: staff keep their own behaviour`)
  if (Array.isArray(decor.areas) && decor.areas.some((a: Json) => a?.npc === npcId)) throw new Error(`${zone}/${npcId} works in a sale area and must stay at its counter`)
  const position = npc.position as unknown
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite)) throw new Error(`${zone}/${npcId}: invalid position`)
  const yaw = Number.isFinite(npc.yaw) ? (npc.yaw as number) : 0
  return { position: position as Vec3Tuple, yaw }
}

/** Crops and orchard trees by kind, one tuple per plant so Pick Crop can tell a tree from a crop by identity. */
export function plantSource(crops: readonly { x: number; y: number; z: number; crop: string }[], trees: readonly { x: number; y: number; z: number }[]): PlantSource {
  const byKind = new Map<CropKind, Vec3Tuple[]>()
  const add = (kind: CropKind, plant: Vec3Tuple) => byKind.set(kind, [...(byKind.get(kind) ?? []), plant])
  for (const c of crops) {
    const plant: Vec3Tuple = [c.x, c.y, c.z]
    add(c.crop as CropKind, plant)
    add('any', plant)
  }
  for (const t of trees) {
    const plant: Vec3Tuple = [t.x, t.y, t.z]
    add('apple_tree', plant)
    add('any', plant)
  }
  return (kind) => byKind.get(kind) ?? []
}

/** One layout and one checkout line per shop zone, shared by its shoppers. */
function shopsFor(): (zone: string, decor: Json) => NpcShop {
  const shops = new Map<string, NpcShop>()
  return (zone, decor) => {
    let shop = shops.get(zone)
    if (!shop) {
      shop = { layout: shopLayout(decor), line: new CheckoutLine(), nav: shopNav(decor) }
      shops.set(zone, shop)
    }
    return shop
  }
}

export function buildBrains(file: NpcBehaviorFile, zones: ReadonlyMap<string, Json>, random: () => number = Math.random, plants: PlantSource = () => []): NpcBrain[] {
  const shopOf = shopsFor()
  return file.npcs.map((a) => {
    const decor = zones.get(a.zone)
    if (!decor) throw new Error(`no zone "${a.zone}"`)
    const home = zoneNpcHome(a.zone, decor, a.npc)
    const far = Object.entries(a.points).find(([, [x, , z]]) => Math.hypot(x - home.position[0], z - home.position[2]) > MAX_POINT_DISTANCE)
    if (far) throw new Error(`${a.zone}/${a.npc}: point ${far[0]} is over ${MAX_POINT_DISTANCE} m from the NPC`)
    return new NpcBrain(`${a.zone}/${a.npc}`, file.trees.get(a.tree)!, home, a.points, { random, plants, shop: shopOf(a.zone, decor) })
  })
}

function warn(context: string, error: unknown): void {
  console.warn(`[npcs] ${context}:`, error instanceof Error ? error.message : error)
}

export class NpcDirector {
  private brains: NpcBrain[] = []
  private source: string | null = null
  private loading = false
  private readonly room: NpcRoom

  constructor(room: NpcRoom) {
    this.room = room
  }

  /** Reads the file again; a changed, valid file replaces every brain (NPCs restart from home). */
  async reload(): Promise<void> {
    if (this.loading) return
    this.loading = true
    try {
      const raw = await readWorldFile(BEHAVIOR_FILE)
      const source = JSON.stringify(raw)
      if (source === this.source) return
      this.source = source
      const file = parseNpcBehavior(raw)
      const zoneKeys = [...new Set(file.npcs.map((a) => a.zone))]
      const zones = new Map(await Promise.all(zoneKeys.map(async (zone) => [zone, await readWorldFile(`zones/${zone}.json`)] as const)))
      this.brains = buildBrains(file, zones, Math.random, plantSource(worldCropPlants(), worldOrchard()?.trees ?? []))
      console.log(`[npcs] ${this.brains.length} NPC brain(s) from ${file.trees.size} tree(s)`)
      const snapshot = this.snapshot(Date.now())
      this.room.forEachClient((c) => c.send('npcs', snapshot))
    } catch (error) {
      warn('behavior file refused, keeping the previous one', error)
    } finally {
      this.loading = false
    }
  }

  tick(now: number): void {
    if (this.brains.length === 0) return
    const world = { now, hour: Number(PARIS_HOUR.format(now)), players: [...this.room.players.values()] }
    for (const brain of this.brains) {
      if (!brain.tick(world)) continue
      const state = brain.state(now)
      this.room.forEachClient((c) => c.send('npc_state', state))
    }
  }

  snapshot(now: number): { npcs: NpcState[] } {
    return { npcs: this.brains.map((b) => b.state(now)) }
  }
}

