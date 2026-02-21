import Phaser from 'phaser';

/**
 * Day/Night cycle system.
 *
 * A full cycle takes CYCLE_DURATION_MS. Day occupies ~60% of the cycle,
 * night ~30%, with transitions (dawn/dusk) filling the remaining ~10%.
 *
 * Applies a colored overlay to the camera and drives FogOfWar's nightAmount.
 */

const CYCLE_DURATION_MS = 180_000; // 3 minutes per full cycle

// Phase boundaries as fractions of the cycle
const DAWN_START = 0.0;
const DAY_START = 0.08;
const DUSK_START = 0.58;
const NIGHT_START = 0.68;
const DAWN2_START = 0.92; // Dawn of next cycle

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export class DayNightCycle {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;
  private elapsed = 0;

  /** 0 = full day, 1 = full night */
  private nightAmount = 0;
  private timeOfDay: TimeOfDay = 'day';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const cam = scene.cameras.main;
    // Create a screen-sized overlay that follows the camera
    this.overlay = scene.add.rectangle(0, 0, cam.width * 3, cam.height * 3, 0x000022, 0);
    this.overlay.setScrollFactor(0);
    this.overlay.setDepth(999); // Just below fog of war
    this.overlay.setOrigin(0.5, 0.5);
    this.overlay.setPosition(cam.width / 2, cam.height / 2);
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);

    // Handle resize
    scene.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
      this.overlay.setSize(gameSize.width * 3, gameSize.height * 3);
      this.overlay.setPosition(gameSize.width / 2, gameSize.height / 2);
    });
  }

  /** Call each frame with delta in ms. Returns nightAmount (0-1). */
  update(delta: number): number {
    this.elapsed += delta;
    const t = (this.elapsed % CYCLE_DURATION_MS) / CYCLE_DURATION_MS;

    if (t < DAY_START) {
      // Dawn
      this.timeOfDay = 'dawn';
      const progress = (t - DAWN_START) / (DAY_START - DAWN_START);
      this.nightAmount = 1 - progress;
      this.setOverlay(lerpColor(NIGHT_COLOR, DAWN_COLOR, progress), 0.25 * (1 - progress));
    } else if (t < DUSK_START) {
      // Day
      this.timeOfDay = 'day';
      this.nightAmount = 0;
      this.setOverlay(DAY_COLOR, 0);
    } else if (t < NIGHT_START) {
      // Dusk
      this.timeOfDay = 'dusk';
      const progress = (t - DUSK_START) / (NIGHT_START - DUSK_START);
      this.nightAmount = progress;
      this.setOverlay(lerpColor(DUSK_COLOR, NIGHT_COLOR, progress), 0.3 * progress);
    } else if (t < DAWN2_START) {
      // Night
      this.timeOfDay = 'night';
      this.nightAmount = 1;
      this.setOverlay(NIGHT_COLOR, 0.3);
    } else {
      // Dawn again
      this.timeOfDay = 'dawn';
      const progress = (t - DAWN2_START) / (1 - DAWN2_START);
      this.nightAmount = 1 - progress;
      this.setOverlay(lerpColor(NIGHT_COLOR, DAWN_COLOR, progress), 0.25 * (1 - progress));
    }

    return this.nightAmount;
  }

  private setOverlay(color: number, alpha: number): void {
    this.overlay.setFillStyle(color, alpha);
  }

  getNightAmount(): number {
    return this.nightAmount;
  }

  getTimeOfDay(): TimeOfDay {
    return this.timeOfDay;
  }

  /** Get a human-readable time string like "Day", "Dusk", "Night", "Dawn" */
  getTimeLabel(): string {
    switch (this.timeOfDay) {
      case 'dawn':
        return 'Dawn';
      case 'day':
        return 'Day';
      case 'dusk':
        return 'Dusk';
      case 'night':
        return 'Night';
    }
  }

  destroy(): void {
    this.overlay.destroy();
  }
}

// Color constants
const DAY_COLOR = 0xffffff;
const DAWN_COLOR = 0xff9944;
const DUSK_COLOR = 0xff6622;
const NIGHT_COLOR = 0x0a0a2e;

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | blue;
}
