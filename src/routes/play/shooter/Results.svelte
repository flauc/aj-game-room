<script lang="ts">
  interface Props {
    winnerId: string | null;
    winnerName: string | null;
    localPlayerId: string;
    kills: number;
    wave: number;
    onPlayAgain: () => void;
  }

  let { winnerId, winnerName, localPlayerId, kills, wave, onPlayAgain }: Props = $props();

  let isWinner = $derived(winnerId === localPlayerId);
</script>

<div class="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
  <div class="w-full max-w-md text-center">
    {#if isWinner}
      <h1 class="mb-2 text-5xl font-extrabold text-yellow-400">VICTORY!</h1>
      <p class="mb-8 text-lg text-gray-300">You survived!</p>
    {:else if winnerId}
      <h1 class="mb-2 text-5xl font-extrabold text-red-500">DEFEAT</h1>
      <p class="mb-8 text-lg text-gray-300">{winnerName} won the match</p>
    {:else}
      <h1 class="mb-2 text-5xl font-extrabold text-gray-400">GAME OVER</h1>
      <p class="mb-8 text-lg text-gray-300">The zombies won this time...</p>
    {/if}

    <div class="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6">
      <h2 class="mb-4 text-sm font-medium tracking-wider text-gray-500 uppercase">Your Stats</h2>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="text-3xl font-bold text-white">{kills}</div>
          <div class="text-sm text-gray-400">Kills</div>
        </div>
        <div>
          <div class="text-3xl font-bold text-white">{wave}</div>
          <div class="text-sm text-gray-400">Waves Survived</div>
        </div>
      </div>
    </div>

    <div class="space-y-3">
      <button
        onclick={onPlayAgain}
        class="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500"
      >
        Play Again
      </button>
      <a
        href="/"
        class="block w-full rounded-lg border border-gray-700 px-4 py-3 text-center font-semibold text-gray-300 transition hover:bg-gray-800"
      >
        Back to Games
      </a>
    </div>
  </div>
</div>
