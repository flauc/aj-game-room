<script lang="ts">
  import { games } from '$lib/games';
</script>

<div class="mx-auto max-w-5xl px-6 py-10">
  <h1 class="mb-2 text-4xl font-extrabold text-white">Welcome to the Game Room 🎮</h1>
  <p class="mb-10 text-lg text-gray-400">Pick a game and let's go!</p>

  {#if games.length === 0}
    <div class="rounded-lg border border-dashed border-gray-700 p-12 text-center text-gray-500">
      No games added yet. Add entries to <code>src/lib/games.ts</code> to get started.
    </div>
  {:else}
    <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {#each games as game (game.id)}
        <a
          href="/play/{game.id}"
          class="group overflow-hidden rounded-xl border border-gray-800 bg-gray-900 transition hover:border-indigo-500"
        >
          <img
            src={game.thumbnail}
            alt={game.title}
            class="h-40 w-full object-cover transition group-hover:scale-105"
          />
          <div class="p-4">
            <h2 class="text-lg font-semibold text-white">{game.title}</h2>
            <p class="mt-1 text-sm text-gray-400">{game.description}</p>
            <span
              class="mt-3 inline-block rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
            >
              {game.type}
            </span>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
