const NOTES_HZ = [784, 1175]
const NOTE_GAP_S = 0.12
const NOTE_LENGTH_S = 0.9
const PEAK_GAIN = 0.25
const SILENT_GAIN = 0.0001

let context: AudioContext | null = null

export function playTaskChime(): void {
  context ??= new AudioContext()
  const start = context.currentTime
  NOTES_HZ.forEach((frequency, index) => {
    const noteStart = start + index * NOTE_GAP_S
    const oscillator = context!.createOscillator()
    const gain = context!.createGain()
    oscillator.type = 'triangle'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(SILENT_GAIN, noteStart)
    gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, noteStart + 0.01)
    gain.gain.exponentialRampToValueAtTime(SILENT_GAIN, noteStart + NOTE_LENGTH_S)
    oscillator.connect(gain).connect(context!.destination)
    oscillator.start(noteStart)
    oscillator.stop(noteStart + NOTE_LENGTH_S)
  })
}
