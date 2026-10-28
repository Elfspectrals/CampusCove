<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { getStoredAuth } from '../api/session'
import { useWalletBalances } from '../composables/useWalletBalances'
import * as friendsApi from '../api/friends'
import type { Friend } from '../api/friends'
import UiIcon from '../components/ui/UiIcon.vue'
import UiCurrency from '../components/ui/UiCurrency.vue'
import PrivacyPanel from '../components/site/PrivacyPanel.vue'
import type { UiIconName } from '../components/ui/icons'

const router = useRouter()

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
  if (status === 'online') return 'Online'
  if (status === 'playing') return 'Playing CampusCove'
  return 'Offline'
}

function launchGame() {
  router.push({ name: 'game' })
}

function openChat(friend: Friend) {
  // TODO: Implement chat functionality
  console.log('Open chat with', friend.display_name)
}

const memberSince = 'February 2026'
const lastOnline = 'Just now'
const stats = computed(() => ({
  friends: friends.value.length,
  level: 5,
  items: 24,
  achievements: 8,
}))
const levelProgress = 62

const quickTiles: Array<{ to: string; icon: UiIconName; label: string; hint: string; tone: string }> = [
  { to: '/shop-skin', icon: 'shirt', label: 'Skins', hint: 'New looks', tone: 'from-grape/40 text-grape' },
  { to: '/locker', icon: 'backpack', label: 'Locker', hint: 'Equip outfits', tone: 'from-pool/40 text-pool' },
]


</script>

<template>
  <div class="mx-auto w-full max-w-[1500px]">
    <div class="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
      <!-- player card -->
      <section class="cc-panel order-2 p-5 lg:order-1">
        <div class="flex items-center gap-4">
          <div class="relative">
            <div class="grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-grape to-coral font-display text-4xl text-white shadow-[inset_0_-5px_0_rgb(0_0_0/0.25),0_4px_0_rgb(var(--cc-ink-950))]">
              {{ initial }}
            </div>
            <span class="absolute -bottom-2 -right-2 grid h-8 min-w-8 place-items-center rounded-lg border-2 border-ink-950 bg-sun px-1 font-display text-sm text-ink-950">
              {{ stats.level }}
            </span>
          </div>
          <div class="min-w-0">
            <h1 class="cc-display m-0 truncate text-2xl">{{ displayName }}</h1>
            <p class="m-0 truncate font-mono text-xs text-mist">{{ handle }}</p>
          </div>
        </div>

        <div class="mt-5">
          <div class="mb-1.5 flex justify-between text-xs font-extrabold uppercase tracking-wider">
            <span class="text-mist">Level {{ stats.level }}</span>
            <span class="text-mint">{{ levelProgress }}%</span>
          </div>
          <div class="cc-meter"><span :style="{ width: `${levelProgress}%` }" /></div>
        </div>

        <dl class="mt-5 grid grid-cols-2 gap-2">
          <div class="cc-panel-flat px-3 py-2.5">
            <dt class="cc-eyebrow">Friends</dt>
            <dd class="cc-display m-0 text-2xl">{{ stats.friends }}</dd>
          </div>
          <div class="cc-panel-flat px-3 py-2.5">
            <dt class="cc-eyebrow">Items</dt>
            <dd class="cc-display m-0 text-2xl">{{ stats.items }}</dd>
          </div>
          <div class="cc-panel-flat px-3 py-2.5">
            <dt class="cc-eyebrow">Trophies</dt>
            <dd class="cc-display m-0 text-2xl">{{ stats.achievements }}</dd>
          </div>
          <div class="cc-panel-flat px-3 py-2.5">
            <dt class="cc-eyebrow">Level</dt>
            <dd class="cc-display m-0 text-2xl text-sun">{{ stats.level }}</dd>
          </div>
        </dl>

        <div class="mt-5 space-y-2 text-sm font-semibold">
          <div class="flex items-center justify-between">
            <span class="text-mist">Member since</span><span>{{ memberSince }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-mist">Last online</span><span class="text-mint">{{ lastOnline }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-mist">Coins</span><UiCurrency currency="coins" :amount="wallet.coins" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-mist">Gems</span><UiCurrency currency="premium" :amount="wallet.premium" />
          </div>
        </div>
      </section>

      <!-- play hero + quick tiles -->
      <section class="order-1 flex min-w-0 flex-col gap-5 lg:order-2">
        <div class="cc-panel relative min-h-[320px] overflow-hidden p-0 sm:min-h-[380px]">
          <div
            class="absolute inset-0"
            style="
              background:
                radial-gradient(600px 300px at 70% 110%, rgb(255 92 122 / 0.55), transparent 65%),
                radial-gradient(500px 260px at 85% 70%, rgb(255 202 58 / 0.45), transparent 60%),
                linear-gradient(160deg, rgb(32 38 92), rgb(14 17 48) 60%, rgb(60 30 100));
            "
          />
          <!-- iso town skyline -->
          <svg class="absolute bottom-0 right-0 h-[85%] w-auto opacity-35 sm:opacity-90" viewBox="0 0 400 260" aria-hidden="true">
            <g>
              <path d="M220 120l60-34 60 34-60 34z" fill="rgb(255 202 58)" />
              <path d="M220 120v80l60 34v-80z" fill="rgb(201 120 14)" />
              <path d="M340 120v80l-60 34v-80z" fill="rgb(150 80 10)" />
              <path d="M250 150l14 8v18l-14-8zM300 158l14-8v18l-14 8z" fill="rgb(255 240 190)" />
              <path d="M120 150l50-28 50 28-50 28z" fill="rgb(64 214 245)" />
              <path d="M120 150v70l50 28v-70z" fill="rgb(22 128 176)" />
              <path d="M220 150v70l-50 28v-70z" fill="rgb(16 90 130)" />
              <path d="M140 175l12 7v14l-12-7z" fill="rgb(220 250 255)" />
              <path d="M300 60l40-22 40 22-40 22z" fill="rgb(168 110 255)" />
              <path d="M300 60v120l40 22V82z" fill="rgb(104 56 196)" />
              <path d="M380 60v120l-40 22V82z" fill="rgb(80 40 160)" />
              <path d="M312 90l10 6v10l-10-6zM312 120l10 6v10l-10-6z" fill="rgb(235 220 255)" />
              <path d="M0 260 200 150l200 110z" fill="rgb(8 10 32)" opacity=".55" />
            </g>
          </svg>
          <div class="relative flex h-full flex-col justify-end gap-4 p-6 sm:p-8">
            <span class="cc-chip cc-chip-mint self-start"><span class="h-2 w-2 rounded-full bg-mint" /> Servers online</span>
            <div>
              <p class="cc-eyebrow text-fog/70">Mode · Campus Town</p>
              <h2 class="cc-display m-0 mt-1 text-5xl leading-none sm:text-6xl">Ready to play?</h2>
              <p class="m-0 mt-2 max-w-md text-sm font-semibold text-fog/80">Drop into the town, visit your loft and see who's around.</p>
            </div>
            <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine self-start" @click="launchGame">
              <UiIcon name="play" :size="26" fill /> Launch game
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          <RouterLink
            v-for="tile in quickTiles"
            :key="tile.to"
            :to="tile.to"
            class="cc-panel group flex flex-col gap-3 overflow-hidden p-4 transition hover:-translate-y-1"
          >
            <span :class="['grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br to-transparent', tile.tone]">
              <UiIcon :name="tile.icon" :size="24" />
            </span>
            <span>
              <span class="cc-display block text-xl text-fog">{{ tile.label }}</span>
              <span class="block text-xs font-bold text-mist">{{ tile.hint }}</span>
            </span>
          </RouterLink>
        </div>
      </section>

      <!-- friends rail -->
      <aside class="cc-panel order-3 flex max-h-[640px] flex-col overflow-hidden">
        <div class="cc-panel-header">
          <div>
            <h2 class="cc-display m-0 text-xl">Friends</h2>
            <p class="m-0 text-xs font-bold text-mist">{{ onlineCount }} of {{ friends.length }} online</p>
          </div>
          <RouterLink to="/friends" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" title="Manage friends">
            <UiIcon name="user-plus" :size="18" />
          </RouterLink>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <div v-if="friendsLoading" class="py-10 text-center text-sm font-bold text-mist">Loading friends…</div>
          <div v-else-if="friends.length === 0" class="px-4 py-10 text-center">
            <UiIcon name="users" :size="36" class="mx-auto text-ink-500" />
            <p class="m-0 mt-2 text-sm font-bold text-mist">No friends yet</p>
            <RouterLink to="/friends" class="cc-btn cc-btn-pool cc-btn-sm mt-4">Add friends</RouterLink>
          </div>
          <ul v-else class="m-0 list-none space-y-1 p-0">
            <li v-for="f in sortedFriends" :key="f.account_id">
              <button
                type="button"
                class="group flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/5"
                @click="openChat(f)"
              >
                <span class="relative shrink-0">
                  <span class="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pool to-grape font-display text-white" :class="f.status === 'offline' ? 'opacity-50 grayscale' : ''">
                    {{ friendInitial(f.display_name) }}
                  </span>
                  <span :class="['absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-ink-900', statusDotClass(f.status)]" :title="statusLabel(f.status)" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-extrabold text-fog">{{ f.display_name }}</span>
                  <span class="block truncate text-xs font-semibold" :class="f.status === 'playing' ? 'text-pool' : f.status === 'online' ? 'text-mint' : 'text-mist/70'">{{ statusLabel(f.status) }}</span>
                </span>
                <UiIcon name="message" :size="18" class="text-mist opacity-0 transition group-hover:opacity-100" />
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
