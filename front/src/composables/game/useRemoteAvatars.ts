import type * as THREE from 'three'
import {
  DEFAULT_SLOT_COLORS,
  SLOTS,
  type CosmeticColors,
} from '../../api/characterCosmetics'
import { buildCompositeAvatar, disposeObject3D } from '../../avatar/compositeAvatar'
import { playAvatarPoolClip, setAvatarSwimming, type PoolClip, setAvatarCrouching, setAvatarPetanque, type PetanqueClip, markAvatarSkatePush, playAvatarSkateMove, type AvatarSkateMove, setAvatarSkating, playAvatarClimbMove, setAvatarClimbPose, type SportsMoveClip, type TennisStroke, playAvatarSportsMove, playAvatarTennisStroke, setAvatarDanceMove, setAvatarDancing, setAvatarDribbling, setAvatarEating, setAvatarPicking, setAvatarRacePose, setAvatarSeated, setAvatarStumbling, setAvatarTennis, updateAvatarAnimation, type RacePose, type AvatarClimbMove, type AvatarClimbPose } from '../../avatar/glbCharacter'
import { parseCharacterLook, type CharacterLook } from '../../avatar/characterLook'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { WEAR_SLOTS, wearSignature, type WearModels } from '../../avatar/modularCharacterLogic'
import { skatingWear } from '../../game/sports/skating/skateWear'
import { leanAngle } from '../../game/sports/skating/skateMotion'
import type { FigurePose } from '../../game/sports/skating/figure'
import { createActionBubble, type AvatarAction } from '../../game/actionBubble'
import { climbingWear } from '../../game/sports/climbingWear'
import { hasSportsLoan } from '../../game/sports/sportsLoans'
import { createChatBubble, type ChatBubble } from '../../game/chatBubble'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { createNameTag, nameTagVisible, type NameTag } from '../../game/nameTag'
import { createVoiceIcon, type VoiceIcon, type VoiceIconState } from '../../game/voiceIcon'
import {
  advancePunchPose,
  createDamageNumber,
  createPunchImpact,
  idlePunchPose,
  jabLeftArm,
  jabRightArm,
  punchPoseOffset,
  startRecoil,
  startSwing,
  type PunchPose,
} from '../../game/remotePunch'
import { createHitFlash } from '../../game/hitFlash'
import { advanceHitStop, idleHitStop, scheduleHitStop, type HitStop } from '../../game/punchFeel'
import { createRacePint, type RacePint } from '../../game/pub/racePint'
import { seatedAvatarFeetY } from '../../game/pub/seats'
import type { BoxerPose, UpperCharge, UpperShot } from '../../avatar/boxingAnimLogic'
import { type RemoteBoxer, dressBoxer } from '../../game/sports/remoteBoxer'
import { createRemoteHeldTool, type RemoteHeldTool } from '../../game/remoteHeldTool'
import { swimwearOutfit } from '../../game/sports/pool/poolRace'
import type { SfxName } from '../../game/sfx'
import type { RemoteUserPayload } from '../../types/gameRealtime'
import { BADGES, overHeadBadges, shownBadges, type BadgeCode } from '../../game/badges'
import { ICONS } from '../../components/ui/icons'

/** How fast remote avatars catch up with their last known position (1/s; higher = snappier). */
const REMOTE_SMOOTHING = 12
const REMOTE_LEAN_SMOOTHING_S = 0.15
/** Beyond this gap (teleport, spawn), remote avatars jump instead of gliding. */
const REMOTE_SNAP_DISTANCE = 4
/** Beyond this distance from the local player a rigged avatar's clips are not advanced (not worth the CPU). */
const ANIMATION_MAX_DISTANCE = 60
const SWIMMER_LIFT_M = 0.3

interface RemoteAvatar {
  userId: string
  robot: boolean
  pseudo: string
  badges: BadgeCode[]
  group: THREE.Group
  nameTag: NameTag
  voiceIcon: VoiceIcon
  voiceState: VoiceIconState
  chatBubble: ChatBubble | null
  /** Last position / yaw received; the group glides towards it in `tick`. */
  x: number
  y: number
  z: number
  ry: number
  color: number
  outfit: string
  appearance: AppearanceUpdate
  skating: boolean
  lean: number
  punchPose: PunchPose
  punchOffsetX: number
  punchOffsetZ: number
  hitStop: HitStop
  jabCount: number
  /** The pub seat the player sits on; network moves are ignored until they stand up. */
  seat: SeatPose | null
  /** Drink Fast: the pint raised while this player races. */
  racePint: RacePint | null
  raceProgress: number
  heldTool: RemoteHeldTool | null
  boxer: RemoteBoxer | null
  figure: FigurePose | null
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
  /** Validated again here (parseCharacterLook): the socket only forwards what a client sent. */
  character?: unknown
}

export interface RemoteAvatarsDeps {
  getScene: () => THREE.Scene | undefined
  myPosition: { x: number; y: number; z: number }
  playSoundOn: (name: SfxName, object: THREE.Object3D, delayS: number) => void
  onIce?: (x: number, z: number) => boolean
  own?: boolean
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
function badgeIconPaths(badges: readonly BadgeCode[]): string[] {
  return overHeadBadges(badges).map((badge) => ICONS[BADGES[badge].icon])
}

const CLIMBING_SHOES_LOAN = 'climbing_shoes'

export function useRemoteAvatars(deps: RemoteAvatarsDeps) {
  const avatars = new Map<string, RemoteAvatar>()
  const sessionByUserId = new Map<string, string>()
  /** Appearance received before the avatar finished its first load. */
  const pendingAppearance = new Map<string, AppearanceUpdate>()
  const lastAppearance = new Map<string, AppearanceUpdate>()
  const topOverride = new Map<string, string>()

  function withTopOverride(sessionId: string, update: AppearanceUpdate): AppearanceUpdate {
    const top = topOverride.get(sessionId)
    if (!top) return update
    const slotHexes = { ...(update.slotHexes ?? {}) }
    delete slotHexes.top
    return { ...update, slotModels: { ...(update.slotModels ?? {}), top }, slotHexes }
  }
  const ownAppearance = new Map<string, { models: WearModels; colors: CosmeticColors; look: CharacterLook | null }>()
  const swimwear = new Set<string>()
  const wantedStarsBySession = new Map<string, number>()
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
    group.userData.isRemoteAvatar = !deps.own
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
    lastAppearance.delete(sessionId)
    topOverride.delete(sessionId)
    ownAppearance.delete(sessionId)
    swimwear.delete(sessionId)
    const entry = avatars.get(sessionId)
    if (!entry) return
    const scene = deps.getScene()
    if (scene) {
      removeSceneDuplicates(sessionId, entry.userId)
      scene.remove(entry.group)
    }
    endFlashOf(entry.group)
    entry.racePint?.dispose()
    entry.nameTag.dispose()
    entry.voiceIcon.dispose()
    entry.chatBubble?.dispose()
    entry.boxer?.dispose()
    disposeObject3D(entry.group)
    avatars.delete(sessionId)
    if (sessionByUserId.get(entry.userId) === sessionId) sessionByUserId.delete(entry.userId)
    pendingAppearance.delete(sessionId)
    renderTokenBySessionId.delete(sessionId)
    wantedStarsBySession.delete(sessionId)
  }

  function removeOtherSessionsOf(userId: string, keepSessionId: string) {
    for (const [sid, avatar] of [...avatars.entries()]) {
      if (avatar.userId === userId && sid !== keepSessionId) remove(sid)
    }
  }

  async function loadModel(models: WearModels, colors: CosmeticColors, look: CharacterLook | null, fallbackColor: number) {
    try {
      return await createModularCharacter(models, colors, DEFAULT_SLOT_COLORS, look)
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
      existing.racePint?.dispose()
      existing.nameTag.dispose()
      existing.voiceIcon.dispose()
      existing.chatBubble?.dispose()
      disposeObject3D(existing.group)
      avatars.delete(sessionId)
      if (sessionByUserId.get(existing.userId) === sessionId) sessionByUserId.delete(existing.userId)
      pendingAppearance.delete(sessionId)
    }

    lastAppearance.set(sessionId, { slotHexes: data.slotHexes, slotModels: data.slotModels, character: data.character })
    const shown = withTopOverride(sessionId, data)
    const colors = parseSlotHexes(shown.slotHexes)
    const skating = deps.onIce?.(data.x, data.z) ?? false
    const ownModels = parseSlotModels(shown.slotModels)
    const look = parseCharacterLook(data.character)
    ownAppearance.set(sessionId, { models: ownModels, colors, look })
    const models = shownModels(sessionId, ownModels, skating)
    const group = await loadModel(models, colors, look, data.color)
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
    setAvatarSwimming(group, swimwear.has(sessionId))
    scene.add(group)
    avatars.set(sessionId, {
      userId: data.id,
      robot: data.robot === true,
      pseudo: data.pseudo,
      badges: shownBadges(data.badges),
      group,
      nameTag: createNameTag(group, data.pseudo, badgeIconPaths(shownBadges(data.badges)), wantedStarsBySession.get(sessionId) ?? 0),
      voiceIcon: createVoiceIcon(group),
      voiceState: null,
      chatBubble: null,
      x: data.x,
      y: data.y,
      z: data.z,
      ry,
      color: data.color,
      outfit: wearSignature(models, colors, look),
      appearance: { slotHexes: data.slotHexes, slotModels: data.slotModels, character: data.character },
      skating,
      lean: 0,
      punchPose: idlePunchPose(),
      punchOffsetX: 0,
      punchOffsetZ: 0,
      hitStop: idleHitStop(),
      jabCount: 0,
      seat,
      racePint: null,
      raceProgress: 0,
      heldTool: data.heldTool ? createRemoteHeldTool(group, data.heldTool) : null,
      boxer: null,
      figure: null,
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
    lastAppearance.set(sessionId, update)
    const shown = withTopOverride(sessionId, update)
    const colors = parseSlotHexes(shown.slotHexes)
    const ownModels = parseSlotModels(shown.slotModels)
    const look = parseCharacterLook(update.character)
    ownAppearance.set(sessionId, { models: ownModels, colors, look })
    entry.appearance = update
    entry.skating = deps.onIce?.(entry.x, entry.z) ?? false
    await rebuild(sessionId, shownModels(sessionId, ownModels, entry.skating), colors, look)
  }

  /** Swimwear in the pool water: the swimsuit replaces the outfit until the player is out of the water. */
  function setSwimwear(sessionId: string, on: boolean) {
    if (swimwear.has(sessionId) === on) return
    if (on) swimwear.add(sessionId)
    else swimwear.delete(sessionId)
    const entry = avatars.get(sessionId)
    if (entry) setAvatarSwimming(entry.group, on)
    const own = ownAppearance.get(sessionId)
    if (own) void rebuild(sessionId, shownModels(sessionId, own.models, entry?.skating ?? false), own.colors, own.look)
  }

  function playPoolClip(sessionId: string, clip: PoolClip) {
    const entry = avatars.get(sessionId)
    if (entry) playAvatarPoolClip(entry.group, clip)
  }

  function shownModels(sessionId: string, models: WearModels, skating: boolean): WearModels {
    return swimwear.has(sessionId) ? swimwearOutfit(models) : climbingWear(skatingWear(models, skating), hasSportsLoan(sessionId, CLIMBING_SHOES_LOAN))
  }

  async function rebuild(sessionId: string, models: WearModels, colors: CosmeticColors, look: CharacterLook | null) {
    const scene = deps.getScene()
    const entry = avatars.get(sessionId)
    if (!scene || !entry) return
    const outfit = wearSignature(models, colors, look)
    if (outfit === entry.outfit) return

    const renderToken = nextRenderToken(sessionId)
    const group = await loadModel(models, colors, look, entry.color)
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
    latest.racePint?.dispose()
    latest.nameTag.dispose()
    latest.voiceIcon.dispose()
    latest.chatBubble?.dispose()
    disposeObject3D(latest.group)
    placeAvatar(group, latest.x, latest.y, latest.z, latest.ry)
    setAvatarSwimming(group, swimwear.has(sessionId))
    scene.add(group)
    const racePint = latest.racePint ? createRacePint(group) : null
    racePint?.setProgress(latest.raceProgress)
    const heldTool = latest.heldTool ? createRemoteHeldTool(group, latest.heldTool.code) : null
    latest.boxer?.dispose()
    const boxer = latest.boxer ? dressBoxer(group) : null
    const nameTag = createNameTag(group, latest.pseudo, badgeIconPaths(latest.badges), wantedStarsBySession.get(sessionId) ?? 0)
    const voiceIcon = createVoiceIcon(group)
    const rebuilt = { ...latest, group, nameTag, voiceIcon, chatBubble: null, outfit, punchOffsetX: 0, punchOffsetZ: 0, racePint, heldTool, boxer }
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

  function setTennis(sessionId: string, on: boolean) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarTennis(entry.group, on)
  }

  function tennisStroke(sessionId: string, stroke: TennisStroke) {
    const entry = avatars.get(sessionId)
    if (entry) playAvatarTennisStroke(entry.group, stroke)
  }

  function setPicking(sessionId: string, picking: boolean) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarPicking(entry.group, picking)
  }

  function setRacePose(sessionId: string, pose: RacePose | null) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarRacePose(entry.group, pose)
  }

  function refreshLentWear(sessionId: string) {
    const entry = avatars.get(sessionId)
    if (entry) void updateAppearance(sessionId, entry.appearance)
  }

  function setClimbAnimation(sessionId: string, pose: AvatarClimbPose, move: AvatarClimbMove | null) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    setAvatarClimbPose(entry.group, pose)
    if (move) playAvatarClimbMove(entry.group, move)
  }

  function skatePushed(sessionId: string): void {
    const entry = avatars.get(sessionId)
    if (entry) markAvatarSkatePush(entry.group, Date.now())
  }

  function skateMove(sessionId: string, move: AvatarSkateMove): void {
    const entry = avatars.get(sessionId)
    if (entry) playAvatarSkateMove(entry.group, move)
  }

  function setWantedStars(sessionId: string, stars: number): void {
    if (stars > 0) wantedStarsBySession.set(sessionId, stars)
    else wantedStarsBySession.delete(sessionId)
    avatars.get(sessionId)?.nameTag.setStars(stars)
  }

  function setHeldTool(sessionId: string, code: string | null) {
    const entry = avatars.get(sessionId)
    if (!entry || (entry.heldTool?.code ?? null) === code) return
    entry.heldTool?.dispose()
    entry.heldTool = code ? createRemoteHeldTool(entry.group, code) : null
  }

  function setFigurePose(sessionId: string, pose: FigurePose | null) {
    const entry = avatars.get(sessionId)
    if (entry) entry.figure = pose
  }

  function setBoxer(sessionId: string, on: boolean) {
    const entry = avatars.get(sessionId)
    if (!entry || (entry.boxer !== null) === on) return
    entry.boxer?.dispose()
    entry.boxer = on ? dressBoxer(entry.group) : null
  }

  function boxerShot(sessionId: string, clip: UpperShot, cancel = false) {
    avatars.get(sessionId)?.boxer?.shot(clip, cancel)
  }

  function boxerCharge(sessionId: string, clip: UpperCharge, on: boolean) {
    avatars.get(sessionId)?.boxer?.charge(clip, on)
  }

  function boxerPose(sessionId: string, pose: BoxerPose) {
    avatars.get(sessionId)?.boxer?.pose(pose)
  }

  function handOf(sessionId: string): THREE.Object3D | null {
    return avatars.get(sessionId)?.group.getObjectByName('HandR') ?? null
  }

  function setVoiceState(sessionId: string, state: VoiceIconState): void {
    const entry = avatars.get(sessionId)
    if (entry) entry.voiceState = state
  }

  function players(): Array<{ sessionId: string; accountId: string; pseudo: string; badges: BadgeCode[] }> {
    return [...avatars.entries()].filter(([, a]) => !a.robot).map(([sessionId, a]) => ({ sessionId, accountId: a.userId, pseudo: a.pseudo, badges: a.badges }))
  }

  function accountOf(sessionId: string): string | null {
    return avatars.get(sessionId)?.userId ?? null
  }

  function setTopOverride(sessionId: string, top: string | null): void {
    if ((topOverride.get(sessionId) ?? null) === top) return
    if (top) topOverride.set(sessionId, top)
    else topOverride.delete(sessionId)
    const last = lastAppearance.get(sessionId)
    if (last) void updateAppearance(sessionId, last)
  }

  function playSportsMove(sessionId: string, clip: SportsMoveClip): void {
    const entry = avatars.get(sessionId)
    if (entry) playAvatarSportsMove(entry.group, clip)
  }

  function setDribbling(sessionId: string, dribbling: boolean): void {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarDribbling(entry.group, dribbling)
  }

  function avatarOf(sessionId: string): THREE.Object3D | null {
    return avatars.get(sessionId)?.group ?? null
  }

  function positionOf(sessionId: string): THREE.Vector3 | null {
    return avatars.get(sessionId)?.group.position ?? null
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

  /** Another player ate or drank (socket `user_action`): a bubble with the food pops over their head and the avatar plays Eat / Drink. */
  function showAction(sessionId: string, action: AvatarAction, code: string | null) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    bubbles.push(createActionBubble(entry.group, action, code))
    setAvatarEating(entry.group, action)
  }

  function setDancing(sessionId: string, dance: { clip: string; timeScale: number } | null) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarDancing(entry.group, dance)
  }

  function danceMove(sessionId: string, lane: number) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarDanceMove(entry.group, lane)
  }

  function stumble(sessionId: string) {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarStumbling(entry.group)
  }

  function setCrouching(sessionId: string, crouching: boolean): void {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarCrouching(entry.group, crouching)
  }

  function playPetanque(sessionId: string, clip: PetanqueClip): void {
    const entry = avatars.get(sessionId)
    if (entry) setAvatarPetanque(entry.group, clip)
  }

  function showChat(sessionId: string, text: string) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    entry.chatBubble?.dispose()
    entry.chatBubble = createChatBubble(entry.group, text)
  }

  function setBadges(sessionId: string, codes: readonly string[]): void {
    const entry = avatars.get(sessionId)
    if (!entry) return
    entry.badges = shownBadges(codes)
    entry.nameTag.dispose()
    entry.nameTag = createNameTag(entry.group, entry.pseudo, badgeIconPaths(entry.badges), wantedStarsBySession.get(sessionId) ?? 0)
  }

  /** Drink Fast: the player races with a pint `progress` drunk (0..1), or puts it down (null). */
  function setRacePint(sessionId: string, progress: number | null) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    if (progress === null) {
      entry.racePint?.dispose()
      entry.racePint = null
      entry.raceProgress = 0
      return
    }
    entry.racePint ??= createRacePint(entry.group)
    entry.raceProgress = progress
    entry.racePint.setProgress(progress)
  }

  function showPunch(sessionId: string) {
    const entry = avatars.get(sessionId)
    if (!entry) return
    entry.jabCount += 1
    startSwing(entry.punchPose)
    deps.playSoundOn('whoosh', entry.group, 0)
  }

  function showHit(sessionId: string, dirX: number, dirZ: number, damage: number, timing: { delay: number; hitStop: number }, sound: SfxName = 'impact') {
    const entry = avatars.get(sessionId)
    if (!entry) return
    startRecoil(entry.punchPose, dirX, dirZ, timing.delay)
    scheduleHitStop(entry.hitStop, timing.delay, timing.hitStop)
    impacts.push(createPunchImpact(entry.group, dirX, dirZ, timing.delay))
    flashes.push(createHitFlash(entry.group, timing.delay))
    damageNumbers.push(createDamageNumber(entry.group, damage, timing.delay))
    deps.playSoundOn(sound, entry.group, timing.delay)
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
    // after the clip posed the arm: the racer's pint lifts it again
    entry.racePint?.update(dt)
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
    const t = deps.own ? 1 : 1 - Math.exp(-REMOTE_SMOOTHING * dt)
    for (const [sessionId, entry] of avatars) {
      if (deps.onIce && deps.onIce(entry.x, entry.z) !== entry.skating) {
        entry.skating = !entry.skating
        void updateAppearance(sessionId, entry.appearance)
      }
      const group = entry.group
      setAvatarSkating(group, entry.skating)
      if (entry.chatBubble && !entry.chatBubble.update(dt)) entry.chatBubble = null
      const tagVisible = !deps.own && nameTagVisible(group.position.x - deps.myPosition.x, group.position.z - deps.myPosition.z)
      entry.nameTag.setVisible(tagVisible)
      entry.voiceIcon.set(entry.voiceState, tagVisible)
      group.position.x -= entry.punchOffsetX
      group.position.z -= entry.punchOffsetZ
      const shownY = entry.y + (swimwear.has(sessionId) ? SWIMMER_LIFT_M : 0) + (entry.figure?.lift ?? 0)
      const dx = entry.x - group.position.x
      const dy = shownY - EYE_HEIGHT - group.position.y
      const dz = entry.z - group.position.z
      if (dx * dx + dy * dy + dz * dz > REMOTE_SNAP_DISTANCE * REMOTE_SNAP_DISTANCE) {
        placeAvatar(group, entry.x, shownY, entry.z, entry.ry)
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
      const target = entry.ry + Math.PI + (entry.figure?.spin ?? 0)
      const turn = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y))
      group.rotation.y += turn * t
      const leanTarget = entry.skating && dt > 0 ? -leanAngle(Math.hypot(group.position.x - prevX, group.position.z - prevZ) / dt, (turn * t) / dt) : 0
      entry.lean += (leanTarget - entry.lean) * Math.min(1, dt / REMOTE_LEAN_SMOOTHING_S)
      group.rotation.z = entry.lean
      // rigged skins play Idle / Walk / Run from the speed the smoothing actually produced
      const moved = Math.hypot(group.position.x - prevX, group.position.z - prevZ)
      const poseDt = advanceHitStop(entry.hitStop, dt)
      applyPunchPose(entry, poseDt, animate(group, poseDt, dt > 0 ? moved / dt : 0))
    }
  }

  return { skatePushed, skateMove, setFigurePose, upsert, updateAppearance, refreshLentWear, setTarget, setSeated, setPicking, setRacePose, setClimbAnimation, setTennis, tennisStroke, setDancing, danceMove, stumble, setHeldTool, setSwimwear, playPoolClip, handOf, playPetanque, setCrouching, setBoxer, boxerShot, boxerCharge, boxerPose, setRacePint, setBadges, pseudoOf, positionOf, avatarOf, playSportsMove, setDribbling, setTopOverride, setVoiceState, setWantedStars, players, accountOf, showAction, showChat, showPunch, showHit, remove, clear, tick }
}
