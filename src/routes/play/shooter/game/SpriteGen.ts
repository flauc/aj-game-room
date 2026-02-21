import Phaser from 'phaser';

/**
 * Procedurally generates all game textures using Phaser Graphics.
 * Call generateAllTextures(scene) once during scene.create().
 */

export type WeaponType = 'sword' | 'spear' | 'bow';

const TEX = {
  PLAYER: 'player_',
  WEAPON_SWORD: 'weapon_sword',
  WEAPON_SPEAR: 'weapon_spear',
  WEAPON_BOW: 'weapon_bow',
  CRAWLER: 'crawler',
  SPITTER: 'spitter',
  BOSS: 'boss',
  ARROW: 'arrow',
  BULLET_MONSTER: 'bullet_monster',
  WALL: 'wall',
  FLOOR: 'floor_',
  BUSH: 'bush',
  SPAWN_HOLE: 'spawn_hole',
  SLASH_EFFECT: 'slash_effect',
  THRUST_EFFECT: 'thrust_effect'
} as const;

export { TEX };

const PLAYER_COLORS = [
  0x8b6914, 0xc9302c, 0x2e7d32, 0xb8860b, 0x6a1b9a, 0x00695c, 0xad1457, 0xd84315
];

export { PLAYER_COLORS };

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

export function generateAllTextures(scene: Phaser.Scene): void {
  // --- Players (one per color) ---
  for (let i = 0; i < PLAYER_COLORS.length; i++) {
    generatePlayerTexture(scene, i, PLAYER_COLORS[i]);
  }

  // --- Weapons ---
  generateSwordTexture(scene);
  generateSpearTexture(scene);
  generateBowTexture(scene);

  // --- Monsters (zombies) ---
  generateCrawlerTexture(scene);
  generateSpitterTexture(scene);
  generateBossTexture(scene);

  // --- Projectiles ---
  generateArrowTexture(scene);
  generateMonsterBulletTexture(scene);

  // --- Tiles ---
  generateWallTexture(scene);
  generateFloorTextures(scene);
  generateBushTexture(scene);

  // --- Effects ---
  generateSpawnHoleTexture(scene);
  generateSlashEffectTexture(scene);
  generateThrustEffectTexture(scene);
}

function generatePlayerTexture(scene: Phaser.Scene, index: number, color: number): void {
  const g = scene.add.graphics();
  const size = 32;
  const cx = size / 2;
  const cy = size / 2;

  // Body — brown tunic circle
  g.fillStyle(darken(color, 30));
  g.fillCircle(cx, cy, 14);
  g.fillStyle(color);
  g.fillCircle(cx, cy, 12);

  // Tunic highlight
  g.fillStyle(lighten(color, 40), 0.3);
  g.fillCircle(cx - 3, cy - 3, 5);

  // Belt
  g.lineStyle(2, darken(color, 60));
  g.beginPath();
  g.moveTo(cx - 10, cy + 3);
  g.lineTo(cx + 10, cy + 3);
  g.strokePath();

  // Head (skin tone)
  g.fillStyle(0xdeb887);
  g.fillCircle(cx, cy - 5, 6);
  g.fillStyle(0xf5deb3, 0.3);
  g.fillCircle(cx - 1, cy - 6, 3);

  // Hood/cap
  g.fillStyle(darken(color, 50));
  g.beginPath();
  g.arc(cx, cy - 7, 7, Math.PI, 0, false);
  g.fill();

  // Eyes
  g.fillStyle(0x333333);
  g.fillCircle(cx + 3, cy - 6, 1.2);
  g.fillCircle(cx + 3, cy - 3, 1.2);

  g.generateTexture(TEX.PLAYER + index, size, size);
  g.destroy();
}

function generateSwordTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 22;
  const h = 10;

  // Blade
  g.fillStyle(0xc0c0c0);
  g.fillRect(6, 3, 14, 4);
  g.fillStyle(0xe8e8e8);
  g.fillRect(7, 4, 12, 2);

  // Blade tip
  g.fillStyle(0xd0d0d0);
  g.fillTriangle(20, 3, 22, 5, 20, 7);

  // Crossguard
  g.fillStyle(0xb8860b);
  g.fillRect(4, 1, 3, 8);

  // Handle
  g.fillStyle(0x5c3317);
  g.fillRect(0, 3, 5, 4);

  g.generateTexture(TEX.WEAPON_SWORD, w, h);
  g.destroy();
}

function generateSpearTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 28;
  const h = 8;

  // Shaft
  g.fillStyle(0x8b6914);
  g.fillRect(0, 3, 22, 2);

  // Spearhead
  g.fillStyle(0xaaaaaa);
  g.fillTriangle(20, 1, 28, 4, 20, 7);
  g.fillStyle(0xcccccc, 0.5);
  g.fillTriangle(21, 2, 26, 4, 21, 6);

  g.generateTexture(TEX.WEAPON_SPEAR, w, h);
  g.destroy();
}

function generateBowTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 16;
  const h = 16;
  const cx = w / 2;
  const cy = h / 2;

  // Bow arc
  g.lineStyle(2.5, 0x8b4513);
  g.beginPath();
  g.arc(cx - 2, cy, 6, -Math.PI * 0.4, Math.PI * 0.4, false);
  g.strokePath();

  // Bowstring
  g.lineStyle(1, 0xccccaa);
  g.beginPath();
  const topY = cy - Math.sin(Math.PI * 0.4) * 6;
  const botY = cy + Math.sin(Math.PI * 0.4) * 6;
  const bowX = cx - 2 + Math.cos(Math.PI * 0.4) * 6;
  g.moveTo(bowX, topY);
  g.lineTo(cx + 4, cy);
  g.lineTo(bowX, botY);
  g.strokePath();

  g.generateTexture(TEX.WEAPON_BOW, w, h);
  g.destroy();
}

function generateCrawlerTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 28;
  const cx = size / 2;
  const cy = size / 2;

  // Zombie shambler body — rotting green-gray
  g.fillStyle(0x3d5c3d);
  g.fillCircle(cx, cy, 12);
  g.fillStyle(0x5a7a5a);
  g.fillCircle(cx, cy, 10);

  // Tattered look — dark patches
  g.fillStyle(0x2a3a2a, 0.6);
  g.fillCircle(cx - 3, cy + 2, 4);
  g.fillCircle(cx + 4, cy - 1, 3);

  // Reaching arms
  g.lineStyle(3, 0x4a6a4a);
  g.beginPath();
  g.moveTo(cx + 8, cy - 3);
  g.lineTo(cx + 14, cy - 5);
  g.moveTo(cx + 8, cy + 3);
  g.lineTo(cx + 14, cy + 5);
  g.strokePath();

  // Clawed fingers
  g.lineStyle(1.5, 0x3d5c3d);
  g.beginPath();
  g.moveTo(cx + 14, cy - 5);
  g.lineTo(cx + 16, cy - 7);
  g.moveTo(cx + 14, cy + 5);
  g.lineTo(cx + 16, cy + 7);
  g.strokePath();

  // Glowing red eyes
  g.fillStyle(0xff2222);
  g.fillCircle(cx + 5, cy - 3, 2);
  g.fillCircle(cx + 5, cy + 3, 2);
  g.fillStyle(0xff8888, 0.5);
  g.fillCircle(cx + 5, cy - 3, 1);
  g.fillCircle(cx + 5, cy + 3, 1);

  g.generateTexture(TEX.CRAWLER, size, size);
  g.destroy();
}

function generateSpitterTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 24;
  const cx = size / 2;
  const cy = size / 2;

  // Bloated zombie — sickly green
  g.fillStyle(0x2d5a2d);
  g.fillCircle(cx, cy, 10);
  g.fillStyle(0x447744);
  g.fillCircle(cx, cy, 8);

  // Toxic ooze glow
  g.fillStyle(0x66ff33, 0.2);
  g.fillCircle(cx, cy, 9);
  g.fillStyle(0x88ff44, 0.15);
  g.fillCircle(cx - 2, cy - 2, 5);

  // Pustules
  g.fillStyle(0x99cc33, 0.6);
  g.fillCircle(cx - 3, cy + 3, 2.5);
  g.fillCircle(cx + 2, cy + 4, 2);
  g.fillCircle(cx - 4, cy - 1, 1.8);

  // Single glowing eye
  g.fillStyle(0xffff00);
  g.fillCircle(cx + 4, cy, 3);
  g.fillStyle(0x000000);
  g.fillCircle(cx + 5, cy, 1.3);

  // Dripping mouth
  g.lineStyle(1.5, 0x66cc22);
  g.beginPath();
  g.moveTo(cx + 7, cy + 2);
  g.lineTo(cx + 10, cy + 5);
  g.moveTo(cx + 8, cy + 1);
  g.lineTo(cx + 11, cy + 3);
  g.strokePath();

  g.generateTexture(TEX.SPITTER, size, size);
  g.destroy();
}

function generateBossTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 48;
  const cx = size / 2;
  const cy = size / 2;

  // Necromancer — dark robed figure
  g.fillStyle(0x1a0a2e);
  g.fillCircle(cx, cy, 22);
  g.fillStyle(0x2d1b4e);
  g.fillCircle(cx, cy, 19);

  // Robe folds
  g.lineStyle(1.5, 0x1a0a2e);
  g.beginPath();
  g.moveTo(cx, cy - 18);
  g.lineTo(cx, cy + 18);
  g.moveTo(cx - 12, cy - 6);
  g.lineTo(cx - 8, cy + 16);
  g.moveTo(cx + 12, cy - 6);
  g.lineTo(cx + 8, cy + 16);
  g.strokePath();

  // Purple magic aura
  g.fillStyle(0x9933ff, 0.15);
  g.fillCircle(cx, cy, 23);
  g.lineStyle(1.5, 0x7722cc, 0.3);
  g.strokeCircle(cx, cy, 20);

  // Skull face
  g.fillStyle(0xccccaa);
  g.fillCircle(cx + 2, cy - 4, 7);
  g.fillStyle(0x1a0a2e);
  // Eye sockets
  g.fillCircle(cx + 4, cy - 6, 2.5);
  g.fillCircle(cx + 4, cy - 1, 2.5);
  // Nose
  g.fillTriangle(cx + 7, cy - 5, cx + 7, cy - 2, cx + 9, cy - 3.5);

  // Glowing eyes inside sockets
  g.fillStyle(0xcc44ff);
  g.fillCircle(cx + 4, cy - 6, 1.2);
  g.fillCircle(cx + 4, cy - 1, 1.2);

  // Staff/bones floating
  g.lineStyle(2, 0x887766);
  g.beginPath();
  g.moveTo(cx - 14, cy - 10);
  g.lineTo(cx - 10, cy + 14);
  g.strokePath();
  g.fillStyle(0xccbbaa);
  g.fillCircle(cx - 14, cy - 10, 3);

  // Purple magic orb on staff
  g.fillStyle(0xbb44ff, 0.6);
  g.fillCircle(cx - 14, cy - 10, 2);

  g.generateTexture(TEX.BOSS, size, size);
  g.destroy();
}

function generateArrowTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 14;
  const h = 6;

  // Shaft
  g.fillStyle(0x8b6914);
  g.fillRect(0, 2, 10, 2);

  // Arrowhead
  g.fillStyle(0xaaaaaa);
  g.fillTriangle(9, 0, 14, 3, 9, 6);

  // Fletching
  g.fillStyle(0xcc3333, 0.7);
  g.fillTriangle(0, 1, 3, 3, 0, 5);

  g.generateTexture(TEX.ARROW, w, h);
  g.destroy();
}

function generateMonsterBulletTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 14;
  // Green toxic glob
  g.fillStyle(0x44ff22, 0.2);
  g.fillCircle(size / 2, size / 2, 6);
  g.fillStyle(0x33cc11);
  g.fillCircle(size / 2, size / 2, 4);
  g.fillStyle(0x88ff66, 0.5);
  g.fillCircle(size / 2, size / 2, 2);

  g.generateTexture(TEX.BULLET_MONSTER, size, size);
  g.destroy();
}

function generateWallTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;

  // Medieval stone wall — warm gray
  g.fillStyle(0x5a524a);
  g.fillRect(0, 0, s, s);

  // Stone block pattern
  g.lineStyle(1, 0x6b635b, 0.6);
  g.beginPath();
  g.moveTo(0, s / 3);
  g.lineTo(s, s / 3);
  g.moveTo(0, (2 * s) / 3);
  g.lineTo(s, (2 * s) / 3);
  g.strokePath();

  g.beginPath();
  g.moveTo(s / 2, 0);
  g.lineTo(s / 2, s / 3);
  g.moveTo(s / 4, s / 3);
  g.lineTo(s / 4, (2 * s) / 3);
  g.moveTo((3 * s) / 4, s / 3);
  g.lineTo((3 * s) / 4, (2 * s) / 3);
  g.moveTo(s / 2, (2 * s) / 3);
  g.lineTo(s / 2, s);
  g.strokePath();

  // Moss/lichen spots
  g.fillStyle(0x4a5a3a, 0.3);
  g.fillCircle(8, 40, 3);
  g.fillCircle(38, 12, 2);

  // Highlight on top/left
  g.lineStyle(1, 0x7a726a, 0.3);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s, 0);
  g.moveTo(0, 0);
  g.lineTo(0, s);
  g.strokePath();

  // Dark edge bottom/right
  g.lineStyle(1, 0x3a332e, 0.5);
  g.beginPath();
  g.moveTo(s - 1, 0);
  g.lineTo(s - 1, s);
  g.moveTo(0, s - 1);
  g.lineTo(s, s - 1);
  g.strokePath();

  g.generateTexture(TEX.WALL, s, s);
  g.destroy();
}

function generateFloorTextures(scene: Phaser.Scene): void {
  for (let v = 0; v < 4; v++) {
    const g = scene.add.graphics();
    const s = 50;

    // Dirt/cobblestone ground
    const baseColors = [0x3a2e1e, 0x382c1c, 0x3c301f, 0x362a1a];
    g.fillStyle(baseColors[v]);
    g.fillRect(0, 0, s, s);

    // Subtle grid (cobblestone cracks)
    g.lineStyle(1, 0x2a2015, 0.3);
    g.strokeRect(0, 0, s, s);

    // Small pebbles/dirt specks
    g.fillStyle(0x4a3e2e, 0.4);
    const seeds = [
      [8, 12],
      [30, 8],
      [15, 35],
      [38, 28],
      [22, 22]
    ];
    for (const [sx, sy] of seeds) {
      const px = (sx + v * 7) % s;
      const py = (sy + v * 11) % s;
      g.fillRect(px, py, 2, 2);
    }

    // Occasional grass tufts
    if (v % 2 === 0) {
      g.fillStyle(0x3a4a2a, 0.3);
      g.fillRect(10 + v * 5, 20, 3, 2);
    }

    g.generateTexture(TEX.FLOOR + v, s, s);
    g.destroy();
  }
}

function generateBushTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;

  // Dark earth under hedge
  g.fillStyle(0x1a1208, 0.8);
  g.fillRect(0, 0, s, s);

  // Thorny hedge clusters
  const clusters = [
    { x: 12, y: 12, r: 10 },
    { x: 30, y: 10, r: 9 },
    { x: 20, y: 25, r: 11 },
    { x: 38, y: 30, r: 8 },
    { x: 10, y: 35, r: 9 },
    { x: 25, y: 40, r: 10 }
  ];

  for (const c of clusters) {
    g.fillStyle(0x2a4a1a, 0.7);
    g.fillCircle(c.x, c.y, c.r);
    g.fillStyle(0x3a6a2a, 0.3);
    g.fillCircle(c.x - 1, c.y - 1, c.r * 0.6);
  }

  // Thorns
  g.lineStyle(1, 0x5a3a1a, 0.4);
  g.beginPath();
  g.moveTo(15, 8);
  g.lineTo(18, 4);
  g.moveTo(35, 25);
  g.lineTo(38, 21);
  g.strokePath();

  g.lineStyle(1, 0x3a6a2a, 0.25);
  g.strokeRect(0, 0, s, s);

  g.generateTexture(TEX.BUSH, s, s);
  g.destroy();
}

function generateSpawnHoleTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 32;
  const cx = size / 2;
  const cy = size / 2;

  // Cracked earth — zombie crawling out
  g.fillStyle(0x000000, 0.8);
  g.fillCircle(cx, cy, 14);
  g.fillStyle(0x2a1a0a, 0.6);
  g.fillCircle(cx, cy, 11);
  g.fillStyle(0x3a2a1a, 0.4);
  g.fillCircle(cx, cy, 7);

  // Cracks radiating outward
  g.lineStyle(1.5, 0x4a3a1a, 0.6);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(angle) * 4, cy + Math.sin(angle) * 4);
    g.lineTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
    g.strokePath();
  }

  // Zombie hand silhouette
  g.fillStyle(0x3d5c3d, 0.5);
  g.fillRect(cx - 2, cy - 8, 4, 6);
  g.fillRect(cx - 3, cy - 10, 2, 3);
  g.fillRect(cx + 1, cy - 9, 2, 3);

  g.generateTexture(TEX.SPAWN_HOLE, size, size);
  g.destroy();
}

function generateSlashEffectTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 40;
  const cx = size / 2;
  const cy = size / 2;

  // Sword slash arc
  g.lineStyle(3, 0xffffff, 0.7);
  g.beginPath();
  g.arc(cx, cy, 16, -Math.PI * 0.4, Math.PI * 0.4, false);
  g.strokePath();
  g.lineStyle(2, 0xcccccc, 0.4);
  g.beginPath();
  g.arc(cx, cy, 14, -Math.PI * 0.3, Math.PI * 0.3, false);
  g.strokePath();

  g.generateTexture(TEX.SLASH_EFFECT, size, size);
  g.destroy();
}

function generateThrustEffectTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const w = 30;
  const h = 8;

  // Spear thrust line effect
  g.fillStyle(0xffffff, 0.5);
  g.fillRect(0, 3, 28, 2);
  g.fillStyle(0xcccccc, 0.3);
  g.fillTriangle(26, 0, 30, 4, 26, 8);

  g.generateTexture(TEX.THRUST_EFFECT, w, h);
  g.destroy();
}
