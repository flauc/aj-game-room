import {
  ref,
  set,
  push,
  onValue,
  onChildAdded,
  onChildRemoved,
  onChildChanged,
  remove,
  onDisconnect,
  type Unsubscribe
} from 'firebase/database';
import { rtdb } from '$lib/firebase';

export interface PlayerState {
  x: number;
  y: number;
  a: number; // aim angle
  hp: number;
  al: boolean; // alive
  kills: number;
  name: string;
}

export interface MonsterState {
  x: number;
  y: number;
  hp: number;
  t: string; // 'crawler' | 'spitter' | 'boss'
}

export interface BulletData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  o: string; // owner id
  src: 'player' | 'monster';
}

export interface GameEvent {
  type: 'kill' | 'monster_kill';
  killer: string;
  victim: string;
  ts: number;
}

export class MultiplayerSync {
  private roomId: string;
  private playerId: string;
  private isHost: boolean;
  private unsubs: Unsubscribe[] = [];
  private lastSyncTime = 0;
  private syncInterval = 100; // 10Hz

  constructor(roomId: string, playerId: string, isHost: boolean) {
    this.roomId = roomId;
    this.playerId = playerId;
    this.isHost = isHost;
  }

  private path(sub: string) {
    return `games/${this.roomId}/${sub}`;
  }

  async joinGame(name: string): Promise<void> {
    const playerRef = ref(rtdb, this.path(`players/${this.playerId}`));
    await set(playerRef, {
      x: 0,
      y: 0,
      a: 0,
      hp: 100,
      al: true,
      kills: 0,
      name
    });
    // Clean up player data on disconnect
    onDisconnect(playerRef).remove();

    if (this.isHost) {
      const stateRef = ref(rtdb, this.path('state'));
      await set(stateRef, 'active');
      const waveRef = ref(rtdb, this.path('wave'));
      await set(waveRef, 0);
      onDisconnect(stateRef).set('over');
    }
  }

  syncLocalPlayer(state: Partial<PlayerState>): void {
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncInterval) return;
    this.lastSyncTime = now;

    const playerRef = ref(rtdb, this.path(`players/${this.playerId}`));
    set(playerRef, state);
  }

  onRemotePlayers(
    onAdd: (id: string, state: PlayerState) => void,
    onChange: (id: string, state: PlayerState) => void,
    onRemove: (id: string) => void
  ): void {
    const playersRef = ref(rtdb, this.path('players'));

    this.unsubs.push(
      onChildAdded(playersRef, (snap) => {
        if (snap.key && snap.key !== this.playerId) {
          onAdd(snap.key, snap.val());
        }
      })
    );

    this.unsubs.push(
      onChildChanged(playersRef, (snap) => {
        if (snap.key && snap.key !== this.playerId) {
          onChange(snap.key, snap.val());
        }
      })
    );

    this.unsubs.push(
      onChildRemoved(playersRef, (snap) => {
        if (snap.key && snap.key !== this.playerId) {
          onRemove(snap.key);
        }
      })
    );
  }

  // Host-only: sync all monsters
  syncMonsters(monsters: Record<string, MonsterState>): void {
    if (!this.isHost) return;
    const now = Date.now();
    if (now - this.lastSyncTime < this.syncInterval) return;
    const monstersRef = ref(rtdb, this.path('monsters'));
    set(monstersRef, monsters);
  }

  // Non-host: listen to monster state
  onMonsters(callback: (monsters: Record<string, MonsterState>) => void): void {
    const monstersRef = ref(rtdb, this.path('monsters'));
    this.unsubs.push(
      onValue(monstersRef, (snap) => {
        callback(snap.val() || {});
      })
    );
  }

  fireBullet(bullet: BulletData): string {
    const bulletsRef = ref(rtdb, this.path('bullets'));
    const newRef = push(bulletsRef);
    set(newRef, bullet);
    return newRef.key!;
  }

  onBullets(onAdd: (id: string, bullet: BulletData) => void, onRemove: (id: string) => void): void {
    const bulletsRef = ref(rtdb, this.path('bullets'));
    this.unsubs.push(
      onChildAdded(bulletsRef, (snap) => {
        if (snap.key) {
          const bullet = snap.val() as BulletData;
          // Only handle bullets from other players
          if (bullet.o !== this.playerId) {
            onAdd(snap.key, bullet);
          }
        }
      })
    );
    this.unsubs.push(
      onChildRemoved(bulletsRef, (snap) => {
        if (snap.key) onRemove(snap.key);
      })
    );
  }

  removeBullet(bulletId: string): void {
    remove(ref(rtdb, this.path(`bullets/${bulletId}`)));
  }

  reportElimination(victimId: string, killerId: string): void {
    const eventsRef = ref(rtdb, this.path('events'));
    push(eventsRef, {
      type: 'kill',
      killer: killerId,
      victim: victimId,
      ts: Date.now()
    });
  }

  onEliminations(callback: (event: GameEvent) => void): void {
    const eventsRef = ref(rtdb, this.path('events'));
    this.unsubs.push(
      onChildAdded(eventsRef, (snap) => {
        callback(snap.val());
      })
    );
  }

  async setWave(wave: number): Promise<void> {
    if (!this.isHost) return;
    await set(ref(rtdb, this.path('wave')), wave);
  }

  onWave(callback: (wave: number) => void): void {
    this.unsubs.push(
      onValue(ref(rtdb, this.path('wave')), (snap) => {
        callback(snap.val() ?? 0);
      })
    );
  }

  async reportGameOver(winnerId: string | null): Promise<void> {
    await set(ref(rtdb, this.path('state')), 'over');
    await set(ref(rtdb, this.path('winner')), winnerId);
  }

  onGameOver(callback: (winnerId: string | null) => void): void {
    this.unsubs.push(
      onValue(ref(rtdb, this.path('state')), (snap) => {
        if (snap.val() === 'over') {
          onValue(ref(rtdb, this.path('winner')), (ws) => callback(ws.val()), { onlyOnce: true });
        }
      })
    );
  }

  async cleanup(): Promise<void> {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    // Remove this player's data
    await remove(ref(rtdb, this.path(`players/${this.playerId}`)));
    // If host, clean up the entire game
    if (this.isHost) {
      await remove(ref(rtdb, this.path('')));
    }
  }
}
