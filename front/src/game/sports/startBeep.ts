const BEEP_HZ = 880
const BEEP_LENGTH_S = 0.35
const PEAK_GAIN = 0.3
const SILENT_GAIN = 0.0001

let context: AudioContext | null = null

export function playStartBeep(): void {
  context ??= new AudioContext()
  const start = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'square'
  oscillator.frequency.value = BEEP_HZ
  gain.gain.setValueAtTime(SILENT_GAIN, start)
  gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, start + 0.01)
  gain.gain.setValueAtTime(PEAK_GAIN, start + BEEP_LENGTH_S - 0.05)
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + BEEP_LENGTH_S)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + BEEP_LENGTH_S)
}
