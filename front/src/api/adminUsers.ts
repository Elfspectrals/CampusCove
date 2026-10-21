import { apiRequest, isRecord } from './http'

export interface AdminUserRow {
  account_id: number
  public_id: string
  username: string
  email: string
  is_admin: boolean
  is_suspended: boolean
  is_banned: boolean
  deleted_at: string | null
}

export interface AdminUsersListParams {
  q?: string
  with_deleted?: boolean
}

export interface AdminUserUpdateBody {
  username?: string
  email?: string
  is_admin?: boolean
}

export interface AdminUserCreateBody {
  username: string
  email: string
  password: string
  is_admin?: boolean
}

function parseUser(row: unknown): AdminUserRow | null {
  if (!isRecord(row)) return null
  if (typeof row.account_id !== 'number') return null
  if (!(typeof row.public_id === 'string' || typeof row.public_id === 'number')) return null
  const username = typeof row.username === 'string' ? row.username : ''
  const email = typeof row.email === 'string' ? row.email : ''
  if (typeof row.is_admin !== 'boolean') return null
  const suspendedUntil = row.suspended_until
  const isSuspended = typeof suspendedUntil === 'string' && suspendedUntil.length > 0
  const bannedAt = row.banned_at
  const isBanned = typeof bannedAt === 'string' && bannedAt.length > 0
  if (!(row.deleted_at === null || typeof row.deleted_at === 'string')) return null
  return {
    account_id: row.account_id,
    public_id: String(row.public_id),
    username,
    email,
    is_admin: row.is_admin,
    is_suspended: isSuspended,
    is_banned: isBanned,
    deleted_at: row.deleted_at,
  }
}

function parseUserListPayload(data: unknown): { users: AdminUserRow[] } {
  if (!isRecord(data)) throw new Error('Invalid admin users response')
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.users) ? data.users : null
  if (!rows) throw new Error('Invalid admin users response')
  const users: AdminUserRow[] = []
  for (const row of rows) {
    const parsed = parseUser(row)
    if (!parsed) throw new Error('Invalid admin user row')
    users.push(parsed)
  }
  return { users }
}

function parseSingleUserPayload(data: unknown): AdminUserRow {
  if (!isRecord(data)) throw new Error('Invalid admin user response')
  const candidate = data.user ?? data.data ?? data
  const user = parseUser(candidate)
  if (!user) throw new Error('Invalid admin user response')
  return user
}

export async function fetchAdminUsers(params: AdminUsersListParams = {}): Promise<{ users: AdminUserRow[] }> {
  const data = await apiRequest('/admin/users', {
    query: { q: params.q?.trim(), with_deleted: params.with_deleted === true ? true : undefined },
  })
  return parseUserListPayload(data)
}

export async function updateAdminUser(accountId: number, body: AdminUserUpdateBody): Promise<AdminUserRow> {
  const data = await apiRequest(`/admin/users/${accountId}`, { method: 'PATCH', body })
  return parseSingleUserPayload(data)
}

export async function createAdminUser(body: AdminUserCreateBody): Promise<AdminUserRow> {
  const data = await apiRequest('/admin/users', { method: 'POST', body })
  return parseSingleUserPayload(data)
}

export async function resetAdminUserPassword(accountId: number, password: string): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/reset-password`, { method: 'POST', body: { password, password_confirmation: password } })
}

export async function suspendAdminUser(accountId: number, until: string, reason?: string): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/suspend`, {
    method: 'POST',
    body: {
      until,
      ...(reason && reason.trim() !== '' ? { reason: reason.trim() } : {}),
    },
  })
}

export async function unsuspendAdminUser(accountId: number): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/unsuspend`, { method: 'POST' })
}

export async function softDeleteAdminUser(accountId: number): Promise<void> {
  await apiRequest(`/admin/users/${accountId}`, { method: 'DELETE' })
}

export async function restoreAdminUser(accountId: number): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/restore`, { method: 'POST' })
}

export async function banAdminUser(accountId: number, reason?: string): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/ban`, {
    method: 'POST',
    body: {
      ...(reason && reason.trim() !== '' ? { reason: reason.trim() } : {}),
    },
  })
}

export async function unbanAdminUser(accountId: number): Promise<void> {
  await apiRequest(`/admin/users/${accountId}/unban`, { method: 'POST' })
}
