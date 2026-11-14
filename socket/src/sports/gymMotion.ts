import type { Player } from '../types.ts'

const MAX_ATHLETE_SPEED = 12

export interface Motion {
  vx: number
  vz: number
}

export class MotionTracker {
  private seen = new Map<number, { x: number, z: number, at: number }>()
  private speed = new Map<number, Motion>()

  track(player: Player, now: number): Motion {
    const seen = this.seen.get(player.accountId)
    const dt = seen ? (now - seen.at) / 1000 : 0
    if (!seen || dt > 0) {
      const raw = seen && dt > 0 ? { vx: (player.x - seen.x) / dt, vz: (player.z - seen.z) / dt } : { vx: 0, vz: 0 }
      const speed = Math.hypot(raw.vx, raw.vz)
      const k = speed > MAX_ATHLETE_SPEED ? MAX_ATHLETE_SPEED / speed : 1
      this.speed.set(player.accountId, { vx: raw.vx * k, vz: raw.vz * k })
      this.seen.set(player.accountId, { x: player.x, z: player.z, at: now })
    }
    return this.speed.get(player.accountId) ?? { vx: 0, vz: 0 }
  }

  forget(accountId: number): void {
    this.seen.delete(accountId)
    this.speed.delete(accountId)
  }
}
