import { apiRequest, isRecord } from './http.ts'

export const TUTORIAL_STEPS = ['pick_apples', 'eat_apple', 'sell_apples', 'deposit_cash', 'play_darts'] as const

export type TutorialStep = (typeof TUTORIAL_STEPS)[number]

export type TutorialState =
  | { status: 'none' }
  | { status: 'done' }
  | { status: 'active' | 'skipped'; step: TutorialStep }

function isStep(value: unknown): value is TutorialStep {
  return (TUTORIAL_STEPS as readonly unknown[]).includes(value)
}

export function parseTutorial(data: unknown): TutorialState {
  if (!isRecord(data)) throw new Error('Invalid tutorial response')
  if (data.status === 'none' || data.status === 'done') return { status: data.status }
  if ((data.status === 'active' || data.status === 'skipped') && isStep(data.step)) return { status: data.status, step: data.step }
  throw new Error('Invalid tutorial response')
}

export async function fetchTutorial(): Promise<TutorialState> {
  return parseTutorial(await apiRequest('/tutorial', { errorMessage: 'Could not load the tutorial' }))
}

export async function skipTutorial(): Promise<TutorialState> {
  return parseTutorial(await apiRequest('/tutorial/skip', { method: 'POST', errorMessage: 'Could not skip the tutorial' }))
}

export async function resumeTutorial(): Promise<TutorialState> {
  return parseTutorial(await apiRequest('/tutorial/resume', { method: 'POST', errorMessage: 'Could not resume the tutorial' }))
}
