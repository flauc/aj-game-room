import Phaser from 'phaser';

/**
 * Sprite asset management — loads Tiny Swords sprite sheets for player units,
 * generates procedural textures for monsters, environment, and effects.
 */

export type WeaponType = 'sword' | 'spear' | 'bow';

/* ---- Unit color system (5 colors from Tiny Swords pack) ---- */

export const UNIT_COLORS = ['red', 'blue', 'yellow', 'purple', 'black'] as const;
export type UnitColor = (typeof UNIT_COLORS)[number];

export type UnitType = 'warrior' | 'archer' | 'lancer';

const WEAPON_TO_UNIT: Record<WeaponType, UnitType> = {
  sword: 'warrior',
  spear: 'lancer',
  bow: 'archer'
};

export function getUnitColor(playerIndex: number): UnitColor {
  return UNIT_COLORS[playerIndex % UNIT_COLORS.length];
}

export function getUnitType(weapon: WeaponType): UnitType {
  return WEAPON_TO_UNIT[weapon];
}

/** Build a texture/animation key like "red_warrior_idle" */
export function getTexKey(color: UnitColor, unit: UnitType, anim: string): string {
  return `${color}_${unit}_${anim}`;
}

/* ---- Sprite sheet frame configs ---- */

interface SheetConfig {
  anim: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
}

const UNIT_SHEETS: Record<UnitType, SheetConfig[]> = {
  warrior: [
    { anim: 'idle', frameWidth: 192, frameHeight: 192, frameCount: 8 },
    { anim: 'run', frameWidth: 192, frameHeight: 192, frameCount: 6 },
    { anim: 'attack', frameWidth: 192, frameHeight: 192, frameCount: 4 }
  ],
  archer: [
    { anim: 'idle', frameWidth: 192, frameHeight: 192, frameCount: 6 },
    { anim: 'run', frameWidth: 192, frameHeight: 192, frameCount: 4 },
    { anim: 'attack', frameWidth: 192, frameHeight: 192, frameCount: 8 }
  ],
  lancer: [
    { anim: 'idle', frameWidth: 320, frameHeight: 320, frameCount: 12 },
    { anim: 'run', frameWidth: 320, frameHeight: 320, frameCount: 6 },
    { anim: 'attack', frameWidth: 320, frameHeight: 320, frameCount: 3 }
  ]
};

const ANIM_FILE: Record<UnitType, Record<string, string>> = {
  warrior: { idle: 'warrior_idle.png', run: 'warrior_run.png', attack: 'warrior_attack.png' },
  archer: { idle: 'archer_idle.png', run: 'archer_run.png', attack: 'archer_shoot.png' },
  lancer: { idle: 'lancer_idle.png', run: 'lancer_run.png', attack: 'lancer_attack.png' }
};

/* ---- Display scale constants ---- */

/** Target display height in game pixels for a unit sprite */
export const UNIT_DISPLAY_SIZE = 56;

/** Scale to apply for standard (192px) unit frames */
export const SCALE_STANDARD = UNIT_DISPLAY_SIZE / 192;

/** Scale to apply for lancer (320px) unit frames */
export const SCALE_LANCER = UNIT_DISPLAY_SIZE / 320;

export function getUnitScale(unit: UnitType): number {
  return unit === 'lancer' ? SCALE_LANCER : SCALE_STANDARD;
}

/* ---- Procedural texture keys (monsters, environment, effects) ---- */

export const TEX = {
  CRAWLER: 'crawler',
  SPITTER: 'spitter',
  BOSS: 'boss',
  ARROW: 'ts_arrow',
  BULLET_MONSTER: 'bullet_monster',
  WALL: 'wall',
  FLOOR: 'floor_',
  BUSH: 'bush',
  SPAWN_HOLE: 'spawn_hole',
  SLASH_EFFECT: 'slash_effect',
  THRUST_EFFECT: 'thrust_effect'
} as const;

/* Keep PLAYER_COLORS for backward compat (HP bar colors, etc.) */
export const PLAYER_COLORS = [0xc9302c, 0x2e7d32, 0xb8860b, 0x6a1b9a, 0x1a1a1a];

/* ===========================================================
   PUBLIC API
   =========================================================== */

/**
 * Call in scene.preload() — queues all sprite sheet + image loads.
 */
export function loadSpriteAssets(scene: Phaser.Scene): void {
  // Arrow image
  scene.load.image(TEX.ARROW, '/sprites/arrow.png');

  // Unit sprite sheets — all colors x all unit types x all anims
  for (const color of UNIT_COLORS) {
    for (const unit of ['warrior', 'archer', 'lancer'] as UnitType[]) {
      const sheets = UNIT_SHEETS[unit];
      for (const sheet of sheets) {
        const key = getTexKey(color, unit, sheet.anim);
        const path = `/sprites/${color}/${ANIM_FILE[unit][sheet.anim]}`;
        scene.load.spritesheet(key, path, {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight
        });
      }
    }
  }
}

/**
 * Call in scene.create() after load completes — registers Phaser animations
 * and generates procedural textures for monsters/environment.
 */
export function createAnimationsAndTextures(scene: Phaser.Scene): void {
  // 1. Register animations for all unit sprite sheets
  for (const color of UNIT_COLORS) {
    for (const unit of ['warrior', 'archer', 'lancer'] as UnitType[]) {
      const sheets = UNIT_SHEETS[unit];
      for (const sheet of sheets) {
        const key = getTexKey(color, unit, sheet.anim);
        const isAttack = sheet.anim === 'attack';
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, {
            start: 0,
            end: sheet.frameCount - 1
          }),
          frameRate: isAttack ? 14 : sheet.anim === 'run' ? 10 : 8,
          repeat: isAttack ? 0 : -1 // attacks play once, idle/run loop
        });
      }
    }
  }

  // 2. Generate procedural textures
  generateCrawlerTexture(scene);
  generateSpitterTexture(scene);
  generateBossTexture(scene);
  generateMonsterBulletTexture(scene);
  generateWallTexture(scene);
  generateFloorTextures(scene);
  generateBushTexture(scene);
  generateSpawnHoleTexture(scene);
  generateSlashEffectTexture(scene);
  generateThrustEffectTexture(scene);
}

/* ===========================================================
   PROCEDURAL TEXTURES — monsters, tiles, effects
   =========================================================== */

function lighten(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount);
  const g = Math.min(255, ((color >> 8) & 0xff) + amount);
  const b = Math.min(255, (color & 0xff) + amount);
  return (r << 16) | (g << 8) | b;
}

function darken(color: number, amount: number): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - amount);
  const g = Math.max(0, ((color >> 8) & 0xff) - amount);
  const b = Math.max(0, (color & 0xff) - amount);
  return (r << 16) | (g << 8) | b;
}

/* --- Monsters --- */

function generateCrawlerTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 30;
  const cx = size / 2;
  const cy = size / 2;

  g.fillStyle(0x000000, 0.15);
  g.fillEllipse(cx, cy + 3, 24, 10);

  g.fillStyle(0x2e4a2e);
  g.fillEllipse(cx, cy, 24, 20);
  g.fillStyle(0x3e5e3e);
  g.fillEllipse(cx, cy, 20, 16);

  g.fillStyle(0x1a2a1a, 0.5);
  g.fillCircle(cx - 4, cy + 3, 4);
  g.fillCircle(cx + 5, cy - 1, 3);

  g.lineStyle(1, 0xa0a080, 0.3);
  g.beginPath();
  g.moveTo(cx - 3, cy - 2);
  g.lineTo(cx - 5, cy + 1);
  g.moveTo(cx - 1, cy - 2);
  g.lineTo(cx - 3, cy + 1);
  g.strokePath();

  g.lineStyle(3.5, 0x3a5a3a);
  g.beginPath();
  g.moveTo(cx + 8, cy - 5);
  g.lineTo(cx + 15, cy - 7);
  g.moveTo(cx + 8, cy + 5);
  g.lineTo(cx + 15, cy + 7);
  g.strokePath();

  g.lineStyle(1.2, 0x2a3a2a);
  g.beginPath();
  g.moveTo(cx + 15, cy - 7);
  g.lineTo(cx + 17, cy - 10);
  g.moveTo(cx + 15, cy - 7);
  g.lineTo(cx + 18, cy - 7);
  g.moveTo(cx + 15, cy - 7);
  g.lineTo(cx + 17, cy - 4);
  g.moveTo(cx + 15, cy + 7);
  g.lineTo(cx + 17, cy + 4);
  g.moveTo(cx + 15, cy + 7);
  g.lineTo(cx + 18, cy + 7);
  g.moveTo(cx + 15, cy + 7);
  g.lineTo(cx + 17, cy + 10);
  g.strokePath();

  g.fillStyle(0x3a5a3a);
  g.fillCircle(cx + 3, cy, 5);
  g.fillStyle(0x4a6a4a);
  g.fillCircle(cx + 3, cy, 4);

  g.fillStyle(0xff1111);
  g.fillCircle(cx + 6, cy - 2, 2);
  g.fillCircle(cx + 6, cy + 2, 2);
  g.fillStyle(0xff3333, 0.2);
  g.fillCircle(cx + 6, cy - 2, 3.5);
  g.fillCircle(cx + 6, cy + 2, 3.5);
  g.fillStyle(0xff8888, 0.8);
  g.fillCircle(cx + 6.5, cy - 2, 0.8);
  g.fillCircle(cx + 6.5, cy + 2, 0.8);

  g.generateTexture(TEX.CRAWLER, size, size);
  g.destroy();
}

function generateSpitterTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 26;
  const cx = size / 2;
  const cy = size / 2;

  g.fillStyle(0x44ff22, 0.08);
  g.fillCircle(cx, cy, 13);

  g.fillStyle(0x1e3e1e);
  g.fillCircle(cx, cy, 11);
  g.fillStyle(0x2a4e2a);
  g.fillCircle(cx, cy, 9);

  g.lineStyle(0.7, 0x44aa22, 0.3);
  g.beginPath();
  g.moveTo(cx - 5, cy - 4);
  g.lineTo(cx - 7, cy - 7);
  g.moveTo(cx + 3, cy + 5);
  g.lineTo(cx + 6, cy + 7);
  g.strokePath();

  g.fillStyle(0x66cc22, 0.7);
  g.fillCircle(cx - 4, cy + 4, 3);
  g.fillCircle(cx + 3, cy + 5, 2.5);
  g.fillStyle(0xaaff44, 0.3);
  g.fillCircle(cx - 4.5, cy + 3, 1.5);

  g.fillStyle(0xccff00);
  g.fillCircle(cx + 5, cy - 1, 3.5);
  g.fillStyle(0x000000);
  g.fillCircle(cx + 5.5, cy - 1, 1.8);
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(cx + 4, cy - 2, 0.8);

  g.lineStyle(1.5, 0x44cc11, 0.7);
  g.beginPath();
  g.moveTo(cx + 8, cy + 2);
  g.lineTo(cx + 10, cy + 6);
  g.moveTo(cx + 9, cy + 1);
  g.lineTo(cx + 12, cy + 4);
  g.strokePath();

  g.generateTexture(TEX.SPITTER, size, size);
  g.destroy();
}

function generateBossTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 52;
  const cx = size / 2;
  const cy = size / 2;

  g.fillStyle(0x6622aa, 0.08);
  g.fillCircle(cx, cy, 26);
  g.lineStyle(1.5, 0x8833cc, 0.15);
  g.strokeCircle(cx, cy, 24);

  g.fillStyle(0x0e0620);
  g.fillCircle(cx, cy, 21);
  g.fillStyle(0x1a0a30);
  g.fillCircle(cx, cy, 18);

  g.lineStyle(1.5, 0x08030e, 0.6);
  g.beginPath();
  g.moveTo(cx - 2, cy - 17);
  g.lineTo(cx - 4, cy + 17);
  g.moveTo(cx + 3, cy - 16);
  g.lineTo(cx + 5, cy + 17);
  g.moveTo(cx - 12, cy - 4);
  g.lineTo(cx - 9, cy + 16);
  g.moveTo(cx + 12, cy - 4);
  g.lineTo(cx + 9, cy + 16);
  g.strokePath();

  g.lineStyle(2.5, 0x8a7a66);
  g.beginPath();
  g.moveTo(cx - 15, cy - 14);
  g.lineTo(cx - 11, cy + 16);
  g.strokePath();

  g.fillStyle(0xccbbaa);
  g.fillCircle(cx - 15, cy - 14, 4);
  g.fillStyle(0xbb44ff, 0.5);
  g.fillCircle(cx - 15, cy - 14, 5);
  g.fillStyle(0xdd66ff, 0.3);
  g.fillCircle(cx - 16, cy - 15, 2);

  g.fillStyle(0x0e0620);
  g.beginPath();
  g.arc(cx + 2, cy - 8, 10, Math.PI, 0, false);
  g.closePath();
  g.fill();

  g.fillStyle(0xbbbb99);
  g.fillCircle(cx + 2, cy - 4, 7.5);
  g.fillStyle(0xddddbb);
  g.fillCircle(cx + 2, cy - 5, 6);

  g.fillStyle(0x0e0620);
  g.fillCircle(cx + 4, cy - 7, 2.8);
  g.fillCircle(cx + 4, cy - 2, 2.8);

  g.fillStyle(0xcc44ff);
  g.fillCircle(cx + 4, cy - 7, 1.5);
  g.fillCircle(cx + 4, cy - 2, 1.5);
  g.fillStyle(0xee88ff, 0.4);
  g.fillCircle(cx + 4, cy - 7, 2.5);
  g.fillCircle(cx + 4, cy - 2, 2.5);

  g.lineStyle(0.7, 0x9944dd, 0.15);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.strokeCircle(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20, 2);
  }

  g.generateTexture(TEX.BOSS, size, size);
  g.destroy();
}

/* --- Projectiles --- */

function generateMonsterBulletTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 14;
  const cx = size / 2;
  const cy = size / 2;
  g.fillStyle(0x44ff22, 0.12);
  g.fillCircle(cx, cy, 7);
  g.fillStyle(0x22bb11);
  g.fillCircle(cx, cy, 4);
  g.fillStyle(0x33dd11);
  g.fillCircle(cx, cy, 3);
  g.fillStyle(0x88ff44, 0.6);
  g.fillCircle(cx - 0.5, cy - 0.5, 1.5);
  g.generateTexture(TEX.BULLET_MONSTER, size, size);
  g.destroy();
}

/* --- Terrain --- */

function generateWallTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;
  g.fillStyle(0x4a423a);
  g.fillRect(0, 0, s, s);

  const blocks = [
    { x: 0, y: 0, w: 24, h: 16, c: 0x554d45 },
    { x: 25, y: 0, w: 25, h: 16, c: 0x504840 },
    { x: 0, y: 17, w: 16, h: 16, c: 0x504840 },
    { x: 17, y: 17, w: 16, h: 16, c: 0x585048 },
    { x: 34, y: 17, w: 16, h: 16, c: 0x4e463e },
    { x: 0, y: 34, w: 25, h: 16, c: 0x585048 },
    { x: 26, y: 34, w: 24, h: 16, c: 0x524a42 }
  ];

  for (const b of blocks) {
    g.fillStyle(b.c);
    g.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    g.fillStyle(lighten(b.c, 15), 0.3);
    g.fillRect(b.x + 1, b.y + 1, b.w - 2, 1);
    g.fillRect(b.x + 1, b.y + 1, 1, b.h - 2);
    g.fillStyle(darken(b.c, 20), 0.4);
    g.fillRect(b.x + 1, b.y + b.h - 2, b.w - 2, 1);
    g.fillRect(b.x + b.w - 2, b.y + 1, 1, b.h - 2);
  }

  g.lineStyle(1, 0x3a332e, 0.7);
  g.beginPath();
  g.moveTo(0, 16);
  g.lineTo(s, 16);
  g.moveTo(0, 33);
  g.lineTo(s, 33);
  g.moveTo(24, 0);
  g.lineTo(24, 16);
  g.moveTo(16, 17);
  g.lineTo(16, 33);
  g.moveTo(33, 17);
  g.lineTo(33, 33);
  g.moveTo(25, 34);
  g.lineTo(25, s);
  g.strokePath();

  g.fillStyle(0x3a5a2a, 0.25);
  g.fillCircle(6, 42, 3);
  g.fillCircle(40, 8, 2.5);

  g.generateTexture(TEX.WALL, s, s);
  g.destroy();
}

function generateFloorTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < 4; v++) {
    const g = scene.add.graphics();
    const s = 50;
    const bases = [0x382c1c, 0x352918, 0x3b2e1e, 0x332716];
    g.fillStyle(bases[v]);
    g.fillRect(0, 0, s, s);

    const stoneOffsets = [
      [5, 5, 12, 10],
      [20, 3, 14, 11],
      [38, 6, 10, 9],
      [3, 18, 11, 13],
      [16, 16, 13, 12],
      [32, 18, 15, 11],
      [6, 34, 14, 12],
      [23, 33, 12, 13],
      [38, 35, 10, 11]
    ];
    for (const [sx, sy, sw, sh] of stoneOffsets) {
      const shiftX = (v * 7 + sx) % s;
      const shade = ((sx + sy + v * 3) % 5) - 2;
      g.fillStyle(lighten(bases[v], 4 + shade), 0.3);
      g.fillRoundedRect(shiftX, sy, sw - 1, sh - 1, 1);
    }

    g.fillStyle(0x4a3e2e, 0.3);
    const pebbles = [[8, 12], [30, 8], [15, 35], [38, 28], [22, 44], [42, 42]];
    for (const [px, py] of pebbles) {
      g.fillCircle((px + v * 7) % s, (py + v * 11) % s, 1);
    }

    if (v < 2) {
      g.fillStyle(0x3a4a2a, 0.2);
      g.fillRect(10 + v * 12, 20 + v * 5, 3, 2);
    }

    g.generateTexture(TEX.FLOOR + v, s, s);
    g.destroy();
  }
}

function generateBushTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;
  g.fillStyle(0x1a1208, 0.9);
  g.fillRect(0, 0, s, s);

  const clusters = [
    { x: 12, y: 10, r: 10 },
    { x: 32, y: 8, r: 9 },
    { x: 22, y: 22, r: 12 },
    { x: 8, y: 30, r: 8 },
    { x: 38, y: 28, r: 9 },
    { x: 18, y: 38, r: 10 },
    { x: 35, y: 40, r: 8 }
  ];

  for (const c of clusters) {
    g.fillStyle(0x0a0804, 0.4);
    g.fillCircle(c.x + 1, c.y + 2, c.r);
  }
  for (const c of clusters) {
    g.fillStyle(0x1e3a12);
    g.fillCircle(c.x, c.y, c.r);
    g.fillStyle(0x2a5a1a, 0.6);
    g.fillCircle(c.x, c.y, c.r * 0.7);
    g.fillStyle(0x3a7a2a, 0.25);
    g.fillCircle(c.x - 1, c.y - 2, c.r * 0.4);
  }

  g.lineStyle(1, 0x2a4a1a, 0.2);
  g.strokeRect(0, 0, s, s);
  g.generateTexture(TEX.BUSH, s, s);
  g.destroy();
}

/* --- Effects --- */

function generateSpawnHoleTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 34;
  const cx = size / 2;
  const cy = size / 2;

  g.fillStyle(0x000000, 0.85);
  g.fillCircle(cx, cy, 15);
  g.fillStyle(0x1a0e05, 0.6);
  g.fillCircle(cx, cy, 12);
  g.fillStyle(0x2a1a0a, 0.4);
  g.fillCircle(cx, cy, 8);

  g.lineStyle(2, 0x3a2a15, 0.5);
  g.strokeCircle(cx, cy, 14);

  g.lineStyle(1.2, 0x4a3a1a, 0.5);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 5);
    g.lineTo(cx + Math.cos(angle) * 15, cy + Math.sin(angle) * 15);
    g.strokePath();
  }

  g.fillStyle(0x3d5c3d, 0.6);
  g.fillRect(cx - 2, cy - 10, 4, 8);
  g.fillStyle(0x3d5c3d, 0.5);
  g.fillRect(cx - 4, cy - 12, 2, 4);
  g.fillRect(cx - 1, cy - 13, 2, 5);
  g.fillRect(cx + 2, cy - 11, 2, 4);

  g.generateTexture(TEX.SPAWN_HOLE, size, size);
  g.destroy();
}

function generateSlashEffectTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 44;
  const cx = size / 2;
  const cy = size / 2;

  g.lineStyle(4, 0xffffff, 0.5);
  g.beginPath();
  g.arc(cx, cy, 18, -Math.PI * 0.4, Math.PI * 0.4, false);
  g.strokePath();

  g.lineStyle(2.5, 0xeeeeff, 0.7);
  g.beginPath();
  g.arc(cx, cy, 16, -Math.PI * 0.35, Math.PI * 0.35, false);
  g.strokePath();

  g.fillStyle(0xffffcc, 0.4);
  g.fillCircle(cx + 14, cy - 10, 1.5);
  g.fillCircle(cx + 16, cy + 8, 1);

  g.generateTexture(TEX.SLASH_EFFECT, size, size);
  g.destroy();
}

function generateThrustEffectTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 32;
  const h = 10;

  g.fillStyle(0xffffff, 0.3);
  g.fillRect(0, 4, 28, 2);
  g.fillStyle(0xeeeeff, 0.2);
  g.fillRect(2, 3, 24, 1);
  g.fillRect(2, 6, 24, 1);

  g.fillStyle(0xcccccc, 0.4);
  g.fillTriangle(26, 1, 32, 5, 26, 9);

  g.fillStyle(0xffffcc, 0.3);
  g.fillCircle(30, 2, 1);
  g.fillCircle(31, 7, 1);

  g.generateTexture(TEX.THRUST_EFFECT, w, h);
  g.destroy();
}
