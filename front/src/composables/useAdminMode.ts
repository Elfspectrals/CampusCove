import { ref } from 'vue'
import { isAdminUser, type User } from '../api/auth'

const STORAGE_KEY = 'campus_cove_admin_mode'
const adminMode = ref<boolean>(localStorage.getItem(STORAGE_KEY) === '1')

function persistAdminMode(value: boolean): void {
  adminMode.value = value
  if (value) {
    localStorage.setItem(STORAGE_KEY, '1')
    return
  }
  localStorage.removeItem(STORAGE_KEY)
}

export function setAdminModeEnabled(enabled: boolean): void {
  persistAdminMode(enabled)
}

export function syncAdminModeForUser(user: User | null | undefined): void {
  if (!isAdminUser(user)) {
    persistAdminMode(false)
  }
}

export function useAdminMode(): { adminModeEnabled: typeof adminMode } {
  return { adminModeEnabled: adminMode }
}
