<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { actionKeyLabels } from '../../config/keybindings'
import { secondsLeft } from '../../game/pub/challenge'
import type { ChallengeInvite } from '../../composables/game/usePubChallenge'

const props = defineProps<{
  incoming: ChallengeInvite | null
  outgoing: ChallengeInvite | null
}>()

const emit = defineEmits<{ accept: []; decline: [] }>()

const now = ref(Date.now())
let timer = 0
onMounted(() => {
  timer = window.setInterval(() => (now.value = Date.now()), 250)
})
onUnmounted(() => window.clearInterval(timer))

const acceptKey = computed(() => actionKeyLabels('acceptChallenge')[0] ?? '')
const declineKey = computed(() => actionKeyLabels('declineChallenge')[0] ?? '')
const incomingLeft = computed(() => (props.incoming ? secondsLeft(props.incoming.expiresAt, now.value) : 0))
const outgoingLeft = computed(() => (props.outgoing ? secondsLeft(props.outgoing.expiresAt, now.value) : 0))
</script>

<template>
  <section
    v-if="incoming"
    class="cc-hud absolute left-1/2 top-16 z-30 w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop px-4 py-3"
    role="alertdialog"
    aria-labelledby="cc-challenge-title"
  >
    <p id="cc-challenge-title" class="m-0 text-sm font-bold text-fog">
      <span class="text-sun">{{ incoming.pseudo }}</span> challenges you to <span class="font-display text-mint">Drink Fast</span>
    </p>
    <p class="m-0 mt-0.5 text-xs text-mist">20 coins each · answer in {{ incomingLeft }} s</p>
    <div class="mt-2 flex items-center gap-2">
      <button type="button" class="cc-btn cc-btn-sm cc-btn-mint pointer-events-auto" @click="emit('accept')">
        Accept<kbd v-if="acceptKey" class="cc-keycap ml-1.5">{{ acceptKey }}</kbd>
      </button>
      <button type="button" class="cc-btn cc-btn-sm cc-btn-ghost pointer-events-auto" @click="emit('decline')">
        Decline<kbd v-if="declineKey" class="cc-keycap ml-1.5">{{ declineKey }}</kbd>
      </button>
    </div>
  </section>
  <p
    v-else-if="outgoing"
    class="cc-hud pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2 animate-cc-pop px-4 py-2 text-sm font-bold text-fog"
    role="status"
  >
    Waiting for <span class="text-sun">{{ outgoing.pseudo }}</span>… <span class="text-mist">{{ outgoingLeft }} s</span>
  </p>
</template>
