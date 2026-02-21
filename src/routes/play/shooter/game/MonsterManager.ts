import Phaser from 'phaser';
import { MAP_DATA, MAP_COLS, MAP_ROWS, TILE_SIZE, randomFloorTile } from './TileMap';
import type { MultiplayerSync, MonsterState } from './MultiplayerSync';
import { TEX } from './SpriteGen';

interface Monster {
  id: string;
  sprite: Phaser.GameObjects.Image;
  hpBar: Phaser.GameObjects.Rectangle;
  hpBarBg: Phaser.GameObjects.Rectangle;
  type: 'crawler' | 'spitter' | 'boss';
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  targetId: string | null;
  lastShot: number;
  spawning: boolean;
  spawnTimer: number;
}

interface SpawnHole {
  circle: Phaser.GameObjects.Image;
  x: number;
  y: number;
  timer: number;
  type: 'crawler' | 'spitter' | 'boss';
}

/**
 * Monster wave system — only runs logic on the host.
 * Non-host clients render monsters from synced data.
 */
export class MonsterManager {
  private scene: Phaser.Scene;
  private sync: MultiplayerSync;
  private isHost: boolean;
  private monsters = new Map<string, Monster>();
  private spawnHoles: SpawnHole[] = [];
  private wave = 0;
  private waveActive = false;
  private nextWaveTimer = 0;
  private monsterIdCounter = 0;
  private wallGroup: Phaser.Physics.Arcade.StaticGroup;

  // Callbacks for the main scene
  onMonsterBullet?: (x: number, y: number, vx: number, vy: number) => void;

  constructor(
    scene: Phaser.Scene,
    sync: MultiplayerSync,
    isHost: boolean,
    wallGroup: Phaser.Physics.Arcade.StaticGroup
  ) {
    this.scene = scene;
    this.sync = sync;
    this.isHost = isHost;
    this.wallGroup = wallGroup;

    if (!isHost) {
      // Listen for monster updates from host
      this.sync.onMonsters((data) => {
        this.updateFromSync(data);
      });
    }
  }

  getMonsterSprites(): Phaser.GameObjects.Image[] {
    return Array.from(this.monsters.values())
      .filter((m) => !m.spawning)
      .map((m) => m.sprite);
  }

  getMonsters(): Map<string, Monster> {
    return this.monsters;
  }

  /** Host: start next wave */
  startNextWave(): void {
    if (!this.isHost) return;
    this.wave++;
    this.sync.setWave(this.wave);
    this.waveActive = true;

    const count = 3 + this.wave * 2;
    const isBossWave = this.wave % 5 === 0;

    // Get player positions to avoid spawning near them
    const avoidPositions: { x: number; y: number }[] = [];
    // We'll collect player positions from the scene's player data
    // For now, spawn at random floor tiles
    for (let i = 0; i < count; i++) {
      let type: 'crawler' | 'spitter' | 'boss' = 'crawler';
      if (isBossWave && i === 0) {
        type = 'boss';
      } else if (Math.random() < 0.3) {
        type = 'spitter';
      }

      const pos = randomFloorTile(avoidPositions, 150);
      avoidPositions.push(pos);
      this.createSpawnHole(pos.x, pos.y, type);
    }
  }

  private createSpawnHole(x: number, y: number, type: 'crawler' | 'spitter' | 'boss'): void {
    const circle = this.scene.add.image(x, y, TEX.SPAWN_HOLE).setDepth(5);
    circle.setScale(0.1);
    circle.setAlpha(0.6);

    // Grow animation
    const targetScale = type === 'boss' ? 1.5 : 1;
    this.scene.tweens.add({
      targets: circle,
      scaleX: targetScale,
      scaleY: targetScale,
      alpha: 1,
      duration: 1000,
      ease: 'Power2'
    });

    this.spawnHoles.push({ circle, x, y, timer: 1000, type });
  }

  private spawnMonster(x: number, y: number, type: 'crawler' | 'spitter' | 'boss'): void {
    const id = `m${this.monsterIdCounter++}`;

    const configs = {
      crawler: { hp: 30, speed: 80, damage: 10, radius: 12, tex: TEX.CRAWLER },
      spitter: { hp: 20, speed: 50, damage: 15, radius: 10, tex: TEX.SPITTER },
      boss: { hp: 200, speed: 100, damage: 30, radius: 22, tex: TEX.BOSS }
    };
    const cfg = configs[type];

    const sprite = this.scene.add.image(x, y, cfg.tex).setDepth(10);
    this.scene.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(cfg.radius, sprite.width / 2 - cfg.radius, sprite.height / 2 - cfg.radius);
    body.setCollideWorldBounds(true);

    // HP bar
    const barW = cfg.radius * 2 + 4;
    const hpBarBg = this.scene.add.rectangle(x, y - cfg.radius - 8, barW, 4, 0x333333).setDepth(11);
    const hpBar = this.scene.add.rectangle(x, y - cfg.radius - 8, barW, 4, 0x44ff44).setDepth(12);

    this.scene.physics.add.collider(sprite, this.wallGroup);

    this.monsters.set(id, {
      id,
      sprite,
      hpBar,
      hpBarBg,
      type,
      hp: cfg.hp,
      maxHp: cfg.hp,
      speed: cfg.speed,
      damage: cfg.damage,
      targetId: null,
      lastShot: 0,
      spawning: false,
      spawnTimer: 0
    });
  }

  /** Host: update monster AI each frame */
  update(delta: number, players: Map<string, { x: number; y: number; alive: boolean }>): void {
    // Process spawn holes
    for (let i = this.spawnHoles.length - 1; i >= 0; i--) {
      const hole = this.spawnHoles[i];
      hole.timer -= delta;
      if (hole.timer <= 0) {
        this.scene.tweens.killTweensOf(hole.circle);
        hole.circle.destroy();
        if (this.isHost) {
          this.spawnMonster(hole.x, hole.y, hole.type);
        }
        this.spawnHoles.splice(i, 1);
      }
    }

    if (!this.isHost) {
      // Non-host: just update HP bars
      for (const monster of this.monsters.values()) {
        this.updateHpBar(monster);
      }
      return;
    }

    // Get alive players
    const alivePlayers = Array.from(players.entries()).filter(([, p]) => p.alive);

    const syncData: Record<string, MonsterState> = {};

    for (const [id, monster] of this.monsters) {
      if (monster.spawning) continue;

      const body = monster.sprite.body as Phaser.Physics.Arcade.Body;

      // Find nearest alive player
      let nearest: { id: string; x: number; y: number; dist: number } | null = null;
      for (const [pid, p] of alivePlayers) {
        const dist = Math.hypot(p.x - monster.sprite.x, p.y - monster.sprite.y);
        if (!nearest || dist < nearest.dist) {
          nearest = { id: pid, x: p.x, y: p.y, dist };
        }
      }

      if (nearest) {
        monster.targetId = nearest.id;
        const angle = Math.atan2(nearest.y - monster.sprite.y, nearest.x - monster.sprite.x);

        // Rotate sprite toward target
        monster.sprite.setRotation(angle);

        if (monster.type === 'spitter' && nearest.dist < 300) {
          // Spitter: stay at range, shoot
          if (nearest.dist < 150) {
            // Too close, back away
            body.setVelocity(
              Math.cos(angle + Math.PI) * monster.speed,
              Math.sin(angle + Math.PI) * monster.speed
            );
          } else {
            body.setVelocity(0, 0);
          }

          // Shoot periodically
          const now = Date.now();
          if (now - monster.lastShot > 2000) {
            monster.lastShot = now;
            const bulletSpeed = 200;
            this.onMonsterBullet?.(
              monster.sprite.x,
              monster.sprite.y,
              Math.cos(angle) * bulletSpeed,
              Math.sin(angle) * bulletSpeed
            );
          }
        } else {
          // Crawler/Boss: charge at player
          body.setVelocity(Math.cos(angle) * monster.speed, Math.sin(angle) * monster.speed);
        }
      } else {
        body.setVelocity(0, 0);
      }

      // Update HP bar position
      this.updateHpBar(monster);

      syncData[id] = {
        x: monster.sprite.x,
        y: monster.sprite.y,
        hp: monster.hp,
        t: monster.type
      };
    }

    // Sync monster positions to RTDB
    this.sync.syncMonsters(syncData);

    // Check if wave is complete
    if (this.waveActive && this.monsters.size === 0 && this.spawnHoles.length === 0) {
      this.waveActive = false;
      this.nextWaveTimer = 5000;
    }

    // Auto-start next wave
    if (!this.waveActive && this.nextWaveTimer > 0) {
      this.nextWaveTimer -= delta;
      if (this.nextWaveTimer <= 0) {
        this.startNextWave();
      }
    }
  }

  private updateHpBar(monster: Monster): void {
    const r = monster.type === 'boss' ? 22 : monster.type === 'crawler' ? 12 : 10;
    const barW = r * 2 + 4;
    monster.hpBarBg.setPosition(monster.sprite.x, monster.sprite.y - r - 8);
    monster.hpBar.setPosition(monster.sprite.x, monster.sprite.y - r - 8);
    const ratio = Math.max(0, monster.hp / monster.maxHp);
    monster.hpBar.setScale(ratio, 1);
    monster.hpBar.setFillStyle(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222);
  }

  /** Apply damage to a monster (called on hit detection) */
  damageMonster(monsterId: string, damage: number): boolean {
    const monster = this.monsters.get(monsterId);
    if (!monster) return false;
    monster.hp -= damage;
    if (monster.hp <= 0) {
      this.destroyMonster(monsterId);
      return true; // Monster killed
    }
    return false;
  }

  private destroyMonster(id: string): void {
    const monster = this.monsters.get(id);
    if (!monster) return;
    monster.sprite.destroy();
    monster.hpBar.destroy();
    monster.hpBarBg.destroy();
    this.monsters.delete(id);
  }

  /** Non-host: update monster visuals from synced data */
  private updateFromSync(data: Record<string, MonsterState>): void {
    // Remove monsters that no longer exist
    for (const [id] of this.monsters) {
      if (!data[id]) {
        this.destroyMonster(id);
      }
    }

    // Update or create monsters
    for (const [id, state] of Object.entries(data)) {
      let monster = this.monsters.get(id);
      if (!monster) {
        // Create new monster sprite (non-host)
        const configs = {
          crawler: { radius: 12, tex: TEX.CRAWLER },
          spitter: { radius: 10, tex: TEX.SPITTER },
          boss: { radius: 22, tex: TEX.BOSS }
        };
        const type = state.t as 'crawler' | 'spitter' | 'boss';
        const cfg = configs[type] || configs.crawler;

        const sprite = this.scene.add.image(state.x, state.y, cfg.tex).setDepth(10);
        this.scene.physics.add.existing(sprite);
        const body = sprite.body as Phaser.Physics.Arcade.Body;
        body.setCircle(cfg.radius, sprite.width / 2 - cfg.radius, sprite.height / 2 - cfg.radius);

        const barW = cfg.radius * 2 + 4;
        const maxHp = type === 'boss' ? 200 : type === 'crawler' ? 30 : 20;
        const hpBarBg = this.scene.add
          .rectangle(state.x, state.y - cfg.radius - 8, barW, 4, 0x333333)
          .setDepth(11);
        const hpBar = this.scene.add
          .rectangle(state.x, state.y - cfg.radius - 8, barW, 4, 0x44ff44)
          .setDepth(12);

        monster = {
          id,
          sprite,
          hpBar,
          hpBarBg,
          type,
          hp: state.hp,
          maxHp,
          speed: 0,
          damage: 0,
          targetId: null,
          lastShot: 0,
          spawning: false,
          spawnTimer: 0
        };
        this.monsters.set(id, monster);
      }

      // Interpolate position
      monster.sprite.x += (state.x - monster.sprite.x) * 0.3;
      monster.sprite.y += (state.y - monster.sprite.y) * 0.3;
      monster.hp = state.hp;
    }
  }

  getWave(): number {
    return this.wave;
  }

  setWave(w: number): void {
    this.wave = w;
  }

  /** Start the first wave (called after game starts). */
  begin(): void {
    if (this.isHost) {
      this.nextWaveTimer = 3000; // 3s before first wave
    }
  }

  /** Get a monster's damage value */
  getMonsterDamage(monsterId: string): number {
    return this.monsters.get(monsterId)?.damage ?? 10;
  }

  destroy(): void {
    for (const [id] of this.monsters) {
      this.destroyMonster(id);
    }
    for (const hole of this.spawnHoles) {
      this.scene.tweens.killTweensOf(hole.circle);
      hole.circle.destroy();
    }
    this.spawnHoles = [];
  }
}
