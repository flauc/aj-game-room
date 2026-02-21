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
import {
  loadSpriteAssets,
  createAnimationsAndTextures,
  TEX,
  PLAYER_COLORS,
  getUnitColor,
  getUnitType,
  getTexKey,
  getUnitScale,
  type WeaponType,
  type UnitColor,
  type UnitType
} from './SpriteGen';
import { DayNightCycle } from './DayNightCycle';

const PLAYER_RADIUS = 14;
const PLAYER_SPEED = 200;
const BULLET_RADIUS = 4;
const MAX_HP = 100;
const INVULN_TIME = 1500;
const ARROW_SCALE = 0.2;

const WEAPON_CONFIGS = {
  sword: { damage: 40, cooldown: 400, range: 45, speed: 0, type: 'melee' as const },
  spear: { damage: 30, cooldown: 500, range: 70, speed: 0, type: 'melee' as const },
  bow: { damage: 25, cooldown: 350, range: 0, speed: 380, type: 'ranged' as const }
};

interface RemotePlayer {
  sprite: Phaser.GameObjects.Sprite;
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
  unitColor: UnitColor;
  unitType: UnitType;
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
  private player!: Phaser.GameObjects.Sprite;
  private playerHpBarBg!: Phaser.GameObjects.Rectangle;
  private playerHpBar!: Phaser.GameObjects.Rectangle;
  private hp = MAX_HP;
  private alive = true;
  private kills = 0;
  private lastAttackTime = 0;
  private invulnUntil = 0;
  private playerColorIndex = 0;
  private lastStatsTime = 0;
  private attackAnimPlaying = false;

  // Unit identity
  private unitColor!: UnitColor;
  private unitType!: UnitType;

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

  preload(): void {
    loadSpriteAssets(this);
  }

  create(): void {
    createAnimationsAndTextures(this);

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    this.wallGroup = this.physics.add.staticGroup();
    this.renderMap();

    this.dayNight = new DayNightCycle(this);
    this.fogOfWar = new FogOfWar(this, 400, 140);
    this.input2 = new InputManager(this);

    if (!this.config.singlePlayer) {
      this.sync = new MultiplayerSync(this.config.roomId, this.config.playerId, this.config.isHost);
    }

    this.monsterManager = new MonsterManager(this, this.sync, this.config.isHost, this.wallGroup);
    this.monsterManager.onMonsterBullet = (x, y, vx, vy) => {
      this.spawnMonsterBullet(x, y, vx, vy);
    };

    const playerIds = Object.keys(this.config.players);
    this.playerColorIndex = playerIds.indexOf(this.config.playerId) % PLAYER_COLORS.length;
    this.unitColor = getUnitColor(playerIds.indexOf(this.config.playerId));
    this.unitType = getUnitType(this.config.weapon);

    for (const [id, p] of Object.entries(this.config.players)) {
      this.playerNames.set(id, p.name);
    }

    const spawnPos = randomFloorTile();
    this.createLocalPlayer(spawnPos.x, spawnPos.y);

    this.sync?.joinGame(this.config.playerName);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.sync?.onRemotePlayers(
      (id, state) => this.addRemotePlayer(id, state),
      (id, state) => this.updateRemotePlayer(id, state),
      (id) => this.removeRemotePlayer(id)
    );

    this.sync?.onBullets(
      (id, bullet) => this.addRemoteBullet(id, bullet),
      (id) => this.removeRemoteBullet(id)
    );

    this.sync?.onEliminations((event) => {
      const killerName = this.playerNames.get(event.killer) || 'Monster';
      const victimName = this.playerNames.get(event.victim) || 'Unknown';
      this.config.onKillFeed(killerName, victimName);
    });

    this.sync?.onWave((wave) => {
      this.monsterManager.setWave(wave);
    });

    this.sync?.onGameOver((winnerId) => {
      const winnerName = winnerId ? this.playerNames.get(winnerId) || null : null;
      this.config.onGameOver(winnerId, winnerName);
    });

    this.monsterManager.begin();
  }

  private renderMap(): void {
    const floorRT = this.add.renderTexture(0, 0, WORLD_W, WORLD_H).setOrigin(0, 0).setDepth(0);

    for (let r = 0; r < MAP_ROWS; r++) {
      for (let c = 0; c < MAP_COLS; c++) {
        const tile = MAP_DATA[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        if (tile === 1) {
          const wall = this.add.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TEX.WALL).setDepth(2);
          this.physics.add.existing(wall, true);
          (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(TILE_SIZE, TILE_SIZE);
          this.wallGroup.add(wall);
        } else {
          const variant = (r * 7 + c * 13) % 4;
          floorRT.drawFrame(TEX.FLOOR + variant, undefined, x, y);

          if (tile === 2) {
            this.add.image(x + TILE_SIZE / 2, y + TILE_SIZE / 2, TEX.BUSH).setDepth(15);
          }
        }
      }
    }
  }

  private createLocalPlayer(x: number, y: number): void {
    const idleKey = getTexKey(this.unitColor, this.unitType, 'idle');
    const scale = getUnitScale(this.unitType);

    this.player = this.add.sprite(x, y, idleKey).setScale(scale).setDepth(20);
    this.player.play(idleKey);

    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const halfFrame = this.player.width / 2;
    const bodyOff = halfFrame - PLAYER_RADIUS / scale;
    body.setCircle(PLAYER_RADIUS, bodyOff, bodyOff);
    body.setCollideWorldBounds(true);

    this.playerHpBarBg = this.add
      .rectangle(x, y - PLAYER_RADIUS - 10, 32, 5, 0x333333)
      .setDepth(22);
    this.playerHpBar = this.add.rectangle(x, y - PLAYER_RADIUS - 10, 32, 5, 0x44ff44).setDepth(23);

    this.physics.add.collider(this.player, this.wallGroup);

    this.invulnUntil = this.time.now + INVULN_TIME;
  }

  private addRemotePlayer(id: string, state: PlayerState): void {
    if (this.remotePlayers.has(id)) return;
    this.playerNames.set(id, state.name);

    const idx = Array.from(this.playerNames.keys()).indexOf(id) % PLAYER_COLORS.length;
    const uColor = getUnitColor(Array.from(this.playerNames.keys()).indexOf(id));
    const weapon = (state.w as WeaponType) || 'sword';
    const uType = getUnitType(weapon);

    const idleKey = getTexKey(uColor, uType, 'idle');
    const scale = getUnitScale(uType);

    const sprite = this.add.sprite(state.x, state.y, idleKey).setScale(scale).setDepth(20);
    sprite.play(idleKey);

    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const halfFrame = sprite.width / 2;
    const bodyOff = halfFrame - PLAYER_RADIUS / scale;
    body.setCircle(PLAYER_RADIUS, bodyOff, bodyOff);

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
      hpBarBg,
      hpBar,
      nameText,
      targetX: state.x,
      targetY: state.y,
      targetAngle: state.a,
      hp: state.hp,
      alive: state.al,
      name: state.name,
      colorIndex: idx,
      unitColor: uColor,
      unitType: uType
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

    // -- Direction: flip sprite horizontally --
    const facingLeft = Math.abs(input.aimAngle) > Math.PI / 2;
    this.player.setFlipX(facingLeft);

    // -- Animation state: idle / run / attack --
    if (!this.attackAnimPlaying) {
      const isMoving = input.moveX !== 0 || input.moveY !== 0;
      const animKey = getTexKey(this.unitColor, this.unitType, isMoving ? 'run' : 'idle');
      if (this.player.anims.currentAnim?.key !== animKey) {
        this.player.play(animKey);
      }
    }

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

      // Play attack animation
      const attackKey = getTexKey(this.unitColor, this.unitType, 'attack');
      this.attackAnimPlaying = true;
      this.player.play(attackKey);
      this.player.once('animationcomplete', () => {
        this.attackAnimPlaying = false;
      });

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
      name: this.config.playerName,
      w: this.config.weapon
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

  // ---- Weapon attacks ----

  private fireArrow(angle: number): void {
    const speed = WEAPON_CONFIGS.bow.speed;
    const startX = this.player.x + Math.cos(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const startY = this.player.y + Math.sin(angle) * (PLAYER_RADIUS + BULLET_RADIUS + 2);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const sprite = this.add
      .image(startX, startY, TEX.ARROW)
      .setDepth(18)
      .setRotation(angle)
      .setScale(ARROW_SCALE);
    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const halfW = sprite.width / 2;
    body.setCircle(BULLET_RADIUS, halfW - BULLET_RADIUS / ARROW_SCALE, halfW - BULLET_RADIUS / ARROW_SCALE);
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

    if (this.config.weapon === 'sword') {
      // Slash trail effect
      const trailCount = 5;
      for (let i = 0; i < trailCount; i++) {
        const trailAngle = angle - Math.PI / 3 + (i / (trailCount - 1)) * ((Math.PI * 2) / 3);
        const trailDist = PLAYER_RADIUS + range * 0.6;
        const tx = this.player.x + Math.cos(trailAngle) * trailDist;
        const ty = this.player.y + Math.sin(trailAngle) * trailDist;
        const trail = this.add
          .image(tx, ty, TEX.SLASH_EFFECT)
          .setDepth(19)
          .setRotation(trailAngle)
          .setAlpha(0.6 - i * 0.08)
          .setScale(0.8);
        this.tweens.add({
          targets: trail,
          alpha: 0,
          scale: 1.2,
          duration: 180 + i * 30,
          onComplete: () => trail.destroy()
        });
      }
    } else {
      // Spear: thrust point effect
      const thrustDist = PLAYER_RADIUS + range;
      const tx = this.player.x + Math.cos(angle) * thrustDist;
      const ty = this.player.y + Math.sin(angle) * thrustDist;
      const thrust = this.add
        .image(tx, ty, TEX.THRUST_EFFECT)
        .setDepth(19)
        .setRotation(angle)
        .setAlpha(0.7);
      this.tweens.add({
        targets: thrust,
        alpha: 0,
        scaleX: 1.5,
        duration: 200,
        onComplete: () => thrust.destroy()
      });
    }

    // Damage monsters in range
    if (this.config.isHost) {
      for (const [mId, monster] of this.monsterManager.getMonsters()) {
        const dist = Math.hypot(
          monster.sprite.x - this.player.x,
          monster.sprite.y - this.player.y
        );
        if (dist > PLAYER_RADIUS + range) continue;
        const angleToMonster = Math.atan2(
          monster.sprite.y - this.player.y,
          monster.sprite.x - this.player.x
        );
        let angleDiff = Math.abs(angleToMonster - angle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
        const maxAngle = this.config.weapon === 'sword' ? Math.PI / 3 : Math.PI / 6;
        if (angleDiff < maxAngle) {
          this.monsterManager.damageMonster(mId, damage);
          monster.sprite.setTint(0xffffff);
          this.time.delayedCall(80, () => {
            if (monster.sprite.active) monster.sprite.clearTint();
          });
        }
      }
    }
  }

  // ---- Bullets ----

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
        if (bullet.rtdbId) this.sync?.removeBullet(bullet.rtdbId);
        this.localBullets.splice(i, 1);
        continue;
      }

      // Check collision with remote players (for local bullets)
      if (bullet.src === 'player' && bullet.ownerId === this.config.playerId) {
        for (const [, rp] of this.remotePlayers) {
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
    const isArrow = data.src !== 'monster';
    const texKey = isArrow ? TEX.ARROW : TEX.BULLET_MONSTER;
    const sprite = this.add.image(data.x, data.y, texKey).setDepth(18);

    if (isArrow) {
      sprite.setScale(ARROW_SCALE);
      sprite.setRotation(Math.atan2(data.vy, data.vx));
    }

    this.physics.add.existing(sprite);
    const body = sprite.body as Phaser.Physics.Arcade.Body;

    if (isArrow) {
      const halfW = sprite.width / 2;
      body.setCircle(BULLET_RADIUS, halfW - BULLET_RADIUS / ARROW_SCALE, halfW - BULLET_RADIUS / ARROW_SCALE);
    } else {
      body.setCircle(
        BULLET_RADIUS,
        sprite.width / 2 - BULLET_RADIUS,
        sprite.height / 2 - BULLET_RADIUS
      );
    }

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

  // ---- Remote player rendering ----

  private updateRemotePlayers(): void {
    for (const [, rp] of this.remotePlayers) {
      if (!rp.alive) {
        rp.sprite.setVisible(false);
        rp.hpBarBg.setVisible(false);
        rp.hpBar.setVisible(false);
        rp.nameText.setVisible(false);
        continue;
      }

      const dx = rp.targetX - rp.sprite.x;
      const dy = rp.targetY - rp.sprite.y;
      rp.sprite.x += dx * 0.2;
      rp.sprite.y += dy * 0.2;

      // Flip based on aim direction
      rp.sprite.setFlipX(Math.abs(rp.targetAngle) > Math.PI / 2);

      // Idle/run animation
      const isMoving = Math.abs(dx) > 1 || Math.abs(dy) > 1;
      const animKey = getTexKey(rp.unitColor, rp.unitType, isMoving ? 'run' : 'idle');
      if (rp.sprite.anims.currentAnim?.key !== animKey) {
        rp.sprite.play(animKey);
      }

      rp.hpBarBg.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 10);
      rp.hpBar.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 10);
      const ratio = Math.max(0, rp.hp / MAX_HP);
      rp.hpBar.setScale(ratio, 1);
      rp.hpBar.setFillStyle(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff2222);

      rp.nameText.setPosition(rp.sprite.x, rp.sprite.y - PLAYER_RADIUS - 20);
    }
  }

  // ---- Damage & Death ----

  private takeDamage(amount: number, source: string): void {
    if (!this.alive || this.time.now < this.invulnUntil) return;

    this.hp -= amount;
    this.invulnUntil = this.time.now + 300;

    this.cameras.main.shake(100, 0.005);
    this.cameras.main.flash(80, 180, 40, 40);

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

    this.tweens.add({
      targets: this.player,
      alpha: 0,
      scaleX: 0.05,
      scaleY: 0.05,
      duration: 500
    });
    this.playerHpBarBg.setVisible(false);
    this.playerHpBar.setVisible(false);

    this.sync?.reportElimination(this.config.playerId, killerId);

    if (killerId !== 'monster') {
      const rp = this.remotePlayers.get(killerId);
      this.config.onEliminated(rp ? rp.name : 'the undead');
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
      name: this.config.playerName,
      w: this.config.weapon
    });

    if (this.config.singlePlayer) {
      this.config.onGameOver(null, null);
    }
  }

  private checkWinCondition(): void {
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
