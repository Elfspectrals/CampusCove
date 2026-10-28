<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import * as friendsApi from '../api/friends'
import type { Friend, PendingFriend } from '../api/friends'
import * as referralsApi from '../api/referrals'
import type { ReferralSummary } from '../api/referrals'
import UiCurrency from '../components/ui/UiCurrency.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import ReportPlayerDialog from '../components/site/ReportPlayerDialog.vue'

const friends = ref<Friend[]>([])
const pending = ref<PendingFriend[]>([])
const friendsLoading = ref(false)
const addUsername = ref('')
const addTag = ref('')
const addError = ref('')
const addLoading = ref(false)
const friendsTab = ref<'all' | 'online' | 'pending'>('all')
const referral = ref<ReferralSummary | null>(null)
const copied = ref(false)
const reporting = ref<{ accountId: number; name: string } | null>(null)
const inviteLink = computed(() =>
  referral.value ? `${window.location.origin}/register?ref=${encodeURIComponent(referral.value.code)}` : '',
)
const requiredDays = computed(() => Math.round((referral.value?.requirements.min_account_age_hours ?? 0) / 24))

const onlineCount = computed(() => friends.value.filter((f) => f.status === 'online' || f.status === 'playing').length)
const incomingPending = computed(() => pending.value.filter((p) => p.incoming))
const outgoingPending = computed(() => pending.value.filter((p) => !p.incoming))
const filteredFriends = computed(() => {
  if (friendsTab.value === 'online') return friends.value.filter((f) => f.status === 'online' || f.status === 'playing')
  if (friendsTab.value === 'pending') return []
  return friends.value
})

onMounted(async () => {
  await Promise.all([loadFriends(), loadReferrals()])
})

async function loadReferrals() {
  try {
    referral.value = await referralsApi.getReferrals()
  } catch {
    referral.value = null
  }
}

async function copyInviteLink() {
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // clipboard unavailable: the link stays selectable in the input
  }
}

async function loadFriends() {
  friendsLoading.value = true
  try {
    const [friendsRes, pendingRes] = await Promise.all([
      friendsApi.getFriends(),
      friendsApi.getPending(),
    ])
    friends.value = friendsRes.friends
    pending.value = pendingRes.pending
  } catch {
    friends.value = []
    pending.value = []
  } finally {
    friendsLoading.value = false
  }
}

async function sendFriendRequest() {
  const username = addUsername.value.trim()
  const tagRaw = addTag.value.trim()
  if (!username || !tagRaw) {
    addError.value = 'Enter username and handle.'
    return
  }
  const tag = parseInt(tagRaw, 10)
  if (Number.isNaN(tag) || tag < 0 || tag > 9999) {
    addError.value = 'Handle must be 0–9999 (same as on their profile).'
    return
  }
  addError.value = ''
  addLoading.value = true
  try {
    await friendsApi.sendRequest(username, tag)
    addUsername.value = ''
    addTag.value = ''
    await loadFriends()
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Failed to send request'
  } finally {
    addLoading.value = false
  }
}

async function acceptFriend(accountId: number) {
  try {
    await friendsApi.acceptRequest(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function declineFriend(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function blockFriend(accountId: number) {
  try {
    await friendsApi.blockUser(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function cancelSentRequest(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

async function removeFriend(accountId: number) {
  try {
    await friendsApi.removeFriend(accountId)
    await loadFriends()
  } catch {
    // ignore
  }
}

function friendInitial(name: string): string {
  return name.length > 0 ? name.charAt(0).toUpperCase() : '?'
}

function statusDotClass(status: string): string {
  if (status === 'online') return 'bg-mint'
  if (status === 'playing') return 'bg-pool'
  return 'bg-ink-500'
}

function statusLabel(status: string): string {
  if (status === 'online') return 'Online'
  if (status === 'playing') return 'Playing CampusCove'
  return 'Offline'
}

</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="cc-eyebrow">Social</p>
        <h1 class="cc-title">Friends</h1>
      </div>
      <div class="cc-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="friendsTab === 'all'" :class="['cc-tab', friendsTab === 'all' && 'cc-tab-active']" @click="friendsTab = 'all'">
          All <span class="opacity-70">{{ friends.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="friendsTab === 'online'" :class="['cc-tab', friendsTab === 'online' && 'cc-tab-active']" @click="friendsTab = 'online'">
          Online <span class="opacity-70">{{ onlineCount }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="friendsTab === 'pending'" :class="['cc-tab', friendsTab === 'pending' && 'cc-tab-active']" @click="friendsTab = 'pending'">
          Pending
          <span v-if="incomingPending.length > 0" class="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 font-sans text-[11px] font-black text-white">{{ incomingPending.length }}</span>
        </button>
      </div>
    </div>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <!-- list -->
      <section class="cc-panel min-h-[360px] overflow-hidden">
        <template v-if="friendsTab === 'pending'">
          <div v-if="friendsLoading" class="p-12 text-center font-bold text-mist">Loading…</div>
          <div v-else-if="pending.length === 0" class="p-12 text-center">
            <UiIcon name="bell" :size="40" class="mx-auto text-ink-500" />
            <p class="m-0 mt-3 font-bold text-mist">No pending requests</p>
          </div>
          <div v-else>
            <div v-if="incomingPending.length > 0" class="p-4">
              <h2 class="cc-eyebrow mb-3 px-1">Incoming requests</h2>
              <ul class="m-0 list-none space-y-2 p-0">
                <li v-for="p in incomingPending" :key="p.account_id" class="cc-panel-flat flex flex-wrap items-center gap-4 p-3">
                  <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sun to-coral font-display text-xl text-white">
                    {{ friendInitial(p.display_name) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate font-extrabold">{{ p.display_name }}</p>
                    <p class="m-0 text-sm font-semibold text-mist">Wants to be your friend</p>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="cc-btn cc-btn-mint cc-btn-sm" @click="acceptFriend(p.account_id)"><UiIcon name="check" :size="16" /> Accept</button>
                    <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="declineFriend(p.account_id)">Decline</button>
                    <button type="button" class="cc-btn cc-btn-coral cc-btn-sm cc-btn-icon" title="Block" aria-label="Block" @click="blockFriend(p.account_id)"><UiIcon name="ban" :size="16" /></button>
                    <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" :title="$t('report.action')" :aria-label="$t('report.action')" @click="reporting = { accountId: p.account_id, name: p.display_name }"><UiIcon name="flag" :size="16" /></button>
                  </div>
                </li>
              </ul>
            </div>
            <div v-if="outgoingPending.length > 0" class="p-4">
              <h2 class="cc-eyebrow mb-3 px-1">Sent requests</h2>
              <ul class="m-0 list-none space-y-2 p-0">
                <li v-for="p in outgoingPending" :key="p.account_id" class="cc-panel-flat flex items-center gap-4 p-3">
                  <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink-700 font-display text-xl text-mist">
                    {{ friendInitial(p.display_name) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate font-extrabold">{{ p.display_name }}</p>
                    <p class="m-0 text-sm font-semibold text-mist">Waiting for reply…</p>
                  </div>
                  <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="cancelSentRequest(p.account_id)">Cancel</button>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="friendsLoading" class="p-12 text-center font-bold text-mist">Loading…</div>
          <div v-else-if="filteredFriends.length === 0" class="p-12 text-center">
            <UiIcon name="users" :size="40" class="mx-auto text-ink-500" />
            <p class="m-0 mt-3 font-bold text-mist">
              {{ friendsTab === 'online' ? 'No friends online right now' : 'No friends yet. Add someone to get started!' }}
            </p>
          </div>
          <ul v-else class="m-0 grid list-none gap-2 p-3 sm:grid-cols-2">
            <li v-for="f in filteredFriends" :key="f.account_id" class="cc-panel-flat group flex items-center gap-3 p-3">
              <span class="relative shrink-0">
                <span class="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-pool to-grape font-display text-xl text-white" :class="f.status === 'offline' ? 'opacity-50 grayscale' : ''">
                  {{ friendInitial(f.display_name) }}
                </span>
                <span :class="['absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-[3px] border-ink-900', statusDotClass(f.status)]" :title="statusLabel(f.status)" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate font-extrabold">{{ f.display_name }}</p>
                <p class="m-0 truncate text-sm font-semibold" :class="f.status === 'playing' ? 'text-pool' : f.status === 'online' ? 'text-mint' : 'text-mist/70'">{{ statusLabel(f.status) }}</p>
              </div>
              <button
                type="button"
                class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon transition sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                :title="$t('report.action')"
                :aria-label="$t('report.action')"
                @click="reporting = { accountId: f.account_id, name: f.display_name }"
              >
                <UiIcon name="flag" :size="16" />
              </button>
              <button
                type="button"
                class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon transition sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                title="Remove friend"
                aria-label="Remove friend"
                @click="removeFriend(f.account_id)"
              >
                <UiIcon name="x" :size="16" />
              </button>
            </li>
          </ul>
        </template>
      </section>

      <div class="flex flex-col gap-5 self-start">
      <!-- add friend -->
      <aside class="cc-panel p-5">
        <span class="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-sun/15 text-sun"><UiIcon name="user-plus" :size="24" /></span>
        <h2 class="cc-display m-0 text-2xl">Add a friend</h2>
        
        <div class="mt-5 flex items-end gap-2">
          <div class="min-w-0 flex-1">
            <label for="add-username" class="cc-label">Username</label>
            <input id="add-username" v-model="addUsername" type="text" placeholder="pseudo" class="cc-input" @keydown.enter="sendFriendRequest" />
          </div>
          <span class="pb-3 font-display text-2xl text-mist">#</span>
          <div class="w-24">
            <label for="add-tag" class="cc-label">Handle</label>
            <input id="add-tag" v-model="addTag" type="text" inputmode="numeric" placeholder="7559" maxlength="4" class="cc-input font-mono" @keydown.enter="sendFriendRequest" />
          </div>
        </div>
        <p v-if="addError" class="cc-alert cc-alert-error m-0 mt-3" role="alert"><UiIcon name="alert" :size="18" /> {{ addError }}</p>
        <button
          type="button"
          class="cc-btn cc-btn-sun mt-4 w-full"
          :disabled="addLoading || !addUsername.trim() || !addTag.trim()"
          @click="sendFriendRequest"
        >
          {{ addLoading ? 'Sending…' : 'Send request' }}
        </button>
      </aside>

      <!-- invite (referral) -->
      <aside v-if="referral" class="cc-panel p-5">
        <span class="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-grape/15 text-grape"><UiIcon name="sparkles" :size="24" /></span>
        <h2 class="cc-display m-0 text-2xl">Invite a friend</h2>
        <p class="m-0 mt-2 text-sm font-semibold text-mist">
          You get <UiCurrency currency="coins" :amount="referral.rewards.referrer" :size="14" />, they get
          <UiCurrency currency="coins" :amount="referral.rewards.referee" :size="14" /> once they have played {{ requiredDays }} days,
          made {{ referral.requirements.min_other_friends }} other friends and bought an item with coins.
        </p>
        <label for="invite-link" class="cc-label mt-4">Your invite link</label>
        <div class="flex gap-2">
          <input id="invite-link" :value="inviteLink" readonly class="cc-input min-w-0 flex-1 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
          <button type="button" class="cc-btn cc-btn-sun cc-btn-sm" @click="copyInviteLink">{{ copied ? 'Copied!' : 'Copy' }}</button>
        </div>
        <p class="m-0 mt-2 text-xs font-semibold text-mist/80">Code: <span class="font-mono text-sun">{{ referral.code }}</span></p>

        <ul v-if="referral.referees.length > 0" class="m-0 mt-4 list-none space-y-2 p-0">
          <li v-for="r in referral.referees" :key="r.account_id" class="cc-panel-flat p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="m-0 truncate font-extrabold">{{ r.display_name }}</p>
              <span v-if="r.qualified" class="flex items-center gap-1 text-sm font-bold text-mint"><UiIcon name="check" :size="14" /> Done</span>
            </div>
            <ul v-if="r.progress" class="m-0 mt-1 list-none space-y-0.5 p-0 text-xs font-semibold text-mist">
              <li :class="r.progress.account_age_ok && 'text-mint'">{{ r.progress.account_age_ok ? '✓' : '·' }} Played {{ requiredDays }} days</li>
              <li :class="r.progress.other_friends >= referral.requirements.min_other_friends && 'text-mint'">
                {{ r.progress.other_friends >= referral.requirements.min_other_friends ? '✓' : '·' }}
                Friends: {{ Math.min(r.progress.other_friends, referral.requirements.min_other_friends) }}/{{ referral.requirements.min_other_friends }}
              </li>
              <li :class="r.progress.has_coin_purchase && 'text-mint'">{{ r.progress.has_coin_purchase ? '✓' : '·' }} First coin purchase</li>
            </ul>
          </li>
        </ul>
      </aside>
      </div>
    </div>
    <ReportPlayerDialog v-if="reporting" :account-id="reporting.accountId" :name="reporting.name" @close="reporting = null" />
  </div>
</template>
