/**
 * What the game loading screen shows: four boot stages in order, and how far the current one is from the files the
 * three.js loading manager has finished. Pure state, no three.js or Vue, so it is unit tested.
 */

export const BOOT_STAGES = ['character', 'world', 'decor', 'server'] as const
export type BootStage = (typeof BOOT_STAGES)[number]
export type StageState = 'pending' | 'active' | 'done'

/** Share of the bar each stage fills. The world (zones, buildings) is most of the bytes. */
const STAGE_WEIGHT: Record<BootStage, number> = { character: 0.05, world: 0.6, decor: 0.25, server: 0.1 }

export interface BootFiles {
  loaded: number
  total: number
}

export interface BootProgress {
  done: ReadonlySet<BootStage>
  files: BootFiles
  startedAt: number
  /** ms since `startedAt` at which each stage finished, for the `[boot]` timing log. */
  timings: Partial<Record<BootStage, number>>
}

export function createBootProgress(now: number): BootProgress {
  return { done: new Set(), files: { loaded: 0, total: 0 }, startedAt: now, timings: {} }
}

export function completeStage(progress: BootProgress, stage: BootStage, now: number): BootProgress {
  if (progress.done.has(stage)) return progress
  return {
    ...progress,
    done: new Set([...progress.done, stage]),
    timings: { ...progress.timings, [stage]: Math.round(now - progress.startedAt) },
  }
}

export function withFiles(progress: BootProgress, loaded: number, total: number): BootProgress {
  return { ...progress, files: { loaded: Math.min(loaded, total), total: Math.max(total, 0) } }
}

/** Stages run in parallel, but the screen shows the first unfinished one as the one in progress. */
export function stageState(progress: BootProgress, stage: BootStage): StageState {
  if (progress.done.has(stage)) return 'done'
  const firstOpen = BOOT_STAGES.find((s) => !progress.done.has(s))
  return firstOpen === stage ? 'active' : 'pending'
}

export function isBootDone(progress: BootProgress): boolean {
  return BOOT_STAGES.every((stage) => progress.done.has(stage))
}

/**
 * 0-100. Finished stages count fully; the active one counts by the share of files loaded so far, so the bar keeps
 * moving while the world downloads. Never reaches 100 before every stage is done, and never goes back: more files
 * queued lower the ratio, so the bar holds `previous` instead.
 */
export function bootPercent(progress: BootProgress, previous = 0): number {
  if (isBootDone(progress)) return 100
  const fileRatio = progress.files.total > 0 ? progress.files.loaded / progress.files.total : 0
  let percent = 0
  for (const stage of BOOT_STAGES) {
    const state = stageState(progress, stage)
    percent += STAGE_WEIGHT[stage] * (state === 'done' ? 1 : state === 'active' ? fileRatio * 0.9 : 0)
  }
  return Math.max(previous, Math.min(99, Math.floor(percent * 100)))
}
