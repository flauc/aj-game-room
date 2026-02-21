<script lang="ts">
  import { page } from '$app/state';
  import { games } from '$lib/games';

  const game = $derived(games.find((g) => g.id === page.params.id));
</script>

{#if game}
  <div class="flex h-[calc(100vh-65px)] flex-col">
    <div class="flex items-center gap-4 border-b border-gray-800 bg-gray-900 px-6 py-3">
      <a href="/" class="text-sm text-gray-400 hover:text-white">&larr; Back</a>
      <h1 class="text-lg font-semibold text-white">{game.title}</h1>
    </div>
    <iframe
      src={game.path}
      title={game.title}
      class="flex-1 border-0"
      sandbox="allow-scripts allow-same-origin allow-popups"
    ></iframe>
  </div>
{:else}
  <div class="flex h-[calc(100vh-65px)] items-center justify-center">
    <div class="text-center">
      <h1 class="text-2xl font-bold text-white">Game not found</h1>
      <a href="/" class="mt-4 inline-block text-indigo-400 hover:underline">Back to games</a>
    </div>
  </div>
{/if}
