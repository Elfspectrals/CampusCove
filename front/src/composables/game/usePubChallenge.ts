import { ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches } from '../../config/keybindings'
import { CHALLENGE_REACH } from '../../game/gameRoomConstants'
import { canChallenge, challengeErrorText, challengeResultText } from '../../game/pub/challenge'
import type { PubSeat } from '../../game/world/worldManifest'
import type {
  PubRaceChallengeCancelledPayload,
  PubRaceChallengedPayload,
  PubRaceChallengeResultPayload,
  PubRaceChallengeSentPayload,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

/** The prompt floats this high over the challenged avatar's feet (seated head + a bit). */
const PROMPT_HEIGHT = 1.7
/** The ray reaches a little past CHALLENGE_REACH: it starts at my eye, the 4 m are between the two stools. */
const AIM_MARGIN = 1
/** Safety net if the server's answer is lost: a challenge UI goes away this long after `expiresAt`. */
const EXPIRY_GRACE_MS = 3000

export interface PubChallengeDeps {
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  mySeat: () => PubSeat | null
  seatOf: (sessionId: string) => PubSeat | null
  /** A Drink Fast race is gathering or running (no challenge then), or a pub game screen is open. */
  busy: () => boolean
  holdingConsumable: () => boolean
  pseudoOf: (sessionId: string) => string
  say: (text: string) => void
}

export interface ChallengeInvite {
  sessionId: string
  pseudo: string
  expiresAt: number
}

/**
 * Drink Fast challenges between two players on bar stools: aim at another seated player for the "Challenge"
 * prompt, the target answers in a small dialog (Accept / Decline, with keys), and on accept the server opens a
 * normal race for the two of them (pub_race_lobby → pub_race_start, handled by usePubGames).
 */
export function usePubChallenge(deps: PubChallengeDeps) {
  const incoming = ref<ChallengeInvite | null>(null)
  const outgoing = ref<ChallengeInvite | null>(null)
  const raycaster = new THREE.Raycaster()
  const center = new THREE.Vector2(0, 0)
  const head = new THREE.Vector3()

  const send = (type: string, payload?: unknown) => deps.gameRoomRef.value?.send(type, payload)

  // The server tells only the other side when this player stands up: clear our own challenge here.
  watch(
    () => deps.mySeat(),
    (seat) => {
      if (seat) return
      incoming.value = null
      outgoing.value = null
    },
  )

  function avatarOf(object: THREE.Object3D): THREE.Object3D | null {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (o.userData.isRemoteAvatar === true) return o
    }
    return null
  }

  /** The seated player under the crosshair who can be challenged from my stool. */
  function findTarget(): { sessionId: string; avatar: THREE.Object3D } | null {
    if (deps.busy() || deps.holdingConsumable() || outgoing.value || incoming.value) return null
    const mine = deps.mySeat()
    const scene = deps.getScene()
    const camera = deps.getCamera()
    if (!mine || !scene || !camera) return null
    const avatars = scene.children.filter((c) => c.userData.isRemoteAvatar === true && c.visible)
    if (avatars.length === 0) return null
    raycaster.setFromCamera(center, camera)
    raycaster.far = CHALLENGE_REACH + AIM_MARGIN
    const hit = raycaster.intersectObjects(avatars, true)[0]
    const avatar = hit ? avatarOf(hit.object) : null
    const sessionId = avatar ? String(avatar.userData.sessionId ?? '') : ''
    if (!avatar || !sessionId || !canChallenge(mine, deps.seatOf(sessionId))) return null
    return { sessionId, avatar }
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const target = findTarget()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!target || !camera || !canvas) return null
    target.avatar.getWorldPosition(head)
    head.y += PROMPT_HEIGHT
    head.project(camera)
    if (head.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (head.x * 0.5 + 0.5) * rect.width,
      y: (-head.y * 0.5 + 0.5) * rect.height,
      action: `Challenge ${deps.pseudoOf(target.sessionId)}`,
      detail: 'Drink Fast · 20 coins',
    }
  }

  function interact(): boolean {
    const target = findTarget()
    if (!target) return false
    send('pub_race_challenge', { targetSessionId: target.sessionId })
    return true
  }

  function reply(accept: boolean): void {
    const invite = incoming.value
    if (!invite) return
    send('pub_race_challenge_reply', { fromSessionId: invite.sessionId, accept })
    incoming.value = null
  }

  /** Accept / decline keys while a challenge waits for this player's answer. */
  function onKeyDown(e: KeyboardEvent): boolean {
    if (!incoming.value || e.repeat) return false
    if (matches('acceptChallenge', e.code)) reply(true)
    else if (matches('declineChallenge', e.code)) reply(false)
    else return false
    e.preventDefault()
    return true
  }

  /** The race screen was closed: nothing of this player's challenge is left to answer or wait for. */
  function clear(): void {
    incoming.value = null
    outgoing.value = null
  }

  /** A `pub_error`: drops the pending challenge when it was about one; the friendly text, or null. */
  function onError(code: string): string | null {
    const text = challengeErrorText(code)
    if (text && code !== 'challenge_pending') outgoing.value = null
    return text
  }

  function expireLater(slot: Ref<ChallengeInvite | null>, invite: ChallengeInvite): void {
    const delay = Math.max(0, invite.expiresAt - Date.now()) + EXPIRY_GRACE_MS
    window.setTimeout(() => {
      // compared by value: the ref holds a reactive proxy of `invite`, not the object itself
      if (slot.value?.sessionId === invite.sessionId && slot.value.expiresAt === invite.expiresAt) slot.value = null
    }, delay)
  }

  function onChallenged(data: PubRaceChallengedPayload): void {
    const invite = { sessionId: data.fromSessionId, pseudo: deps.pseudoOf(data.fromSessionId), expiresAt: data.expiresAt }
    incoming.value = invite
    expireLater(incoming, invite)
  }

  function onSent(data: PubRaceChallengeSentPayload): void {
    const invite = { sessionId: data.toSessionId, pseudo: deps.pseudoOf(data.toSessionId), expiresAt: data.expiresAt }
    outgoing.value = invite
    expireLater(outgoing, invite)
  }

  function onResult(data: PubRaceChallengeResultPayload): void {
    const name = outgoing.value?.sessionId === data.toSessionId ? outgoing.value.pseudo : deps.pseudoOf(data.toSessionId)
    outgoing.value = null
    deps.say(challengeResultText(name, data.accepted, data.reason))
  }

  function onCancelled(data: PubRaceChallengeCancelledPayload): void {
    if (incoming.value?.sessionId !== data.fromSessionId) return
    incoming.value = null
    deps.say(`${deps.pseudoOf(data.fromSessionId)} called off the challenge.`)
  }

  const source: InteractionSource = { prompt, interact }

  return {
    incoming,
    outgoing,
    source,
    accept: () => reply(true),
    decline: () => reply(false),
    onKeyDown,
    onError,
    clear,
    handlers: { onChallenged, onSent, onResult, onCancelled },
  }
}
