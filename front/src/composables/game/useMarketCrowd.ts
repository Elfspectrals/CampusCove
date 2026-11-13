import * as THREE from 'three'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { SHOPPER_SPEED, crowdPath, lapSeconds, shopperAt, type CrowdWaypoint } from '../../game/market/marketCrowd.ts'
import type { MarketSnapshot } from '../../types/gameRealtime'
import type { MarketStallAnchor } from './useMarketStalls'

export interface MarketCrowdDeps {
  shoppers: () => readonly THREE.Object3D[]
  stalls: () => readonly MarketStallAnchor[]
  market: () => MarketSnapshot | null
}

export function useMarketCrowd(deps: MarketCrowdDeps) {
  const position = new THREE.Vector3()
  let path: CrowdWaypoint[] = []
  let pathFor: readonly MarketStallAnchor[] | null = null
  let clock = 0

  function currentPath(): CrowdWaypoint[] {
    const stalls = deps.stalls()
    if (stalls !== pathFor) {
      pathFor = stalls
      path = crowdPath([...stalls].sort((a, b) => a.stallNo - b.stallNo).map(({ anchor }) => {
        anchor.getWorldPosition(position)
        return { x: position.x, z: position.z, yaw: anchor.rotation.y }
      }))
    }
    return path
  }

  function tick(dt: number): void {
    const open = deps.market()?.open === true
    const shoppers = deps.shoppers()
    const route = currentPath()
    for (const shopper of shoppers) shopper.visible = open && route.length > 0
    if (!open || route.length === 0) return
    clock += dt
    const lap = lapSeconds(route)
    shoppers.forEach((shopper, i) => {
      const pose = shopperAt(route, clock + (lap * i) / shoppers.length)
      shopper.position.set(pose.x, shopper.position.y, pose.z)
      shopper.rotation.y = pose.yaw
      if (shopper.parent?.visible) updateAvatarAnimation(shopper, dt, pose.moving ? SHOPPER_SPEED : 0)
    })
  }

  return { tick }
}
