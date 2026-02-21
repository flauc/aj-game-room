<script lang="ts">
  import {
    createRoom,
    joinRoom,
    listenToRoom,
    startGame as startGameFn,
    type Room,
    type RoomPlayer
  } from '$lib/rooms';
  import { authUser } from '$lib/auth.svelte';

  interface Props {
    onStart: (data: {
      roomId: string;
      playerId: string;
      players: Record<string, { name: string }>;
      isHost: boolean;
      playerName: string;
    }) => void;
  }

  let { onStart }: Props = $props();

  const playerName = $derived(
    authUser.current?.displayName || authUser.current?.email?.split('@')[0] || 'Player'
  );
  let roomCode = $state('');
  let roomId = $state('');
  let playerId = $state('');
  let isHost = $state(false);
  let room = $state<Room | null>(null);
  let error = $state('');
  let phase = $state<'choice' | 'lobby'>('choice');

  let unsubRoom: (() => void) | null = null;

  async function handleCreate() {
    try {
      error = '';
      const result = await createRoom(playerName);
      roomId = result.roomId;
      playerId = result.playerId;
      isHost = true;
      phase = 'lobby';
      unsubRoom = listenToRoom(roomId, (r) => {
        room = r;
        if (r?.status === 'playing') {
          startGame();
        }
      });
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function handleJoin() {
    if (!roomCode.trim()) {
      error = 'Enter a room code';
      return;
    }
    try {
      error = '';
      const result = await joinRoom(roomCode.trim(), playerName);
      roomId = result.roomId;
      playerId = result.playerId;
      isHost = false;
      phase = 'lobby';
      unsubRoom = listenToRoom(roomId, (r) => {
        room = r;
        if (r?.status === 'playing') {
          startGame();
        }
      });
    } catch (e) {
      error = (e as Error).message;
    }
  }

  function startGame() {
    unsubRoom?.();
    if (!room) return;
    const players: Record<string, { name: string }> = {};
    for (const [id, p] of Object.entries(room.players)) {
      players[id] = { name: p.name };
    }
    onStart({ roomId, playerId, players, isHost, playerName });
  }

  async function handleStartGame() {
    await startGameFn(roomId);
  }

  let playerList = $derived(room ? Object.entries(room.players) : []);
  let canStart = $derived(isHost && playerList.length >= 2);
</script>

<div class="flex min-h-[calc(100vh-65px)] items-center justify-center px-4">
  <div class="w-full max-w-md">
    <h1 class="mb-8 text-center text-3xl font-bold text-white">Blaster Arena</h1>

    {#if phase === 'choice'}
      <div class="space-y-4">
        <p class="text-center text-gray-400">
          Playing as <span class="font-semibold text-white">{playerName}</span>
        </p>
        <button
          onclick={handleCreate}
          class="w-full rounded-lg bg-indigo-600 px-4 py-4 text-lg font-semibold text-white transition hover:bg-indigo-500"
        >
          Create Room
        </button>
        <div class="flex items-center gap-3">
          <div class="h-px flex-1 bg-gray-700"></div>
          <span class="text-sm text-gray-500">or</span>
          <div class="h-px flex-1 bg-gray-700"></div>
        </div>
        <div class="flex gap-2">
          <input
            type="text"
            maxlength="4"
            bind:value={roomCode}
            onkeydown={(e) => e.key === 'Enter' && handleJoin()}
            class="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-center font-mono text-lg tracking-widest text-white uppercase placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
            placeholder="CODE"
          />
          <button
            onclick={handleJoin}
            class="rounded-lg bg-green-600 px-6 py-3 font-semibold text-white transition hover:bg-green-500"
          >
            Join
          </button>
        </div>
        {#if error}
          <p class="text-center text-sm text-red-400">{error}</p>
        {/if}
      </div>
    {:else if phase === 'lobby'}
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-6">
        {#if room}
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Lobby</h2>
            <div
              class="rounded bg-gray-800 px-3 py-1 font-mono text-lg tracking-widest text-indigo-400"
            >
              {room.code}
            </div>
          </div>

          <p class="mb-4 text-sm text-gray-400">Share the code above to invite players</p>

          <div class="mb-6 space-y-2">
            {#each playerList as [id, player]}
              <div class="flex items-center gap-3 rounded-lg bg-gray-800 px-4 py-3">
                <div class="h-3 w-3 rounded-full bg-green-500"></div>
                <span class="text-white">{player.name}</span>
                {#if id === room.hostId}
                  <span class="rounded bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300"
                    >Host</span
                  >
                {/if}
                {#if id === playerId}
                  <span class="text-xs text-gray-500">(you)</span>
                {/if}
              </div>
            {/each}
          </div>

          {#if isHost}
            <button
              onclick={handleStartGame}
              disabled={!canStart}
              class="w-full rounded-lg bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canStart ? 'Start Game' : 'Waiting for players...'}
            </button>
          {:else}
            <p class="text-center text-sm text-gray-400">Waiting for the host to start...</p>
          {/if}
        {:else}
          <p class="text-center text-gray-400">Loading...</p>
        {/if}
      </div>
    {/if}

    <a href="/" class="mt-6 block text-center text-sm text-gray-500 hover:text-white">
      &larr; Back to games
    </a>
  </div>
</div>
