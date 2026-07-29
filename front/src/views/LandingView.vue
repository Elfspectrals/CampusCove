<template>
  <div class="relative min-h-screen overflow-hidden bg-[#080b18] text-white">
    <div class="campus-grid pointer-events-none absolute inset-0 opacity-35" aria-hidden="true" />
    <div
      class="pointer-events-none absolute -left-40 top-24 h-[28rem] w-[28rem] rounded-full bg-fuchsia-500/20 blur-3xl"
      aria-hidden="true"
    />
    <div
      class="pointer-events-none absolute -right-40 top-0 h-[32rem] w-[32rem] rounded-full bg-cyan-400/15 blur-3xl"
      aria-hidden="true"
    />

    <header class="relative z-10 border-b border-white/10 bg-[#080b18]/75 backdrop-blur-xl">
      <nav class="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 sm:px-8" aria-label="Public navigation">
        <router-link :to="{ name: 'landing' }" class="group flex items-center gap-3" aria-label="CampusCove home">
          <span
            class="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-cyan-400/20 to-fuchsia-500/25 shadow-lg shadow-fuchsia-950/40 transition group-hover:border-cyan-200/60"
            aria-hidden="true"
          >
            <svg class="h-6 w-6 text-cyan-100" viewBox="0 0 24 24" fill="none">
              <path d="M4 10.5 12 5l8 5.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-8Z" stroke="currentColor" stroke-width="1.7" />
              <path d="M8 20v-6h8v6M2.5 10.5 12 4l9.5 6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span class="text-base font-black tracking-tight sm:text-lg">CampusCove</span>
        </router-link>

        <div class="flex items-center gap-2 sm:gap-3">
          <router-link
            :to="{ name: 'login' }"
            class="rounded-full px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
          >
            Sign in
          </router-link>
          <router-link
            :to="{ name: 'register' }"
            class="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-100 sm:px-5"
          >
            Join the campus
          </router-link>
        </div>
      </nav>
    </header>

    <main id="main-content" class="relative z-10">
      <section class="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:py-20">
        <div class="max-w-3xl">
          <div class="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">
            <span class="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_1rem_rgba(103,232,249,0.9)]" aria-hidden="true" />
            A shared 3D campus
          </div>

          <h1 class="m-0 mt-7 text-[clamp(3.25rem,8vw,6.75rem)] font-black leading-[0.9] tracking-[-0.055em]">
            Meet.
            <span class="block bg-gradient-to-r from-cyan-300 via-sky-300 to-fuchsia-400 bg-clip-text text-transparent">
              Make it yours.
            </span>
          </h1>

          <p class="m-0 mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Explore a multiplayer city, build a space that feels like home, and show up in a look that is entirely yours.
          </p>

          <div class="mt-9 flex flex-col gap-3 sm:flex-row">
            <router-link
              :to="{ name: 'register' }"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-7 py-3.5 text-base font-black text-white shadow-xl shadow-fuchsia-950/40 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              Create your character
              <span aria-hidden="true">→</span>
            </router-link>
            <router-link
              :to="{ name: 'shop' }"
              class="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-7 py-3.5 text-base font-bold text-white transition hover:border-cyan-200/50 hover:bg-cyan-200/10"
            >
              Explore the shop
            </router-link>
          </div>

          <dl class="mt-10 grid max-w-2xl grid-cols-3 gap-3 border-t border-white/10 pt-7">
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">World</dt>
              <dd class="m-0 mt-1 text-sm font-bold text-slate-100 sm:text-base">3D city</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Social</dt>
              <dd class="m-0 mt-1 text-sm font-bold text-slate-100 sm:text-base">Realtime</dd>
            </div>
            <div>
              <dt class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Home</dt>
              <dd class="m-0 mt-1 text-sm font-bold text-slate-100 sm:text-base">Persistent</dd>
            </div>
          </dl>
        </div>

        <div class="relative mx-auto w-full max-w-2xl lg:max-w-none" aria-label="CampusCove gameplay preview">
          <div class="absolute -inset-5 rounded-[2.25rem] bg-gradient-to-br from-cyan-400/20 via-transparent to-fuchsia-500/25 blur-2xl" aria-hidden="true" />
          <div class="relative overflow-hidden rounded-[2rem] border border-white/15 bg-[#10162b]/95 p-3 shadow-2xl shadow-black/50 sm:p-4">
            <div class="flex items-center justify-between gap-4 px-2 pb-3 pt-1">
              <div class="flex items-center gap-2">
                <span class="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                <span class="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
                <span class="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
              </div>
              <span class="text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">CampusCove · Shared city</span>
            </div>

            <div class="relative aspect-[4/3] overflow-hidden rounded-[1.4rem] border border-cyan-200/15 bg-gradient-to-b from-[#354c83] via-[#253969] to-[#15213f]">
              <div class="preview-sky absolute inset-x-0 top-0 h-1/2" aria-hidden="true" />
              <div class="preview-ground absolute inset-x-[-12%] bottom-[-25%] h-[72%] rotate-[-4deg]" aria-hidden="true" />

              <div class="absolute left-[9%] top-[31%] h-[24%] w-[26%] rounded-t-xl border border-white/20 bg-gradient-to-b from-fuchsia-300/90 to-violet-700 shadow-xl" aria-hidden="true">
                <div class="absolute inset-x-[12%] top-[18%] grid grid-cols-3 gap-[8%]">
                  <span v-for="index in 6" :key="`left-window-${index}`" class="aspect-square rounded-sm bg-cyan-100/80 shadow-[0_0_0.8rem_rgba(207,250,254,0.45)]" />
                </div>
              </div>

              <div class="absolute right-[8%] top-[24%] h-[31%] w-[31%] rounded-t-2xl border border-white/20 bg-gradient-to-b from-cyan-200/90 to-sky-700 shadow-xl" aria-hidden="true">
                <div class="absolute inset-x-[11%] top-[16%] grid grid-cols-4 gap-[7%]">
                  <span v-for="index in 8" :key="`right-window-${index}`" class="aspect-square rounded-sm bg-white/75 shadow-[0_0_0.8rem_rgba(255,255,255,0.35)]" />
                </div>
              </div>

              <div class="absolute bottom-[18%] left-1/2 h-[27%] w-[12%] -translate-x-1/2" aria-hidden="true">
                <div class="absolute left-1/2 top-0 h-[38%] w-[48%] -translate-x-1/2 rounded-full bg-gradient-to-br from-cyan-100 to-fuchsia-300 shadow-[0_0_1.5rem_rgba(103,232,249,0.55)]" />
                <div class="absolute bottom-0 left-1/2 h-[67%] w-full -translate-x-1/2 rounded-t-[45%] bg-gradient-to-b from-fuchsia-400 to-violet-700 shadow-xl" />
              </div>

              <div class="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
                <div class="rounded-xl border border-white/15 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-white/80 backdrop-blur">
                  <span class="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                  Multiplayer connected
                </div>
                <div class="hidden gap-1.5 sm:flex" aria-label="Game hotbar preview">
                  <span v-for="index in 5" :key="`slot-${index}`" :class="['grid h-9 w-9 place-items-center rounded-lg border bg-slate-950/70 text-xs font-bold backdrop-blur', index === 1 ? 'border-cyan-300 text-cyan-200' : 'border-white/15 text-white/45']">
                    {{ index }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="border-y border-white/10 bg-white/[0.025]">
        <div class="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 md:grid-cols-3">
          <article class="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div class="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200">
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 18c-2.2 0-4-1.8-4-4s1.8-4 4-4c.5-2.8 2.9-5 6-5 3.4 0 6.2 2.8 6.2 6.2A3.4 3.4 0 0 1 18.6 18H7Z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
              </svg>
            </div>
            <h2 class="m-0 mt-5 text-xl font-black">Explore together</h2>
            <p class="m-0 mt-2 leading-7 text-slate-400">Move through a shared city and see other players as they arrive, leave, and change spaces.</p>
          </article>

          <article class="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div class="grid h-11 w-11 place-items-center rounded-2xl bg-fuchsia-300/10 text-fuchsia-200">
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m5 11 7-6 7 6v8H5v-8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                <path d="M9 19v-5h6v5" stroke="currentColor" stroke-width="1.7" />
              </svg>
            </div>
            <h2 class="m-0 mt-5 text-xl font-black">Build your place</h2>
            <p class="m-0 mt-2 leading-7 text-slate-400">Collect furniture, arrange your apartment, and return to a space that keeps your layout.</p>
          </article>

          <article class="rounded-3xl border border-white/10 bg-white/[0.035] p-6">
            <div class="grid h-11 w-11 place-items-center rounded-2xl bg-violet-300/10 text-violet-200">
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 4h8l3 4-2.5 3v8h-9v-8L5 8l3-4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
                <path d="m9 4 3 4 3-4" stroke="currentColor" stroke-width="1.7" />
              </svg>
            </div>
            <h2 class="m-0 mt-5 text-xl font-black">Shape your identity</h2>
            <p class="m-0 mt-2 leading-7 text-slate-400">Unlock character styles and create a look that follows you throughout the campus.</p>
          </article>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-5 py-20 sm:px-8">
        <div class="overflow-hidden rounded-[2rem] border border-fuchsia-300/20 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/10 to-cyan-400/15 px-6 py-12 text-center sm:px-10">
          <p class="m-0 text-xs font-bold uppercase tracking-[0.24em] text-cyan-200">Your place is waiting</p>
          <h2 class="m-0 mt-4 text-3xl font-black tracking-tight sm:text-5xl">Step into CampusCove.</h2>
          <p class="mx-auto mb-0 mt-4 max-w-2xl text-base leading-7 text-slate-300">Create an account, choose your look, and make your first trip across campus.</p>
          <router-link
            :to="{ name: 'register' }"
            class="mt-8 inline-flex rounded-full bg-white px-7 py-3.5 text-base font-black text-slate-950 transition hover:bg-cyan-100"
          >
            Join now
          </router-link>
        </div>
      </section>
    </main>

    <footer class="relative z-10 border-t border-white/10 px-5 py-7 text-center text-sm text-slate-500">
      CampusCove · A virtual campus built to explore together.
    </footer>
  </div>
</template>

<style scoped>
.campus-grid {
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px);
  background-size: 3rem 3rem;
  mask-image: linear-gradient(to bottom, black, transparent 75%);
}

.preview-sky {
  background:
    radial-gradient(circle at 70% 25%, rgba(255, 255, 255, 0.5), transparent 4%),
    linear-gradient(to bottom, rgba(125, 211, 252, 0.22), transparent);
}

.preview-ground {
  background:
    linear-gradient(90deg, transparent 48%, rgba(255, 255, 255, 0.14) 49%, rgba(255, 255, 255, 0.14) 51%, transparent 52%),
    linear-gradient(rgba(76, 29, 149, 0.82), rgba(15, 23, 42, 0.96));
  clip-path: polygon(15% 0, 85% 0, 100% 100%, 0 100%);
}
</style>
