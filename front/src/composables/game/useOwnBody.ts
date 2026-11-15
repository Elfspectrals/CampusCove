import type * as THREE from 'three'

interface OwnAvatar {
  setTarget: (sessionId: string, x: number, y: number, z: number, ry: number | undefined) => void
  setSwimwear: (sessionId: string, on: boolean) => void
  avatarOf: (sessionId: string) => THREE.Object3D | null
  tick: (dt: number) => void
}

export interface OwnBodyDeps {
  sessionId: () => string | null
  myPosition: { x: number; y: number; z: number }
  avatar: () => OwnAvatar
  yaw: () => number
  shown: () => boolean
  swimming: () => boolean
}

export function useOwnBody(deps: OwnBodyDeps) {
  function tick(dt: number): void {
    const me = deps.sessionId()
    if (!me) return
    const avatar = deps.avatar()
    const shown = deps.shown()
    avatar.setSwimwear(me, deps.swimming())
    avatar.setTarget(me, deps.myPosition.x, deps.myPosition.y, deps.myPosition.z, deps.yaw())
    if (shown) avatar.tick(dt)
    const body = avatar.avatarOf(me)
    if (body) body.visible = shown
  }

  return { tick }
}
