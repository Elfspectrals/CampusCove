import type { Judgement } from './danceHud'

interface SongStyle {
  chords: number[][]
  fourOnFloor: boolean
  hatDivision: 2 | 4
  bassEighths: boolean
  arpeggio: boolean
  wave: OscillatorType
}

const A3 = 220
const STYLES: Readonly<Record<string, SongStyle>> = {
  harbour_sway: { chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], fourOnFloor: false, hatDivision: 2, bassEighths: false, arpeggio: false, wave: 'triangle' },
  cove_groove: { chords: [[5, 8, 12], [1, 5, 8], [-4, 0, 3], [3, 7, 10]], fourOnFloor: true, hatDivision: 2, bassEighths: true, arpeggio: false, wave: 'sawtooth' },
  ice_waltz: { chords: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [-5, -1, 2]], fourOnFloor: false, hatDivision: 2, bassEighths: false, arpeggio: true, wave: 'sine' },
  night_sprint: { chords: [[7, 10, 14], [3, 7, 10], [-2, 2, 5], [5, 9, 12]], fourOnFloor: true, hatDivision: 4, bassEighths: true, arpeggio: true, wave: 'square' },
}

const MASTER_GAIN = 0.32
const SILENT = 0.0001
const BEATS_PER_CHORD = 4

function hz(semitones: number): number {
  return A3 * 2 ** (semitones / 12)
}

export interface DanceMusic {
  stop(): void
  hit(judgement: Judgement): void
}

export function startDanceMusic(song: string, bpm: number, lengthMs: number, startsInMs: number): DanceMusic {
  const style = STYLES[song]
  if (!style) throw new Error(`No music style for song ${song}`)
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  master.connect(ctx.destination)
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

  function tone(freq: number, at: number, length: number, peak: number, wave: OscillatorType, out: AudioNode = master): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = wave
    osc.frequency.value = freq
    gain.gain.setValueAtTime(SILENT, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.01)
    gain.gain.exponentialRampToValueAtTime(SILENT, at + length)
    osc.connect(gain).connect(out)
    osc.start(at)
    osc.stop(at + length + 0.02)
  }

  function kick(at: number): void {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(140, at)
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.18)
    gain.gain.setValueAtTime(0.9, at)
    gain.gain.exponentialRampToValueAtTime(SILENT, at + 0.25)
    osc.connect(gain).connect(master)
    osc.start(at)
    osc.stop(at + 0.3)
  }

  function hat(at: number, peak: number): void {
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    src.buffer = noise
    filter.type = 'highpass'
    filter.frequency.value = 7000
    gain.gain.setValueAtTime(peak, at)
    gain.gain.exponentialRampToValueAtTime(SILENT, at + 0.05)
    src.connect(filter).connect(gain).connect(master)
    src.start(at)
    src.stop(at + 0.06)
  }

  const pad = ctx.createBiquadFilter()
  pad.type = 'lowpass'
  pad.frequency.value = 1400
  pad.connect(master)
  const beat = 60 / bpm
  const origin = ctx.currentTime + startsInMs / 1000
  const beats = Math.floor(lengthMs / 1000 / beat)
  for (let b = 0; b < beats; b++) {
    const at = origin + b * beat
    if (at < ctx.currentTime) continue
    const chord = style.chords[Math.floor(b / BEATS_PER_CHORD) % style.chords.length]
    if (!chord) throw new Error(`Song ${song}: no chord for beat ${b}`)
    if (style.fourOnFloor || b % 2 === 0) kick(at)
    for (let h = 0; h < style.hatDivision; h++) hat(at + (h * beat) / style.hatDivision, h % 2 === 1 ? 0.12 : 0.06)
    const root = hz((chord[0] ?? 0) - 24)
    tone(root, at, beat * 0.9, 0.35, 'triangle')
    if (style.bassEighths) tone(root * 2, at + beat / 2, beat * 0.4, 0.18, 'triangle')
    if (b % BEATS_PER_CHORD === 0) for (const n of chord) tone(hz(n), at, beat * BEATS_PER_CHORD * 0.95, 0.06, style.wave, pad)
    if (style.arpeggio) chord.forEach((n, i) => tone(hz(n + 12), at + (i * beat) / chord.length, beat / chord.length, 0.05, 'square', pad))
  }

  return {
    stop() {
      void ctx.close()
    },
    hit(judgement) {
      const at = ctx.currentTime
      if (judgement === 'miss') tone(110, at, 0.18, 0.25, 'sawtooth')
      else tone(judgement === 'perfect' ? 1320 : 990, at, 0.08, 0.15, 'sine')
    },
  }
}
