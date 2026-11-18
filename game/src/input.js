// Keyboard and mouse: held keys, one-shot presses, pointer-locked mouse look and mouse buttons.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const input = {
    held,
    pressed,
    mouseDX: 0,
    mouseDY: 0,
    leftDown: false,
    rightDown: false,
    leftClicked: false,
    wheel: 0,
    locked: false,
    /** True while a key in the list is held. */
    down(...codes) { return codes.some((c) => held.has(c)); },
    /** True once per press of a key in the list (cleared by endFrame). */
    hit(...codes) { return codes.some((c) => pressed.has(c)); },
    axis(neg, pos) { return (input.down(...pos) ? 1 : 0) - (input.down(...neg) ? 1 : 0); },
    endFrame() {
      pressed.clear();
      input.mouseDX = 0;
      input.mouseDY = 0;
      input.leftClicked = false;
      input.wheel = 0;
    },
    lock() {
      if (!input.locked && canvas.requestPointerLock) {
        try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignored */ }
      }
    },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
  };

  window.addEventListener('keydown', (e) => {
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => { held.clear(); input.leftDown = false; input.rightDown = false; });
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });
  window.addEventListener('mousemove', (e) => {
    if (input.locked) { input.mouseDX += e.movementX; input.mouseDY += e.movementY; }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { input.leftDown = true; input.leftClicked = true; }
    if (e.button === 2) input.rightDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.leftDown = false;
    if (e.button === 2) input.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => { input.wheel += Math.sign(e.deltaY); }, { passive: true });
  return input;
}
