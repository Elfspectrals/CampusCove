<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  SECURITY_EVENT_TYPES,
  banSecurityIp,
  fetchSecurityCves,
  fetchSecurityEvents,
  fetchSecurityIp,
  fetchSecurityOverview,
  unbanSecurityIp,
  type SecurityCveList,
  type SecurityEvent,
  type SecurityEventType,
  type SecurityIpDetail,
  type SecurityOverview,
} from '../../api/adminSecurity'
import SecurityGlobe, { type GlobeImpact } from '../../components/admin/SecurityGlobe.vue'

const REFRESH_MS = 10_000
const STALE_SCAN_HOURS = 48
const HOUR_MS = 3_600_000

const overview = ref<SecurityOverview | null>(null)
const events = ref<SecurityEvent[]>([])
const nextBeforeId = ref<number | null>(null)
const pagedFeed = ref(false)
const typeFilter = ref<SecurityEventType | ''>('')
const selected = ref<SecurityIpDetail | null>(null)
const reportBan = ref(false)
const error = ref<string | null>(null)
const busy = ref(false)
const cveList = ref<SecurityCveList | null>(null)
let refreshing = false
let timer = 0

const impacts = computed<GlobeImpact[]>(() => {
  const data = overview.value
  if (!data) return []
  const bannedCountries = new Set(data.top_ips.filter((ip) => ip.status === 'banned').map((ip) => ip.country))
  return data.top_countries.flatMap((row) => (row.country ? [{ country: row.country, events: row.events, banned: bannedCountries.has(row.country) }] : []))
})

const hourlyMax = computed(() => Math.max(1, ...(overview.value?.hourly.map((h) => h.events) ?? [])))
const scanAgeHours = computed(() => {
  const data = overview.value
  if (!data?.cves) return null
  return (Date.parse(data.generated_at) - Date.parse(data.cves.scanned_at)) / HOUR_MS
})
const scanIsStale = computed(() => scanAgeHours.value !== null && scanAgeHours.value > STALE_SCAN_HOURS)
const scanAge = computed(() => {
  const hours = scanAgeHours.value
  if (hours === null) return ''
  if (hours < 1) return 'less than an hour ago'
  if (hours < STALE_SCAN_HOURS) return `${Math.floor(hours)} h ago`
  return `${Math.floor(hours / 24)} days ago`
})

const pathMax = computed(() => Math.max(1, ...(overview.value?.top_paths.map((p) => p.events) ?? [])))

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString()
}

function dateTime(iso: string | null): string {
  return iso === null ? 'never' : new Date(iso).toLocaleString()
}

async function loadFeed(): Promise<void> {
  const page = await fetchSecurityEvents({ type: typeFilter.value || undefined })
  events.value = page.events
  nextBeforeId.value = page.next_before_id
  pagedFeed.value = false
}

async function refresh(): Promise<void> {
  if (refreshing) return
  refreshing = true
  try {
    overview.value = await fetchSecurityOverview()
    if (!pagedFeed.value) await loadFeed()
    error.value = null
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    refreshing = false
  }
}

async function loadMore(): Promise<void> {
  if (nextBeforeId.value === null) return
  try {
    const page = await fetchSecurityEvents({ type: typeFilter.value || undefined, before_id: nextBeforeId.value })
    events.value = [...events.value, ...page.events]
    nextBeforeId.value = page.next_before_id
    pagedFeed.value = true
  } catch (e) {
    error.value = messageOf(e)
  }
}

async function changeFilter(): Promise<void> {
  try {
    await loadFeed()
  } catch (e) {
    error.value = messageOf(e)
  }
}

async function toggleCves(): Promise<void> {
  if (cveList.value) {
    cveList.value = null
    return
  }
  try {
    cveList.value = await fetchSecurityCves()
  } catch (e) {
    error.value = messageOf(e)
  }
}

async function openIp(ip: string): Promise<void> {
  try {
    selected.value = await fetchSecurityIp(ip)
    reportBan.value = false
  } catch (e) {
    error.value = messageOf(e)
  }
}

async function ban(duration: '24h' | 'permanent'): Promise<void> {
  const ip = selected.value?.ip
  if (!ip) return
  const what = duration === 'permanent' ? 'permanently' : 'for 24 hours'
  if (!window.confirm(`Ban ${ip} ${what}?${reportBan.value ? ' It will also be reported to AbuseIPDB.' : ''}`)) return
  busy.value = true
  try {
    await banSecurityIp(ip, duration, reportBan.value)
    selected.value = await fetchSecurityIp(ip)
    await refresh()
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

async function unban(): Promise<void> {
  const ip = selected.value?.ip
  if (!ip || !window.confirm(`Lift the ban on ${ip}?`)) return
  busy.value = true
  try {
    selected.value = await unbanSecurityIp(ip)
    await refresh()
  } catch (e) {
    error.value = messageOf(e)
  } finally {
    busy.value = false
  }
}

function startPolling(): void {
  window.clearInterval(timer)
  timer = window.setInterval(refresh, REFRESH_MS)
}

function onVisibilityChange(): void {
  if (document.hidden) {
    window.clearInterval(timer)
    return
  }
  void refresh()
  startPolling()
}

onMounted(() => {
  void refresh()
  startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <div class="sec">
    <header class="sec-header">
      <h1 class="sec-title">CampusCove security</h1>
      <div class="sec-header-side">
        <span v-if="overview" class="sec-muted">Updated {{ time(overview.generated_at) }}</span>
        <RouterLink :to="{ name: 'admin-users' }" class="sec-btn">Back to admin</RouterLink>
      </div>
    </header>

    <p v-if="error" class="sec-alert" role="alert">{{ error }}</p>

    <div class="sec-grid">
      <section class="sec-card sec-globe-card" aria-label="Attack map">
        <div class="sec-legend">
          <span><span class="dot dot-gold" /> Events 24 h</span>
          <span><span class="dot dot-red" /> Banned</span>
        </div>
        <SecurityGlobe :impacts="impacts" />
        <ul v-if="overview" class="sec-countries">
          <li v-for="row in overview.top_countries" :key="row.country ?? 'unknown'">
            <span>{{ row.country ?? 'Unknown' }}</span>
            <span class="sec-muted">{{ row.events }}</span>
          </li>
        </ul>
      </section>

      <div class="sec-side">
        <div class="sec-stats">
          <div class="sec-card sec-stat">
            <span class="sec-muted">Live IPs (10 min)</span>
            <strong class="sec-value sec-gold">{{ overview?.live_ips ?? '–' }}</strong>
          </div>
          <div class="sec-card sec-stat">
            <span class="sec-muted">Events 24 h</span>
            <strong class="sec-value">{{ overview?.events_24h ?? '–' }}</strong>
            <svg v-if="overview" class="sec-spark" viewBox="0 0 96 16" preserveAspectRatio="none" aria-hidden="true">
              <rect
                v-for="(bucket, i) in overview.hourly"
                :key="bucket.hour"
                :x="i * 4"
                :y="16 - (16 * bucket.events) / hourlyMax"
                width="3"
                :height="(16 * bucket.events) / hourlyMax"
                :class="i === overview.hourly.length - 1 ? 'spark-now' : 'spark-bar'"
              />
            </svg>
          </div>
          <div class="sec-card sec-stat">
            <span class="sec-muted">Banned now</span>
            <strong class="sec-value sec-red">{{ overview?.active_bans ?? '–' }}</strong>
          </div>
          <div class="sec-card sec-stat">
            <span class="sec-muted">Failed logins 24 h</span>
            <strong class="sec-value">{{ overview?.login_failed_24h ?? '–' }}</strong>
          </div>
          <div class="sec-card sec-stat">
            <span class="sec-muted">Suspect IPs</span>
            <strong class="sec-value sec-amber">{{ overview?.suspect_ips ?? '–' }}</strong>
          </div>
          <button type="button" class="sec-card sec-stat sec-stat-button" :aria-expanded="cveList !== null" @click="toggleCves">
            <span class="sec-muted">Open CVEs</span>
            <template v-if="overview?.cves">
              <strong class="sec-value" :class="{ 'sec-red': overview.cves.by_severity.CRITICAL > 0 }">{{ overview.cves.total }}</strong>
              <span class="sec-muted">{{ overview.cves.by_severity.CRITICAL }} critical · {{ overview.cves.by_severity.HIGH }} high</span>
              <span :class="scanIsStale ? 'sec-amber' : 'sec-muted'">last scan {{ scanAge }}</span>
            </template>
            <strong v-else class="sec-value sec-muted">{{ overview ? 'no scan yet' : '–' }}</strong>
          </button>
        </div>

        <section class="sec-card">
          <h2 class="sec-subtitle">Top IPs</h2>
          <p v-if="overview && overview.top_ips.length === 0" class="sec-muted">No suspicious IP in the last 24 hours.</p>
          <ul class="sec-rows">
            <li v-for="row in overview?.top_ips ?? []" :key="row.ip">
              <button type="button" class="sec-link" @click="openIp(row.ip)">{{ row.ip }}</button>
              <span class="sec-muted">{{ row.country ?? '??' }}</span>
              <span class="badge" :class="`badge-${row.status}`">{{ row.status }}</span>
              <span class="sec-gold">{{ row.score }}</span>
            </li>
          </ul>
        </section>

        <section class="sec-card">
          <h2 class="sec-subtitle">Most probed paths</h2>
          <p v-if="overview && overview.top_paths.length === 0" class="sec-muted">No probe in the last 24 hours.</p>
          <ul class="sec-paths">
            <li v-for="row in overview?.top_paths ?? []" :key="row.path">
              <code>{{ row.path }}</code>
              <span class="bar"><span class="bar-fill" :style="{ width: `${(100 * row.events) / pathMax}%` }" /></span>
              <span class="sec-muted">{{ row.events }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <section class="sec-card sec-feed">
      <div class="sec-feed-head">
        <h2 class="sec-subtitle">Live feed</h2>
        <label class="sec-muted">
          Type
          <select v-model="typeFilter" class="sec-select" @change="changeFilter">
            <option value="">All types</option>
            <option v-for="type in SECURITY_EVENT_TYPES" :key="type" :value="type">{{ type }}</option>
          </select>
        </label>
      </div>
      <p v-if="events.length === 0" class="sec-muted">No event yet.</p>
      <ul class="sec-events">
        <li v-for="event in events" :key="event.id">
          <span class="sec-muted">{{ time(event.created_at) }}</span>
          <button type="button" class="sec-link" @click="openIp(event.ip)">{{ event.ip }}</button>
          <span :class="`type-${event.type}`">{{ event.type }}</span>
          <span class="sec-ellipsis">{{ event.method }} {{ event.path }}<template v-if="event.detail"> · {{ event.detail }}</template></span>
        </li>
      </ul>
      <button v-if="nextBeforeId !== null" type="button" class="sec-btn" @click="loadMore">Load more</button>
    </section>

    <section v-if="cveList" class="sec-card sec-feed" aria-label="Dependency CVEs">
      <div class="sec-feed-head">
        <h2 class="sec-subtitle">Dependency CVEs</h2>
        <span v-if="cveList.scan" class="sec-muted">{{ cveList.scan.ref }} · {{ cveList.scan.commit_sha.slice(0, 7) }} · {{ dateTime(cveList.scan.scanned_at) }}</span>
      </div>
      <p v-if="!cveList.scan" class="sec-muted">No Trivy scan received yet.</p>
      <p v-else-if="cveList.vulnerabilities.length === 0" class="sec-muted">No known vulnerability in the dependencies.</p>
      <ul class="sec-cves">
        <li v-for="cve in cveList.vulnerabilities" :key="cve.id">
          <span class="badge" :class="`sev-${cve.severity}`">{{ cve.severity }}</span>
          <a class="sec-link" :href="`https://cve.now/${encodeURIComponent(cve.vulnerability_id)}`" target="_blank" rel="noopener noreferrer">{{ cve.vulnerability_id }}</a>
          <span>{{ cve.package }} {{ cve.installed_version }} → {{ cve.fixed_version ?? 'no fix yet' }}</span>
          <span class="sec-muted">{{ cve.target }}</span>
          <span class="sec-muted sec-ellipsis">{{ cve.title }}</span>
        </li>
      </ul>
    </section>

    <aside v-if="selected" class="sec-panel" aria-label="IP details">
      <div class="sec-panel-head">
        <h2 class="sec-subtitle">{{ selected.ip }}</h2>
        <button type="button" class="sec-btn" aria-label="Close" @click="selected = null">×</button>
      </div>
      <p>
        Score <strong class="sec-gold">{{ selected.score }}</strong>
        <span class="badge" :class="`badge-${selected.status}`">{{ selected.status }}</span>
      </p>
      <p v-if="selected.reputation" class="sec-muted">
        AbuseIPDB {{ selected.reputation.abuse_confidence }} % · {{ selected.reputation.isp ?? 'unknown ISP' }} ·
        {{ selected.reputation.usage_type ?? 'unknown usage' }} · {{ selected.reputation.total_reports }} reports
        <template v-if="selected.reputation.is_tor"> · Tor exit</template>
        · checked {{ dateTime(selected.reputation.checked_at) }}
      </p>
      <p v-else class="sec-muted">Not checked on AbuseIPDB.</p>

      <div class="sec-actions">
        <button type="button" class="sec-btn sec-btn-gold" :disabled="busy" @click="ban('24h')">Ban 24 h</button>
        <button type="button" class="sec-btn sec-btn-red" :disabled="busy" @click="ban('permanent')">Ban permanently</button>
        <button v-if="selected.status === 'banned'" type="button" class="sec-btn" :disabled="busy" @click="unban">Unban</button>
        <label class="sec-muted"><input v-model="reportBan" type="checkbox"> Report to AbuseIPDB</label>
      </div>

      <h3 class="sec-subtitle">Bans</h3>
      <p v-if="selected.bans.length === 0" class="sec-muted">Never banned.</p>
      <ul class="sec-rows">
        <li v-for="item in selected.bans" :key="item.id">
          <span>{{ item.reason }}</span>
          <span class="sec-muted">{{ dateTime(item.created_at) }}</span>
          <span class="sec-muted">until {{ item.expires_at ? dateTime(item.expires_at) : 'forever' }}</span>
          <span v-if="item.lifted_at" class="sec-muted">lifted {{ dateTime(item.lifted_at) }}</span>
        </li>
      </ul>

      <h3 class="sec-subtitle">Latest events</h3>
      <ul class="sec-events">
        <li v-for="event in selected.events.events" :key="event.id">
          <span class="sec-muted">{{ dateTime(event.created_at) }}</span>
          <span :class="`type-${event.type}`">{{ event.type }}</span>
          <span class="sec-ellipsis">{{ event.method }} {{ event.path }}<template v-if="event.detail"> · {{ event.detail }}</template></span>
        </li>
      </ul>
    </aside>
  </div>
</template>

<style>
.sec {
  --sec-bg: #0b0b0b;
  --sec-card: #121212;
  --sec-line: #2a2618;
  --sec-gold: #d4af37;
  --sec-gold-dim: #5c4f24;
  --sec-text: #e8e2cf;
  --sec-muted: #9a927c;
  --sec-red: #e24b4a;
  --sec-red-soft: #f09595;
  --sec-amber: #ef9f27;
  min-height: 100dvh;
  overflow-y: auto;
  background: var(--sec-bg);
  color: var(--sec-text);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  font-size: 0.875rem;
}

.sec-header,
.sec-header-side,
.sec-feed-head,
.sec-panel-head,
.sec-actions,
.sec-legend {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.sec-header,
.sec-feed-head,
.sec-panel-head {
  justify-content: space-between;
}

.sec-title {
  margin: 0;
  color: var(--sec-gold);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sec-subtitle {
  margin: 0 0 0.5rem;
  color: var(--sec-gold);
  font-size: 0.95rem;
  font-weight: 600;
}

.sec-muted { color: var(--sec-muted); }
.sec-gold { color: var(--sec-gold); }
.sec-red { color: var(--sec-red); }
.sec-amber { color: var(--sec-amber); }

.sec-alert {
  margin: 0;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--sec-red);
  border-radius: 0.5rem;
  color: var(--sec-red-soft);
}

.sec-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  gap: 1rem;
}

@media (max-width: 960px) {
  .sec-grid { grid-template-columns: minmax(0, 1fr); }
}

.sec-card {
  background: var(--sec-card);
  border: 1px solid var(--sec-line);
  border-radius: 0.75rem;
  padding: 0.75rem;
}

.sec-globe-card {
  display: flex;
  flex-direction: column;
}

.sec-side {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

.sec-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.sec-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.sec-stat-button {
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.sec-stat-button:hover { border-color: var(--sec-gold-dim); }

.sec-cves {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.sec-cves li {
  display: grid;
  grid-template-columns: 5.5rem 10rem minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.5fr);
  gap: 0.75rem;
  align-items: baseline;
}

@media (max-width: 960px) {
  .sec-cves li { grid-template-columns: 5.5rem minmax(0, 1fr); }
}

.sev-CRITICAL { background: #3a1414; color: var(--sec-red-soft); }
.sev-HIGH { background: #3a2a0c; color: #fac775; }
.sev-MEDIUM { background: #2a2618; color: var(--sec-gold); }
.sev-LOW,
.sev-UNKNOWN { background: #1e1e1a; color: #b4b2a9; }

.sec-value {
  font-size: 1.5rem;
  font-weight: 600;
}

.sec-spark { width: 100%; height: 16px; }
.spark-bar { fill: var(--sec-gold-dim); }
.spark-now { fill: var(--sec-gold); }

.dot {
  display: inline-block;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
}
.dot-gold { background: var(--sec-gold); }
.dot-red { background: var(--sec-red); }

.sec-rows,
.sec-paths,
.sec-events,
.sec-countries {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.sec-rows li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.sec-countries {
  flex-direction: row;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
}

.sec-countries li { display: flex; gap: 0.35rem; }

.sec-paths li {
  display: grid;
  grid-template-columns: minmax(0, 9rem) 1fr auto;
  align-items: center;
  gap: 0.5rem;
}

.sec-paths code {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar {
  height: 0.4rem;
  background: var(--sec-line);
  border-radius: 999px;
  overflow: hidden;
}

.bar-fill {
  display: block;
  height: 100%;
  background: var(--sec-gold);
}

.sec-events li {
  display: grid;
  grid-template-columns: 6.5rem 9rem 7rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: baseline;
}

.sec-panel .sec-events li { grid-template-columns: 10rem 7rem minmax(0, 1fr); }

@media (max-width: 640px) {
  .sec-events li,
  .sec-panel .sec-events li { grid-template-columns: minmax(0, 1fr); gap: 0.1rem; }
}

.sec-ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sec-link,
.sec-rows code,
.sec-events .sec-link {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
}

.sec-link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--sec-text);
  text-align: left;
  cursor: pointer;
  text-decoration: underline dotted var(--sec-gold-dim);
}

.sec-link:hover { color: var(--sec-gold); }

.badge {
  border-radius: 0.375rem;
  padding: 0 0.4rem;
  font-size: 0.75rem;
}
.badge-banned { background: #3a1414; color: var(--sec-red-soft); }
.badge-suspect { background: #3a2a0c; color: #fac775; }
.badge-normal { background: #1e1e1a; color: #b4b2a9; }

.type-scanner_agent,
.type-injection { color: var(--sec-red-soft); }
.type-probe_path { color: #fac775; }
.type-rate_limited { color: var(--sec-gold); }

.sec-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 1px solid var(--sec-gold-dim);
  border-radius: 0.5rem;
  background: transparent;
  color: var(--sec-text);
  padding: 0.25rem 0.65rem;
  cursor: pointer;
}

.sec-btn:hover:not(:disabled) { border-color: var(--sec-gold); color: var(--sec-gold); }
.sec-btn:disabled { opacity: 0.5; cursor: wait; }
.sec-btn:focus-visible,
.sec-link:focus-visible,
.sec-select:focus-visible { outline: 2px solid var(--sec-gold); outline-offset: 2px; }
.sec-btn-gold { border-color: var(--sec-gold); color: var(--sec-gold); }
.sec-btn-red { border-color: var(--sec-red); color: var(--sec-red-soft); }

.sec-select {
  margin-left: 0.35rem;
  background: var(--sec-bg);
  color: var(--sec-text);
  border: 1px solid var(--sec-gold-dim);
  border-radius: 0.5rem;
  padding: 0.2rem 0.4rem;
}

.sec-feed { display: flex; flex-direction: column; gap: 0.5rem; }

.sec-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 50;
  width: min(32rem, 100vw);
  overflow-y: auto;
  background: var(--sec-card);
  border-left: 1px solid var(--sec-gold-dim);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sec-panel p { margin: 0; }
</style>
