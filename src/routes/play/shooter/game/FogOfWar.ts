import Phaser from 'phaser';
import { MAP_DATA, MAP_COLS, MAP_ROWS, TILE_SIZE } from './TileMap';

/**
 * Fog of war — everything outside the player's vision is pitch black.
 * Uses a screen-sized CanvasTexture with native Canvas 2D compositing
 * to reliably cut a vision circle out of solid black.
 */
export class FogOfWar {
  private scene: Phaser.Scene;
  private canvasTex!: Phaser.Textures.CanvasTexture;
  private fogImage!: Phaser.GameObjects.Image;
  private ctx!: CanvasRenderingContext2D;

  private dayVisionRadius: number;
  private nightVisionRadius: number;
  private currentVisionRadius: number;

  /** 0 = full day, 1 = full night */
  private nightAmount = 0;

  constructor(scene: Phaser.Scene, dayVisionRadius = 280, nightVisionRadius = 120) {
    this.scene = scene;
    this.dayVisionRadius = dayVisionRadius;
    this.nightVisionRadius = nightVisionRadius;
    this.currentVisionRadius = dayVisionRadius;

    const cam = scene.cameras.main;
    this.createCanvas(cam.width, cam.height);

    // Handle resize
    scene.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.fogImage.destroy();
      this.scene.textures.remove('_fogCanvas');
      this.createCanvas(gameSize.width, gameSize.height);
    });
  }

  private createCanvas(w: number, h: number): void {
    this.canvasTex = this.scene.textures.createCanvas('_fogCanvas', w, h)!;
    this.ctx = this.canvasTex.getContext();
    this.fogImage = this.scene.add
      .image(0, 0, '_fogCanvas')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  /** Set the night amount (0 = full day, 1 = full night). */
  setNightAmount(amount: number): void {
    this.nightAmount = Math.max(0, Math.min(1, amount));
    this.currentVisionRadius = Phaser.Math.Linear(
      this.dayVisionRadius,
      this.nightVisionRadius,
      this.nightAmount
    );
  }

  getNightAmount(): number {
    return this.nightAmount;
  }

  getVisionRadius(): number {
    return this.currentVisionRadius;
  }

  /** Call this every frame with the local player's position. */
  update(playerX: number, playerY: number): void {
    const cam = this.scene.cameras.main;
    const w = this.canvasTex.width;
    const h = this.canvasTex.height;
    const ctx = this.ctx;

    // Player position relative to camera viewport
    const px = playerX - cam.scrollX;
    const py = playerY - cam.scrollY;
    const r = this.currentVisionRadius;

    // Fill entire canvas with solid black
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Cut out the vision circle using destination-out
    ctx.globalCompositeOperation = 'destination-out';
    const gradient = ctx.createRadialGradient(px, py, r * 0.25, px, py, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.6, 'rgba(0,0,0,0.95)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    // Reset composite mode
    ctx.globalCompositeOperation = 'source-over';

    this.canvasTex.refresh();
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
    this.fogImage.destroy();
    if (this.scene.textures.exists('_fogCanvas')) {
      this.scene.textures.remove('_fogCanvas');
    }
  }
}
