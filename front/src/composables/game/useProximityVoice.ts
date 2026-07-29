import { computed, ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'

const DEFAULT_MAX_PEERS = 4
const DEFAULT_DISCONNECT_DISTANCE = 22

interface VoiceConfig {
  enabled: boolean
  iceServers: RTCIceServer[]
  iceTransportPolicy: RTCIceTransportPolicy
  maxPeers: number
  connectDistance: number
  disconnectDistance: number
}

interface VoicePeerSnapshotEntry {
  sessionId: string
  accountId: number
  pseudo: string
  linkId: string
  shouldOffer: boolean
  x: number
  y: number
  z: number
  speaking: boolean
}

interface VoicePeerState {
  info: VoicePeerSnapshotEntry
  connection: RTCPeerConnection
  pendingCandidates: RTCIceCandidateInit[]
  source: MediaStreamAudioSourceNode | null
  panner: PannerNode | null
  gain: GainNode | null
  offerStarted: boolean
}

export interface VoicePeerView {
  sessionId: string
  pseudo: string
  speaking: boolean
  muted: boolean
  connectionState: RTCPeerConnectionState
}

export interface UseProximityVoiceDeps {
  gameRoomRef: ShallowRef<Room | null>
  getCamera: () => THREE.PerspectiveCamera | undefined
  matchesPushToTalk: (event: KeyboardEvent) => boolean
}

const defaultVoiceConfig = (): VoiceConfig => ({
  enabled: true,
  iceServers: [],
  iceTransportPolicy: 'all',
  maxPeers: DEFAULT_MAX_PEERS,
  connectDistance: 18,
  disconnectDistance: DEFAULT_DISCONNECT_DISTANCE,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseIceServers(value: unknown): RTCIceServer[] | null {
  if (!Array.isArray(value)) return null
  const out: RTCIceServer[] = []
  for (const raw of value) {
    if (!isRecord(raw)) return null
    const urls = raw.urls
    const validUrls =
      typeof urls === 'string' ||
      (Array.isArray(urls) && urls.length > 0 && urls.every((url) => typeof url === 'string'))
    if (!validUrls) return null
    const server: RTCIceServer = { urls: urls as string | string[] }
    if (typeof raw.username === 'string') server.username = raw.username
    if (typeof raw.credential === 'string') server.credential = raw.credential
    out.push(server)
  }
  return out
}

function parseVoiceConfig(raw: unknown): VoiceConfig | null {
  if (!isRecord(raw)) return null
  const iceServers = parseIceServers(raw.iceServers)
  if (iceServers === null) return null
  const iceTransportPolicy = raw.iceTransportPolicy
  if (iceTransportPolicy !== 'all' && iceTransportPolicy !== 'relay') return null
  if (
    typeof raw.enabled !== 'boolean' ||
    typeof raw.maxPeers !== 'number' ||
    !Number.isInteger(raw.maxPeers) ||
    raw.maxPeers < 1 ||
    raw.maxPeers > 12 ||
    typeof raw.connectDistance !== 'number' ||
    !Number.isFinite(raw.connectDistance) ||
    raw.connectDistance <= 0 ||
    typeof raw.disconnectDistance !== 'number' ||
    !Number.isFinite(raw.disconnectDistance) ||
    raw.disconnectDistance < raw.connectDistance
  ) {
    return null
  }
  return {
    enabled: raw.enabled,
    iceServers,
    iceTransportPolicy,
    maxPeers: raw.maxPeers,
    connectDistance: raw.connectDistance,
    disconnectDistance: raw.disconnectDistance,
  }
}

function parseVoicePeer(raw: unknown): VoicePeerSnapshotEntry | null {
  if (!isRecord(raw)) return null
  if (
    typeof raw.sessionId !== 'string' ||
    raw.sessionId.length === 0 ||
    typeof raw.accountId !== 'number' ||
    !Number.isInteger(raw.accountId) ||
    raw.accountId <= 0 ||
    typeof raw.pseudo !== 'string' ||
    typeof raw.linkId !== 'string' ||
    raw.linkId.length === 0 ||
    typeof raw.shouldOffer !== 'boolean' ||
    typeof raw.x !== 'number' ||
    !Number.isFinite(raw.x) ||
    typeof raw.y !== 'number' ||
    !Number.isFinite(raw.y) ||
    typeof raw.z !== 'number' ||
    !Number.isFinite(raw.z)
  ) {
    return null
  }
  return {
    sessionId: raw.sessionId,
    accountId: raw.accountId,
    pseudo: raw.pseudo.trim() || `Player ${raw.accountId}`,
    linkId: raw.linkId,
    shouldOffer: raw.shouldOffer,
    x: raw.x,
    y: raw.y,
    z: raw.z,
    speaking: raw.speaking === true,
  }
}

function audioContextConstructor(): typeof AudioContext | null {
  const browserWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext
  }
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null
}

export function useProximityVoice(deps: UseProximityVoiceDeps) {
  const enabled = ref(false)
  const requestingPermission = ref(false)
  const micMuted = ref(false)
  const deafened = ref(false)
  const pushToTalkActive = ref(false)
  const error = ref<string | null>(null)
  const peerViews = ref<VoicePeerView[]>([])
  const voiceConfig = ref<VoiceConfig>(defaultVoiceConfig())

  const peers = new Map<string, VoicePeerState>()
  const latestPeerInfo = new Map<string, VoicePeerSnapshotEntry>()
  const mutedPeerIds = new Set<string>()
  const listenerPosition = new THREE.Vector3()
  const listenerDirection = new THREE.Vector3()

  let boundRoom: Room | null = null
  let localStream: MediaStream | null = null
  let localTrack: MediaStreamTrack | null = null
  let audioContext: AudioContext | null = null
  let speakingSent = false
  let permissionRequestId = 0
  let disposed = false

  const supported = computed(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof RTCPeerConnection !== 'undefined',
  )

  const statusLabel = computed(() => {
    if (requestingPermission.value) return 'Requesting microphone…'
    if (!enabled.value) return 'Voice off'
    if (micMuted.value) return 'Microphone muted'
    if (pushToTalkActive.value) return 'Transmitting'
    return 'Hold push-to-talk'
  })

  function syncPeerViews(): void {
    peerViews.value = [...peers.values()]
      .map((peer): VoicePeerView => ({
        sessionId: peer.info.sessionId,
        pseudo: peer.info.pseudo,
        speaking: peer.info.speaking,
        muted: mutedPeerIds.has(peer.info.sessionId),
        connectionState: peer.connection.connectionState,
      }))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo))
  }

  function sendSpeaking(active: boolean): void {
    if (speakingSent === active) return
    speakingSent = active
    boundRoom?.send('voice_speaking', { active })
  }

  function applyLocalTrackState(active: boolean): void {
    const shouldTransmit = enabled.value && !micMuted.value && active
    if (localTrack) localTrack.enabled = shouldTransmit
    pushToTalkActive.value = shouldTransmit
    sendSpeaking(shouldTransmit)
  }

  function releasePushToTalk(): void {
    applyLocalTrackState(false)
  }

  function onPushToTalkKeyDown(event: KeyboardEvent): boolean {
    if (!deps.matchesPushToTalk(event)) return false
    if (!event.repeat) applyLocalTrackState(true)
    return true
  }

  function onPushToTalkKeyUp(event: KeyboardEvent): boolean {
    if (!deps.matchesPushToTalk(event)) return false
    releasePushToTalk()
    return true
  }

  function closePeer(sessionId: string): void {
    const peer = peers.get(sessionId)
    if (!peer) return
    peer.connection.onicecandidate = null
    peer.connection.ontrack = null
    peer.connection.onconnectionstatechange = null
    peer.connection.close()
    peer.source?.disconnect()
    peer.panner?.disconnect()
    peer.gain?.disconnect()
    peers.delete(sessionId)
    syncPeerViews()
  }

  function clearPeers(): void {
    for (const sessionId of [...peers.keys()]) closePeer(sessionId)
    latestPeerInfo.clear()
  }

  function sendSignal(
    peer: VoicePeerState,
    kind: 'offer' | 'answer' | 'ice',
    payload: { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit },
  ): void {
    const room = boundRoom
    if (!room || !enabled.value) return
    room.send('voice_signal', {
      targetSessionId: peer.info.sessionId,
      linkId: peer.info.linkId,
      kind,
      ...payload,
    })
  }

  async function connectRemoteStream(peer: VoicePeerState, stream: MediaStream): Promise<void> {
    const context = audioContext
    if (!context) return
    if (context.state === 'suspended') await context.resume()
    if (
      !enabled.value ||
      audioContext !== context ||
      peers.get(peer.info.sessionId) !== peer
    ) {
      return
    }
    peer.source?.disconnect()
    peer.panner?.disconnect()
    peer.gain?.disconnect()

    const source = context.createMediaStreamSource(stream)
    const panner = context.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'linear'
    panner.refDistance = 1.5
    panner.maxDistance = voiceConfig.value.disconnectDistance
    panner.rolloffFactor = 1
    const gain = context.createGain()
    gain.gain.value = deafened.value || mutedPeerIds.has(peer.info.sessionId) ? 0 : 1
    source.connect(panner)
    panner.connect(gain)
    gain.connect(context.destination)
    peer.source = source
    peer.panner = panner
    peer.gain = gain
  }

  async function makeOffer(peer: VoicePeerState): Promise<void> {
    if (peer.offerStarted || peer.connection.signalingState !== 'stable') return
    peer.offerStarted = true
    try {
      const offer = await peer.connection.createOffer()
      if (peers.get(peer.info.sessionId) !== peer) return
      await peer.connection.setLocalDescription(offer)
      const description = peer.connection.localDescription
      if (!description || peers.get(peer.info.sessionId) !== peer) return
      sendSignal(peer, 'offer', {
        description: { type: description.type, sdp: description.sdp },
      })
    } catch {
      if (peers.get(peer.info.sessionId) === peer) {
        peer.offerStarted = false
        error.value = `Could not connect voice to ${peer.info.pseudo}.`
      }
    }
  }

  function createPeer(info: VoicePeerSnapshotEntry): VoicePeerState | null {
    if (!localStream || peers.size >= voiceConfig.value.maxPeers) return null
    const connection = new RTCPeerConnection({
      iceServers: voiceConfig.value.iceServers,
      iceTransportPolicy: voiceConfig.value.iceTransportPolicy,
    })
    for (const track of localStream.getAudioTracks()) {
      connection.addTrack(track, localStream)
    }

    const peer: VoicePeerState = {
      info,
      connection,
      pendingCandidates: [],
      source: null,
      panner: null,
      gain: null,
      offerStarted: false,
    }
    peers.set(info.sessionId, peer)

    connection.onicecandidate = (event) => {
      if (!event.candidate || peers.get(info.sessionId) !== peer) return
      sendSignal(peer, 'ice', {
        candidate: {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex,
          usernameFragment: event.candidate.usernameFragment ?? undefined,
        },
      })
    }
    connection.ontrack = (event) => {
      if (peers.get(info.sessionId) !== peer) return
      const stream = event.streams[0] ?? new MediaStream([event.track])
      void connectRemoteStream(peer, stream).catch(() => {
        if (peers.get(info.sessionId) === peer) {
          error.value = `Could not play voice from ${peer.info.pseudo}.`
        }
      })
    }
    connection.onconnectionstatechange = () => {
      if (peers.get(info.sessionId) !== peer) return
      if (
        connection.connectionState === 'failed' ||
        connection.connectionState === 'closed'
      ) {
        closePeer(info.sessionId)
        return
      }
      syncPeerViews()
    }

    syncPeerViews()
    if (info.shouldOffer) void makeOffer(peer)
    return peer
  }

  async function flushPendingCandidates(peer: VoicePeerState): Promise<void> {
    if (!peer.connection.remoteDescription) return
    const pending = peer.pendingCandidates.splice(0)
    for (const candidate of pending) {
      await peer.connection.addIceCandidate(candidate)
    }
  }

  async function handleVoiceSignal(raw: unknown): Promise<void> {
    if (!enabled.value || !isRecord(raw)) return
    const fromSessionId = raw.fromSessionId
    const linkId = raw.linkId
    const kind = raw.kind
    if (
      typeof fromSessionId !== 'string' ||
      typeof linkId !== 'string' ||
      (kind !== 'offer' && kind !== 'answer' && kind !== 'ice')
    ) {
      return
    }
    const peer = peers.get(fromSessionId)
    if (!peer || peer.info.linkId !== linkId) return

    try {
      if (kind === 'ice') {
        if (!isRecord(raw.candidate) || typeof raw.candidate.candidate !== 'string') return
        const candidate = raw.candidate as RTCIceCandidateInit
        if (peer.connection.remoteDescription) {
          await peer.connection.addIceCandidate(candidate)
        } else {
          peer.pendingCandidates.push(candidate)
        }
        return
      }

      if (!isRecord(raw.description)) return
      const type = raw.description.type
      const sdp = raw.description.sdp
      if (
        (type !== 'offer' && type !== 'answer') ||
        type !== kind ||
        typeof sdp !== 'string'
      ) {
        return
      }
      await peer.connection.setRemoteDescription({ type, sdp })
      await flushPendingCandidates(peer)
      if (kind === 'offer') {
        const answer = await peer.connection.createAnswer()
        if (peers.get(fromSessionId) !== peer) return
        await peer.connection.setLocalDescription(answer)
        const description = peer.connection.localDescription
        if (!description) return
        sendSignal(peer, 'answer', {
          description: { type: description.type, sdp: description.sdp },
        })
      }
    } catch {
      if (peers.get(fromSessionId) !== peer) return
      error.value = `Voice negotiation with ${peer.info.pseudo} failed.`
      closePeer(fromSessionId)
    }
  }

  function applyPeerSnapshot(raw: unknown): void {
    if (!enabled.value || !isRecord(raw) || !Array.isArray(raw.peers)) return
    const parsed = new Map<string, VoicePeerSnapshotEntry>()
    for (const value of raw.peers) {
      const peer = parseVoicePeer(value)
      if (!peer) continue
      parsed.set(peer.sessionId, peer)
    }
    latestPeerInfo.clear()
    for (const [sessionId, info] of parsed) latestPeerInfo.set(sessionId, info)

    for (const [sessionId, existing] of [...peers]) {
      const next = parsed.get(sessionId)
      if (!next || next.linkId !== existing.info.linkId) {
        closePeer(sessionId)
        continue
      }
      existing.info = next
    }
    for (const info of parsed.values()) {
      if (!peers.has(info.sessionId)) createPeer(info)
    }
    syncPeerViews()
  }

  function applySpeaking(raw: unknown): void {
    if (!isRecord(raw) || typeof raw.sessionId !== 'string' || typeof raw.active !== 'boolean') {
      return
    }
    const info = latestPeerInfo.get(raw.sessionId)
    const peer = peers.get(raw.sessionId)
    if (!info || !peer) return
    info.speaking = raw.active
    peer.info.speaking = raw.active
    syncPeerViews()
  }

  function bindRoom(room: Room | null): void {
    if (boundRoom === room) return
    clearPeers()
    boundRoom = room
    if (!room) {
      if (enabled.value) disableVoice(false)
      return
    }

    room.onMessage('voice_config', (payload: unknown) => {
      if (boundRoom !== room) return
      const parsed = parseVoiceConfig(payload)
      if (!parsed) {
        error.value = 'The server returned an invalid voice configuration.'
        disableVoice(false)
        return
      }
      voiceConfig.value = parsed
      if (!parsed.enabled) {
        error.value = 'Proximity voice is disabled on this server.'
        disableVoice(false)
      }
    })
    room.onMessage('voice_peer_snapshot', (payload: unknown) => {
      if (boundRoom !== room) return
      applyPeerSnapshot(payload)
    })
    room.onMessage('voice_signal', (payload: unknown) => {
      if (boundRoom !== room) return
      void handleVoiceSignal(payload)
    })
    room.onMessage('voice_speaking', (payload: unknown) => {
      if (boundRoom !== room) return
      applySpeaking(payload)
    })
    room.onMessage('voice_error', (payload: unknown) => {
      if (boundRoom !== room || !isRecord(payload)) return
      error.value =
        typeof payload.message === 'string' ? payload.message : 'Proximity voice is unavailable.'
      if (payload.code === 'voice_disabled' || payload.code === 'voice_config_invalid') {
        disableVoice(false)
      }
    })
    room.onLeave(() => {
      if (boundRoom !== room) return
      boundRoom = null
      disableVoice(false)
    })

    if (enabled.value) room.send('voice_enable', { enabled: true })
  }

  async function enableVoice(): Promise<void> {
    if (disposed || enabled.value || requestingPermission.value) return
    error.value = null
    const room = deps.gameRoomRef.value
    if (!room) {
      error.value = 'Connect to the lobby before enabling voice.'
      return
    }
    if (!supported.value) {
      error.value = 'This browser cannot access WebRTC microphone audio.'
      return
    }
    if (!voiceConfig.value.enabled) {
      error.value = 'Proximity voice is disabled on this server.'
      return
    }

    const requestId = ++permissionRequestId
    requestingPermission.value = true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      const track = stream.getAudioTracks()[0]
      if (!track) {
        for (const mediaTrack of stream.getTracks()) mediaTrack.stop()
        throw new Error('No microphone track was provided.')
      }
      const AudioContextClass = audioContextConstructor()
      if (!AudioContextClass) {
        for (const mediaTrack of stream.getTracks()) mediaTrack.stop()
        throw new Error('Web Audio is unavailable.')
      }
      let nextAudioContext: AudioContext
      try {
        nextAudioContext = new AudioContextClass()
      } catch (cause) {
        for (const mediaTrack of stream.getTracks()) mediaTrack.stop()
        throw cause
      }
      try {
        await nextAudioContext.resume()
      } catch (cause) {
        for (const mediaTrack of stream.getTracks()) mediaTrack.stop()
        void nextAudioContext.close()
        throw cause
      }
      if (
        requestId !== permissionRequestId ||
        disposed ||
        deps.gameRoomRef.value !== room ||
        boundRoom !== room
      ) {
        for (const mediaTrack of stream.getTracks()) mediaTrack.stop()
        void nextAudioContext.close()
        return
      }
      localStream = stream
      localTrack = track
      localTrack.enabled = false
      localTrack.onended = () => {
        if (localTrack !== track) return
        error.value = 'Microphone access ended. Enable voice to reconnect.'
        disableVoice(true)
      }
      audioContext = nextAudioContext
      enabled.value = true
      const roomWasBound = boundRoom === room
      bindRoom(room)
      if (roomWasBound) room.send('voice_enable', { enabled: true })
    } catch (cause) {
      if (requestId !== permissionRequestId || disposed) return
      const message = cause instanceof Error ? cause.message : 'Microphone permission was denied.'
      error.value = `Could not enable proximity voice: ${message}`
      enabled.value = false
    } finally {
      if (requestId === permissionRequestId) {
        requestingPermission.value = false
      }
    }
  }

  function disableVoice(notifyServer = true): void {
    permissionRequestId += 1
    requestingPermission.value = false
    if (notifyServer && boundRoom && enabled.value) {
      boundRoom.send('voice_enable', { enabled: false })
    }
    releasePushToTalk()
    enabled.value = false
    clearPeers()
    if (localTrack) localTrack.onended = null
    localTrack = null
    if (localStream) {
      for (const track of localStream.getTracks()) track.stop()
    }
    localStream = null
    if (audioContext) void audioContext.close()
    audioContext = null
  }

  function toggleMicMuted(): void {
    micMuted.value = !micMuted.value
    if (micMuted.value) releasePushToTalk()
  }

  function toggleDeafened(): void {
    deafened.value = !deafened.value
    tick()
  }

  function togglePeerMuted(sessionId: string): void {
    if (mutedPeerIds.has(sessionId)) mutedPeerIds.delete(sessionId)
    else mutedPeerIds.add(sessionId)
    syncPeerViews()
    tick()
  }

  function tick(): void {
    if (!audioContext) return
    const camera = deps.getCamera()
    if (camera) {
      const worldPosition = camera.getWorldPosition(listenerPosition)
      const worldDirection = camera.getWorldDirection(listenerDirection)
      const listener = audioContext.listener
      const now = audioContext.currentTime
      if (listener.positionX && listener.forwardX && listener.upX) {
        listener.positionX.setTargetAtTime(worldPosition.x, now, 0.03)
        listener.positionY.setTargetAtTime(worldPosition.y, now, 0.03)
        listener.positionZ.setTargetAtTime(worldPosition.z, now, 0.03)
        listener.forwardX.setTargetAtTime(worldDirection.x, now, 0.03)
        listener.forwardY.setTargetAtTime(worldDirection.y, now, 0.03)
        listener.forwardZ.setTargetAtTime(worldDirection.z, now, 0.03)
        listener.upX.setTargetAtTime(camera.up.x, now, 0.03)
        listener.upY.setTargetAtTime(camera.up.y, now, 0.03)
        listener.upZ.setTargetAtTime(camera.up.z, now, 0.03)
      } else {
        const legacyListener = listener as AudioListener & {
          setPosition?: (x: number, y: number, z: number) => void
          setOrientation?: (
            x: number,
            y: number,
            z: number,
            upX: number,
            upY: number,
            upZ: number,
          ) => void
        }
        legacyListener.setPosition?.(
          worldPosition.x,
          worldPosition.y,
          worldPosition.z,
        )
        legacyListener.setOrientation?.(
          worldDirection.x,
          worldDirection.y,
          worldDirection.z,
          camera.up.x,
          camera.up.y,
          camera.up.z,
        )
      }
    }
    const now = audioContext.currentTime
    for (const peer of peers.values()) {
      if (peer.panner?.positionX) {
        peer.panner.positionX.setTargetAtTime(peer.info.x, now, 0.08)
        peer.panner.positionY.setTargetAtTime(peer.info.y, now, 0.08)
        peer.panner.positionZ.setTargetAtTime(peer.info.z, now, 0.08)
      } else {
        const legacyPanner = peer.panner as
          | (PannerNode & {
              setPosition?: (x: number, y: number, z: number) => void
            })
          | null
        legacyPanner?.setPosition?.(peer.info.x, peer.info.y, peer.info.z)
      }
      const audible = !deafened.value && !mutedPeerIds.has(peer.info.sessionId)
      peer.gain?.gain.setTargetAtTime(audible ? 1 : 0, now, 0.03)
    }
  }

  function refreshPolicy(): void {
    if (enabled.value) boundRoom?.send('voice_policy_refresh', {})
  }

  function dispose(): void {
    disposed = true
    disableVoice(true)
    boundRoom = null
    mutedPeerIds.clear()
  }

  return {
    supported,
    enabled,
    requestingPermission,
    micMuted,
    deafened,
    pushToTalkActive,
    error,
    peerViews,
    statusLabel,
    bindRoom,
    enableVoice,
    disableVoice,
    toggleMicMuted,
    toggleDeafened,
    togglePeerMuted,
    onPushToTalkKeyDown,
    onPushToTalkKeyUp,
    releasePushToTalk,
    refreshPolicy,
    tick,
    dispose,
  }
}
