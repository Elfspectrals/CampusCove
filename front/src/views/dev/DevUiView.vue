<script setup lang="ts">
import { ref } from 'vue'
import UiIcon from '../../components/ui/UiIcon.vue'
import UiCurrency from '../../components/ui/UiCurrency.vue'
import UiLogo from '../../components/ui/UiLogo.vue'
import { ICONS, type UiIconName } from '../../components/ui/icons'
import GameInteractionPrompt from '../../components/game/GameInteractionPrompt.vue'
import type { ItemRarity } from '../../utils/itemShopPresentation'

/**
 * Living reference for the "Cove Nights" design system (/dev/ui).
 * Everything here uses the same classes/components as the real screens.
 */
const sections = [
  { id: 'direction', label: 'Direction' },
  { id: 'color', label: 'Color' },
  { id: 'type', label: 'Type' },
  { id: 'buttons', label: 'Buttons' },
  { id: 'forms', label: 'Forms' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'surfaces', label: 'Surfaces' },
  { id: 'items', label: 'Items' },
  { id: 'hud', label: 'HUD' },
  { id: 'icons', label: 'Icons' },
]

const surfaces = [
  { token: 'ink-950', note: 'App background' },
  { token: 'ink-900', note: 'Panel base' },
  { token: 'ink-800', note: 'Panel top' },
  { token: 'ink-700', note: 'Raised / skeleton' },
  { token: 'ink-600', note: 'Borders' },
  { token: 'ink-500', note: 'Hover borders' },
  { token: 'mist', note: 'Secondary text' },
  { token: 'fog', note: 'Primary text' },
]

const candy = [
  { token: 'sun', note: 'Primary CTA · coins · active tab' },
  { token: 'pool', note: 'Info · focus ring · links' },
  { token: 'mint', note: 'Success · online · XP' },
  { token: 'coral', note: 'Danger · admin · notifications' },
  { token: 'grape', note: 'Premium gems · equipped' },
]

const rarities: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const tab = ref<'one' | 'two' | 'three'>('one')
const checked = ref(true)
const radio = ref<'coins' | 'premium'>('coins')
const selectedSlot = ref(2)
const selectedCard = ref<ItemRarity>('epic')
const modalOpen = ref(false)
const iconNames = Object.keys(ICONS) as UiIconName[]

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="mx-auto w-full max-w-[1400px]">
    <!-- header -->
    <header class="cc-panel relative mb-6 overflow-hidden p-6 sm:p-8">
      <div
        class="pointer-events-none absolute inset-0"
        style="background: radial-gradient(500px 240px at 90% 0%, rgb(var(--cc-grape) / 0.35), transparent 70%), radial-gradient(500px 240px at 0% 100%, rgb(var(--cc-sun) / 0.18), transparent 70%)"
      />
      <div class="relative flex flex-wrap items-end justify-between gap-6">
        <div>
          <span class="cc-chip cc-chip-pool"><UiIcon name="palette" :size="14" /> /dev/ui · design system</span>
          <h1 class="cc-display m-0 mt-3 text-5xl sm:text-6xl">Cove Nights</h1>
          <p class="m-0 mt-2 max-w-2xl font-semibold text-mist">
            The CampusCove interface kit. Chunky tactile panels, pressable candy buttons, lobby tabs and
            rarity cards over a midnight harbor-town palette. Every swatch and widget below is the real class or component
            the app uses.
          </p>
        </div>
        <UiLogo size="md" />
      </div>
      <nav class="relative mt-6 flex flex-wrap gap-1.5" aria-label="Sections">
        <button v-for="s in sections" :key="s.id" type="button" class="cc-btn cc-btn-ghost cc-btn-sm" @click="scrollTo(s.id)">
          {{ s.label }}
        </button>
      </nav>
    </header>

    <div class="space-y-10">
      <!-- direction -->
      <section id="direction" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Art direction</h2>
        <div class="grid gap-4 md:grid-cols-4">
          <article class="cc-panel p-5">
            <p class="cc-eyebrow text-sun">Habbo Hotel</p>
            <p class="m-0 mt-2 text-sm font-semibold text-mist">Isometric floor tiles, chunky bevelled panels with a hard drop edge, cosy social-room warmth.</p>
          </article>
          <article class="cc-panel p-5">
            <p class="cc-eyebrow text-pool">Fall Guys · Brawl Stars</p>
            <p class="m-0 mt-2 text-sm font-semibold text-mist">Candy colours, fat display type (Lilita One) and buttons you physically press down.</p>
          </article>
          <article class="cc-panel p-5">
            <p class="cc-eyebrow text-grape">Fortnite lobby</p>
            <p class="m-0 mt-2 text-sm font-semibold text-mist">Top-tab navigation with a skewed highlight, PLAY always in reach, rarity-tiered item cards.</p>
          </article>
          <article class="cc-panel p-5">
            <p class="cc-eyebrow text-mint">Garry's Mod</p>
            <p class="m-0 mt-2 text-sm font-semibold text-mist">Dense tool panels for inventory, spawn-menu slot grids and admin consoles.</p>
          </article>
        </div>
      </section>

      <!-- color -->
      <section id="color" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-1 text-3xl">Color</h2>
        <p class="m-0 mb-4 text-sm font-semibold text-mist">Tokens live in <span class="font-mono text-fog">src/style.css</span> as RGB triplets, exposed to Tailwind as <span class="font-mono text-fog">bg-sun</span>, <span class="font-mono text-fog">text-ink-950/70</span>…</p>
        <h3 class="cc-eyebrow mb-2">Surfaces &amp; text</h3>
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <div v-for="c in surfaces" :key="c.token" class="cc-panel-flat overflow-hidden">
            <div class="h-16 border-b-2 border-ink-950" :style="{ background: `rgb(var(--cc-${c.token}))` }" />
            <div class="p-2.5">
              <p class="m-0 font-mono text-xs font-bold">{{ c.token }}</p>
              <p class="m-0 text-[11px] font-semibold text-mist">{{ c.note }}</p>
            </div>
          </div>
        </div>
        <h3 class="cc-eyebrow mb-2">Candy accents (each has an <span class="font-mono">-edge</span> shade for the 3D lip)</h3>
        <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div v-for="c in candy" :key="c.token" class="cc-panel-flat overflow-hidden">
            <div class="flex h-20">
              <div class="flex-1" :style="{ background: `rgb(var(--cc-${c.token}))` }" />
              <div class="w-6" :style="{ background: `rgb(var(--cc-${c.token}-edge))` }" />
            </div>
            <div class="p-2.5">
              <p class="m-0 font-mono text-xs font-bold">{{ c.token }}</p>
              <p class="m-0 text-[11px] font-semibold text-mist">{{ c.note }}</p>
            </div>
          </div>
        </div>
        <h3 class="cc-eyebrow mb-2">Rarity ladder</h3>
        <div class="grid grid-cols-5 gap-3">
          <div v-for="r in rarities" :key="r" :class="['cc-rarity rounded-xl p-3 text-center', `cc-rarity-${r}`, 'cc-rarity-bg']">
            <p class="cc-display m-0 text-lg capitalize">{{ r }}</p>
            <p class="m-0 font-mono text-[10px] text-fog/70">--cc-r-{{ r }}</p>
          </div>
        </div>
      </section>

      <!-- type -->
      <section id="type" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Typography</h2>
        <div class="cc-panel grid gap-6 p-6 md:grid-cols-[1fr_1fr]">
          <div class="space-y-3">
            <p class="cc-eyebrow">Display · Lilita One · .cc-display</p>
            <p class="cc-display m-0 text-6xl leading-none">Ready to play?</p>
            <p class="cc-display m-0 text-4xl leading-none">Furniture Shop</p>
            <p class="cc-display m-0 text-2xl">Selected outfit</p>
            <p class="cc-display m-0 text-lg">Card title</p>
          </div>
          <div class="space-y-3">
            <p class="cc-eyebrow">Body · Nunito 500–900</p>
            <p class="m-0 text-lg font-semibold">Hang out, build your space and meet people — all in one cozy 3D town.</p>
            <p class="m-0 text-sm font-semibold text-mist">Secondary copy uses mist at semibold so it stays legible on dark panels.</p>
            <p class="cc-eyebrow m-0">.cc-eyebrow — section labels</p>
            <p class="cc-label m-0">.cc-label — form labels</p>
            <p class="m-0 font-mono text-sm text-mist">JetBrains Mono — handles, codes, coordinates · tryme#7559</p>
          </div>
        </div>
      </section>

      <!-- buttons -->
      <section id="buttons" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-1 text-3xl">Buttons</h2>
        <p class="m-0 mb-4 text-sm font-semibold text-mist">Pressable: hover lifts 1px, active sinks onto its edge. One <span class="text-sun">sun</span> CTA per view.</p>
        <div class="cc-panel space-y-6 p-6">
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="cc-btn cc-btn-sun">Sun</button>
            <button type="button" class="cc-btn cc-btn-pool">Pool</button>
            <button type="button" class="cc-btn cc-btn-mint">Mint</button>
            <button type="button" class="cc-btn cc-btn-coral">Coral</button>
            <button type="button" class="cc-btn cc-btn-grape">Grape</button>
            <button type="button" class="cc-btn cc-btn-ghost">Ghost</button>
            <button type="button" class="cc-btn">Neutral</button>
            <button type="button" class="cc-btn cc-btn-sun" disabled>Disabled</button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="cc-btn cc-btn-sun cc-btn-sm">Small</button>
            <button type="button" class="cc-btn cc-btn-sun">Default</button>
            <button type="button" class="cc-btn cc-btn-sun cc-btn-lg">Large</button>
            <button type="button" class="cc-btn cc-btn-sun cc-btn-xl cc-btn-shine"><UiIcon name="play" :size="26" fill /> Play</button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon" aria-label="Menu"><UiIcon name="menu" /></button>
            <button type="button" class="cc-btn cc-btn-coral cc-btn-sm cc-btn-icon" aria-label="Close"><UiIcon name="x" :size="16" /></button>
            <button type="button" class="cc-btn cc-btn-mint cc-btn-sm"><UiIcon name="check" :size="16" /> Accept</button>
            <button type="button" class="cc-btn cc-btn-pool cc-btn-sm"><UiIcon name="refresh" :size="16" /> Refresh</button>
          </div>
          <pre class="m-0 overflow-x-auto rounded-xl bg-ink-950/70 p-3 font-mono text-xs text-mist">&lt;button class="cc-btn cc-btn-sun cc-btn-lg"&gt;Buy&lt;/button&gt;</pre>
        </div>
      </section>

      <!-- forms -->
      <section id="forms" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Forms &amp; tabs</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="cc-panel space-y-4 p-6">
            <div>
              <label class="cc-label" for="dev-input">Username</label>
              <input id="dev-input" class="cc-input" placeholder="cove_runner" />
            </div>
            <div>
              <label class="cc-label" for="dev-select">Kind</label>
              <select id="dev-select" class="cc-input">
                <option>Furniture</option>
                <option>Apartment asset</option>
              </select>
            </div>
            <div class="flex flex-wrap items-center gap-5">
              <label class="flex cursor-pointer items-center gap-2 text-sm font-bold"><input v-model="checked" type="checkbox" class="cc-check" /> Published</label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-bold"><input v-model="radio" type="radio" value="coins" class="cc-check" /> Coins</label>
              <label class="flex cursor-pointer items-center gap-2 text-sm font-bold"><input v-model="radio" type="radio" value="premium" class="cc-check" /> Gems</label>
            </div>
            <input class="cc-input cc-input-sm" placeholder=".cc-input-sm (admin density)" />
          </div>
          <div class="cc-panel space-y-5 p-6">
            <div>
              <p class="cc-eyebrow mb-2">.cc-tabs / .cc-tab</p>
              <div class="cc-tabs">
                <button type="button" :class="['cc-tab', tab === 'one' && 'cc-tab-active']" @click="tab = 'one'"><UiIcon name="chair" :size="16" /> Furniture</button>
                <button type="button" :class="['cc-tab', tab === 'two' && 'cc-tab-active']" @click="tab = 'two'"><UiIcon name="shirt" :size="16" /> Skins</button>
                <button type="button" :class="['cc-tab', tab === 'three' && 'cc-tab-active']" @click="tab = 'three'">Pending <span class="grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1.5 font-sans text-[11px] font-black text-white">3</span></button>
              </div>
            </div>
            <div>
              <p class="cc-eyebrow mb-2">Lobby nav (top bar)</p>
              <div class="flex h-14 items-stretch rounded-xl border-2 border-ink-600/60 bg-ink-900 px-2">
                <span class="relative flex items-center gap-2 px-3 font-display text-sm uppercase tracking-wide text-sun">
                  <UiIcon name="home" :size="16" /> Lobby
                  <span class="absolute inset-x-2 bottom-0 h-1 -skew-x-12 rounded-t-sm bg-sun shadow-[0_0_14px_rgb(var(--cc-sun)/0.8)]" />
                </span>
                <span class="flex items-center gap-2 px-3 font-display text-sm uppercase tracking-wide text-mist"><UiIcon name="backpack" :size="16" /> Locker</span>
                <span class="flex items-center gap-2 px-3 font-display text-sm uppercase tracking-wide text-mist"><UiIcon name="chair" :size="16" /> Shop</span>
              </div>
            </div>
            <div>
              <p class="cc-eyebrow mb-2">Chips &amp; keycaps</p>
              <div class="flex flex-wrap items-center gap-2">
                <span class="cc-chip">Default</span>
                <span class="cc-chip cc-chip-sun">Sun</span>
                <span class="cc-chip cc-chip-pool">Pool</span>
                <span class="cc-chip cc-chip-mint">Live</span>
                <span class="cc-chip cc-chip-coral">Banned</span>
                <span class="cc-chip cc-chip-grape">Equipped</span>
                <span class="cc-keycap">E</span>
                <span class="cc-keycap">Esc</span>
                <span class="cc-keycap">⇧ R</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- feedback -->
      <section id="feedback" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Feedback</h2>
        <div class="grid gap-4 md:grid-cols-2">
          <div class="cc-panel space-y-3 p-6">
            <p class="cc-alert cc-alert-success m-0"><UiIcon name="check" :size="18" /> Purchase complete — check your locker.</p>
            <p class="cc-alert cc-alert-error m-0"><UiIcon name="alert" :size="18" /> Not enough coins for this item.</p>
            <p class="cc-alert cc-alert-warn m-0"><UiIcon name="lock" :size="18" /> Sign in to buy.</p>
            <p class="cc-alert cc-alert-info m-0"><UiIcon name="info" :size="18" /> Holding an item — click a slot to drop it.</p>
          </div>
          <div class="cc-panel space-y-5 p-6">
            <div>
              <div class="mb-1.5 flex justify-between text-xs font-extrabold uppercase tracking-wider"><span class="text-mist">Level 5</span><span class="text-mint">62%</span></div>
              <div class="cc-meter"><span style="width: 62%" /></div>
            </div>
            <div class="grid grid-cols-3 gap-2">
              <div v-for="n in 3" :key="n" class="h-20 animate-pulse rounded-xl bg-ink-800/70" />
            </div>
            <p class="m-0 text-xs font-semibold text-mist">Skeletons (<span class="font-mono">animate-pulse bg-ink-800/70</span>) replace "Loading…" text in grids.</p>
            <button type="button" class="cc-btn cc-btn-pool" @click="modalOpen = true">Open modal</button>
          </div>
        </div>
      </section>

      <!-- surfaces -->
      <section id="surfaces" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Surfaces</h2>
        <div class="grid gap-4 md:grid-cols-3">
          <div class="cc-panel p-5">
            <p class="cc-display m-0 text-xl">.cc-panel</p>
            <p class="m-0 mt-1 text-sm font-semibold text-mist">Primary container. Gradient fill, top highlight, hard 6px drop edge.</p>
          </div>
          <div class="cc-panel-flat p-5">
            <p class="cc-display m-0 text-xl">.cc-panel-flat</p>
            <p class="m-0 mt-1 text-sm font-semibold text-mist">Nested blocks inside a panel — stats, list rows, sub-forms.</p>
          </div>
          <div class="relative overflow-hidden rounded-chunk">
            <div class="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--cc-pool)),rgb(var(--cc-grape)))]" />
            <div class="cc-panel-glass relative m-4 p-5">
              <p class="cc-display m-0 text-xl">.cc-panel-glass</p>
              <p class="m-0 mt-1 text-sm font-semibold text-mist">Floating over 3D scenes (showroom, overlays).</p>
            </div>
          </div>
        </div>
      </section>

      <!-- items -->
      <section id="items" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-4 text-3xl">Items &amp; currency</h2>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div class="cc-panel p-6">
            <p class="cc-eyebrow mb-3">.cc-card + .cc-rarity-* (click to select)</p>
            <ul class="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 xl:grid-cols-5">
              <li v-for="r in rarities" :key="r" :class="['cc-card cc-rarity', `cc-rarity-${r}`, selectedCard === r && 'cc-card-selected']">
                <button type="button" class="block w-full text-left" @click="selectedCard = r">
                  <div class="cc-rarity-bg relative grid h-32 place-items-center">
                    <UiIcon name="chair" :size="44" class="text-white/85 drop-shadow-[0_4px_0_rgba(0,0,0,0.3)]" />
                    <span class="cc-rarity-text absolute left-2 top-2 rounded-md bg-ink-950/75 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">{{ r }}</span>
                  </div>
                  <div class="border-t-2 border-ink-950/60 bg-ink-950/60 px-3 py-2">
                    <p class="cc-display m-0 truncate text-base">Neon Couch</p>
                    <UiCurrency currency="coins" :amount="1250" :size="14" class="text-sm text-sun" />
                  </div>
                </button>
              </li>
            </ul>
          </div>
          <div class="cc-panel space-y-5 p-6">
            <div>
              <p class="cc-eyebrow mb-2">UiCurrency</p>
              <div class="flex flex-wrap items-center gap-3">
                <UiCurrency currency="coins" :amount="12450" pill />
                <UiCurrency currency="premium" :amount="320" pill />
                <UiCurrency currency="coins" :amount="900" class="text-sun" />
                <UiCurrency currency="premium" :amount="null" class="text-grape" />
              </div>
            </div>
            <div>
              <p class="cc-eyebrow mb-2">.cc-slot (inventory / hotbar)</p>
              <div class="cc-hud inline-flex gap-1.5 p-1.5">
                <button
                  v-for="n in 5"
                  :key="n"
                  type="button"
                  :class="['cc-slot h-14 w-14', selectedSlot === n && 'cc-slot-active -translate-y-1']"
                  :aria-label="`Slot ${n}`"
                  @click="selectedSlot = n"
                >
                  <span class="absolute left-1 top-0.5 font-display text-[11px] text-fog/80">{{ n }}</span>
                  <UiIcon v-if="n % 2" name="box" :size="24" class="mx-auto text-pool" />
                </button>
              </div>
            </div>
            <div>
              <p class="cc-eyebrow mb-2">UiLogo</p>
              <div class="flex items-center gap-4"><UiLogo size="sm" /><UiLogo size="sm" mark /></div>
            </div>
          </div>
        </div>
      </section>

      <!-- hud -->
      <section id="hud" class="scroll-mt-24">
        <h2 class="cc-display m-0 mb-1 text-3xl">In-game HUD</h2>
        <p class="m-0 mb-4 text-sm font-semibold text-mist">Overlays sit on the 3D canvas — the scene itself is untouched. <span class="font-mono">.cc-hud</span> is the glassy chip used everywhere in-game.</p>
        <div class="relative h-[360px] overflow-hidden rounded-chunk border-2 border-ink-600/70" style="background: linear-gradient(180deg, rgb(120 170 220), rgb(70 110 160) 60%, rgb(60 80 60) 61%, rgb(40 60 40))">
          <div class="absolute left-3 top-3 flex flex-wrap gap-2">
            <span class="cc-hud inline-flex items-center gap-2 px-3 py-1.5 font-display text-sm tracking-wide"><UiIcon name="map" :size="16" class="text-sun" /> Campus Town</span>
            <span class="cc-hud px-2.5 py-1.5 font-mono text-[11px] text-mist">XYZ 12.4 · 0.0 · -8.1</span>
            <span class="cc-hud inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold"><UiIcon name="monitor" :size="14" /> High</span>
          </div>
          <div class="cc-hud absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 border-sun/60 px-4 py-2 text-sm font-bold text-sun">
            <UiIcon name="info" :size="18" /> Welcome to Campus Town
          </div>
          <div class="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-white/30" />
          <GameInteractionPrompt :screen-x="520" :screen-y="170" key-label="F" action-label="Enter" detail-label="Loft 04 · rent 200 coins" />
          <div class="cc-hud absolute bottom-[5.75rem] left-1/2 flex -translate-x-1/2 items-center gap-2 px-3 py-1.5 text-[11px] font-bold text-mist">
            <span class="cc-keycap">E</span> Inventory <span class="mx-1 h-3 w-0.5 bg-white/15" /> <span class="cc-keycap">C</span> Collision
          </div>
          <div class="cc-hud absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 p-1.5">
            <div v-for="n in 9" :key="n" :class="['cc-slot h-12 w-12', n === 1 && 'cc-slot-active -translate-y-1']">
              <span class="absolute left-1 top-0.5 font-display text-[11px] text-fog/80">{{ n }}</span>
              <UiIcon v-if="n < 4" name="chair" :size="22" class="mx-auto mt-3 text-sun" />
            </div>
          </div>
        </div>
      </section>

      <!-- icons -->
      <section id="icons" class="scroll-mt-24 pb-10">
        <h2 class="cc-display m-0 mb-1 text-3xl">Icons</h2>
        <p class="m-0 mb-4 text-sm font-semibold text-mist"><span class="font-mono">&lt;UiIcon name="…" /&gt;</span> — 24px stroke set, replaces every emoji icon.</p>
        <div class="cc-panel grid grid-cols-3 gap-2 p-4 sm:grid-cols-6 lg:grid-cols-10">
          <div v-for="name in iconNames" :key="name" class="cc-panel-flat flex flex-col items-center gap-2 px-1 py-3">
            <UiIcon :name="name" :size="24" />
            <span class="max-w-full truncate font-mono text-[10px] text-mist">{{ name }}</span>
          </div>
        </div>
      </section>
    </div>

    <div v-if="modalOpen" class="cc-backdrop" role="dialog" aria-modal="true" aria-labelledby="dev-modal-title" @click.self="modalOpen = false">
      <div class="cc-modal max-w-md">
        <p class="cc-eyebrow">.cc-backdrop + .cc-modal</p>
        <h2 id="dev-modal-title" class="cc-display m-0 mt-1 text-3xl">Confirm purchase</h2>
        <p class="m-0 mt-2 text-sm font-semibold text-mist">Modals pop in with a springy scale and inherit the panel styling.</p>
        <div class="mt-6 grid grid-cols-2 gap-3">
          <button type="button" class="cc-btn cc-btn-ghost" @click="modalOpen = false">Cancel</button>
          <button type="button" class="cc-btn cc-btn-sun" @click="modalOpen = false">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>
