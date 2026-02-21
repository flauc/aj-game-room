<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { WeaponType } from './game/SpriteGen';

  interface Props {
    roomId: string;
    playerId: string;
    playerName: string;
    players: Record<string, { name: string }>;
    isHost: boolean;
    singlePlayer: boolean;
    weapon: WeaponType;
    onGameOver: (winnerId: string | null, winnerName: string | null) => void;
  }

  let { roomId, playerId, playerName, players, isHost, singlePlayer, weapon, onGameOver }: Props = $props();

  let container: HTMLDivElement;
  let game: Phaser.Game | null = null;

  let kills = $state(0);
  let wave = $state(0);
  let alivePlayers = $state(0);
  let timeOfDay = $state('Day');
  $effect(() => {
    alivePlayers = Object.keys(players).length;
  });
  let eliminated = $state(false);
  let killerName = $state('');
  let killFeed = $state<{ killer: string; victim: string; id: number }[]>([]);
  let feedId = 0;

  onMount(async () => {
    const Phaser = await import('phaser');
    const { MainScene } = await import('./game/MainScene');

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: container,
      width: window.innerWidth,
      height: window.innerHeight - 65,
      backgroundColor: '#1a130a',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false
        }
      },
      scene: MainScene,
      input: {
        gamepad: true
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    };

    game = new Phaser.Game(config);
    game.scene.start('MainScene', {
      roomId,
      playerId,
      playerName,
      players,
      isHost,
      singlePlayer,
      weapon,
      onEliminated: (killer: string) => {
        eliminated = true;
        killerName = killer;
      },
      onGameOver: (winnerId: string | null, winnerName: string | null) => {
        onGameOver(winnerId, winnerName);
      },
      onStatsUpdate: (k: number, w: number, alive: number, tod: string) => {
        kills = k;
        wave = w;
        alivePlayers = alive;
        timeOfDay = tod;
      },
      onKillFeed: (killer: string, victim: string) => {
        const id = feedId++;
        killFeed = [...killFeed.slice(-4), { killer, victim, id }];
        setTimeout(() => {
          killFeed = killFeed.filter((f) => f.id !== id);
        }, 4000);
      }
    });
  });

  onDestroy(() => {
    if (game) {
      const scene = game.scene.getScene('MainScene') as any;
      scene?.shutdown?.();
      game.destroy(true);
      game = null;
    }
  });
</script>

<div class="relative h-[calc(100vh-65px)] w-full overflow-hidden">
  <div bind:this={container} class="h-full w-full"></div>

  <!-- HUD Overlay -->
  <div
    class="pointer-events-none absolute top-0 right-0 left-0 z-10 flex items-start justify-between p-4"
  >
    <div class="flex flex-col gap-2">
      <div class="rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm">
        Wave <span class="font-bold text-indigo-400">{wave}</span>
      </div>
      <div class="rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm">
        Alive <span class="font-bold text-green-400">{alivePlayers}</span>
        <div class="rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm">
          {#if timeOfDay === 'Night'}
            <span class="font-bold text-blue-300">🌙 {timeOfDay}</span>
          {:else if timeOfDay === 'Dawn'}
            <span class="font-bold text-orange-300">🌅 {timeOfDay}</span>
          {:else if timeOfDay === 'Dusk'}
            <span class="font-bold text-orange-400">🌇 {timeOfDay}</span>
          {:else}
            <span class="font-bold text-yellow-300">☀️ {timeOfDay}</span>
          {/if}
        </div>
      </div>
    </div>

    <div class="rounded-lg bg-black/60 px-3 py-2 text-sm text-white backdrop-blur-sm">
      Kills <span class="font-bold text-yellow-400">{kills}</span>
    </div>
  </div>

  <!-- Kill Feed -->
  <div class="pointer-events-none absolute top-16 right-4 z-10 flex flex-col gap-1">
    {#each killFeed as feed (feed.id)}
      <div
        class="animate-fade-in rounded bg-black/70 px-3 py-1 text-xs text-white backdrop-blur-sm"
      >
        <span class="text-red-400">{feed.killer}</span> eliminated
        <span class="text-gray-300">{feed.victim}</span>
      </div>
    {/each}
  </div>

  <!-- Eliminated overlay -->
  {#if eliminated}
    <div class="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
      <div class="text-center">
        <h2 class="text-4xl font-bold text-red-500">ELIMINATED</h2>
        <p class="mt-2 text-lg text-gray-300">Killed by {killerName}</p>
        <p class="mt-4 text-sm text-gray-500">Watching remaining players...</p>
      </div>
    </div>
  {/if}
</div>
