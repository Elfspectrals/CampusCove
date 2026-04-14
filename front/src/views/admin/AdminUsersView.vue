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
        <h1 class="m-0 text-2xl font-bold text-slate-900">Admin users</h1>
        <p class="mt-1 text-sm text-slate-600">Search and manage account status and credentials.</p>
      </div>
      <label for="admin-users-search" class="w-full sm:w-80">
        <span class="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
        <input
          id="admin-users-search"
          v-model="search"
          type="search"
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
          placeholder="Username or email"
        />
      </label>
    </div>

    <p v-if="message" class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{{ message }}</p>
    <p v-if="error" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{{ error }}</p>

    <section class="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 class="m-0 text-base font-semibold text-slate-900">Create user</h2>
      <form class="mt-3 grid gap-3 md:grid-cols-4" @submit.prevent="submitCreateUser">
        <input v-model="createUsername" type="text" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20" placeholder="Username" />
        <input v-model="createEmail" type="email" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20" placeholder="Email" />
        <input v-model="createPassword" type="password" minlength="8" class="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20" placeholder="Password (min 8)" />
        <div class="flex items-center justify-between gap-2 rounded-lg border border-slate-300 px-3 py-2">
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="createIsAdmin" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
            Admin
          </label>
          <button type="submit" class="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-500 disabled:opacity-60" :disabled="createSubmitting">
            {{ createSubmitting ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </form>
    </section>

    <div v-if="loading" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">Loading users...</div>
    <div v-else-if="!error && filteredUsers.length === 0" class="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-600">No users found.</div>
    <div v-else class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-4 py-3 text-left font-semibold text-slate-700">User</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-700">Email</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-700">Role</th>
              <th class="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              <th class="px-4 py-3 text-right font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="user in filteredUsers" :key="user.account_id" class="align-top">
              <td class="px-4 py-3">
                <p class="m-0 font-semibold text-slate-900">{{ user.username }}</p>
                <p class="m-0 text-xs text-slate-500">#{{ user.account_id }}</p>
              </td>
              <td class="px-4 py-3 text-slate-700">{{ user.email }}</td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="user.is_admin ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-700'">
                  {{ user.is_admin ? 'Admin' : 'Player' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <span class="rounded-full px-2 py-1 text-xs font-semibold" :class="user.deleted_at ? 'bg-slate-300 text-slate-800' : user.is_banned ? 'bg-rose-100 text-rose-900' : user.is_suspended ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'">
                  {{ user.deleted_at ? 'Soft deleted' : user.is_banned ? 'Banned' : user.is_suspended ? 'Suspended' : 'Active' }}
                </span>
              </td>
              <td class="px-4 py-3">
                <div class="flex flex-wrap justify-end gap-2">
                  <button type="button" class="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50" @click="openEdit(user)">
                    Edit
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="toggleSuspend(user)"
                  >
                    {{ user.is_suspended ? 'Unsuspend' : 'Suspend' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="toggleBan(user)"
                  >
                    {{ user.is_banned ? 'Unban' : 'Ban' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-60"
                    :disabled="actionSubmittingFor === user.account_id || user.deleted_at !== null"
                    @click="softDelete(user)"
                  >
                    Soft-delete
                  </button>
                  <button
                    v-if="user.deleted_at"
                    type="button"
                    class="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
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

    <div v-if="editTarget" class="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" @click.self="closeEdit">
      <div class="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 class="m-0 text-lg font-bold text-slate-900">Edit {{ editTarget.username }}</h2>
        <form class="mt-4 space-y-3" @submit.prevent="saveUser">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700" for="admin-edit-username">Username</label>
            <input id="admin-edit-username" v-model="editUsername" type="text" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-700" for="admin-edit-email">Email</label>
            <input id="admin-edit-email" v-model="editEmail" type="email" class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20" />
          </div>
          <label class="flex items-center gap-2 text-sm text-slate-800">
            <input v-model="editAdmin" type="checkbox" class="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
            Grant admin role
          </label>

          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <label class="mb-1 block text-sm font-medium text-slate-700" for="admin-edit-password">Reset password</label>
            <div class="flex gap-2">
              <input
                id="admin-edit-password"
                v-model="resetPasswordInput"
                type="password"
                minlength="8"
                class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                placeholder="New temporary password"
              />
              <button
                type="button"
                class="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                :disabled="resetSubmitting || resetPasswordInput.trim().length < 8"
                @click="submitResetPassword"
              >
                Reset
              </button>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50" @click="closeEdit">Close</button>
            <button type="submit" class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-60" :disabled="editSubmitting">
              {{ editSubmitting ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
