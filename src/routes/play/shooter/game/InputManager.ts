import Phaser from 'phaser';

export interface InputState {
  moveX: number;
  moveY: number;
  aimAngle: number;
  shooting: boolean;
}

/**
 * Unified input manager supporting keyboard+mouse, gamepad, and touch.
 * Auto-detects active input source.
 */
export class InputManager {
  private scene: Phaser.Scene;
  private keys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private usingTouch = false;

  // Virtual joystick state (touch)
  private leftStick = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
  private rightStick = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
  private leftPointerId = -1;
  private rightPointerId = -1;

  // Joystick visuals
  private leftBase?: Phaser.GameObjects.Arc;
  private leftThumb?: Phaser.GameObjects.Arc;
  private rightBase?: Phaser.GameObjects.Arc;
  private rightThumb?: Phaser.GameObjects.Arc;

  private playerX = 0;
  private playerY = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.setupKeyboard();
    this.setupTouch();
  }

  private setupKeyboard(): void {
    if (!this.scene.input.keyboard) return;
    this.keys = {
      W: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      SPACE: this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    };
  }

  private setupTouch(): void {
    if (!this.scene.sys.game.device.input.touch) return;

    this.scene.input.addPointer(1); // Support 2 simultaneous touches

    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.usingTouch = true;
      const halfW = this.scene.scale.width / 2;

      if (pointer.x < halfW && !this.leftStick.active) {
        this.leftStick.active = true;
        this.leftStick.startX = pointer.x;
        this.leftStick.startY = pointer.y;
        this.leftPointerId = pointer.id;
        this.showJoystick('left', pointer.x, pointer.y);
      } else if (pointer.x >= halfW && !this.rightStick.active) {
        this.rightStick.active = true;
        this.rightStick.startX = pointer.x;
        this.rightStick.startY = pointer.y;
        this.rightPointerId = pointer.id;
        this.showJoystick('right', pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.leftPointerId && this.leftStick.active) {
        this.updateStick(this.leftStick, pointer);
        this.updateJoystickVisual('left');
      } else if (pointer.id === this.rightPointerId && this.rightStick.active) {
        this.updateStick(this.rightStick, pointer);
        this.updateJoystickVisual('right');
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.leftPointerId) {
        this.leftStick.active = false;
        this.leftStick.x = 0;
        this.leftStick.y = 0;
        this.leftPointerId = -1;
        this.hideJoystick('left');
      } else if (pointer.id === this.rightPointerId) {
        this.rightStick.active = false;
        this.rightStick.x = 0;
        this.rightStick.y = 0;
        this.rightPointerId = -1;
        this.hideJoystick('right');
      }
    });
  }

  private updateStick(
    stick: { startX: number; startY: number; x: number; y: number },
    pointer: Phaser.Input.Pointer
  ): void {
    const maxDist = 50;
    const dx = pointer.x - stick.startX;
    const dy = pointer.y - stick.startY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const clamp = Math.min(dist, maxDist);
      stick.x = ((dx / dist) * clamp) / maxDist;
      stick.y = ((dy / dist) * clamp) / maxDist;
    }
  }

  private showJoystick(side: 'left' | 'right', x: number, y: number): void {
    const base = this.scene.add.circle(x, y, 50, 0xffffff, 0.15).setDepth(2000).setScrollFactor(0);
    const thumb = this.scene.add.circle(x, y, 20, 0xffffff, 0.4).setDepth(2001).setScrollFactor(0);
    if (side === 'left') {
      this.leftBase = base;
      this.leftThumb = thumb;
    } else {
      this.rightBase = base;
      this.rightThumb = thumb;
    }
  }

  private hideJoystick(side: 'left' | 'right'): void {
    if (side === 'left') {
      this.leftBase?.destroy();
      this.leftThumb?.destroy();
    } else {
      this.rightBase?.destroy();
      this.rightThumb?.destroy();
    }
  }

  private updateJoystickVisual(side: 'left' | 'right'): void {
    const stick = side === 'left' ? this.leftStick : this.rightStick;
    const thumb = side === 'left' ? this.leftThumb : this.rightThumb;
    if (thumb) {
      const base = side === 'left' ? this.leftBase : this.rightBase;
      if (base) {
        thumb.setPosition(base.x + stick.x * 50, base.y + stick.y * 50);
      }
    }
  }

  setPlayerPosition(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
  }

  getState(): InputState {
    // Try gamepad first
    const pad = this.scene.input.gamepad?.pad1;
    if (pad && pad.connected) {
      const deadzone = 0.15;
      const lx = Math.abs(pad.leftStick.x) > deadzone ? pad.leftStick.x : 0;
      const ly = Math.abs(pad.leftStick.y) > deadzone ? pad.leftStick.y : 0;
      const rx = Math.abs(pad.rightStick.x) > deadzone ? pad.rightStick.x : 0;
      const ry = Math.abs(pad.rightStick.y) > deadzone ? pad.rightStick.y : 0;
      const shooting = Math.hypot(rx, ry) > 0.5 || pad.R2 > 0.5;
      return {
        moveX: lx,
        moveY: ly,
        aimAngle: Math.hypot(rx, ry) > deadzone ? Math.atan2(ry, rx) : Math.atan2(ly, lx),
        shooting
      };
    }

    // Touch virtual joysticks
    if (this.usingTouch && (this.leftStick.active || this.rightStick.active)) {
      const shooting =
        this.rightStick.active && Math.hypot(this.rightStick.x, this.rightStick.y) > 0.3;
      return {
        moveX: this.leftStick.x,
        moveY: this.leftStick.y,
        aimAngle: this.rightStick.active ? Math.atan2(this.rightStick.y, this.rightStick.x) : 0,
        shooting
      };
    }

    // Keyboard + mouse
    let mx = 0;
    let my = 0;
    if (this.keys) {
      if (this.keys.A.isDown) mx -= 1;
      if (this.keys.D.isDown) mx += 1;
      if (this.keys.W.isDown) my -= 1;
      if (this.keys.S.isDown) my += 1;
      // Normalize diagonal
      const len = Math.hypot(mx, my);
      if (len > 1) {
        mx /= len;
        my /= len;
      }
    }

    const pointer = this.scene.input.activePointer;
    const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aimAngle = Math.atan2(worldPoint.y - this.playerY, worldPoint.x - this.playerX);

    const shooting = pointer.isDown || (this.keys?.SPACE?.isDown ?? false);

    return { moveX: mx, moveY: my, aimAngle, shooting };
  }

  destroy(): void {
    this.hideJoystick('left');
    this.hideJoystick('right');
  }
}
