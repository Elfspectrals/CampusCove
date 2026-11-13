export const RESPAWN_BED_CODES: readonly string[] = ['decor_bed_single', 'decor_bed_double', 'decor_bunk_bed']

export function isRespawnBed(code: string): boolean {
  return RESPAWN_BED_CODES.includes(code)
}
