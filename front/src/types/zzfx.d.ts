declare module 'zzfx' {
  export const ZZFX: {
    sampleRate: number
    audioContext: AudioContext
    buildSamples: (...parameters: Array<number | undefined>) => ArrayLike<number>
  }
}
