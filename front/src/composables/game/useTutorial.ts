import { readonly, ref } from 'vue'
import { fetchTutorial, parseTutorial, resumeTutorial, skipTutorial, type TutorialState } from '../../api/tutorial'

const state = ref<TutorialState | null>(null)

export const tutorial = readonly(state)

export async function loadTutorial(): Promise<void> {
  state.value = await fetchTutorial()
}

export async function skipTheTutorial(): Promise<void> {
  state.value = await skipTutorial()
}

export async function resumeTheTutorial(): Promise<void> {
  state.value = await resumeTutorial()
}

export function applyTutorialState(data: unknown): void {
  state.value = parseTutorial(data)
}
