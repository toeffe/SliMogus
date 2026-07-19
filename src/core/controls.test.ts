import { afterEach, describe, expect, it } from 'vitest';
import { PlayerInputButton } from '@sim/input';
import { KeyboardController } from './controls';

let controller: KeyboardController | null = null;

afterEach(() => {
  controller?.destroy();
  controller = null;
});

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }));
}

function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { code }));
}

describe('KeyboardController movement', () => {
  it('reports zero movement when nothing is held', () => {
    controller = new KeyboardController();
    expect(controller.getMovement()).toEqual({ moveX: 0, moveY: 0 });
  });

  it('maps WASD to normalized axes (yaw 0: W → −Z / sim −Y)', () => {
    controller = new KeyboardController();
    press('KeyW');
    press('KeyD');
    expect(controller.getMovement()).toEqual({ moveX: 1, moveY: -1 });
  });

  it('rotates WASD by facing yaw into world axes', () => {
    controller = new KeyboardController();
    controller.setFacingYaw(Math.PI / 2);
    press('KeyW');
    const m = controller.getMovement();
    expect(m.moveX).toBeCloseTo(-1, 5);
    expect(m.moveY).toBeCloseTo(0, 5);
  });

  it('maps arrow keys the same way as WASD', () => {
    controller = new KeyboardController();
    press('ArrowDown');
    press('ArrowLeft');
    expect(controller.getMovement()).toEqual({ moveX: -1, moveY: 1 });
  });

  it('cancels out opposite keys held simultaneously', () => {
    controller = new KeyboardController();
    press('KeyW');
    press('KeyS');
    expect(controller.getMovement().moveY).toBe(0);
  });

  it('stops reporting a direction once its key is released', () => {
    controller = new KeyboardController();
    press('KeyD');
    expect(controller.getMovement().moveX).toBe(1);
    release('KeyD');
    expect(controller.getMovement().moveX).toBe(0);
  });
});

describe('KeyboardController action buttons', () => {
  it('reports no buttons held by default', () => {
    controller = new KeyboardController();
    expect(controller.getHeldButtons()).toBe(0);
  });

  it('maps E/Q/R/M/1/2 to the expected bits, combinable while held together', () => {
    controller = new KeyboardController();
    press('KeyE');
    press('KeyQ');
    expect(controller.getHeldButtons()).toBe(PlayerInputButton.USE | PlayerInputButton.KILL);
  });

  it('maps M to emergency meeting', () => {
    controller = new KeyboardController();
    press('KeyM');
    expect(controller.getHeldButtons()).toBe(PlayerInputButton.CALL_MEETING);
  });

  it('toggles flashlight on F without setting a button bit', () => {
    controller = new KeyboardController();
    expect(controller.isFlashlightOn()).toBe(true);
    press('KeyF');
    expect(controller.isFlashlightOn()).toBe(false);
    expect(controller.getHeldButtons()).toBe(0);
    release('KeyF');
    press('KeyF');
    expect(controller.isFlashlightOn()).toBe(true);
  });

  it('maps sabotage hotkeys', () => {
    controller = new KeyboardController();
    press('Digit1');
    expect(controller.getHeldButtons()).toBe(PlayerInputButton.SABOTAGE_LIGHTS);
    press('Digit2');
    expect(controller.getHeldButtons()).toBe(
      PlayerInputButton.SABOTAGE_LIGHTS | PlayerInputButton.SABOTAGE_REACTOR,
    );
  });

  it('clears a button once its key is released', () => {
    controller = new KeyboardController();
    press('KeyR');
    release('KeyR');
    expect(controller.getHeldButtons()).toBe(0);
  });

  it('ignores keys with no mapping', () => {
    controller = new KeyboardController();
    press('KeyZ');
    expect(controller.getMovement()).toEqual({ moveX: 0, moveY: 0 });
    expect(controller.getHeldButtons()).toBe(0);
  });
});

describe('KeyboardController use edge / movement lock', () => {
  it('reports a KeyE rising edge once via consumeUseEdge', () => {
    controller = new KeyboardController();
    expect(controller.consumeUseEdge()).toBe(false);
    press('KeyE');
    expect(controller.consumeUseEdge()).toBe(true);
    expect(controller.consumeUseEdge()).toBe(false);
  });

  it('zeros movement while locked', () => {
    controller = new KeyboardController();
    press('KeyW');
    controller.setMovementLocked(true);
    expect(controller.getMovement()).toEqual({ moveX: 0, moveY: 0 });
    controller.setMovementLocked(false);
    expect(controller.getMovement()).toEqual({ moveX: 0, moveY: -1 });
  });
});

describe('KeyboardController queued UI actions', () => {
  it('returns null when nothing is queued', () => {
    controller = new KeyboardController();
    expect(controller.takeQueuedAction()).toBeNull();
  });

  it('returns and clears a queued action exactly once', () => {
    controller = new KeyboardController();
    controller.queueAction(PlayerInputButton.VOTE_CAST, 5);
    expect(controller.takeQueuedAction()).toEqual({
      button: PlayerInputButton.VOTE_CAST,
      targetId: 5,
    });
    expect(controller.takeQueuedAction()).toBeNull();
  });

  it('overwrites a not-yet-consumed queued action', () => {
    controller = new KeyboardController();
    controller.queueAction(PlayerInputButton.VOTE_CAST, 5);
    controller.queueAction(PlayerInputButton.VOTE_SKIP, -1);
    expect(controller.takeQueuedAction()).toEqual({
      button: PlayerInputButton.VOTE_SKIP,
      targetId: -1,
    });
  });
});

describe('KeyboardController destroy', () => {
  it('stops responding to key events after destroy', () => {
    controller = new KeyboardController();
    controller.destroy();
    press('KeyW');
    expect(controller.getMovement()).toEqual({ moveX: 0, moveY: 0 });
  });
});
