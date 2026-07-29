<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-16 text-white">
    <div class="max-w-lg text-center">
      <p class="m-0 text-sm font-bold uppercase tracking-[0.24em] text-cyan-300">404 · Off campus</p>
      <h1 class="m-0 mt-4 text-4xl font-black tracking-tight sm:text-5xl">This path leads nowhere.</h1>
      <p class="m-0 mt-4 text-base leading-7 text-slate-300">
        The page may have moved, or the link may be out of date.
      </p>
      <router-link
        :to="{ name: 'landing' }"
        class="mt-8 inline-flex rounded-full bg-fuchsia-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-fuchsia-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fuchsia-300"
      >
        Return to CampusCove
      </router-link>
    </div>
  </main>
</template>
