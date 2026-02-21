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
import { generateAllTextures, TEX, PLAYER_COLORS, type WeaponType } from './SpriteGen';
import { DayNightCycle, type TimeOfDay } from './DayNightCycle';

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 200;
const BULLET_RADIUS = 4;
const MAX_HP = 100;
const INVULN_TIME = 1500;

const WEAPON_CONFIGS = {
  sword: { damage: 40, cooldown: 400, range: 45, speed: 0, type: 'melee' as const },
  spear: { damage: 30, cooldown: 500, range: 70, speed: 0, type: 'melee' as const },
  bow: { damage: 25, cooldown: 350, range: 0, range: 0, range: 0, speed: 380, type: 'ranged' as const }
};

interface RemotePlayer {
  sprite: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
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
  singlePlayer: boolean;
  weapon: WeaponType;
  onEliminated: (killerName: string) => void;
  onGameOver: (winnerId: string | null, winnerName: string | null) => void;
  onStatsUpdate: (kills: number, wave: number, alivePlayers: number, timeOfDay: string) => void;
  onKillFeed: (killerName: string, victimName: string) => void;
}

export class MainScene extends Phaser.Scene {
  private config!: SceneConfig;
  private sync: MultiplayerSync | null = null;
  private input2!: InputManager;
  private fogOfWar!: FogOfWar;
  private monsterManager!: MonsterManager;
  private dayNight!: DayNightCycle;

  // Local player
  private player!: Phaser.GameObjects.Image;
  private playerWeapon!: Phaser.GameObjects.Image;
  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private hp = MAX_HP;
  private alive = true;
  private kills = 0;
  private lastAttackTime = 0;
  private invulnUntil = 0;
  private playerColorIndex = 0;
  private lastStatsTime = 0;

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
    this.fogOfWar = new FogOfWar(this, 400, 140);

    // Init input
    this.input2 = new InputManager(this);

    // Init multiplayer sync (skip in single player)
    if (!this.config.singlePlayer) {
      this.sync = new MultiplayerSync(this.config.roomId, this.config.playerId, this.config.isHost);
    }

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
    this.sync?.joinGame(this.config.playerName);

    // Camera follow
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Listen for remote players
    this.sync?.onRemotePlayers(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id)
    );

    // Listen for remote bullets
    this.sync?.onBullets(
      (id, bullet) => this.addRemoteBullet(id, bullet),
      (id) => this.removeRemoteBullet(id)
    );

    // Listen for eliminations
    this.sync?.onEliminations((event) => {
      const killerName = this.playerNames.get(event.killer) || 'Monster';
      const victimName = this.playerNames.get(event.victim) || 'Unknown';
      this.config.onKillFeed(killerName, victimName);
    });

    // Listen for wave changes
    this.sync?.onWave((wave) => {
      this.monsterManager.setWave(wave);
    });

    // Listen for game over
    this.sync?.onGameOver((winnerId) => {
      const winnerName = winnerId ? this.playerNames.get(winnerId) || null : null;
      this.config.onGameOver(winnerId, winnerName);
    });

    // Start waves
    this.monsterManager.begin();
  }

  private renderMap(): void {
    // Bake all floor tiles into a single RenderTexture (eliminates ~1200 individual images)
    const floorRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0);

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const tile = MAP_DATA[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (tile === 1) {
          // Wall — keep as individual Image for physics collisions
          const wall = this.add.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TEX.WALL).setDepth(2);
          this.physics.add.existing(wall, true);
          (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, TILE_SIZE);
          this.wallGroup.add(wall);
        } else {
          // Draw floor directly into baked texture
          const variant = (r * 7 + c * 13) % 4;
          floorRT.drawFrame(TEX.FLOOR + variant, undefined, x, y);

          if (tile === 2) {
            // Bush on top — keep as individual Image for depth sorting
            this.add.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TEX.BUSH).setDepth(15);
          }
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

    // Weapon sprite
    const weaponTex = this.getWeaponTexture(this.config.weapon);
    this.playerWeapon = this.add.image(x + 20, y, weaponTex);
    this.playerWeapon.setDepth(21);

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

    const weapon = this.add.image(state.x + 20, state.y, TEX.WEAPON_SWORD).setDepth(21);

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
      weapon: weapon,
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
    rp.weapon.destroy();
    rp.hpBarBg.destroy();
    rp.hp.destroy();
    rp.nameText.destroy();
    this.remotePlayers.delete(id);
  }

  private getWeaponTexture(weapon: WeaponType): string {
    switch (weapon) {
      case 'sword': return TEX.WEAPON_SWORD;
      case 'spear': return TEX.WEAPON_SPEAR;
      case 'bow': return TEX.WEAPON_BOW;
    }
  }

  update(_time: number, delta: number): void {
    // -- Day/Night --
    const nightAmount = this.dayNight.update(delta);
    if (!this.alive) {
    if (!this.alive) {
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

    // -- Weapon position --
    const weaponDist = PLAYER_RADIUS + 6;
    this.playerWeapon.setPosition(
      this.player.x + Math.cos(input.aimAngle) * weaponDist,
      this.player.y + Math.sin(input.aimAngle) * weaponDist
    );
    this.playerWeapon.setRotation(input.aimAngle);

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

    // -- Attacking --
    const wCfg = WEAPON_CONFIGS[this.config.weapon];
    if (input.shooting && this.time.now - this.lastAttackTime > wCfg.cooldown) {
      this.lastAttackTime = this.time.now;
      if (wCfg.type === 'ranged') {
        this.fireArrow(input.aimAngle);
      } else {
        this.meleeAttack(input.aimAngle);
      }
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
        if (monster.type === 'spitter') continue;
        const dist = Math.hypot(monster.sprite.x - this.player.x, monster.sprite.y - this.player.y);
        if (dist < PLAYER_RADIUS + 12) {
          this.takeDamage(this.monsterManager.getMonsterDamage(mId), 'monster');
        }
      }
    }

    // -- Check bullet collisions with local player --
    const bulletDamage = WEAPON_CONFIGS.bow.damage;
    for (const [bulletId, bullet] of this.remoteBullets) {
      if (!bullet.sprite.active) continue;
      const dist = Math.hypot(bullet.sprite.x - this.player.x, bullet.sprite.y - this.player.y);
      if (dist < PLAYER_RADIUS + BULLET_RADIUS && this.time.now > this.invulnUntil) {
        this.takeDamage(bulletDamage, bullet.ownerId);
        bullet.sprite.destroy();
        this.remoteBullets.delete(bulletId);
      }
    }

    // -- Check local bullet collisions with monsters --
    const weaponDamage = WEAPON_CONFIGS[this.config.weapon].damage;
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
            this.monsterManager.damageMonster(mId, weaponDamage);
          }
          bullet.sprite.destroy();
          if (bullet.rtdbId) this.sync?.removeBullet(bullet.rtdbId);
          this.localBullets.splice(i, 1);
          break;
        }
      }weapo
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
      rp.weapon.setVisible(visible && rp.alive);
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
    this.sync?.syncLocalPlayer({
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

    // -- Stats update (throttled to ~10Hz) --
    if (this.time.now - this.lastStatsTime > 100) {
      this.lastStatsTime = this.time.now;
      let aliveCount = this.alive ? 1 : 0;
      for (const rp of this.remotePlayers.values()) {
        if (rp.alive) aliveCount++;
      }
      this.config.onStatsUpdate(
        this.kills,
        this.monsterManager.getWave(),
        aliveCount,
        this.dayNight.getTimeLabel()
      );
    }
  }

  private fireArrow(angle: number): void {
    const speed = WEAPON_CONFIGS.bow.speed;
    const startX = this.player.x + Math.cos(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const startY = this.player.y + Math.sin(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const sprite = this.add.image(startX, startY, TEX.ARROW).setDepth(18).setRotation(angle);
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

    const bullet: LocalBullet = {
      sprite,
      vx,
      vy,
      ownerId: this.config.playerId,
      src: 'player',
      lifetime: 1500
    };

    this.physics.add.collider(sprite, this.wallGroup, () => {
      sprite.destroy();
      if (bullet.rtdbId) this.sync?.removeBullet(bullet.rtdbId);
      const idx = this.localBullets.indexOf(bullet);
      if (idx !== -1) this.localBullets.splice(idx, 1);
    });

    if (this.sync) {
      bullet.rtdbId = this.sync.fireBullet({
        x: startX,
        y: startY,
        vx,
        vy,
        o: this.config.playerId,
        src: 'player'
      });
    }
    this.localBullets.push(bullet);
  }

  private meleeAttack(angle: number): void {
    const wCfg = WEAPON_CONFIGS[this.config.weapon];
    const range = wCfg.range;
    const damage = wCfg.damage;

    // Visual effect
    const effectTex = this.config.weapon === 'sword' ? TEX.SLASH_EFFECT : TEX.THRUST_EFFECT;
    const effectX = this.player.x + Math.cos(angle) * (PLAYER_RADIUS + range * 0.5);
    const effectY = this.player.y + Math.sin(angle) * (PLAYER_RADIUS + range * 0.5);
    const effect = this.add.image(effectX, effectY, effectTex).setDepth(19).setRotation(angle).setAlpha(0.8);
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 1.3,
      duration: 200,
      onComplete: () => effect.destroy()
    });

    // Damage monsters in range
    if (this.config.isHost) {
      for (const [mId, monster] of this.monsterManager.getMonsters()) {
        const dist = Math.hypot(monster.sprite.x - this.player.x, monster.sprite.y - this.player.y);
        if (dist > PLAYER_RADIUS + range) continue;
        const angleToMonster = Math.atan2(monster.sprite.y - this.player.y, monster.sprite.x - this.player.x);
        let angleDiff = Math.abs(angleToMonster - angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const maxAngle = this.config.weapon === 'sword' ? Math.PI / 4 : Math.PI / 8;
        if (angleDiff < maxAngle) {
          this.monsterManager.damageMonster(mId, damage);
        }
      }
    }
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
      const bullet = this.localBullets[i];ARROW
      bullet.lifetime -= delta;

      if (bullet.lifetime <= 0 || !bullet.sprite.active) {
        bullet.sprite.destroy();
        if (bullet.rtdbId) this.sync?.removeBullet(bullet.rtdbId);
        this.localBullets.splice(i, 1);
        continue;
      }

      // Check collision with remote players (for local bullets)
      if (bullet.src === 'player' && bullet.ownerId === this.config.playerId) {
        for (const [id, rp] of this.remotePlayers) {
          if (!rp.alive) continue;
          const dist = Math.hypot(bullet.sprite.x - rp.sprite.x, bullet.sprite.y - rp.sprite.y);
          if (dist < PLAYER_RADIUS + BULLET_RADIUS) {
            bullet.sprite.destroy();
            if (bullet.rtdbId) this.sync?.removeBullet(bullet.rtdbId);
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
    const texKey = data.src === 'monster' ? TEX.BULLET_MONSTER : TEX.ARROW;
    const sprite = this.add.image(data.x, data.y, texKey).setDepth(18);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(
      BULLEweapoRADIUS,
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
weapon.setPosition(
        rp.sprite.x + Math.cos(rp.targetAngle) * gunDist,
        rp.sprite.y + Math.sin(rp.targetAngle) * gunDist
      );
      rp.weapo

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
        rp.weapon.setVisible(false);
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

      // Weapon
      const weaponDist = PLAYER_RADIUS + 6;
      rp.weapon.setPosition(
        rp.sprite.x + Math.cos(rp.targetAngle) * weaponDist,
        rp.sprite.y + Math.sin(rp.targetAngle) * weaponDist
      );Weapo
      rp.weapon.setRotation(rp.targetAngle);

      // HP bar
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
the undead');
      }
    } else {
      this.config.onEliminated('the undead
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
      targets: [this.player, this.playerWeapon],
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 500
    });
    this.playerHpBarBg.setVisible(false);
    this.playerHpBar.setVisible(false);

    this.sync?.reportElimination(this.config.playerId, killerId);

    if (killerId !== 'monster') {
      const rp = this.remotePlayers.get(killerId);
      if (rp) {
        this.config.onEliminated(rp.name);
      } else {
        this.config.onEliminated('the undead');
      }
    } else {
      this.config.onEliminated('the undead');
    }
    this.sync?.syncLocalPlayer({
      x: this.player.x,
      y: this.player.y,
      a: 0,
      hp: 0,
      al: false,
      kills: this.kills,
      name: this.config.playerName
    });

    // In single player, dying = game over
    if (this.config.singlePlayer) {
      this.config.onGameOver(null, null);
    }
  }

  private checkWinCondition(): void {
    // In single player, game over is handled in die()
    if (this.config.singlePlayer) return;

    const allPlayers = new Map<string, boolean>();
    allPlayers.set(this.config.playerId, this.alive);
    for (const [id, rp] of this.remotePlayers) {
      allPlayers.set(id, rp.alive);
    }

    const alivePlayers = Array.from(allPlayers.entries()).filter(([, al]) => al);

    if (alivePlayers.length <= 1 && allPlayers.size > 1) {
      const winnerId = alivePlayers.length === 1 ? alivePlayers[0][0] : null;
      this.sync?.reportGameOver(winnerId);
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
