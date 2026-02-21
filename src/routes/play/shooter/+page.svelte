<script lang="ts">
  import Lobby from './Lobby.svelte';
  import Game from './Game.svelte';
  import Results from './Results.svelte';

  type Phase =
    | { type: 'lobby' }
    | {
        type: 'game';
        roomId: string;
        playerId: string;
        playerName: string;
        players: Record<string, { name: string }>;
        isHost: boolean;
        singlePlayer: boolean;
      }
    | {
        type: 'results';
        winnerId: string | null;
        winnerName: string | null;
        kills: number;
        wave: number;
        playerId: string;
      };

  let phase = $state<Phase>({ type: 'lobby' });
  let lastKills = $state(0);
  let lastWave = $state(0);

  function handleStart(data: {
    roomId: string;
    playerId: string;
    playerName: string;
    players: Record<string, { name: string }>;
    isHost: boolean;
    singlePlayer?: boolean;
  }) {
    phase = {
      type: 'game',
      singlePlayer: data.singlePlayer ?? false,
      ...data
    };
  }

  function handleGameOver(winnerId: string | null, winnerName: string | null) {
    if (phase.type !== 'game') return;
    phase = {
      type: 'results',
      winnerId,
      winnerName,
      kills: lastKills,
      wave: lastWave,
      playerId: phase.playerId
    };
  }

  function handlePlayAgain() {
    phase = { type: 'lobby' };
    lastKills = 0;
    lastWave = 0;
  }
</script>

{#if phase.type === 'lobby'}
  <Lobby onStart={handleStart} />
{:else if phase.type === 'game'}
  <Game
    roomId={phase.roomId}
    playerId={phase.playerId}
    playerName={phase.playerName}
    players={phase.players}
    isHost={phase.isHost}
    singlePlayer={phase.singlePlayer}
    onGameOver={handleGameOver}
  />
{:else if phase.type === 'results'}
  <Results
    winnerId={phase.winnerId}
    winnerName={phase.winnerName}
    localPlayerId={phase.playerId}
    kills={lastKills}
    wave={lastWave}
    onPlayAgain={handlePlayAgain}
  />
{/if}
