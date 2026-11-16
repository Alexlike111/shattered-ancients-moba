import type { AbilitySlot } from '../types/game';

export interface InputCallbacks {
  onCastAbility: (slot: AbilitySlot) => void;
  onUpgradeAbility: (slot: AbilitySlot) => void;
  onCastBattleSpell: () => void;
  onStartRecall: () => void;
  onQuickBuySlot: (index: number) => void;
  onUseActiveItemSlot: (activeIndex: number) => void;
  onParry: () => void;
  onSlide: () => void;
  onPlaceWard: () => void;
  onChooseTalentBranch: (branch: 'left' | 'right') => void;
  onToggleShop: () => void;
  onToggleScoreboard: (visible: boolean) => void;
  onLookDelta: (dx: number, dy: number) => void;
  onJump: () => void;
}

export function detectMobileOrTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return coarse || uaMobile || navigator.maxTouchPoints > 0 || window.innerWidth <= 900;
}

export class InputController {
  private keys = new Set<string>();
  public primaryFireHeld = false;
  public touchMoveX = 0;
  public touchMoveZ = 0;
  public isTouchMode = false;
  public isPointerLocked = false;
  public sensitivity = 0.0022;

  private canvas: HTMLCanvasElement;
  private callbacks: InputCallbacks;

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.isTouchMode = detectMobileOrTouchDevice();

    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat && e.code !== 'Tab') return;
      this.keys.add(e.code);

      if (e.code === 'Tab') {
        e.preventDefault();
        this.callbacks.onToggleScoreboard(true);
        return;
      }

      if (e.altKey || e.ctrlKey) {
        if (e.code === 'KeyQ') {
          e.preventDefault();
          this.callbacks.onUpgradeAbility('Q');
          return;
        }
        if (e.code === 'KeyW') {
          e.preventDefault();
          this.callbacks.onUpgradeAbility('W');
          return;
        }
        if (e.code === 'KeyE') {
          e.preventDefault();
          this.callbacks.onUpgradeAbility('E');
          return;
        }
        if (e.code === 'KeyR') {
          e.preventDefault();
          this.callbacks.onUpgradeAbility('R');
          return;
        }
      }

      switch (e.code) {
        case 'KeyQ':
        case 'Digit1':
          this.callbacks.onCastAbility('Q');
          break;
        case 'Digit2':
        case 'KeyE':
          this.callbacks.onCastAbility('W');
          break;
        case 'Digit3':
        case 'KeyC':
          this.callbacks.onCastAbility('E');
          break;
        case 'Digit4':
        case 'KeyR':
          this.callbacks.onCastAbility('R');
          break;
        case 'Digit5':
          this.callbacks.onUseActiveItemSlot(0);
          break;
        case 'Digit6':
          this.callbacks.onUseActiveItemSlot(1);
          break;
        case 'KeyV':
          this.callbacks.onParry();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.callbacks.onSlide();
          break;
        case 'KeyX':
          this.callbacks.onPlaceWard();
          break;
        case 'BracketLeft':
          this.callbacks.onChooseTalentBranch('left');
          break;
        case 'BracketRight':
          this.callbacks.onChooseTalentBranch('right');
          break;
        case 'KeyF':
          this.callbacks.onCastBattleSpell();
          break;
        case 'KeyG':
          this.callbacks.onQuickBuySlot(0);
          break;
        case 'KeyH':
          this.callbacks.onQuickBuySlot(1);
          break;
        case 'KeyT':
          this.callbacks.onStartRecall();
          break;
        case 'KeyB':
          this.callbacks.onToggleShop();
          break;
        case 'Space':
          this.callbacks.onJump();
          break;
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Tab') {
        this.callbacks.onToggleScoreboard(false);
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.isTouchMode) return;
      if (!this.isPointerLocked) {
        this.requestPointerLock();
        return;
      }
      if (e.button === 0) {
        this.primaryFireHeld = true;
      } else if (e.button === 2) {
        this.callbacks.onCastAbility('W');
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.primaryFireHeld = false;
      }
    });

    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      if (!this.isPointerLocked) {
        this.primaryFireHeld = false;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked) return;
      const dx = e.movementX * this.sensitivity;
      const dy = e.movementY * this.sensitivity;
      this.callbacks.onLookDelta(dx, dy);
    });
  }

  public requestPointerLock(): void {
    if (this.isTouchMode) return;
    if (typeof this.canvas.requestPointerLock !== 'function') return;
    try {
      void this.canvas.requestPointerLock();
    } catch {
      // Безопасно для мобильных и встроенных webview
    }
  }

  public releasePointerLock(): void {
    if (typeof document.exitPointerLock === 'function' && document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Игнорируем
      }
    }
  }

  public getMoveAxes(): { forward: number; strafe: number } {
    let forward = 0;
    let strafe = 0;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    forward += -this.touchMoveZ;
    strafe += this.touchMoveX;

    const len = Math.hypot(forward, strafe);
    if (len > 1) {
      forward /= len;
      strafe /= len;
    }
    return { forward, strafe };
  }
}
