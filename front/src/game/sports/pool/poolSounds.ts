const SILENT_GAIN = 0.0001

let context: AudioContext | null = null

function audio(): AudioContext {
  context ??= new AudioContext()
  return context
}

function tone(frequency: number, lengthS: number, peak: number, type: OscillatorType, delayS = 0): void {
  const ctx = audio()
  const start = ctx.currentTime + delayS
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = type
  oscillator.frequency.value = frequency
  gain.gain.setValueAtTime(SILENT_GAIN, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.01)
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + lengthS)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start(start)
  oscillator.stop(start + lengthS)
}

function noise(lengthS: number, peak: number, cutoffHz: number, delayS = 0): void {
  const ctx = audio()
  const start = ctx.currentTime + delayS
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * lengthS), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  source.buffer = buffer
  filter.type = 'lowpass'
  filter.frequency.value = cutoffHz
  gain.gain.setValueAtTime(SILENT_GAIN, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02)
  gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, start + lengthS)
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start(start)
}

export function playStartBeep(): void {
  tone(1046, 0.35, 0.3, 'square')
}

export function playMarksCall(): void {
  tone(523, 0.18, 0.15, 'triangle')
  tone(659, 0.25, 0.15, 'triangle', 0.2)
}

export function playStroke(good: boolean): void {
  noise(0.18, good ? 0.18 : 0.08, good ? 1400 : 600)
}

export function playFalseStart(): void {
  tone(196, 0.5, 0.25, 'sawtooth')
}

export function playSplash(scale: number): void {
  const size = Math.min(1, scale / 3.6)
  noise(0.4 + size * 0.8, 0.2 + size * 0.4, 800 + size * 1800)
}

export function playFinish(): void {
  tone(784, 0.6, 0.22, 'triangle')
  tone(1175, 0.9, 0.22, 'triangle', 0.12)
}
