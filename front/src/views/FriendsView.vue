<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import * as friendsApi from '../api/friends'
import type { Friend, PendingFriend } from '../api/friends'
import * as referralsApi from '../api/referrals'
import type { ReferralSummary } from '../api/referrals'
import UiCurrency from '../components/ui/UiCurrency.vue'
import UiIcon from '../components/ui/UiIcon.vue'
import ReportPlayerDialog from '../components/site/ReportPlayerDialog.vue'

const { t } = useI18n()
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
    addError.value = t('friendsPage.missingFields')
    return
  }
  const tag = parseInt(tagRaw, 10)
  if (Number.isNaN(tag) || tag < 0 || tag > 9999) {
    addError.value = t('friendsPage.badHandle')
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
    addError.value = e instanceof Error ? e.message : t('friendsPage.sendFailed')
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
  if (status === 'online') return t('home.status.online')
  if (status === 'playing') return t('home.status.playing')
  return t('home.status.offline')
}

</script>

<template>
  <div class="mx-auto w-full max-w-5xl">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <h1 class="cc-title">{{ t('friendsPage.title') }}</h1>
      <div class="cc-tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="friendsTab === 'all'" :class="['cc-tab', friendsTab === 'all' && 'cc-tab-active']" @click="friendsTab = 'all'">
          {{ t('friendsPage.tabs.all') }} <span class="font-mono text-xs text-mist tabular-nums">{{ friends.length }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="friendsTab === 'online'" :class="['cc-tab', friendsTab === 'online' && 'cc-tab-active']" @click="friendsTab = 'online'">
          {{ t('friendsPage.tabs.online') }} <span class="font-mono text-xs text-mist tabular-nums">{{ onlineCount }}</span>
        </button>
        <button type="button" role="tab" :aria-selected="friendsTab === 'pending'" :class="['cc-tab', friendsTab === 'pending' && 'cc-tab-active']" @click="friendsTab = 'pending'">
          {{ t('friendsPage.tabs.pending') }}
          <span v-if="incomingPending.length > 0" class="rounded-full bg-coral/20 px-1.5 font-mono text-xs text-coral tabular-nums">{{ incomingPending.length }}</span>
        </button>
      </div>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section class="min-h-[360px] overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
        <template v-if="friendsTab === 'pending'">
          <div v-if="friendsLoading" class="p-12 text-center text-mist">{{ t('friendsPage.loading') }}</div>
          <div v-else-if="pending.length === 0" class="p-12 text-center">
            <UiIcon name="bell" :size="24" :stroke-width="1.75" class="mx-auto text-mist" />
            <p class="m-0 mt-3 text-mist">{{ t('friendsPage.noPending') }}</p>
          </div>
          <div v-else>
            <div v-if="incomingPending.length > 0" class="p-4">
              <h2 class="m-0 mb-2 px-1 text-sm font-semibold text-mist">{{ t('friendsPage.incoming') }}</h2>
              <ul class="m-0 list-none divide-y divide-white/10 p-0">
                <li v-for="p in incomingPending" :key="p.account_id" class="flex flex-wrap items-center gap-3 px-1 py-3">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-700 font-display text-fog">
                    {{ friendInitial(p.display_name) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate font-semibold">{{ p.display_name }}</p>
                    <p class="m-0 text-sm text-mist">{{ t('friendsPage.wantsFriend') }}</p>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" class="cc-btn cc-btn-sun cc-btn-sm" @click="acceptFriend(p.account_id)">{{ t('friendsPage.accept') }}</button>
                    <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="declineFriend(p.account_id)">{{ t('friendsPage.decline') }}</button>
                    <button type="button" class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-coral" :title="t('friendsPage.block')" :aria-label="t('friendsPage.block')" @click="blockFriend(p.account_id)"><UiIcon name="ban" :size="16" :stroke-width="1.75" /></button>
                    <button type="button" class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-fog" :title="t('report.action')" :aria-label="t('report.action')" @click="reporting = { accountId: p.account_id, name: p.display_name }"><UiIcon name="flag" :size="16" :stroke-width="1.75" /></button>
                  </div>
                </li>
              </ul>
            </div>
            <div v-if="outgoingPending.length > 0" class="p-4">
              <h2 class="m-0 mb-2 px-1 text-sm font-semibold text-mist">{{ t('friendsPage.sent') }}</h2>
              <ul class="m-0 list-none divide-y divide-white/10 p-0">
                <li v-for="p in outgoingPending" :key="p.account_id" class="flex items-center gap-3 px-1 py-3">
                  <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink-700 font-display text-mist">
                    {{ friendInitial(p.display_name) }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="m-0 truncate font-semibold">{{ p.display_name }}</p>
                    <p class="m-0 text-sm text-mist">{{ t('friendsPage.waiting') }}</p>
                  </div>
                  <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="cancelSentRequest(p.account_id)">{{ t('friendsPage.cancel') }}</button>
                </li>
              </ul>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="friendsLoading" class="p-12 text-center text-mist">{{ t('friendsPage.loading') }}</div>
          <div v-else-if="filteredFriends.length === 0" class="p-12 text-center">
            <UiIcon name="users" :size="24" :stroke-width="1.75" class="mx-auto text-mist" />
            <p class="m-0 mt-3 text-mist">
              {{ friendsTab === 'online' ? t('friendsPage.noneOnline') : t('friendsPage.noFriends') }}
            </p>
          </div>
          <ul v-else class="m-0 grid list-none gap-1 p-2 sm:grid-cols-2">
            <li v-for="f in filteredFriends" :key="f.account_id" class="group flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-white/5">
              <span class="relative shrink-0">
                <span class="grid h-10 w-10 place-items-center rounded-lg bg-ink-700 font-display text-fog" :class="f.status === 'offline' ? 'opacity-50' : ''">
                  {{ friendInitial(f.display_name) }}
                </span>
                <span :class="['absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-900', statusDotClass(f.status)]" :title="statusLabel(f.status)" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="m-0 truncate font-semibold">{{ f.display_name }}</p>
                <p class="m-0 truncate text-sm text-mist">{{ statusLabel(f.status) }}</p>
              </div>
              <button
                type="button"
                class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-[opacity,color] hover:text-fog sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                :title="t('report.action')"
                :aria-label="t('report.action')"
                @click="reporting = { accountId: f.account_id, name: f.display_name }"
              >
                <UiIcon name="flag" :size="16" :stroke-width="1.75" />
              </button>
              <button
                type="button"
                class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-[opacity,color] hover:text-coral sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                :title="t('friendsPage.remove')"
                :aria-label="t('friendsPage.remove')"
                @click="removeFriend(f.account_id)"
              >
                <UiIcon name="x" :size="16" :stroke-width="1.75" />
              </button>
            </li>
          </ul>
        </template>
      </section>

      <div class="flex flex-col gap-6 self-start">
        <aside class="rounded-2xl border border-white/10 bg-ink-900 p-5">
          <h2 class="m-0 text-base font-semibold">{{ t('friendsPage.addTitle') }}</h2>
          <div class="mt-4 flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <label for="add-username" class="cc-label">{{ t('friendsPage.username') }}</label>
              <input id="add-username" v-model="addUsername" type="text" spellcheck="false" autocapitalize="off" autocomplete="off" class="cc-input" @keydown.enter="sendFriendRequest" />
            </div>
            <span class="pb-3 font-mono text-xl text-mist">#</span>
            <div class="w-24">
              <label for="add-tag" class="cc-label">{{ t('friendsPage.handle') }}</label>
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
            {{ addLoading ? t('friendsPage.sending') : t('friendsPage.send') }}
          </button>
        </aside>

        <aside v-if="referral" class="rounded-2xl border border-white/10 bg-ink-900 p-5">
          <h2 class="m-0 text-base font-semibold">{{ t('friendsPage.inviteTitle') }}</h2>
          <i18n-t keypath="friendsPage.inviteBody" tag="p" class="m-0 mt-2 text-sm text-mist" scope="global">
            <template #referrer><UiCurrency currency="coins" :amount="referral.rewards.referrer" :size="14" /></template>
            <template #referee><UiCurrency currency="coins" :amount="referral.rewards.referee" :size="14" /></template>
            <template #days>{{ requiredDays }}</template>
            <template #friends>{{ referral.requirements.min_other_friends }}</template>
          </i18n-t>
          <label for="invite-link" class="cc-label mt-4">{{ t('friendsPage.inviteLink') }}</label>
          <div class="flex gap-2">
            <input id="invite-link" :value="inviteLink" readonly class="cc-input min-w-0 flex-1 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
            <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="copyInviteLink">{{ copied ? t('friendsPage.copied') : t('friendsPage.copy') }}</button>
          </div>
          <p class="m-0 mt-2 text-xs text-mist">{{ t('friendsPage.code') }} <span class="font-mono text-fog">{{ referral.code }}</span></p>

          <ul v-if="referral.referees.length > 0" class="m-0 mt-4 list-none divide-y divide-white/10 border-t border-white/10 p-0">
            <li v-for="r in referral.referees" :key="r.account_id" class="py-3">
              <div class="flex items-center justify-between gap-2">
                <p class="m-0 truncate font-semibold">{{ r.display_name }}</p>
                <span v-if="r.qualified" class="flex items-center gap-1 text-sm text-mint"><UiIcon name="check" :size="14" :stroke-width="1.75" /> {{ t('friendsPage.done') }}</span>
              </div>
              <ul v-if="r.progress" class="m-0 mt-1 list-none space-y-0.5 p-0 text-xs text-mist">
                <li class="flex items-center gap-1.5" :class="r.progress.account_age_ok && 'text-mint'">
                  <UiIcon :name="r.progress.account_age_ok ? 'check' : 'x'" :size="12" :stroke-width="1.75" /> {{ t('friendsPage.playedDays', { days: requiredDays }) }}
                </li>
                <li class="flex items-center gap-1.5" :class="r.progress.other_friends >= referral.requirements.min_other_friends && 'text-mint'">
                  <UiIcon :name="r.progress.other_friends >= referral.requirements.min_other_friends ? 'check' : 'x'" :size="12" :stroke-width="1.75" />
                  {{ t('friendsPage.friendsProgress', { count: Math.min(r.progress.other_friends, referral.requirements.min_other_friends), total: referral.requirements.min_other_friends }) }}
                </li>
                <li class="flex items-center gap-1.5" :class="r.progress.has_coin_purchase && 'text-mint'">
                  <UiIcon :name="r.progress.has_coin_purchase ? 'check' : 'x'" :size="12" :stroke-width="1.75" /> {{ t('friendsPage.firstPurchase') }}
                </li>
              </ul>
            </li>
          </ul>
        </aside>
      </div>
    </div>
    <ReportPlayerDialog v-if="reporting" :account-id="reporting.accountId" :name="reporting.name" @close="reporting = null" />
  </div>
</template>

