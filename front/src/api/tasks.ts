import { apiRequest, isRecord } from './http.ts'
import { getStoredAuth } from './session.ts'

export interface TaskProgress {
  task: string
  value: number
  tiers: number[]
  reached: number[]
}

const isNumberList = (raw: unknown): raw is number[] => Array.isArray(raw) && raw.every((n) => typeof n === 'number')

function parseTask(raw: unknown): TaskProgress {
  if (!isRecord(raw) || typeof raw.task !== 'string' || typeof raw.value !== 'number' || !isNumberList(raw.tiers) || !isNumberList(raw.reached)) {
    throw new Error('Invalid task')
  }
  return { task: raw.task, value: raw.value, tiers: raw.tiers, reached: raw.reached }
}

export async function fetchTasks(): Promise<TaskProgress[]> {
  const data = await apiRequest('/tasks', { token: getStoredAuth()?.token ?? null, errorMessage: 'Could not load your tasks' })
  if (!isRecord(data) || !Array.isArray(data.tasks)) throw new Error('Invalid tasks response')
  return data.tasks.map(parseTask)
}
