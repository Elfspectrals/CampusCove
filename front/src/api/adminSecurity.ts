import { apiRequest, isRecord } from './http'

export const SECURITY_EVENT_TYPES = ['not_found', 'login_failed', 'rate_limited', 'probe_path', 'injection', 'scanner_agent'] as const
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number]
const CVE_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const
type CveSeverity = (typeof CVE_SEVERITIES)[number]
type IpStatus = 'banned' | 'suspect' | 'normal'

interface SecurityTopIp {
  ip: string
  score: number
  status: IpStatus
  country: string | null
}

interface SecurityScanInfo {
  scanned_at: string
  commit_sha: string
  ref: string
}

interface SecurityCveSummary extends SecurityScanInfo {
  by_severity: Record<CveSeverity, number>
  total: number
}

interface SecurityCve {
  id: number
  target: string
  package: string
  installed_version: string
  fixed_version: string | null
  vulnerability_id: string
  severity: CveSeverity
  title: string | null
}

export interface SecurityCveList {
  scan: SecurityScanInfo | null
  vulnerabilities: SecurityCve[]
}

export interface SecurityOverview {
  generated_at: string
  live_ips: number
  events_24h: number
  login_failed_24h: number
  active_bans: number
  suspect_ips: number
  by_type_24h: Record<SecurityEventType, number>
  hourly: { hour: string, events: number }[]
  top_ips: SecurityTopIp[]
  top_countries: { country: string | null, events: number }[]
  top_paths: { path: string, events: number }[]
  cves: SecurityCveSummary | null
}

export interface SecurityEvent {
  id: number
  ip: string
  country: string | null
  type: SecurityEventType
  method: string
  path: string
  user_agent: string | null
  detail: string | null
  created_at: string
}

export interface SecurityEventPage {
  events: SecurityEvent[]
  next_before_id: number | null
}

export interface SecurityBan {
  id: number
  ip: string
  reason: 'auto' | 'manual'
  score: number | null
  banned_by_account_id: number | null
  created_at: string
  expires_at: string | null
  lifted_at: string | null
  lifted_by_account_id: number | null
}

interface SecurityIpReputation {
  abuse_confidence: number
  country: string | null
  isp: string | null
  usage_type: string | null
  is_tor: boolean
  total_reports: number
  checked_at: string
}

export interface SecurityIpDetail {
  ip: string
  score: number
  status: IpStatus
  reputation: SecurityIpReputation | null
  events: SecurityEventPage
  bans: SecurityBan[]
}

export interface SecurityEventFilters {
  ip?: string
  type?: SecurityEventType
  before_id?: number
}

function invalid(what: string): never {
  throw new Error(`Invalid security ${what}`)
}

function num(value: unknown, what: string): number {
  return typeof value === 'number' ? value : invalid(what)
}

function str(value: unknown, what: string): string {
  return typeof value === 'string' ? value : invalid(what)
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function list<T>(value: unknown, parse: (item: unknown) => T, what: string): T[] {
  return Array.isArray(value) ? value.map(parse) : invalid(what)
}

function isEventType(value: unknown): value is SecurityEventType {
  return (SECURITY_EVENT_TYPES as readonly unknown[]).includes(value)
}

function parseStatus(value: unknown): IpStatus {
  return value === 'banned' || value === 'suspect' || value === 'normal' ? value : invalid('status')
}

function parseEvent(value: unknown): SecurityEvent {
  if (!isRecord(value) || !isEventType(value.type)) invalid('event')
  return {
    id: num(value.id, 'event'),
    ip: str(value.ip, 'event'),
    country: strOrNull(value.country),
    type: value.type,
    method: str(value.method, 'event'),
    path: str(value.path, 'event'),
    user_agent: strOrNull(value.user_agent),
    detail: strOrNull(value.detail),
    created_at: str(value.created_at, 'event'),
  }
}

function parseEventPage(value: unknown): SecurityEventPage {
  if (!isRecord(value)) invalid('events')
  return {
    events: list(value.events, parseEvent, 'events'),
    next_before_id: typeof value.next_before_id === 'number' ? value.next_before_id : null,
  }
}

function parseBan(value: unknown): SecurityBan {
  if (!isRecord(value) || (value.reason !== 'auto' && value.reason !== 'manual')) invalid('ban')
  return {
    id: num(value.id, 'ban'),
    ip: str(value.ip, 'ban'),
    reason: value.reason,
    score: typeof value.score === 'number' ? value.score : null,
    banned_by_account_id: typeof value.banned_by_account_id === 'number' ? value.banned_by_account_id : null,
    created_at: str(value.created_at, 'ban'),
    expires_at: strOrNull(value.expires_at),
    lifted_at: strOrNull(value.lifted_at),
    lifted_by_account_id: typeof value.lifted_by_account_id === 'number' ? value.lifted_by_account_id : null,
  }
}

function parseReputation(value: unknown): SecurityIpReputation | null {
  if (value === null) return null
  if (!isRecord(value) || typeof value.is_tor !== 'boolean') invalid('reputation')
  return {
    abuse_confidence: num(value.abuse_confidence, 'reputation'),
    country: strOrNull(value.country),
    isp: strOrNull(value.isp),
    usage_type: strOrNull(value.usage_type),
    is_tor: value.is_tor,
    total_reports: num(value.total_reports, 'reputation'),
    checked_at: str(value.checked_at, 'reputation'),
  }
}

function parseIpDetail(value: unknown): SecurityIpDetail {
  if (!isRecord(value)) invalid('ip')
  return {
    ip: str(value.ip, 'ip'),
    score: num(value.score, 'ip'),
    status: parseStatus(value.status),
    reputation: parseReputation(value.reputation),
    events: parseEventPage(value.events),
    bans: list(value.bans, parseBan, 'bans'),
  }
}

function isSeverity(value: unknown): value is CveSeverity {
  return (CVE_SEVERITIES as readonly unknown[]).includes(value)
}

function parseScanInfo(value: unknown): SecurityScanInfo {
  if (!isRecord(value)) invalid('scan')
  return { scanned_at: str(value.scanned_at, 'scan'), commit_sha: str(value.commit_sha, 'scan'), ref: str(value.ref, 'scan') }
}

function parseCveSummary(value: unknown): SecurityCveSummary | null {
  if (value === null) return null
  if (!isRecord(value) || !isRecord(value.by_severity)) invalid('cve summary')
  const bySeverity = value.by_severity
  return {
    ...parseScanInfo(value),
    by_severity: Object.fromEntries(CVE_SEVERITIES.map((severity) => [severity, num(bySeverity[severity], 'cve summary')])) as Record<CveSeverity, number>,
    total: num(value.total, 'cve summary'),
  }
}

function parseCve(value: unknown): SecurityCve {
  if (!isRecord(value) || !isSeverity(value.severity)) invalid('cve')
  return {
    id: num(value.id, 'cve'),
    target: str(value.target, 'cve'),
    package: str(value.package, 'cve'),
    installed_version: str(value.installed_version, 'cve'),
    fixed_version: strOrNull(value.fixed_version),
    vulnerability_id: str(value.vulnerability_id, 'cve'),
    severity: value.severity,
    title: strOrNull(value.title),
  }
}

function parseOverview(value: unknown): SecurityOverview {
  if (!isRecord(value) || !isRecord(value.by_type_24h)) invalid('overview')
  const byType = value.by_type_24h
  return {
    generated_at: str(value.generated_at, 'overview'),
    live_ips: num(value.live_ips, 'overview'),
    events_24h: num(value.events_24h, 'overview'),
    login_failed_24h: num(value.login_failed_24h, 'overview'),
    active_bans: num(value.active_bans, 'overview'),
    suspect_ips: num(value.suspect_ips, 'overview'),
    by_type_24h: Object.fromEntries(SECURITY_EVENT_TYPES.map((type) => [type, num(byType[type], 'overview')])) as Record<SecurityEventType, number>,
    hourly: list(value.hourly, (row) => {
      if (!isRecord(row)) invalid('hourly')
      return { hour: str(row.hour, 'hourly'), events: num(row.events, 'hourly') }
    }, 'hourly'),
    top_ips: list(value.top_ips, (row) => {
      if (!isRecord(row)) invalid('top ip')
      return { ip: str(row.ip, 'top ip'), score: num(row.score, 'top ip'), status: parseStatus(row.status), country: strOrNull(row.country) }
    }, 'top ips'),
    top_countries: list(value.top_countries, (row) => {
      if (!isRecord(row)) invalid('country')
      return { country: strOrNull(row.country), events: num(row.events, 'country') }
    }, 'countries'),
    top_paths: list(value.top_paths, (row) => {
      if (!isRecord(row)) invalid('path')
      return { path: str(row.path, 'path'), events: num(row.events, 'path') }
    }, 'paths'),
    cves: parseCveSummary(value.cves),
  }
}

export async function fetchSecurityOverview(): Promise<SecurityOverview> {
  return parseOverview(await apiRequest('/admin/security/overview'))
}

export async function fetchSecurityCves(): Promise<SecurityCveList> {
  const data = await apiRequest('/admin/security/cves')
  if (!isRecord(data)) invalid('cves')
  return {
    scan: data.scan === null ? null : parseScanInfo(data.scan),
    vulnerabilities: list(data.vulnerabilities, parseCve, 'cves'),
  }
}

export async function fetchSecurityEvents(filters: SecurityEventFilters = {}): Promise<SecurityEventPage> {
  return parseEventPage(await apiRequest('/admin/security/events', { query: { ...filters } }))
}

export async function fetchSecurityIp(ip: string): Promise<SecurityIpDetail> {
  return parseIpDetail(await apiRequest(`/admin/security/ips/${encodeURIComponent(ip)}`))
}

export async function banSecurityIp(ip: string, duration: '24h' | 'permanent', report: boolean): Promise<SecurityBan> {
  const data = await apiRequest(`/admin/security/ips/${encodeURIComponent(ip)}/ban`, { method: 'POST', body: { duration, report } })
  if (!isRecord(data)) invalid('ban')
  return parseBan(data.ban)
}

export async function unbanSecurityIp(ip: string): Promise<SecurityIpDetail> {
  const data = await apiRequest(`/admin/security/ips/${encodeURIComponent(ip)}/unban`, { method: 'POST' })
  if (!isRecord(data)) invalid('unban')
  return parseIpDetail(data.ip)
}
