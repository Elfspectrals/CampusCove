import type * as THREE from 'three'
import {
  DEFAULT_SLOT_COLORS,
  SLOTS,
  type CosmeticColors,
} from '../../api/characterCosmetics'
import { buildCompositeAvatar, disposeObject3D } from '../../avatar/compositeAvatar'
import { setAvatarSeated, updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { WEAR_SLOTS, wearSignature, type WearModels } from '../../avatar/modularCharacterLogic'
import { createActionBubble, type AvatarAction } from '../../game/actionBubble'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import {
  advancePunchPose,
  createDamageNumber,
  createHitFlash,
  createPunchImpact,
  idlePunchPose,
  jabLeftArm,
  jabRightArm,
  punchPoseOffset,
  startRecoil,
  startSwing,
  type PunchPose,
} from '../../game/remotePunch'
import { advanceHitStop, idleHitStop, scheduleHitStop, type HitStop } from '../../game/punchFeel'
import { seatedAvatarFeetY } from '../../game/pub/seats'
import type { SfxName } from '../../game/sfx'
import type { RemoteUserPayload } from '../../types/gameRealtime'

/** How fast remote avatars catch up with their last known position (1/s; higher = snappier). */
const REMOTE_SMOOTHING = 12
/** Beyond this gap (teleport, spawn), remote avatars jump instead of gliding. */
const REMOTE_SNAP_DISTANCE = 4
/** Beyond this distance from the local player a rigged avatar's clips are not advanced (not worth the CPU). */
const ANIMATION_MAX_DISTANCE = 60

interface RemoteAvatar {
  userId: string
  pseudo: string
  group: THREE.Group
  /** Last position / yaw received; the group glides towards it in `tick`. */
  x: number
  y: number
  z: number
  ry: number
  color: number
  outfit: string
  punchPose: PunchPose
  punchOffsetX: number
  punchOffsetZ: number
  hitStop: HitStop
  jabCount: number
  /** The pub seat the player sits on; network moves are ignored until they stand up. */
  seat: SeatPose | null
}

/** Where a seated avatar rests: seat top and sitting direction (camera yaw convention). */
export interface SeatPose {
  x: number
  y: number
  z: number
  yaw: number
}

interface AppearanceUpdate {
  slotHexes?: Record<string, string>
  slotModels?: Record<string, string | null>
}

export interface RemoteAvatarsDeps {
  getScene: () => THREE.Scene | undefined
  myPosition: { x: number; y: number; z: number }
  playSoundOn: (name: SfxName, object: THREE.Object3D, delayS: number) => void
}

function parseSlotHexes(raw: Record<string, string> | null | undefined): CosmeticColors {
  const out = { ...DEFAULT_SLOT_COLORS }
  for (const s of SLOTS) {
    const hex = raw?.[s]
    if (typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex)) out[s] = hex
  }
  return out
}

function parseSlotModels(raw: Record<string, string | null> | null | undefined): WearModels {
  const out = {} as WearModels
  for (const s of WEAR_SLOTS) {
    const url = raw?.[s]
    out[s] = typeof url === 'string' && url.length > 0 ? url : null
  }
  return out
}

function parseYaw(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

/** Skins face +Z while the camera looks towards -Z at yaw 0, hence the half turn. */
function placeAvatar(group: THREE.Group, x: number, y: number, z: number, ry: number) {
  group.position.set(x, y - EYE_HEIGHT, z)
  group.rotation.y = ry + Math.PI
}

/**
 * Other players' avatars, keyed by Colyseus session id. Models load asynchronously, so every rebuild takes a
 * render token and a stale load (superseded, or for a player who left) is thrown away; a player is never
 * shown twice even if they reconnect under a new session.
 */
export function useRemoteAvatars(deps: RemoteAvatarsDeps) {
  const avatars = new Map<string, RemoteAvatar>()
  const sessionByUserId = new Map<string, string>()
  /** Appearance received before the avatar finished its first load. */
  const pendingAppearance = new Map<string, AppearanceUpdate>()
  const upsertTokenByUserId = new Map<string, number>()
  const renderTokenBySessionId = new Map<string, number>()
  /** Eat / drink bubbles over other players' heads (they live on the avatar group). */
  let bubbles: Array<ReturnType<typeof createActionBubble>> = []
  let impacts: Array<ReturnType<typeof createPunchImpact>> = []
  let flashes: Array<ReturnType<typeof createHitFlash>> = []
  let damageNumbers: Array<ReturnType<typeof createDamageNumber>> = []

  function nextRenderToken(sessionId: string): number {
    const next = (renderTokenBySessionId.get(sessionId) ?? 0) + 1
    renderTokenBySessionId.set(sessionId, next)
    return next
  }

  function tagAvatar(group: THREE.Group, sessionId: string, userId: string, pseudo: string): void {
    group.userData.isRemoteAvatar = true
    group.userData.sessionId = sessionId
    group.userData.userId = userId
    group.userData.pseudo = pseudo
    group.rotation.order = 'YXZ'
  }

  /** Drop any avatar group left in the scene for this session or user (safety net against duplicates). */
  function removeSceneDuplicates(sessionId: string, userId: string) {
    const scene = deps.getScene()
    if (!scene) return
    const stale = scene.children.filter((child) => {
      const tag = child.userData as { isRemoteAvatar?: boolean; sessionId?: string; userId?: string }
      return tag.isRemoteAvatar === true && (tag.sessionId === sessionId || tag.userId === userId)
    })
    for (const obj of stale) {
      scene.remove(obj)
      endFlashOf(obj)
      disposeObject3D(obj)
    }
  }

  function remove(sessionId: string) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    const scene = deps.getScene()
    if (scene) {
      removeSceneDuplicates(sessionId, entry.userId)
      scene.remove(entry.group)
    }
    endFlashOf(entry.group)
    disposeObject3D(entry.group)
    avatars.delete(sessionId)
    if (sessionByUserId.get(entry.userId) === sessionId) sessionByUserId.delete(entry.userId)
    pendingAppearance.delete(sessionId)
    renderTokenBySessionId.delete(sessionId)
  }

  function removeOtherSessionsOf(userId: string, keepSessionId: string) {
    for (const [sid, avatar] of [...avatars.entries()]) {
      if (avatar.userId === userId && sid !== keepSessionId) remove(sid)
    }
  }

  async function loadModel(models: WearModels, colors: CosmeticColors, fallbackColor: number) {
    try {
      return await createModularCharacter(models, colors, DEFAULT_SLOT_COLORS)
    } catch (err) {
      console.error('[avatars] outfit failed to load, showing the placeholder avatar', models, err)
      return buildCompositeAvatar(null, fallbackColor)
    }
  }

  async function upsert(sessionId: string, data: RemoteUserPayload, seat: SeatPose | null = null) {
    const scene = deps.getScene()
    if (!scene) return
    const renderToken = nextRenderToken(sessionId)
    const token = (upsertTokenByUserId.get(data.id) ?? 0) + 1
    upsertTokenByUserId.set(data.id, token)

    removeOtherSessionsOf(data.id, sessionId)
    const knownSessionId = sessionByUserId.get(data.id)
    if (knownSessionId && knownSessionId !== sessionId) remove(knownSessionId)

    const existing = avatars.get(sessionId)
    if (existing) {
      scene.remove(existing.group)
      endFlashOf(existing.group)
      disposeObject3D(existing.group)
      avatars.delete(sessionId)
      if (sessionByUserId.get(existing.userId) === sessionId) sessionByUserId.delete(existing.userId)
      pendingAppearance.delete(sessionId)
    }

    const colors = parseSlotHexes(data.slotHexes)
    const models = parseSlotModels(data.slotModels)
    const group = await loadModel(models, colors, data.color)
    if (upsertTokenByUserId.get(data.id) !== token || renderTokenBySessionId.get(sessionId) !== renderToken) {
      disposeObject3D(group)
      return
    }

    const latestSessionId = sessionByUserId.get(data.id)
    if (latestSessionId && latestSessionId !== sessionId) remove(latestSessionId)
    removeOtherSessionsOf(data.id, sessionId)
    removeSceneDuplicates(sessionId, data.id)
    tagAvatar(group, sessionId, data.id, data.pseudo)
    const ry = parseYaw(data.ry)
    placeAvatar(group, data.x, data.y, data.z, ry)
    scene.add(group)
    avatars.set(sessionId, {
      userId: data.id,
      pseudo: data.pseudo,
      group,
      x: data.x,
      y: data.y,
      z: data.z,
      ry,
      color: data.color,
      outfit: wearSignature(models, colors),
      punchPose: idlePunchPose(),
      punchOffsetX: 0,
      punchOffsetZ: 0,
      hitStop: idleHitStop(),
      jabCount: 0,
      seat,
    })
    sessionByUserId.set(data.id, sessionId)
    if (seat) applySeat(avatars.get(sessionId)!)

    const pending = pendingAppearance.get(sessionId)
    if (pending) {
      pendingAppearance.delete(sessionId)
      void updateAppearance(sessionId, pending)
    }
  }

  /** Rebuild the avatar model when the player changed outfit or tint. */
  async function updateAppearance(sessionId: string, update: AppearanceUpdate) {
    const scene = deps.getScene()
    if (!scene) return
    const entry = avatars.get(sessionId)
    if (!entry) {
      pendingAppearance.set(sessionId, update)
      return
    }
    const colors = parseSlotHexes(update.slotHexes)
    const models = parseSlotModels(update.slotModels)
    const outfit = wearSignature(models, colors)
    if (outfit === entry.outfit) return

    const renderToken = nextRenderToken(sessionId)
    const group = await loadModel(models, colors, entry.color)
    const latest = avatars.get(sessionId)
    if (!latest || renderTokenBySessionId.get(sessionId) !== renderToken) {
      disposeObject3D(group)
      return
    }
    removeOtherSessionsOf(latest.userId, sessionId)
    removeSceneDuplicates(sessionId, latest.userId)
    tagAvatar(group, sessionId, latest.userId, latest.pseudo)
    scene.remove(latest.group)
    endFlashOf(latest.group)
    disposeObject3D(latest.group)
    placeAvatar(group, latest.x, latest.y, latest.z, latest.ry)
    scene.add(group)
    const rebuilt = { ...latest, group, outfit, punchOffsetX: 0, punchOffsetZ: 0 }
    avatars.set(sessionId, rebuilt)
    applySeat(rebuilt)
  }

  /** Sit the avatar on its seat (Sit clip, or lowered in Idle for skins without it) or let it stand. */
  function applySeat(entry: RemoteAvatar) {
    const sitting = setAvatarSeated(entry.group, entry.seat !== null)
    const seat = entry.seat
    if (!seat) return
    entry.x = seat.x
    entry.y = seatedAvatarFeetY(seat.y, sitting) + EYE_HEIGHT
    entry.z = seat.z
    entry.ry = seat.yaw
  }

  /** `user_seated`: the player sat down on `seat`, or stood up (null). */
  function setSeated(sessionId: string, seat: SeatPose | null) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    entry.seat = seat
    applySeat(entry)
  }

  function pseudoOf(sessionId: string): string | null {
    return avatars.get(sessionId)?.pseudo ?? null
  }

  /** New network position; the avatar glides there in `tick`. A seated player stays put until they stand. */
  function setTarget(sessionId: string, x: number, y: number, z: number, ry: number | undefined) {
    const entry = avatars.get(sessionId)
    if (!entry || entry.seat) return
    entry.x = x
    entry.y = y
    entry.z = z
    entry.ry = parseYaw(ry ?? entry.ry)
  }

  /** Another player ate or drank (socket `user_action`): a bubble with the food pops over their head. */
  function showAction(sessionId: string, action: AvatarAction, code: string | null) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    bubbles.push(createActionBubble(entry.group, action, code))
  }

  function showPunch(sessionId: string) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    entry.jabCount += 1
    startSwing(entry.punchPose)
    deps.playSoundOn('whoosh', entry.group, 0)
  }

  function showHit(sessionId: string, dirX: number, dirZ: number, damage: number, timing: { delay: number; hitStop: number }) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    startRecoil(entry.punchPose, dirX, dirZ, timing.delay)
    scheduleHitStop(entry.hitStop, timing.delay, timing.hitStop)
    impacts.push(createPunchImpact(entry.group, dirX, dirZ, timing.delay))
    flashes.push(createHitFlash(entry.group, timing.delay))
    damageNumbers.push(createDamageNumber(entry.group, damage, timing.delay))
    deps.playSoundOn('impact', entry.group, timing.delay)
  }

  function endFlashOf(group: THREE.Object3D) {
    for (const flash of flashes) if (flash.avatar === group) flash.end()
  }

  function applyPunchPose(entry: RemoteAvatar, dt: number, animated: boolean) {
    advancePunchPose(entry.punchPose, dt)
    const pose = punchPoseOffset(entry.punchPose, entry.group.rotation.y)
    entry.group.position.x += pose.x
    entry.group.position.z += pose.z
    entry.group.rotation.x = pose.leanX
    entry.group.rotation.z = pose.leanZ
    entry.punchOffsetX = pose.x
    entry.punchOffsetZ = pose.z
    if (animated) (entry.jabCount % 2 === 0 ? jabLeftArm : jabRightArm)(entry.group, pose.swing)
  }

  function clear() {
    for (const id of [...avatars.keys()]) remove(id)
  }

  function animate(group: THREE.Object3D, dt: number, speed: number): boolean {
    const dx = group.position.x - deps.myPosition.x
    const dz = group.position.z - deps.myPosition.z
    if (dx * dx + dz * dz > ANIMATION_MAX_DISTANCE * ANIMATION_MAX_DISTANCE) return false
    updateAvatarAnimation(group, dt, speed)
    return true
  }

  /**
   * Called every frame: moves each avatar towards its last received position/yaw, so movement looks
   * continuous between network updates (sent every 50 ms) instead of jumping.
   */
  function tick(dt: number) {
    if (bubbles.length > 0) bubbles = bubbles.filter((b) => b.update(dt))
    if (impacts.length > 0) impacts = impacts.filter((i) => i.update(dt))
    if (flashes.length > 0) flashes = flashes.filter((f) => f.update(dt))
    if (damageNumbers.length > 0) damageNumbers = damageNumbers.filter((d) => d.update(dt))
    const t = 1 - Math.exp(-REMOTE_SMOOTHING * dt)
    for (const entry of avatars.values()) {
      const group = entry.group
      group.position.x -= entry.punchOffsetX
      group.position.z -= entry.punchOffsetZ
      const dx = entry.x - group.position.x
      const dy = entry.y - EYE_HEIGHT - group.position.y
      const dz = entry.z - group.position.z
      if (dx * dx + dy * dy + dz * dz > REMOTE_SNAP_DISTANCE * REMOTE_SNAP_DISTANCE) {
        placeAvatar(group, entry.x, entry.y, entry.z, entry.ry)
        const poseDt = advanceHitStop(entry.hitStop, dt)
        applyPunchPose(entry, poseDt, animate(group, poseDt, 0))
        continue
      }
      const prevX = group.position.x
      const prevZ = group.position.z
      group.position.x += dx * t
      group.position.y += dy * t
      group.position.z += dz * t
      // shortest way round, so turning from 350° to 10° doesn't spin the long way
      const target = entry.ry + Math.PI
      const turn = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y))
      group.rotation.y += turn * t
      // rigged skins play Idle / Walk / Run from the speed the smoothing actually produced
      const moved = Math.hypot(group.position.x - prevX, group.position.z - prevZ)
      const poseDt = advanceHitStop(entry.hitStop, dt)
      applyPunchPose(entry, poseDt, animate(group, poseDt, dt > 0 ? moved / dt : 0))
    }
  }

  return { upsert, updateAppearance, setTarget, setSeated, pseudoOf, showAction, showPunch, showHit, remove, clear, tick }
}
