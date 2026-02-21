import Phaser from 'phaser';
import { MAP_DATA, MAP_COLS, MAP_ROWS, TILE_SIZE } from './TileMap';

/**
 * Fog of war system with day/night cycle awareness.
 *
 * Day:   large vision radius, standard fog outside vision.
 * Night: small vision radius, explored areas stay dimly visible,
 *        unexplored areas are pitch black.
 */
export class FogOfWar {
  private fog: Phaser.GameObjects.RenderTexture;
  private blackRect: Phaser.GameObjects.Rectangle;
  private clearBrush: Phaser.GameObjects.Graphics;
  private dimBrush: Phaser.GameObjects.Graphics;
  private scene: Phaser.Scene;

  private dayVisionRadius: number;
  private nightVisionRadius: number;
  private currentVisionRadius: number;

  /** Grid tracking explored tiles (for night mode) */
  private explored: boolean[][];

  /** 0 = full day, 1 = full night */
  private nightAmount = 0;

  constructor(scene: Phaser.Scene, dayVisionRadius = 280, nightVisionRadius = 120) {
    this.scene = scene;
    this.dayVisionRadius = dayVisionRadius;
    this.nightVisionRadius = nightVisionRadius;
    this.currentVisionRadius = dayVisionRadius;

    const worldW = MAP_COLS * TILE_SIZE;
    const worldH = MAP_ROWS * TILE_SIZE;

    // Explored grid
    this.explored = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(false));

    // Create a RenderTexture covering the whole map
    this.fog = scene.add.renderTexture(0, 0, worldW, worldH);
    this.fog.setDepth(1000);

    // Black fill rectangle (used to stamp onto the RT)
    this.blackRect = scene.add.rectangle(0, 0, worldW, worldH, 0x000000, 0.85);
    this.blackRect.setOrigin(0, 0);
    this.blackRect.setVisible(false);

    // Clear brush — soft radial gradient (erases fog fully)
    this.clearBrush = scene.add.graphics();
    this.clearBrush.setVisible(false);

    // Dim brush — for explored areas at night (partial erase)
    this.dimBrush = scene.add.graphics();
    this.dimBrush.setVisible(false);

    this.rebuildBrushes();
  }

  private rebuildBrushes(): void {
    const r = this.currentVisionRadius;

    // Clear brush: erases fog entirely around player
    this.clearBrush.clear();
    const steps = 24;
    for (let i = steps; i >= 0; i--) {
      const ratio = i / steps;
      const radius = r * ratio;
      const alpha = i === 0 ? 1 : 0.045;
      this.clearBrush.fillStyle(0x000000, alpha);
      this.clearBrush.fillCircle(r, r, radius);
    }

    // Dim brush: a single tile-sized square used to partially erase explored tiles at night
    this.dimBrush.clear();
    this.dimBrush.fillStyle(0x000000, 0.4);
    this.dimBrush.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  }

  /** Set the night amount (0 = full day, 1 = full night). */
  setNightAmount(amount: number): void {
    this.nightAmount = Math.max(0, Math.min(1, amount));
    const newRadius = Phaser.Math.Linear(
      this.dayVisionRadius,
      this.nightVisionRadius,
      this.nightAmount
    );

    // Only rebuild brushes if radius changed significantly
    if (Math.abs(newRadius - this.currentVisionRadius) > 2) {
      this.currentVisionRadius = newRadius;
      this.rebuildBrushes();
    }

    // Darkness increases at night
    const alpha = Phaser.Math.Linear(0.75, 0.93, this.nightAmount);
    this.blackRect.setFillStyle(0x000000, alpha);
  }

  getNightAmount(): number {
    return this.nightAmount;
  }

  getVisionRadius(): number {
    return this.currentVisionRadius;
  }

  /** Call this every frame with the local player's position. */
  update(playerX: number, playerY: number): void {
    // Mark tiles around player as explored
    const tileRadius = Math.ceil(this.currentVisionRadius / TILE_SIZE) + 1;
    const playerCol = Math.floor(playerX / TILE_SIZE);
    const playerRow = Math.floor(playerY / TILE_SIZE);

    for (let dr = -tileRadius; dr <= tileRadius; dr++) {
      for (let dc = -tileRadius; dc <= tileRadius; dc++) {
        const r = playerRow + dr;
        const c = playerCol + dc;
        if (r < 0 || r >= MAP_ROWS || c < 0 || c >= MAP_COLS) continue;
        if (MAP_DATA[r][c] === 1) continue; // Don't mark walls as explored

        const tileX = c * TILE_SIZE + TILE_SIZE / 2;
        const tileY = r * TILE_SIZE + TILE_SIZE / 2;
        if (this.isVisible(playerX, playerY, tileX, tileY)) {
          this.explored[r][c] = true;
        }
      }
    }

    // Re-fill the fog with darkness
    this.fog.clear();
    this.fog.draw(this.blackRect, 0, 0);

    // At night, partially reveal explored areas (dim)
    if (this.nightAmount > 0.3) {
      for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
          if (this.explored[r][c]) {
            this.fog.erase(this.dimBrush, c * TILE_SIZE, r * TILE_SIZE);
          }
        }
      }
    }

    // Erase fog around the player (full vision)
    const vr = this.currentVisionRadius;
    this.fog.erase(this.clearBrush, playerX - vr, playerY - vr);
  }

  /**
   * Check if a world position is visible to the local player.
   * Uses distance check (current vision radius) + wall raycasting.
   */
  isVisible(playerX: number, playerY: number, targetX: number, targetY: number): boolean {
    const dist = Math.hypot(targetX - playerX, targetY - playerY);
    if (dist > this.currentVisionRadius) return false;

    // Raycast from player to target, checking for wall tiles
    const steps = Math.ceil(dist / (TILE_SIZE / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const rx = playerX + (targetX - playerX) * t;
      const ry = playerY + (targetY - playerY) * t;
      const col = Math.floor(rx / TILE_SIZE);
      const row = Math.floor(ry / TILE_SIZE);
      if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) {
        if (MAP_DATA[row][col] === 1) return false;
      }
    }
    return true;
  }

  destroy(): void {
    this.fog.destroy();
    this.blackRect.destroy();
    this.clearBrush.destroy();
    this.dimBrush.destroy();
  }
}
