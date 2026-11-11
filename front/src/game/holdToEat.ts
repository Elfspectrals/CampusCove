import type { SurvivalStats } from './survival.ts'

export const BITE_S = 1

export type ConsumeKind = 'eat' | 'drink'

export type EatStep = 'wait' | 'bite' | 'stop'

export function consumeKind(code: string): ConsumeKind {
  return code.includes('water') || code.includes('juice') || code.includes('coffee') ? 'drink' : 'eat'
}

export function isFull(stats: SurvivalStats, kind: ConsumeKind): boolean {
  return stats[kind === 'drink' ? 'thirst' : 'hunger'] >= 100
}

export function eatStep(elapsedS: number, bites: number, keepGoing: boolean): EatStep {
  if (elapsedS < bites * BITE_S) return 'wait'
  return keepGoing ? 'bite' : 'stop'
}
