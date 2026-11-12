<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { outputDeviceSupported } from '../../composables/game/useProximityVoice'
import { setInputDevice, setInputVolume, setOutputDevice, setOutputVolume, setVoiceMode, voiceSettings } from '../../composables/game/useVoiceSettings'
import { MAX_VOLUME, VOICE_MODES, micLevel } from '../../game/voice'

const { t } = useI18n()
const inputs = ref<MediaDeviceInfo[]>([])
const outputs = ref<MediaDeviceInfo[]>([])
const testing = ref(false)
const level = ref(0)
const testError = ref<string | null>(null)
const canPickOutput = outputDeviceSupported()
let stream: MediaStream | null = null
let context: AudioContext | null = null
let frame = 0

async function loadDevices(): Promise<void> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  inputs.value = devices.filter((d) => d.kind === 'audioinput')
  outputs.value = devices.filter((d) => d.kind === 'audiooutput')
}

function label(device: MediaDeviceInfo, index: number): string {
  return device.label || t('settings.voiceDevice', { n: index + 1 })
}

function stopTest(): void {
  cancelAnimationFrame(frame)
  stream?.getTracks().forEach((track) => track.stop())
  void context?.close()
  stream = null
  context = null
  testing.value = false
  level.value = 0
}

async function startTest(): Promise<void> {
  stopTest()
  testError.value = null
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: voiceSettings.inputDeviceId ? { deviceId: { exact: voiceSettings.inputDeviceId } } : true })
  } catch {
    testError.value = t('voice.micDenied')
    return
  }
  context = new AudioContext()
  const analyser = new AnalyserNode(context, { fftSize: 512 })
  const gain = new GainNode(context, { gain: voiceSettings.inputVolume })
  context.createMediaStreamSource(stream).connect(gain).connect(analyser)
  const samples = new Float32Array(analyser.fftSize)
  testing.value = true
  await loadDevices()
  const loop = () => {
    analyser.getFloatTimeDomainData(samples)
    level.value = micLevel(samples)
    frame = requestAnimationFrame(loop)
  }
  loop()
}

watch(
  () => [voiceSettings.inputDeviceId, voiceSettings.inputVolume],
  () => {
    if (testing.value) void startTest()
  },
)

onMounted(() => {
  void loadDevices()
  navigator.mediaDevices.addEventListener('devicechange', loadDevices)
})
onUnmounted(() => {
  navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
  stopTest()
})
</script>

<template>
  <section class="mt-5" aria-labelledby="game-voice-title">
    <h3 id="game-voice-title" class="m-0 mb-1 text-sm font-extrabold text-fog">{{ t('settings.voice') }}</h3>
    <p class="m-0 text-sm font-semibold text-mist">{{ t('settings.voiceIntro') }}</p>
    <label v-for="mode in VOICE_MODES" :key="mode" class="mt-1.5 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <input type="radio" name="voice-mode" class="size-4 shrink-0 accent-sun" :checked="voiceSettings.mode === mode" @change="setVoiceMode(mode)" />
      <span class="min-w-0 text-sm font-bold text-mist">{{ t(mode === 'pushToTalk' ? 'settings.voicePushToTalk' : 'settings.voiceOpenMic') }}</span>
    </label>

    <label class="mt-3 flex min-h-11 flex-wrap items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <span class="w-32 shrink-0 text-sm font-bold text-mist">{{ t('settings.voiceInput') }}</span>
      <select class="cc-input min-w-0 flex-1" :value="voiceSettings.inputDeviceId ?? ''" @change="setInputDevice(($event.target as HTMLSelectElement).value || null)">
        <option value="">{{ t('settings.voiceDefaultDevice') }}</option>
        <option v-for="(device, i) in inputs" :key="device.deviceId || i" :value="device.deviceId">{{ label(device, i) }}</option>
      </select>
    </label>
    <label class="mt-1.5 flex min-h-11 flex-wrap items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <span class="w-32 shrink-0 text-sm font-bold text-mist">{{ t('settings.voiceOutput') }}</span>
      <select
        v-if="canPickOutput"
        class="cc-input min-w-0 flex-1"
        :value="voiceSettings.outputDeviceId ?? ''"
        @change="setOutputDevice(($event.target as HTMLSelectElement).value || null)"
      >
        <option value="">{{ t('settings.voiceDefaultDevice') }}</option>
        <option v-for="(device, i) in outputs" :key="device.deviceId || i" :value="device.deviceId">{{ label(device, i) }}</option>
      </select>
      <span v-else class="min-w-0 flex-1 text-sm text-mist">{{ t('settings.voiceOutputUnsupported') }}</span>
    </label>

    <label class="mt-1.5 flex min-h-11 items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <span class="w-32 shrink-0 text-sm font-bold text-mist">{{ t('settings.voiceInputVolume') }}</span>
      <input
        type="range"
        class="min-w-0 flex-1 accent-sun"
        min="0"
        :max="MAX_VOLUME"
        step="0.05"
        :value="voiceSettings.inputVolume"
        @input="setInputVolume(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-12 shrink-0 text-right font-mono text-sm text-fog">{{ Math.round(voiceSettings.inputVolume * 100) }} %</span>
    </label>
    <label class="mt-1.5 flex min-h-11 items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <span class="w-32 shrink-0 text-sm font-bold text-mist">{{ t('settings.voiceOutputVolume') }}</span>
      <input
        type="range"
        class="min-w-0 flex-1 accent-sun"
        min="0"
        :max="MAX_VOLUME"
        step="0.05"
        :value="voiceSettings.outputVolume"
        @input="setOutputVolume(Number(($event.target as HTMLInputElement).value))"
      />
      <span class="w-12 shrink-0 text-right font-mono text-sm text-fog">{{ Math.round(voiceSettings.outputVolume * 100) }} %</span>
    </label>

    <div class="mt-1.5 flex min-h-11 items-center gap-3 rounded-xl bg-ink-950/50 px-3 py-1.5">
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost shrink-0" @click="testing ? stopTest() : startTest()">
        {{ testing ? t('settings.voiceStopTest') : t('settings.voiceTest') }}
      </button>
      <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-950" role="meter" :aria-valuenow="Math.round(level * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="t('settings.voiceLevel')">
        <div class="h-full rounded-full bg-mint transition-[width] duration-75" :style="{ width: `${level * 100}%` }" />
      </div>
    </div>
    <p v-if="testError" class="m-0 mt-1.5 text-sm font-bold text-coral" role="alert">{{ testError }}</p>
  </section>
</template>
