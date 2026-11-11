<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { getStoredAuth } from '../api/session'
import { useWalletBalances } from '../composables/useWalletBalances'
import * as friendsApi from '../api/friends'
import type { Friend } from '../api/friends'
import UiIcon from '../components/ui/UiIcon.vue'
import UiCurrency from '../components/ui/UiCurrency.vue'
import PrivacyPanel from '../components/site/PrivacyPanel.vue'
import townHero from '../assets/landing/town-hero.webp'

const router = useRouter()
const { t } = useI18n()

const auth = computed(() => getStoredAuth())
const wallet = useWalletBalances()
const displayName = computed(() => auth.value?.user?.display_name || auth.value?.user?.username || 'Player')
const handle = computed(() => {
  const u = auth.value?.user
  return u ? `${u.username}#${String(u.tag).padStart(4, '0')}` : ''
})
const initial = computed(() => {
  const n = displayName.value
  return n.length > 0 ? n.charAt(0).toUpperCase() : 'P'
})

const friends = ref<Friend[]>([])
const friendsLoading = ref(false)

const onlineCount = computed(() => friends.value.filter((f) => f.status === 'online' || f.status === 'playing').length)
const sortedFriends = computed(() => {
  const rank = (s: string) => (s === 'playing' ? 0 : s === 'online' ? 1 : 2)
  return [...friends.value].sort((a, b) => rank(a.status) - rank(b.status))
})

onMounted(async () => {
  await loadFriends()
})

async function loadFriends() {
  friendsLoading.value = true
  try {
    const friendsRes = await friendsApi.getFriends()
    friends.value = friendsRes.friends
  } catch {
    friends.value = []
  } finally {
    friendsLoading.value = false
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

function launchGame() {
  router.push({ name: 'game' })
}

function openChat(friend: Friend) {
  // TODO: Implement chat functionality
  console.log('Open chat with', friend.display_name)
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1500px]">
    <div class="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_300px]">
      <section class="order-2 self-start rounded-2xl border border-white/10 bg-ink-900 p-5 lg:order-1">
        <div class="flex items-center gap-4">
          <div class="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-ink-700 font-display text-3xl text-fog">
            {{ initial }}
          </div>
          <div class="min-w-0">
            <h1 class="m-0 truncate text-xl font-semibold">{{ displayName }}</h1>
            <p class="m-0 truncate font-mono text-xs text-mist">{{ handle }}</p>
          </div>
        </div>

        <dl class="m-0 mt-6 divide-y divide-white/10 border-t border-white/10 text-sm">
          <div class="flex min-h-11 items-center justify-between">
            <dt class="text-mist">{{ t('home.friends') }}</dt>
            <dd class="m-0 font-semibold tabular-nums">{{ friends.length }}</dd>
          </div>
          <div class="flex min-h-11 items-center justify-between">
            <dt class="text-mist">{{ t('home.coins') }}</dt>
            <dd class="m-0"><UiCurrency currency="coins" :amount="wallet.coins" /></dd>
          </div>
          <div class="flex min-h-11 items-center justify-between">
            <dt class="text-mist">{{ t('home.gems') }}</dt>
            <dd class="m-0"><UiCurrency currency="premium" :amount="wallet.premium" /></dd>
          </div>
        </dl>
      </section>

      <section class="order-1 min-w-0 lg:order-2">
        <div class="relative isolate flex min-h-[320px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 sm:min-h-[380px]">
          <img :src="townHero" alt="" width="2400" height="1350" class="absolute inset-0 -z-10 h-full w-full object-cover object-right" />
          <div class="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-3/4 bg-gradient-to-b from-transparent to-ink-950/90" />
          <div class="flex flex-col items-start gap-5 p-6 sm:p-8">
            <div>
              <h2 class="m-0 font-display text-4xl leading-none text-fog sm:text-5xl">{{ t('home.playTitle') }}</h2>
              <p class="m-0 mt-3 max-w-md text-fog/85">{{ t('home.playLead') }}</p>
            </div>
            <button type="button" class="cc-btn cc-btn-sun cc-btn-lg" @click="launchGame">
              <UiIcon name="play" :size="20" fill /> {{ t('home.launch') }}
            </button>
          </div>
        </div>
      </section>

      <aside class="order-3 flex max-h-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900">
        <div class="flex items-center justify-between gap-3 border-b border-white/10 py-3 pl-5 pr-2">
          <div>
            <h2 class="m-0 text-base font-semibold">{{ t('home.friends') }}</h2>
            <p class="m-0 text-sm tabular-nums text-mist">{{ t('home.online', { online: onlineCount, total: friends.length }) }}</p>
          </div>
          <RouterLink
            to="/friends"
            class="grid h-11 w-11 place-items-center rounded-lg text-mist transition-colors hover:bg-white/5 hover:text-fog"
            :title="t('home.manageFriends')"
            :aria-label="t('home.manageFriends')"
          >
            <UiIcon name="user-plus" :size="18" :stroke-width="1.75" />
          </RouterLink>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div v-if="friendsLoading" class="py-10 text-center text-sm text-mist">{{ t('home.loadingFriends') }}</div>
          <div v-else-if="friends.length === 0" class="px-4 py-10 text-center">
            <UiIcon name="users" :size="24" :stroke-width="1.75" class="mx-auto text-mist" />
            <p class="m-0 mt-2 text-sm text-mist">{{ t('home.noFriends') }}</p>
            <RouterLink to="/friends" class="cc-btn cc-btn-ghost cc-btn-sm mt-4">{{ t('home.addFriends') }}</RouterLink>
          </div>
          <ul v-else class="m-0 list-none space-y-1 p-0">
            <li v-for="f in sortedFriends" :key="f.account_id">
              <button
                type="button"
                class="group flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/5"
                @click="openChat(f)"
              >
                <span class="relative shrink-0">
                  <span class="grid h-10 w-10 place-items-center rounded-lg bg-ink-700 font-display text-fog" :class="f.status === 'offline' ? 'opacity-50' : ''">
                    {{ friendInitial(f.display_name) }}
                  </span>
                  <span :class="['absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-900', statusDotClass(f.status)]" :title="statusLabel(f.status)" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-semibold text-fog">{{ f.display_name }}</span>
                  <span class="block truncate text-xs text-mist">{{ statusLabel(f.status) }}</span>
                </span>
                <UiIcon name="message" :size="18" :stroke-width="1.75" class="text-mist opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </li>
          </ul>
        </div>
      </aside>
    </div>

    <div class="mt-8 max-w-md">
      <PrivacyPanel />
    </div>
  </div>
</template>
