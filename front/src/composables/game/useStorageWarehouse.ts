import { watch, type ShallowRef } from 'vue'
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { cloneModel, modelSize } from '../../game/mallTemplates/templateProps'
import type { SfxName } from '../../game/sfx'
import { pileLayout } from '../../game/storage/storagePile'
import { openHouseInterior } from '../../game/town/openHouses'
import type { StorageLotContent, StorageOpenedPayload, StorageSalePayload } from '../../types/gameRealtime'

const WALK_SPEED = 1.6
const TURN_RATE = 6
const DOOR_RAISE_PER_S = 1.4
const ROLLED_SCALE = 0.06
const REVEAL_MS = 20000
const TARP_COLOR = 0x7a6f5c
const RING_COLOR = 0xffd36a
const RING_WIDTH = 0.12
const FLOOR_LIFT = 0.02
const OPEN_PHASES = new Set(['preview', 'bidding', 'hammering', 'result'])

interface StorageUnitPoint {
  id: string
  door: string
  threshold: [number, number, number]
  inside: [number, number, number]
}

interface Door {
  node: THREE.Object3D
  baseY: number
  height: number
  open: number
}

export interface StorageWarehouseDeps {
  getScene: () => THREE.Scene | undefined
  sale: ShallowRef<StorageSalePayload | null>
  units: () => readonly StorageUnitPoint[]
  playOn: (name: SfxName, object: THREE.Object3D) => void
}

export function useStorageWarehouse(deps: StorageWarehouseDeps) {
  const doors = new Map<string, Door>()
  const piles = new Map<string, { lotId: string; group: THREE.Group }>()
  const reveals = new Map<string, number>()
  let auctioneer: THREE.Object3D | null = null
  let auctioneerSpeed = 0
  let ring: THREE.Mesh | null = null
  const tarp = new THREE.MeshStandardMaterial({ color: TARP_COLOR, roughness: 0.95 })

  function unitById(id: string | undefined): StorageUnitPoint | undefined {
    return id ? deps.units().find((u) => u.id === id) : undefined
  }

  function door(unit: StorageUnitPoint): Door | null {
    const known = doors.get(unit.id)
    if (known) return known
    const node = openHouseInterior('storage')?.getObjectByName(unit.door)
    if (!node) return null
    const height = new THREE.Box3().setFromObject(node).getSize(new THREE.Vector3()).y
    const created = { node, baseY: node.position.y, height: height / Math.max(node.getWorldScale(new THREE.Vector3()).y, 1e-6), open: 0 }
    doors.set(unit.id, created)
    return created
  }

  function frame(unit: StorageUnitPoint) {
    const dx = unit.threshold[0] - unit.inside[0]
    const dz = unit.threshold[2] - unit.inside[2]
    const length = Math.hypot(dx, dz) || 1
    const dir = new THREE.Vector3(dx / length, 0, dz / length)
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const back = new THREE.Vector3(unit.inside[0], unit.inside[1], unit.inside[2]).addScaledVector(dir, -2)
    return { dir, side, back, yaw: Math.atan2(dir.x, dir.z) }
  }

  async function buildPile(unit: StorageUnitPoint, lotId: string, contents: readonly StorageLotContent[]): Promise<void> {
    const shown = contents.filter((c) => c.model_glb)
    const sizes = await Promise.all(shown.map((c) => modelSize(c.model_glb!)))
    const layout = pileLayout(shown.map((c, i) => ({ code: c.code, quantity: c.quantity, size: { w: sizes[i]![0], d: sizes[i]![2], h: sizes[i]![1] } })), lotId)
    const scene = deps.getScene()
    if (!scene || piles.get(unit.id)?.lotId !== lotId) return
    const group = piles.get(unit.id)!.group
    const { dir, side, back, yaw } = frame(unit)
    for (const [i, place] of layout.entries()) {
      const content = shown[i]!
      const [w, , d] = sizes[i]!
      const object = place.covered
        ? new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, place.height * 1.04, d * 1.06).translate(0, (place.height * 1.04) / 2, 0), tarp)
        : await cloneModel(content.model_glb!)
      if (piles.get(unit.id)?.group !== group) return disposeObject3D(object)
      object.position.copy(back).addScaledVector(dir, place.z).addScaledVector(side, place.x)
      object.position.y += place.y
      object.rotation.y = yaw + place.yaw
      group.add(object)
    }
    scene.add(group)
  }

  function showPile(unit: StorageUnitPoint, lotId: string, contents: readonly StorageLotContent[]): void {
    if (piles.get(unit.id)?.lotId === lotId) return
    clearPile(unit.id)
    piles.set(unit.id, { lotId, group: new THREE.Group() })
    void buildPile(unit, lotId, contents)
  }

  function clearPile(unitId: string): void {
    const pile = piles.get(unitId)
    if (!pile) return
    piles.delete(unitId)
    pile.group.removeFromParent()
    pile.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material === tarp) o.geometry.dispose()
    })
  }

  function ensureRing(): THREE.Mesh {
    if (ring) return ring
    const radius = deps.sale.value?.bidZone?.radius ?? 6
    ring = new THREE.Mesh(
      new THREE.RingGeometry(radius - RING_WIDTH, radius, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.55, depthWrite: false }),
    )
    deps.getScene()?.add(ring)
    return ring
  }

  function openUnits(s: StorageSalePayload | null): Set<string> {
    const open = new Set(reveals.keys())
    if (s?.active && s.unitId && s.phase && OPEN_PHASES.has(s.phase)) open.add(s.unitId)
    return open
  }

  watch(deps.sale, (next, previous) => {
    const unit = unitById(next?.unitId)
    if (next?.active && unit && next.lot) showPile(unit, next.lot.id, next.lot.contents)
    for (const unitId of [...piles.keys()]) if (!openUnits(next).has(unitId)) clearPile(unitId)
    if (!auctioneer) return
    if (next?.leader && next.leader.amount !== previous?.leader?.amount) deps.playOn('storage_bid', auctioneer)
    if (next?.phase === 'result' && previous?.phase !== 'result') deps.playOn('storage_gavel', auctioneer)
  })

  function onOpened(data: StorageOpenedPayload): void {
    const unit = unitById(data.unitId ?? undefined)
    if (!unit) return
    reveals.set(unit.id, Date.now() + REVEAL_MS)
    clearPile(unit.id)
    showPile(unit, data.lotId, data.contents)
    if (auctioneer) deps.playOn('storage_gavel', auctioneer)
  }

  function tickDoors(dt: number): void {
    const now = Date.now()
    for (const [unitId, until] of reveals) {
      if (now >= until) {
        reveals.delete(unitId)
        clearPile(unitId)
      }
    }
    const open = openUnits(deps.sale.value)
    for (const unit of deps.units()) {
      const d = open.has(unit.id) || doors.has(unit.id) ? door(unit) : null
      if (!d) continue
      const target = open.has(unit.id) ? 1 : 0
      if (d.open === target) continue
      if (d.open === 0 && target === 1) deps.playOn('storage_shutter', d.node)
      d.open = target > d.open ? Math.min(1, d.open + dt * DOOR_RAISE_PER_S) : Math.max(0, d.open - dt * DOOR_RAISE_PER_S)
      const scale = 1 - (1 - ROLLED_SCALE) * d.open
      d.node.scale.y = scale
      d.node.position.y = d.baseY + d.height * (1 - scale)
    }
  }

  function tickAuctioneer(dt: number): void {
    const s = deps.sale.value
    const goal = s?.auctioneer
    if (!auctioneer || !goal) return
    const dx = goal.x - auctioneer.position.x
    const dz = goal.z - auctioneer.position.z
    const distance = Math.hypot(dx, dz)
    const step = Math.min(distance, WALK_SPEED * dt)
    auctioneerSpeed = distance > 0.05 ? WALK_SPEED : 0
    if (distance > 0.05) {
      auctioneer.position.x += (dx / distance) * step
      auctioneer.position.z += (dz / distance) * step
    }
    auctioneer.position.y = goal.y
    const facing = distance > 0.05 ? Math.atan2(dx, dz) : goal.yaw
    if (facing !== undefined) {
      const delta = Math.atan2(Math.sin(facing - auctioneer.rotation.y), Math.cos(facing - auctioneer.rotation.y))
      auctioneer.rotation.y += delta * Math.min(1, TURN_RATE * dt)
    }
  }

  function tickRing(): void {
    const zone = deps.sale.value?.bidZone
    const bidding = deps.sale.value?.active && deps.sale.value.phase === 'bidding' && zone
    if (!bidding) {
      if (ring) ring.visible = false
      return
    }
    const r = ensureRing()
    const unit = unitById(deps.sale.value?.unitId)
    r.visible = true
    r.position.set(zone.x, (unit?.threshold[1] ?? 0) + FLOOR_LIFT, zone.z)
  }

  function tick(dt: number): void {
    tickAuctioneer(dt)
    tickDoors(dt)
    tickRing()
  }

  function dispose(): void {
    for (const unitId of [...piles.keys()]) clearPile(unitId)
    if (ring) {
      ring.removeFromParent()
      ring.geometry.dispose()
      ;(ring.material as THREE.Material).dispose()
    }
    tarp.dispose()
  }

  return {
    tick,
    dispose,
    onOpened,
    setAuctioneer: (npc: THREE.Object3D) => {
      auctioneer = npc
    },
    npcSpeed: (npc: THREE.Object3D) => (npc === auctioneer ? auctioneerSpeed : 0),
  }
}
