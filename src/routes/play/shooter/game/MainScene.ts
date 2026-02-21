import Phaser from 'phaser';
import {
  MAP_DATA,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
  WORLD_W,
  WORLD_H,
  randomFloorTile
} from './TileMap';
import { FogOfWar } from './FogOfWar';
import { InputManager } from './InputManager';
import { MonsterManager } from './MonsterManager';
import { MultiplayerSync, type PlayerState, type BulletData } from './MultiplayerSync';
import { generateAllTextures, TEX, PLAYER_COLORS } from './SpriteGen';
import { DayNightCycle, type TimeOfDay } from './DayNightCycle';

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 200;
const BULLET_SPEED = 400;
const BULLET_RADIUS = 4;
const BULLET_COOLDOWN = 250;
const BULLET_DAMAGE = 25;
const MAX_HP = 100;
const INVULN_TIME = 1500;

interface RemotePlayer {
  sprite: Phaser.GameObjects.Image;
  gun: Phaser.GameObjects.Image;
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  nameText: Phaser.GameObjects.Text;
  targetX: number;
  targetY: number;
  targetAngle: number;
  hp: number;
  alive: boolean;
  name: string;
  colorIndex: number;
}

interface LocalBullet {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  ownerId: string;
  src: 'player' | 'monster';
  lifetime: number;
  rtdbId?: string;
}

export interface SceneConfig {
  roomId: string;
  playerId: string;
  playerName: string;
  players: Record<string, { name: string }>;
  isHost: boolean;
  onEliminated: (killerName: string) => void;
  onGameOver: (winnerId: string | null, winnerName: string | null) => void;
  onStatsUpdate: (kills: number, wave: number, alivePlayers: number, timeOfDay: string) => void;
  onKillFeed: (killerName: string, victimName: string) => void;
}

export class MainScene extends Phaser.Scene {
  private config!: SceneConfig;
  private sync!: MultiplayerSync;
  private input2!: InputManager;
  private fogOfWar!: FogOfWar;
  private monsterManager!: MonsterManager;
  private dayNight!: DayNightCycle;

  // Local player
  private player!: Phaser.GameObjects.Image;
  private playerGun!: Phaser.GameObjects.Image;
  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private hp = MAX_HP;
  private alive = true;
  private kills = 0;
  private lastShotTime = 0;
  private invulnUntil = 0;
  private playerColorIndex = 0;

  // Remote players
  private remotePlayers = new Map<string, RemotePlayer>();

  // Bullets
  private localBullets: LocalBullet[] = [];
  private remoteBullets = new Map<string, LocalBullet>();

  // Walls physics group
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;

  // All player names (for kill feed)
  private playerNames = new Map<string, string>();

  constructor() {
    super({ key: 'MainScene' });
  }

  init(config: SceneConfig): void {
    this.config = config;
  }

  create(): void {
    // Generate all textures
    generateAllTextures(this);

    // Set world bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // Build tilemap
    this.wallGroup = this.physics.add.staticGroup();
    this.renderMap();

    // Init day/night cycle
    this.dayNight = new DayNightCycle(this);

    // Init fog of war
    this.fogOfWar = new FogOfWar(this, 280, 120);

    // Init input
    this.input2 = new InputManager(this);

    // Init multiplayer sync
    this.sync = new MultiplayerSync(this.config.roomId, this.config.playerId, this.config.isHost);

    // Init monster manager
    this.monsterManager = new MonsterManager(this, this.sync, this.config.isHost, this.wallGroup);
    this.monsterManager.onMonsterBullet = (x, y, vx, vy) => {
      this.spawnMonsterBullet(x, y, vx, vy);
    };

    // Assign color index based on player order
    const playerIds = Object.keys(this.config.players);
    this.playerColorIndex = playerIds.indexOf(this.config.playerId) % PLAYER_COLORS.length;

    // Store all player names
    for (const [id, p] of Object.entries(this.config.players)) {
      this.playerNames.set(id, p.name);
    }

    // Spawn local player
    const spawnPos = randomFloorTile();
    this.createLocalPlayer(spawnPos.x, spawnPos.y);

    // Join game in RTDB
    this.sync.joinGame(this.config.playerName);

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Listen for remote players
    this.sync.onRemotePlayers(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id)
    );

    // Listen for remote bullets
    this.sync.onBullets(
      (id, bullet) => this.addRemoteBullet(id, bullet),
      (id) => this.removeRemoteBullet(id)
    );

    // Listen for eliminations
    this.sync.onEliminations((event) => {
      const killerName = this.playerNames.get(event.killer) || 'Monster';
      const victimName = this.playerNames.get(event.victim) || 'Unknown';
      this.config.onKillFeed(killerName, victimName);
    });

    // Listen for wave changes
    this.sync.onWave((wave) => {
      this.monsterManager.setWave(wave);
    });

    // Listen for game over
    this.sync.onGameOver((winnerId) => {
      const winnerName = winnerId ? this.playerNames.get(winnerId) || null : null;
      this.config.onGameOver(winnerId, winnerName);
    });

    // Start waves
    this.monsterManager.begin();
  }

  private renderMap(): void {
    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const tile = MAP_DATA[r][c];
        const x = c * TILE_SIZE + TILE_SIZE / 2;
        const y = r * TILE_SIZE + TILE_SIZE / 2;

        if (tile === 1) {
          // Wall
          const wall = this.add.image(x, y, TEX.WALL).setDepth(2);
          this.physics.add.existing(wall, true);
          (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, TILE_SIZE);
          this.wallGroup.add(wall);
        } else if (tile === 2) {
          // Floor under bush
          const variant = (r * 7 + c * 13) % 4;
          this.add.image(x, y, TEX.FLOOR + variant).setDepth(0);
          // Bush on top
          this.add.image(x, y, TEX.BUSH).setDepth(15);
        } else {
          // Floor with variant
          const variant = (r * 7 + c * 13) % 4;
          this.add.image(x, y, TEX.FLOOR + variant).setDepth(0);
        }
      }
    }
  }

  private createLocalPlayer(x: number, y: number): void {
    this.player = this.add.image(x, y, TEX.PLAYER + this.playerColorIndex);
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      PLAYER_RADIUS,
      this.player.width / 2 - PLAYER_RADIUS,
      this.player.height / 2 - PLAYER_RADIUS
    );
    body.setCollideWorldBounds(true);
    this.player.setDepth(20);

    // Gun sprite
    this.playerGun = this.add.image(x + 20, y, TEX.PLAYER_GUN + this.playerColorIndex);
    this.playerGun.setDepth(21);

    // HP bar
    this.playerHpBarBg = this.add
      .rectangle(x, y - PLAYER_RADIUS - 10, 32, 5, 0x333333)
      .setDepth(22);
    this.playerHpBar = this.add.rectangle(x, y - PLAYER_RADIUS - 10, 32, 5, 0x44ff44).setDepth(23);

    // Collide with walls
    this.physics.add.collider(this.player, this.wallGroup);

    this.invulnUntil = this.time.now + INVULN_TIME;
  }

  private addRemotePlayer(id: string, state: PlayerState): void {
    if (this.remotePlayers.has(id)) return;
    this.playerNames.set(id, state.name);

    const idx = Array.from(this.playerNames.keys()).indexOf(id) % PLAYER_COLORS.length;

    const sprite = this.add.image(state.x, state.y, TEX.PLAYER + idx).setDepth(20);
    this.physics.add.existing(sprite);
    (sprite.body as Phaser.Physics.Arcade.Body).setCircle(
      PLAYER_RADIUS,
      sprite.width / 2 - PLAYER_RADIUS,
      sprite.height / 2 - PLAYER_RADIUS
    );

    const gun = this.add.image(state.x + 20, state.y, TEX.PLAYER_GUN + idx).setDepth(21);

    const hpBarBg = this.add
      .rectangle(state.x, state.y - PLAYER_RADIUS - 10, 32, 5, 0x333333)
      .setDepth(22);
    const hpBar = this.add
      .rectangle(state.x, state.y - PLAYER_RADIUS - 10, 32, 5, 0x44ff44)
      .setDepth(23);

    const nameText = this.add
      .text(state.x, state.y - PLAYER_RADIUS - 20, state.name, {
        fontSize: '11px',
        color: '#ffffff',
        align: 'center'
      })
      .setOrigin(0.5)
      .setDepth(24);

    this.remotePlayers.set(id, {
      sprite,
      gun,
      hpBarBg,
      hpBar,
      nameText,
      targetX: state.x,
      targetY: state.y,
      targetAngle: state.a,
      hp: state.hp,
      alive: state.al,
      name: state.name,
      colorIndex: idx
    });
  }

  private updateRemotePlayer(id: string, state: PlayerState): void {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.targetX = state.x;
    rp.targetY = state.y;
    rp.targetAngle = state.a;
    rp.hp = state.hp;
    rp.alive = state.al;
  }

  private removeRemotePlayer(id: string): void {
    const rp = this.remotePlayers.get(id);
    if (!rp) return;
    rp.sprite.destroy();
    rp.gun.destroy();
    rp.hpBarBg.destroy();
    rp.hpBar.destroy();
    rp.nameText.destroy();
    this.remotePlayers.delete(id);
  }

  update(_time: number, delta: number): void {
    // -- Day/Night --
    const nightAmount = this.dayNight.update(delta);
    this.fogOfWar.setNightAmount(nightAmount);

    if (!this.alive) {
      this.fogOfWar.update(this.player.x, this.player.y);
      return;
    }

    // -- Input --
    this.input2.setPlayerPosition(this.player.x, this.player.y);
    const input = this.input2.getState();

    // -- Movement --
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(input.moveX * PLAYER_SPEED, input.moveY * PLAYER_SPEED);

    // -- Player rotation toward aim --
    this.player.setRotation(input.aimAngle);

    // -- Gun position --
    const gunDist = PLAYER_RADIUS + 6;
    this.playerGun.setPosition(
      this.player.x + Math.cos(input.aimAngle) * gunDist,
      this.player.y + Math.sin(input.aimAngle) * gunDist
    );
    this.playerGun.setRotation(input.aimAngle);

    // -- HP bar --
    this.playerHpBarBg.setPosition(this.player.x, this.player.y - PLAYER_RADIUS - 10);
    this.playerHpBar.setPosition(this.player.x, this.player.y - PLAYER_RADIUS - 10);
    const hpRatio = Math.max(0, this.hp / MAX_HP);
    this.playerHpBar.setScale(hpRatio, 1);
    this.playerHpBar.setFillStyle(hpRatio > 0.5 ? 0x44ff44 : hpRatio > 0.25 ? 0xffaa00 : 0xff2222);

    // -- Invulnerability flash --
    if (this.time.now < this.invulnUntil) {
      this.player.setAlpha(Math.sin(this.time.now * 0.02) * 0.3 + 0.7);
    } else {
      this.player.setAlpha(1);
    }

    // -- Shooting --
    if (input.shooting && this.time.now - this.lastShotTime > BULLET_COOLDOWN) {
      this.lastShotTime = this.time.now;
      this.fireBullet(input.aimAngle);
    }

    // -- Update local bullets --
    this.updateBullets(delta);

    // -- Update remote players --
    this.updateRemotePlayers();

    // -- Monster manager --
    const playersMap = new Map<string, { x: number; y: number; alive: boolean }>();
    playersMap.set(this.config.playerId, { x: this.player.x, y: this.player.y, alive: this.alive });
    for (const [id, rp] of this.remotePlayers) {
      playersMap.set(id, { x: rp.sprite.x, y: rp.sprite.y, alive: rp.alive });
    }
    this.monsterManager.update(delta, playersMap);

    // -- Check monster collisions with local player --
    if (this.alive && this.time.now > this.invulnUntil) {
      for (const [mId, monster] of this.monsterManager.getMonsters()) {
        if (monster.type === 'spitter') continue; // Spitters use projectiles
        const dist = Math.hypot(monster.sprite.x - this.player.x, monster.sprite.y - this.player.y);
        if (dist < PLAYER_RADIUS + 12) {
          this.takeDamage(this.monsterManager.getMonsterDamage(mId), 'monster');
        }
      }
    }

    // -- Check bullet collisions with local player --
    for (const [bulletId, bullet] of this.remoteBullets) {
      if (!bullet.sprite.active) continue;
      const dist = Math.hypot(bullet.sprite.x - this.player.x, bullet.sprite.y - this.player.y);
      if (dist < PLAYER_RADIUS + BULLET_RADIUS && this.time.now > this.invulnUntil) {
        this.takeDamage(BULLET_DAMAGE, bullet.ownerId);
        bullet.sprite.destroy();
        this.remoteBullets.delete(bulletId);
      }
    }

    // -- Check local bullet collisions with monsters --
    for (let i = this.localBullets.length - 1; i >= 0; i--) {
      const bullet = this.localBullets[i];
      if (bullet.src !== 'player') continue;
      for (const [mId, monster] of this.monsterManager.getMonsters()) {
        const dist = Math.hypot(
          bullet.sprite.x - monster.sprite.x,
          bullet.sprite.y - monster.sprite.y
        );
        const mRadius = monster.type === 'boss' ? 22 : monster.type === 'crawler' ? 12 : 10;
        if (dist < mRadius + BULLET_RADIUS) {
          if (this.config.isHost) {
            this.monsterManager.damageMonster(mId, BULLET_DAMAGE);
          }
          bullet.sprite.destroy();
          if (bullet.rtdbId) this.sync.removeBullet(bullet.rtdbId);
          this.localBullets.splice(i, 1);
          break;
        }
      }
    }

    // -- Fog of war --
    this.fogOfWar.update(this.player.x, this.player.y);

    // -- Visibility of remote entities --
    for (const [, rp] of this.remotePlayers) {
      const visible = this.fogOfWar.isVisible(
        this.player.x,
        this.player.y,
        rp.sprite.x,
        rp.sprite.y
      );
      rp.sprite.setVisible(visible && rp.alive);
      rp.gun.setVisible(visible && rp.alive);
      rp.hpBarBg.setVisible(visible && rp.alive);
      rp.hpBar.setVisible(visible && rp.alive);
      rp.nameText.setVisible(visible && rp.alive);
    }

    for (const [, monster] of this.monsterManager.getMonsters()) {
      const visible = this.fogOfWar.isVisible(
        this.player.x,
        this.player.y,
        monster.sprite.x,
        monster.sprite.y
      );
      monster.sprite.setVisible(visible);
      monster.hpBar.setVisible(visible);
      monster.hpBarBg.setVisible(visible);
    }

    // -- Sync local player state --
    this.sync.syncLocalPlayer({
      x: this.player.x,
      y: this.player.y,
      a: input.aimAngle,
      hp: this.hp,
      al: this.alive,
      kills: this.kills,
      name: this.config.playerName
    });

    // -- Host: check win condition --
    if (this.config.isHost) {
      this.checkWinCondition();
    }

    // -- Stats update --
    const aliveCount =
      (this.alive ? 1 : 0) +
      Array.from(this.remotePlayers.values()).filter((rp) => rp.alive).length;
    this.config.onStatsUpdate(
      this.kills,
      this.monsterManager.getWave(),
      aliveCount,
      this.dayNight.getTimeLabel()
    );
  }

  private fireBullet(angle: number): void {
    const startX = this.player.x + Math.cos(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const startY = this.player.y + Math.sin(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const vx = Math.cos(angle) * BULLET_SPEED;
    const vy = Math.sin(angle) * BULLET_SPEED;

    const sprite = this.add.image(startX, startY, TEX.BULLET_PLAYER).setDepth(18);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      BULLET_RADIUS,
      sprite.width / 2 - BULLET_RADIUS,
      sprite.height / 2 - BULLET_RADIUS
    );
    body.setVelocity(vx, vy);
    body.setCollideWorldBounds(true);
    body.onWorldBounds = true;

    // Muzzle flash
    const flash = this.add.image(startX, startY, TEX.MUZZLE_FLASH).setDepth(19).setAlpha(0.8);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.5,
      duration: 100,
      onComplete: () => flash.destroy()
    });

    const bullet: LocalBullet = {
      sprite,
      vx,
      vy,
      ownerId: this.config.playerId,
      src: 'player',
      lifetime: 1500
    };

    // Collide with walls
    this.physics.add.collider(sprite, this.wallGroup, () => {
      sprite.destroy();
      if (bullet.rtdbId) this.sync.removeBullet(bullet.rtdbId);
      const idx = this.localBullets.indexOf(bullet);
      if (idx !== -1) this.localBullets.splice(idx, 1);
    });

    // Sync to RTDB
    bullet.rtdbId = this.sync.fireBullet({
      x: startX,
      y: startY,
      vx,
      vy,
      o: this.config.playerId,
      src: 'player'
    });
    this.localBullets.push(bullet);
  }

  private spawnMonsterBullet(x: number, y: number, vx: number, vy: number): void {
    const sprite = this.add.image(x, y, TEX.BULLET_MONSTER).setDepth(18);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      BULLET_RADIUS + 1,
      sprite.width / 2 - BULLET_RADIUS - 1,
      sprite.height / 2 - BULLET_RADIUS - 1
    );
    body.setVelocity(vx, vy);
    body.setCollideWorldBounds(true);

    const bullet: LocalBullet = {
      sprite,
      vx,
      vy,
      ownerId: 'monster',
      src: 'monster',
      lifetime: 2000
    };

    this.physics.add.collider(sprite, this.wallGroup, () => {
      sprite.destroy();
      const idx = this.localBullets.indexOf(bullet);
      if (idx !== -1) this.localBullets.splice(idx, 1);
    });

    this.localBullets.push(bullet);
  }

  private updateBullets(delta: number): void {
    for (let i = this.localBullets.length - 1; i >= 0; i--) {
      const bullet = this.localBullets[i];
      bullet.lifetime -= delta;

      if (bullet.lifetime <= 0 || !bullet.sprite.active) {
        bullet.sprite.destroy();
        if (bullet.rtdbId) this.sync.removeBullet(bullet.rtdbId);
        this.localBullets.splice(i, 1);
        continue;
      }

      // Check collision with remote players (for local bullets)
      if (bullet.src === 'player' && bullet.ownerId === this.config.playerId) {
        for (const [id, rp] of this.remotePlayers) {
          if (!rp.alive) continue;
          const dist = Math.hypot(bullet.sprite.x - rp.sprite.x, bullet.sprite.y - rp.sprite.y);
          if (dist < PLAYER_RADIUS + BULLET_RADIUS) {
            // We hit them — but damage is applied on their client
            bullet.sprite.destroy();
            if (bullet.rtdbId) this.sync.removeBullet(bullet.rtdbId);
            this.localBullets.splice(i, 1);
            break;
          }
        }
      }

      // Monster bullet hitting local player
      if (bullet.src === 'monster' && this.alive && this.time.now > this.invulnUntil) {
        const dist = Math.hypot(bullet.sprite.x - this.player.x, bullet.sprite.y - this.player.y);
        if (dist < PLAYER_RADIUS + BULLET_RADIUS + 1) {
          this.takeDamage(15, 'monster');
          bullet.sprite.destroy();
          this.localBullets.splice(i, 1);
        }
      }
    }
  }

  private addRemoteBullet(id: string, data: BulletData): void {
    const texKey = data.src === 'monster' ? TEX.BULLET_MONSTER : TEX.BULLET_PLAYER;
    const sprite = this.add.image(data.x, data.y, texKey).setDepth(18);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      BULLET_RADIUS,
      sprite.width / 2 - BULLET_RADIUS,
      sprite.height / 2 - BULLET_RADIUS
    );
    body.setVelocity(data.vx, data.vy);
    body.setCollideWorldBounds(true);

    const bullet: LocalBullet = {
      sprite,
      vx: data.vx,
      vy: data.vy,
      ownerId: data.o,
      src: data.src,
      lifetime: 1500,
      rtdbId: id
    };

    this.physics.add.collider(sprite, this.wallGroup, () => {
      sprite.destroy();
      this.remoteBullets.delete(id);
    });

    this.remoteBullets.set(id, bullet);
  }

  private removeRemoteBullet(id: string): void {
    const bullet = this.remoteBullets.get(id);
    if (bullet) {
      bullet.sprite.destroy();
      this.remoteBullets.delete(id);
    }
  }

  private updateRemotePlayers(): void {
    for (const [, rp] of this.remotePlayers) {
      if (!rp.alive) {
        rp.sprite.setVisible(false);
        rp.gun.setVisible(false);
        rp.hpBarBg.setVisible(false);
        rp.hpBar.setVisible(false);
        rp.nameText.setVisible(false);
        continue;
      }

      // Interpolate position
      rp.sprite.x += (rp.targetX - rp.sprite.x) * 0.2;
      rp.sprite.y += (rp.targetY - rp.sprite.y) * 0.2;

      // Rotation
      rp.sprite.setRotation(rp.targetAngle);

      // Gun
      const gunDist = PLAYER_RADIUS + 6;
      rp.gun.setPosition(
        rp.sprite.x + Math.cos(rp.targetAngle) * gunDist,
        rp.sprite.y + Math.sin(rp.targetAngle) * gunDist
      );
      rp.gun.setRotation(rp.targetAngle);

      // HP barplayerGun
      rp.hpBarBg.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 10);
      rp.hpBar.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 10);
      const ratio = Math.max(0, rp.hp / MAX_HP);
      rp.hpBar.setScale(ratio, 1);
      rp.hpBar.setFillStyle(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222);

      // Name
      rp.nameText.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 20);
    }
  }

  private takeDamage(amount: number, source: string): void {
    if (!this.alive || this.time.now < this.invulnUntil) return;

    this.hp -= amount;
    this.invulnUntil = this.time.now + 300;

    this.cameras.main.shake(100, 0.005);

    if (this.hp <= 0) {
      this.hp = 0;
      this.die(source);
    }
  }

  private die(killerId: string): void {
    this.alive = false;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setEnable(false);

    // Death animation
    this.tweens.add({
      targets: [this.player, this.playerGun],
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 500
    });
    this.playerHpBarBg.setVisible(false);
    this.playerHpBar.setVisible(false);

    this.sync.reportElimination(this.config.playerId, killerId);

    if (killerId !== 'monster') {
      const rp = this.remotePlayers.get(killerId);
      if (rp) {
        this.config.onEliminated(rp.name);
      } else {
        this.config.onEliminated('a monster');
      }
    } else {
      this.config.onEliminated('a monster');
    }
dayNight?.destroy();
    this.
    this.sync.syncLocalPlayer({
      x: this.player.x,
      y: this.player.y,
      a: 0,
      hp: 0,
      al: false,
      kills: this.kills,
      name: this.config.playerName
    });
  }

  private checkWinCondition(): void {
    const allPlayers = new Map<string, boolean>();
    allPlayers.set(this.config.playerId, this.alive);
    for (const [id, rp] of this.remotePlayers) {
      allPlayers.set(id, rp.alive);
    }

    const alivePlayers = Array.from(allPlayers.entries()).filter(([, al]) => al);

    if (alivePlayers.length <= 1 && allPlayers.size > 1) {
      const winnerId = alivePlayers.length === 1 ? alivePlayers[0][0] : null;
      this.sync.reportGameOver(winnerId);
    }
  }

  shutdown(): void {
    this.input2?.destroy();
    this.fogOfWar?.destroy();
    this.monsterManager?.destroy();
    this.dayNight?.destroy();
    this.sync?.cleanup();
  }
}
