import { onUnmounted, ref, shallowRef } from 'vue'
import * as THREE from 'three'
import {
  createLocalAudioTrack,
  Room,
  RoomEvent,
  Track,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'
import { matches } from '../../config/keybindings'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { VOICE_FULL_VOLUME_DISTANCE, VOICE_RELEASE_RANGE } from '../../game/voice'
import type { VoiceIconState } from '../../game/voiceIcon'
import { voiceSettings } from './useVoiceSettings'

export interface VoiceTokenPayload {
  url: string
  token: string
}

export interface ProximityVoiceDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  remotePosition: (sessionId: string) => THREE.Vector3 | null
  isMuted: (sessionId: string) => boolean
  setVoiceState: (sessionId: string, state: VoiceIconState) => void
  sendMuted: () => void
  canTalk: () => boolean
  say: (text: string) => void
  micDeniedMessage: () => string
}

interface Voice {
  panner: PannerNode
  source: MediaStreamAudioSourceNode
  element: HTMLMediaElement
}

export function useProximityVoice(deps: ProximityVoiceDeps) {
  const connected = ref(false)
  const talking = ref(false)
  const speaking = shallowRef<ReadonlySet<string>>(new Set())
  let room: Room | null = null
  let audio: AudioContext | null = null
  let mic: LocalAudioTrack | null = null
  let micPending: Promise<LocalAudioTrack | null> | null = null
  const voices = new Map<string, Voice>()
  const forward = new THREE.Vector3()
  const up = new THREE.Vector3()
  const camPos = new THREE.Vector3()

  function context(): AudioContext {
    audio ??= new AudioContext()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  }

  function onSubscribed(track: RemoteTrack, _pub: RemoteTrackPublication, participant: RemoteParticipant): void {
    if (track.kind !== Track.Kind.Audio) return
    const ctx = context()
    const element = (track as RemoteAudioTrack).attach()
    element.muted = true
    const source = ctx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      refDistance: VOICE_FULL_VOLUME_DISTANCE,
      maxDistance: VOICE_RELEASE_RANGE,
      rolloffFactor: 1,
    })
    source.connect(panner).connect(ctx.destination)
    voices.set(participant.identity, { panner, source, element })
  }

  function dropVoice(identity: string): void {
    const voice = voices.get(identity)
    if (!voice) return
    voice.source.disconnect()
    voice.panner.disconnect()
    voice.element.remove()
    voices.delete(identity)
  }

  async function connect(payload: VoiceTokenPayload): Promise<void> {
    await disconnect()
    const next = new Room({ adaptiveStream: false, dynacast: false })
    next.on(RoomEvent.TrackSubscribed, onSubscribed)
    next.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => dropVoice(participant.identity))
    next.on(RoomEvent.ParticipantDisconnected, (participant) => dropVoice(participant.identity))
    next.on(RoomEvent.Disconnected, () => {
      connected.value = false
    })
    next.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      speaking.value = new Set(speakers.map((p) => p.identity))
    })
    await next.connect(payload.url, payload.token, { autoSubscribe: false })
    room = next
    connected.value = true
    deps.sendMuted()
    if (voiceSettings.mode === 'openMic' && talking.value) await setTalking(true)
  }

  async function disconnect(): Promise<void> {
    for (const identity of [...voices.keys()]) dropVoice(identity)
    speaking.value = new Set()
    mic?.stop()
    mic = null
    micPending = null
    talking.value = false
    const current = room
    room = null
    connected.value = false
    if (current) await current.disconnect()
  }

  async function publishedMic(): Promise<LocalAudioTrack | null> {
    const current = room
    if (!current) return null
    if (mic) return mic
    micPending ??= (async () => {
      try {
        const track = await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
        await current.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
        mic = track
        return track
      } catch (err) {
        console.error('[voice] microphone unavailable', err)
        deps.say(deps.micDeniedMessage())
        return null
      } finally {
        micPending = null
      }
    })()
    return micPending
  }

  async function setTalking(on: boolean): Promise<void> {
    talking.value = on
    context()
    const track = on ? await publishedMic() : mic
    if (!track) {
      talking.value = false
      return
    }
    if (talking.value) await track.unmute()
    else await track.mute()
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.repeat || !room || !deps.canTalk() || !matches('pushToTalk', e.code)) return
    if (voiceSettings.mode === 'pushToTalk') void setTalking(true)
    else void setTalking(!talking.value)
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (voiceSettings.mode === 'pushToTalk' && matches('pushToTalk', e.code) && talking.value) void setTalking(false)
  }

  function updateVoices(): void {
    if (!room) return
    for (const participant of room.remoteParticipants.values()) {
      const position = deps.remotePosition(participant.identity)
      const talkingNow = speaking.value.has(participant.identity)
      deps.setVoiceState(participant.identity, talkingNow ? (deps.isMuted(participant.identity) ? 'muted' : 'speaking') : null)
      const voice = voices.get(participant.identity)
      if (voice && position) {
        const t = voice.panner.context.currentTime
        voice.panner.positionX.setValueAtTime(position.x, t)
        voice.panner.positionY.setValueAtTime(position.y + EYE_HEIGHT, t)
        voice.panner.positionZ.setValueAtTime(position.z, t)
      }
    }
  }

  function updateListener(): void {
    const camera = deps.getCamera()
    if (!audio || !camera) return
    camera.getWorldPosition(camPos)
    camera.getWorldDirection(forward)
    up.set(0, 1, 0).applyQuaternion(camera.quaternion)
    const l = audio.listener
    const t = audio.currentTime
    l.positionX.setValueAtTime(camPos.x, t)
    l.positionY.setValueAtTime(camPos.y, t)
    l.positionZ.setValueAtTime(camPos.z, t)
    l.forwardX.setValueAtTime(forward.x, t)
    l.forwardY.setValueAtTime(forward.y, t)
    l.forwardZ.setValueAtTime(forward.z, t)
    l.upX.setValueAtTime(up.x, t)
    l.upY.setValueAtTime(up.y, t)
    l.upZ.setValueAtTime(up.z, t)
  }

  function tick(): void {
    updateVoices()
    updateListener()
  }

  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  onUnmounted(() => {
    document.removeEventListener('keydown', onKeyDown)
    document.removeEventListener('keyup', onKeyUp)
    void disconnect()
    void audio?.close()
  })

  return {
    connected,
    talking,
    speaking,
    tick,
    onToken: (payload: VoiceTokenPayload) => {
      connect(payload).catch((err) => console.error('[voice] could not join the voice room', err))
    },
    disconnect,
  }
}
