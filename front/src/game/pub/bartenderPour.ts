import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { createGltfLoader } from '../gltfLoaderFactory'
import type { PubLayout } from '../world/worldManifest'

/** Seconds for the full glass to glide from the taps to the serving spot. */
const SLIDE_S = 0.6
/** Another player's glass stays on the bar this long before vanishing (we never learn when they pick it up). */
const OTHERS_GLASS_LINGER_S = 6
const BARTENDER_TURN_SPEED = 4
const LIQUID_NODE = /liquid|beer|stout|lager|wine|whisky|vodka|foam|head/i

interface Glass {
  sessionId: string
  code: string
  model: THREE.Object3D | null
  liquid: THREE.Object3D[]
  elapsed: number
  durationMs: number
  served: boolean
  lingerLeft: number
}

/**
 * The barman's service on the pub bar: on `pub_pouring` a glass appears on the taps and fills up, then slides
 * to the serving spot where the customer picks it up. Everything lives in the pub interior group, so it hides
 * with the building when the player is far away.
 */
export function createBartenderPour(interior: THREE.Group, layout: PubLayout) {
  const loader = createGltfLoader()
  const models = new Map<string, Promise<THREE.Object3D>>()
  const glasses: Glass[] = []
  interior.updateWorldMatrix(true, false)
  const toLocal = interior.matrixWorld.clone().invert()
  const tapsSpot = new THREE.Vector3().fromArray(layout.taps).applyMatrix4(toLocal)
  const serveSpot = new THREE.Vector3().fromArray(layout.serve).applyMatrix4(toLocal)
  const bartender = interior.getObjectByName('NPC_Bartender') ?? null
  const restRotation = bartender?.rotation.y ?? 0
  const pourRotation = bartender ? restRotation + yawTowards(bartender.position, tapsSpot) - yawTowards(bartender.position, bartenderFacing(bartender, layout)) : 0

  function bartenderFacing(npc: THREE.Object3D, pub: PubLayout): THREE.Vector3 {
    const ahead = new THREE.Vector3(-Math.sin(pub.bartenderYaw), 0, -Math.cos(pub.bartenderYaw))
    return new THREE.Vector3().fromArray(pub.bartender).add(ahead).applyMatrix4(toLocal).setY(npc.position.y)
  }

  function yawTowards(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(-(to.x - from.x), -(to.z - from.z))
  }

  function load(url: string): Promise<THREE.Object3D> {
    let model = models.get(url)
    if (!model) {
      model = loader.loadAsync(url).then((gltf) => gltf.scene)
      models.set(url, model)
    }
    return model
  }

  function liquidNodes(model: THREE.Object3D): THREE.Object3D[] {
    const found: THREE.Object3D[] = []
    model.traverse((obj) => {
      if (obj !== model && obj instanceof THREE.Mesh && LIQUID_NODE.test(obj.name)) found.push(obj)
    })
    return found.length > 0 ? found : [model]
  }

  function removeGlass(glass: Glass): void {
    if (glass.model) {
      glass.model.removeFromParent()
      disposeObject3D(glass.model)
    }
    glasses.splice(glasses.indexOf(glass), 1)
  }

  function addGlass(sessionId: string, code: string, modelUrl: string, durationMs: number, served: boolean): void {
    const previous = glasses.find((g) => g.sessionId === sessionId)
    if (previous) removeGlass(previous)
    const glass: Glass = { sessionId, code, model: null, liquid: [], elapsed: 0, durationMs, served, lingerLeft: OTHERS_GLASS_LINGER_S }
    glasses.push(glass)
    load(modelUrl)
      .then((template) => {
        if (!glasses.includes(glass)) return
        const model = template.clone(true)
        glass.model = model
        glass.liquid = liquidNodes(model)
        interior.add(model)
        place(glass)
      })
      .catch((err: unknown) => console.error('[pub] drink model failed to load', modelUrl, err))
  }

  /** `pub_pouring`: the barman pulls a drink for `sessionId`. */
  function pour(sessionId: string, code: string, modelUrl: string, durationMs: number): void {
    addGlass(sessionId, code, modelUrl, durationMs, false)
  }

  /** `pub_served`: this player's drink is ready. A counter order has no pour, so the glass appears straight on the bar. */
  function serve(sessionId: string, code: string, modelUrl: string): void {
    const glass = glasses.find((g) => g.sessionId === sessionId)
    if (glass && glass.code === code) {
      glass.served = true
      return
    }
    addGlass(sessionId, code, modelUrl, 0, true)
  }

  /** The drink waiting for `sessionId` on the serving spot, if it has arrived there. */
  function servedCode(sessionId: string): string | null {
    const glass = glasses.find((g) => g.sessionId === sessionId)
    return glass && glass.served && slideProgress(glass) >= 1 ? glass.code : null
  }

  function pickUp(sessionId: string): string | null {
    const code = servedCode(sessionId)
    if (code === null) return null
    removeGlass(glasses.find((g) => g.sessionId === sessionId)!)
    return code
  }

  function fillProgress(glass: Glass): number {
    return glass.durationMs <= 0 ? 1 : Math.min(1, (glass.elapsed * 1000) / glass.durationMs)
  }

  function slideProgress(glass: Glass): number {
    const sliding = glass.elapsed - glass.durationMs / 1000
    return Math.min(1, Math.max(0, sliding / SLIDE_S))
  }

  function place(glass: Glass): void {
    if (!glass.model) return
    const fill = fillProgress(glass)
    for (const node of glass.liquid) node.scale.y = Math.max(0.02, fill)
    const slide = slideProgress(glass)
    const eased = slide * slide * (3 - 2 * slide)
    glass.model.position.lerpVectors(tapsSpot, serveSpot, eased)
  }

  function update(dt: number): void {
    let pouring = false
    for (const glass of [...glasses]) {
      glass.elapsed += dt
      if (fillProgress(glass) < 1) pouring = true
      place(glass)
      if (!glass.served && slideProgress(glass) >= 1) {
        glass.lingerLeft -= dt
        if (glass.lingerLeft <= 0) removeGlass(glass)
      }
    }
    if (!bartender) return
    const target = pouring ? pourRotation : restRotation
    const delta = Math.atan2(Math.sin(target - bartender.rotation.y), Math.cos(target - bartender.rotation.y))
    const step = BARTENDER_TURN_SPEED * dt
    bartender.rotation.y += Math.abs(delta) <= step ? delta : Math.sign(delta) * step
  }

  function dispose(): void {
    for (const glass of [...glasses]) removeGlass(glass)
    if (bartender) bartender.rotation.y = restRotation
  }

  return { pour, serve, servedCode, pickUp, update, dispose }
}
