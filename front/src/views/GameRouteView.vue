<script setup lang="ts">
import { defineAsyncComponent, h } from 'vue'
import GameLoadingScreen from '../components/game/GameLoadingScreen.vue'
import { BOOT_STAGES } from '../game/loading/bootProgress'

/**
 * /game route. GameView (three.js, Rapier, Colyseus) is a large chunk: this small one shows the loading screen at
 * once while it downloads, then GameView takes over with the same screen and real progress.
 */
const startingStages = BOOT_STAGES.map((stage, index) => ({ stage, state: index === 0 ? ('active' as const) : ('pending' as const) }))

const GameView = defineAsyncComponent({
  loader: () => import('./GameView.vue'),
  delay: 0,
  loadingComponent: {
    render: () =>
      h('div', { class: 'relative flex h-full min-h-0 w-full flex-1' }, [
        h(GameLoadingScreen, { percent: 0, stages: startingStages, files: { loaded: 0, total: 0 } }),
      ]),
  },
})
</script>

<template>
  <GameView />
</template>
