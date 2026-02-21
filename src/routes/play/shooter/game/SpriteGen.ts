import Phaser from 'phaser';

/**
 * Procedurally generates all game textures using Phaser Graphics.
 * Call generateAllTextures(scene) once during scene.create().
 */

const TEX = {
  PLAYER: 'player_',
  PLAYER_GUN: 'gun_',
  CRAWLER: 'crawler',
  SPITTER: 'spitter',
  BOSS: 'boss',
  BULLET_PLAYER: 'bullet_player',
  BULLET_MONSTER: 'bullet_monster',
  WALL: 'wall',
  FLOOR: 'floor_',
  BUSH: 'bush',
  SPAWN_HOLE: 'spawn_hole',
  MUZZLE_FLASH: 'muzzle_flash'
} as const;

export { TEX };

const PLAYER_COLORS = [
  0x3b82f6, 0xef4444, 0x22c55e, 0xf59e0b, 0xa855f7, 0x06b6d4, 0xec4899, 0xf97316
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
    generateGunTexture(scene, i, PLAYER_COLORS[i]);
  }

  // --- Monsters ---
  generateCrawlerTexture(scene);
  generateSpitterTexture(scene);
  generateBossTexture(scene);

  // --- Bullets ---
  generatePlayerBulletTexture(scene);
  generateMonsterBulletTexture(scene);

  // --- Tiles ---
  generateWallTexture(scene);
  generateFloorTextures(scene);
  generateBushTexture(scene);

  // --- Effects ---
  generateSpawnHoleTexture(scene);
  generateMuzzleFlashTexture(scene);
}

function generatePlayerTexture(scene: Phaser.Scene, index: number, color: number): void {
  const g = scene.add.graphics();
  const size = 32;

  // Body - circle with inner shading
  g.fillStyle(darken(color, 40));
  g.fillCircle(size / 2, size / 2, 14);
  g.fillStyle(color);
  g.fillCircle(size / 2, size / 2, 12);
  g.fillStyle(lighten(color, 60), 0.4);
  g.fillCircle(size / 2 - 3, size / 2 - 3, 6);

  // Eyes
  g.fillStyle(0xffffff);
  g.fillCircle(size / 2 + 3, size / 2 - 3, 3);
  g.fillCircle(size / 2 + 3, size / 2 + 3, 3);
  g.fillStyle(0x111111);
  g.fillCircle(size / 2 + 4, size / 2 - 3, 1.5);
  g.fillCircle(size / 2 + 4, size / 2 + 3, 1.5);

  g.generateTexture(TEX.PLAYER + index, size, size);
  g.destroy();
}

function generateGunTexture(scene: Phaser.Scene, index: number, color: number): void {
  const g = scene.add.graphics();
  // Gun barrel
  g.fillStyle(0x555555);
  g.fillRoundedRect(0, 2, 16, 6, 2);
  g.fillStyle(0x888888);
  g.fillRoundedRect(1, 3, 14, 4, 1);
  // Muzzle tip
  g.fillStyle(darken(color, 30));
  g.fillRect(13, 1, 3, 8);

  g.generateTexture(TEX.PLAYER_GUN + index, 16, 10);
  g.destroy();
}

function generateCrawlerTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 28;
  const cx = size / 2;
  const cy = size / 2;

  // Body - segmented bug look
  g.fillStyle(0x2d7a2d);
  g.fillCircle(cx, cy, 12);
  g.fillStyle(0x44aa44);
  g.fillCircle(cx, cy, 10);

  // Segments
  g.lineStyle(1.5, 0x2d7a2d);
  g.beginPath();
  g.moveTo(cx - 8, cy - 3);
  g.lineTo(cx + 8, cy - 3);
  g.moveTo(cx - 8, cy + 3);
  g.lineTo(cx + 8, cy + 3);
  g.strokePath();

  // Eyes - angry red
  g.fillStyle(0xff3333);
  g.fillCircle(cx + 5, cy - 4, 2.5);
  g.fillCircle(cx + 5, cy + 4, 2.5);
  g.fillStyle(0x220000);
  g.fillCircle(cx + 6, cy - 4, 1);
  g.fillCircle(cx + 6, cy + 4, 1);

  // Mandibles
  g.lineStyle(2, 0x2d7a2d);
  g.beginPath();
  g.moveTo(cx + 9, cy - 3);
  g.lineTo(cx + 13, cy - 6);
  g.moveTo(cx + 9, cy + 3);
  g.lineTo(cx + 13, cy + 6);
  g.strokePath();

  g.generateTexture(TEX.CRAWLER, size, size);
  g.destroy();
}

function generateSpitterTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 24;
  const cx = size / 2;
  const cy = size / 2;

  // Body - purple ooze
  g.fillStyle(0x6622aa);
  g.fillCircle(cx, cy, 10);
  g.fillStyle(0x9944cc);
  g.fillCircle(cx, cy, 8);

  // Inner glow
  g.fillStyle(0xbb66ff, 0.3);
  g.fillCircle(cx - 2, cy - 2, 4);

  // Single large eye
  g.fillStyle(0xffff00);
  g.fillCircle(cx + 3, cy, 3.5);
  g.fillStyle(0x000000);
  g.fillCircle(cx + 4, cy, 1.5);

  // Tentacles
  g.lineStyle(1.5, 0x7733bb);
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2 + Math.PI * 0.5;
    const sx = cx + Math.cos(angle) * 8;
    const sy = cy + Math.sin(angle) * 8;
    const ex = cx + Math.cos(angle) * 11;
    const ey = cy + Math.sin(angle) * 11;
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(ex, ey);
    g.strokePath();
  }

  g.generateTexture(TEX.SPITTER, size, size);
  g.destroy();
}

function generateBossTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 48;
  const cx = size / 2;
  const cy = size / 2;

  // Body - large armored
  g.fillStyle(0x881111);
  g.fillCircle(cx, cy, 22);
  g.fillStyle(0xcc2222);
  g.fillCircle(cx, cy, 19);

  // Armor plates
  g.lineStyle(2, 0x881111);
  g.strokeCircle(cx, cy, 15);
  g.strokeCircle(cx, cy, 10);

  // Cross pattern
  g.lineStyle(2, 0x661111);
  g.beginPath();
  g.moveTo(cx - 18, cy);
  g.lineTo(cx + 18, cy);
  g.moveTo(cx, cy - 18);
  g.lineTo(cx, cy + 18);
  g.strokePath();

  // Glowing core
  g.fillStyle(0xff6600, 0.6);
  g.fillCircle(cx, cy, 6);
  g.fillStyle(0xffcc00, 0.4);
  g.fillCircle(cx, cy, 3);

  // Eyes
  g.fillStyle(0xff0000);
  g.fillCircle(cx + 8, cy - 8, 3);
  g.fillCircle(cx + 8, cy + 8, 3);
  g.fillStyle(0xffff00, 0.5);
  g.fillCircle(cx + 8, cy - 8, 1.5);
  g.fillCircle(cx + 8, cy + 8, 1.5);

  // Spikes
  g.fillStyle(0x661111);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    const bx = cx + Math.cos(angle) * 19;
    const by = cy + Math.sin(angle) * 19;
    const tx = cx + Math.cos(angle) * 23;
    const ty = cy + Math.sin(angle) * 23;
    const lx = cx + Math.cos(angle - 0.3) * 18;
    const ly = cy + Math.sin(angle - 0.3) * 18;
    const rx = cx + Math.cos(angle + 0.3) * 18;
    const ry = cy + Math.sin(angle + 0.3) * 18;
    g.fillTriangle(lx, ly, tx, ty, rx, ry);
  }

  g.generateTexture(TEX.BOSS, size, size);
  g.destroy();
}

function generatePlayerBulletTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 12;
  // Bright core
  g.fillStyle(0xfff7aa, 0.3);
  g.fillCircle(size / 2, size / 2, 5);
  g.fillStyle(0xfcd34d);
  g.fillCircle(size / 2, size / 2, 3.5);
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(size / 2, size / 2, 1.5);

  g.generateTexture(TEX.BULLET_PLAYER, size, size);
  g.destroy();
}

function generateMonsterBulletTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 14;
  // Angry red glow
  g.fillStyle(0xff3333, 0.2);
  g.fillCircle(size / 2, size / 2, 6);
  g.fillStyle(0xff4444);
  g.fillCircle(size / 2, size / 2, 4);
  g.fillStyle(0xff9999, 0.5);
  g.fillCircle(size / 2, size / 2, 2);

  g.generateTexture(TEX.BULLET_MONSTER, size, size);
  g.destroy();
}

function generateWallTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;

  // Base stone
  g.fillStyle(0x334155);
  g.fillRect(0, 0, s, s);

  // Brick pattern
  g.lineStyle(1, 0x475569, 0.6);
  // Horizontal lines
  g.beginPath();
  g.moveTo(0, s / 3);
  g.lineTo(s, s / 3);
  g.moveTo(0, (2 * s) / 3);
  g.lineTo(s, (2 * s) / 3);
  g.strokePath();

  // Vertical lines (offset per row)
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

  // Subtle highlight on top/left edges
  g.lineStyle(1, 0x556677, 0.3);
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(s, 0);
  g.moveTo(0, 0);
  g.lineTo(0, s);
  g.strokePath();

  // Dark edge bottom/right
  g.lineStyle(1, 0x1e293b, 0.5);
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
  // Generate 4 floor variants for visual variety
  for (let v = 0; v < 4; v++) {
    const g = scene.add.graphics();
    const s = 50;

    // Base color with slight variation
    const baseColors = [0x1a1a2e, 0x191928, 0x1b1b30, 0x18182a];
    g.fillStyle(baseColors[v]);
    g.fillRect(0, 0, s, s);

    // Subtle grid lines
    g.lineStyle(1, 0x252540, 0.2);
    g.strokeRect(0, 0, s, s);

    // Tiny specks for texture
    g.fillStyle(0x252540, 0.4);
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

    g.generateTexture(TEX.FLOOR + v, s, s);
    g.destroy();
  }
}

function generateBushTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const s = 50;

  // Dark ground under bush
  g.fillStyle(0x0d2818, 0.8);
  g.fillRect(0, 0, s, s);

  // Leaf clusters
  const clusters = [
    { x: 12, y: 12, r: 10 },
    { x: 30, y: 10, r: 9 },
    { x: 20, y: 25, r: 11 },
    { x: 38, y: 30, r: 8 },
    { x: 10, y: 35, r: 9 },
    { x: 25, y: 40, r: 10 }
  ];

  for (const c of clusters) {
    g.fillStyle(0x166534, 0.7);
    g.fillCircle(c.x, c.y, c.r);
    g.fillStyle(0x22c55e, 0.3);
    g.fillCircle(c.x - 1, c.y - 1, c.r * 0.6);
  }

  // Border
  g.lineStyle(1, 0x22c55e, 0.25);
  g.strokeRect(0, 0, s, s);

  g.generateTexture(TEX.BUSH, s, s);
  g.destroy();
}

function generateSpawnHoleTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 32;
  const cx = size / 2;
  const cy = size / 2;

  g.fillStyle(0x000000, 0.8);
  g.fillCircle(cx, cy, 14);
  g.fillStyle(0x331100, 0.6);
  g.fillCircle(cx, cy, 11);
  g.fillStyle(0x442200, 0.4);
  g.fillCircle(cx, cy, 7);

  // Cracks radiating outward
  g.lineStyle(1, 0x553300, 0.5);
  for (let a = 0; a < 6; a++) {
    const angle = (a / 6) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(angle) * 5, cy + Math.sin(angle) * 5);
    g.lineTo(cx + Math.cos(angle) * 14, cy + Math.sin(angle) * 14);
    g.strokePath();
  }

  g.generateTexture(TEX.SPAWN_HOLE, size, size);
  g.destroy();
}

function generateMuzzleFlashTexture(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const size = 16;
  g.fillStyle(0xffffff, 0.4);
  g.fillCircle(size / 2, size / 2, 7);
  g.fillStyle(0xffee88, 0.6);
  g.fillCircle(size / 2, size / 2, 4);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(size / 2, size / 2, 2);

  g.generateTexture(TEX.MUZZLE_FLASH, size, size);
  g.destroy();
}
