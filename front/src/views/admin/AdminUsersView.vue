<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  banAdminUser,
  createAdminUser,
  fetchAdminUsers,
  resetAdminUserPassword,
  restoreAdminUser,
  softDeleteAdminUser,
  suspendAdminUser,
  unbanAdminUser,
  unsuspendAdminUser,
  updateAdminUser,
  type AdminUserRow,
} from '../../api/adminUsers'

const loading = ref(true)
const error = ref<string | null>(null)
const message = ref<string | null>(null)
const search = ref('')
const users = ref<AdminUserRow[]>([])
const createUsername = ref('')
const createEmail = ref('')
const createPassword = ref('')
const createIsAdmin = ref(false)
const createSubmitting = ref(false)

const editTarget = ref<AdminUserRow | null>(null)
const editUsername = ref('')
const editEmail = ref('')
const editAdmin = ref(false)
const editSubmitting = ref(false)
const resetPasswordInput = ref('')
const resetSubmitting = ref(false)
const actionSubmittingFor = ref<number | null>(null)

let searchDebounce: ReturnType<typeof setTimeout> | null = null

const filteredUsers = computed(() => users.value)

function futureIsoDays(days: number): string {
  const msPerDay = 24 * 60 * 60 * 1000
  return new Date(Date.now() + days * msPerDay).toISOString()
}

async function loadUsers(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    const response = await fetchAdminUsers({ q: search.value, with_deleted: true })
    users.value = response.users
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not load admin users'
    users.value = []
  } finally {
    loading.value = false
  }
}

function openEdit(user: AdminUserRow): void {
  editTarget.value = user
  editUsername.value = user.username
  editEmail.value = user.email
  editAdmin.value = user.is_admin
  resetPasswordInput.value = ''
  message.value = null
}

function closeEdit(): void {
  editTarget.value = null
  resetPasswordInput.value = ''
}

async function saveUser(): Promise<void> {
  if (!editTarget.value) return
  editSubmitting.value = true
  error.value = null
  try {
    await updateAdminUser(editTarget.value.account_id, {
      username: editUsername.value.trim(),
      email: editEmail.value.trim(),
      is_admin: editAdmin.value,
    })
    message.value = 'User updated.'
    await loadUsers()
    const refreshed = users.value.find((user) => user.account_id === editTarget.value?.account_id) ?? null
    if (refreshed) openEdit(refreshed)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not update user'
  } finally {
    editSubmitting.value = false
  }
}

async function submitCreateUser(): Promise<void> {
  if (createUsername.value.trim() === '' || createEmail.value.trim() === '' || createPassword.value.trim().length < 8) return
  createSubmitting.value = true
  error.value = null
  try {
    await createAdminUser({
      username: createUsername.value.trim(),
      email: createEmail.value.trim(),
      password: createPassword.value.trim(),
      is_admin: createIsAdmin.value,
    })
    message.value = 'User created.'
    createUsername.value = ''
    createEmail.value = ''
    createPassword.value = ''
    createIsAdmin.value = false
    await loadUsers()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not create user'
  } finally {
    createSubmitting.value = false
  }
}

async function submitResetPassword(): Promise<void> {
  if (!editTarget.value || resetPasswordInput.value.trim().length < 8) return
  resetSubmitting.value = true
  error.value = null
  try {
    await resetAdminUserPassword(editTarget.value.account_id, resetPasswordInput.value.trim())
    message.value = 'Password reset applied.'
    resetPasswordInput.value = ''
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not reset password'
  } finally {
    resetSubmitting.value = false
  }
}

async function toggleSuspend(user: AdminUserRow): Promise<void> {
  actionSubmittingFor.value = user.account_id
  error.value = null
  try {
    if (user.is_suspended) {
      await unsuspendAdminUser(user.account_id)
      message.value = `${user.username} unsuspended.`
    } else {
      await suspendAdminUser(user.account_id, futureIsoDays(7))
      message.value = `${user.username} suspended.`
    }
    await loadUsers()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not update suspension status'
  } finally {
    actionSubmittingFor.value = null
  }
}

async function toggleBan(user: AdminUserRow): Promise<void> {
  actionSubmittingFor.value = user.account_id
  error.value = null
  try {
    if (user.is_banned) {
      await unbanAdminUser(user.account_id)
      message.value = `${user.username} unbanned.`
    } else {
      await banAdminUser(user.account_id)
      message.value = `${user.username} banned.`
    }
    await loadUsers()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not update ban status'
  } finally {
    actionSubmittingFor.value = null
  }
}

async function softDelete(user: AdminUserRow): Promise<void> {
  if (!window.confirm(`Soft-delete ${user.username}?`)) return
  actionSubmittingFor.value = user.account_id
  error.value = null
  try {
    await softDeleteAdminUser(user.account_id)
    message.value = `${user.username} soft-deleted.`
    await loadUsers()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not soft-delete user'
  } finally {
    actionSubmittingFor.value = null
  }
}

async function restore(user: AdminUserRow): Promise<void> {
  actionSubmittingFor.value = user.account_id
  error.value = null
  try {
    await restoreAdminUser(user.account_id)
    message.value = `${user.username} restored.`
    await loadUsers()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'Could not restore user'
  } finally {
    actionSubmittingFor.value = null
  }
}

onMounted(() => {
  void loadUsers()
})

watch(search, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    void loadUsers()
  }, 350)
})
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl flex-col">
    <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 class="cc-display m-0 text-3xl text-fog">Admin users</h1>
        <p class="mt-1 text-sm text-mist">Search and manage account status and credentials.</p>
      </div>
      <label for="admin-users-search" class="w-full sm:w-80">
        <span class="cc-label">Search</span>
        <input
          id="admin-users-search"
          v-model="search"
          type="search"
          class="cc-input cc-input-sm w-full"
          placeholder="Username or email"
        />
      </label>
    </div>

    <p v-if="message" class="mb-4 cc-alert cc-alert-success">{{ message }}</p>
    <p v-if="error" class="mb-4 cc-alert cc-alert-error">{{ error }}</p>

    <section class="mb-4 cc-panel p-4">
      <h2 class="cc-display m-0 text-xl text-fog">Create user</h2>
      <form class="mt-3 grid gap-3 md:grid-cols-4" @submit.prevent="submitCreateUser">
        <input v-model="createUsername" type="text" class="cc-input cc-input-sm" placeholder="Username" />
        <input v-model="createEmail" type="email" class="cc-input cc-input-sm" placeholder="Email" />
        <input v-model="createPassword" type="password" minlength="8" class="cc-input cc-input-sm" placeholder="Password (min 8)" />
        <div class="cc-panel-flat flex items-center justify-between gap-2 px-3 py-2">
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="createIsAdmin" type="checkbox" class="cc-check" />
            Admin
          </label>
          <button type="submit" class="cc-btn cc-btn-sm cc-btn-sun" :disabled="createSubmitting">
            {{ createSubmitting ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </form>
    </section>

    <div v-if="loading" class="cc-panel-flat px-4 py-16 text-center text-sm font-bold text-mist">Loading users...</div>
    <div v-else-if="!error && filteredUsers.length === 0" class="cc-panel-flat px-4 py-16 text-center text-sm font-bold text-mist">No users found.</div>
    <div v-else class="cc-panel overflow-hidden">
      <div class="overflow-x-auto">
        <table class="cc-table">
          <thead>
            <tr>
              <th class="px-4 py-3 text-left">User</th>
              <th class="px-4 py-3 text-left">Email</th>
              <th class="px-4 py-3 text-left">Role</th>
              <th class="px-4 py-3 text-left">Status</th>
              <th class="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in filteredUsers" :key="user.account_id" class="align-top">
              <td class="px-4 py-3">
                <p class="m-0 font-semibold text-fog">{{ user.username }}</p>
                <p class="m-0 text-xs text-mist">#{{ user.account_id }}</p>
              </td>
              <td class="px-4 py-3 text-fog/90">{{ user.email }}</td>
              <td class="px-4 py-3">
                <span class="cc-chip" :class="user.is_admin ? 'cc-chip-grape' : ''">
                  {{ user.is_admin ? 'Admin' : 'Player' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="cc-chip" :class="user.deleted_at ? 'opacity-60' : user.is_banned ? 'cc-chip-coral' : user.is_suspended ? 'cc-chip-sun' : 'cc-chip-mint'">
                  {{ user.deleted_at ? 'Soft deleted' : user.is_banned ? 'Banned' : user.is_suspended ? 'Suspended' : 'Active' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap justify-end gap-2">
                  <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="openEdit(user)">
                    Edit
                  </button>
                  <button
                    type="button"
                    class="cc-btn cc-btn-sm cc-btn-ghost text-sun"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="toggleSuspend(user)"
                  >
                    {{ user.is_suspended ? 'Unsuspend' : 'Suspend' }}
                  </button>
                  <button
                    type="button"
                    class="cc-btn cc-btn-sm cc-btn-ghost text-coral"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="toggleBan(user)"
                  >
                    {{ user.is_banned ? 'Unban' : 'Ban' }}
                  </button>
                  <button
                    type="button"
                    class="cc-btn cc-btn-sm cc-btn-ghost text-coral"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="softDelete(user)"
                  >
                    Soft-delete
                  </button>
                  <button
                    v-if="user.deleted_at"
                    type="button"
                    class="cc-btn cc-btn-sm cc-btn-ghost text-mint"
                    :disabled="actionSubmittingFor === user.account_id"
                    @click="restore(user)"
                  >
                    Restore
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="editTarget" class="cc-backdrop" @click.self="closeEdit">
      <div class="cc-modal max-w-lg">
        <h2 class="cc-display m-0 text-2xl text-fog">Edit {{ editTarget.username }}</h2>
        <form class="mt-4 space-y-3" @submit.prevent="saveUser">
          <div>
            <label class="cc-label" for="admin-edit-username">Username</label>
            <input id="admin-edit-username" v-model="editUsername" type="text" class="cc-input cc-input-sm w-full" />
          </div>
          <div>
            <label class="cc-label" for="admin-edit-email">Email</label>
            <input id="admin-edit-email" v-model="editEmail" type="email" class="cc-input cc-input-sm w-full" />
          </div>
          <label class="flex cursor-pointer items-center gap-2 text-sm font-bold text-fog">
            <input v-model="editAdmin" type="checkbox" class="cc-check" />
            Grant admin role
          </label>

          <div class="cc-panel-flat p-3">
            <label class="cc-label" for="admin-edit-password">Reset password</label>
            <div class="flex gap-2">
              <input
                id="admin-edit-password"
                v-model="resetPasswordInput"
                type="password"
                minlength="8"
                class="cc-input cc-input-sm min-w-0 flex-1"
                placeholder="New temporary password"
              />
              <button
                type="button"
                class="cc-btn cc-btn-sm cc-btn-ghost"
                :disabled="resetSubmitting || resetPasswordInput.trim().length < 8"
                @click="submitResetPassword"
              >
                Reset
              </button>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost" @click="closeEdit">Close</button>
            <button type="submit" class="cc-btn cc-btn-sm cc-btn-sun" :disabled="editSubmitting">
              {{ editSubmitting ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
