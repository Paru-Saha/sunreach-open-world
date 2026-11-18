// Title and pause screens: New Game / Continue / Controls on the title over a slow flyover of the
// bay, and Resume / Save / Load / Radio / Controls / Quit in the pause menu with a stats panel.
// Buttons work with the mouse or with arrow keys and Enter.
import { TOKEN_SPOTS } from './pickups.js';
import { ORDER, STORY } from './story.js';

const CONTROLS = `
  <div class="stats">
    <span><kbd>W A S D</kbd></span><span>Walk / drive</span>
    <span><kbd>Mouse</kbd></span><span>Look (click the game to capture the mouse)</span>
    <span><kbd>Shift</kbd></span><span>Sprint</span>
    <span><kbd>Space</kbd></span><span>Jump / handbrake drift</span>
    <span><kbd>F</kbd> or <kbd>E</kbd></span><span>Get in or out of a car (take one by force)</span>
    <span><kbd>Left click</kbd></span><span>Punch / shoot</span>
    <span><kbd>Right click</kbd></span><span>Aim</span>
    <span><kbd>Q</kbd> <kbd>1 2 3</kbd> wheel</span><span>Switch weapon</span>
    <span><kbd>R</kbd></span><span>Change radio station (in a car)</span>
    <span><kbd>H</kbd> / <kbd>C</kbd> / <kbd>G</kbd></span><span>Horn / look back / siren in a police car</span>
    <span><kbd>Esc</kbd> or <kbd>P</kbd></span><span>Pause</span>
  </div>`;

export function createMenus(game) {
  const title = document.getElementById('title');
  const titleMenu = document.getElementById('titlemenu');
  const pause = document.getElementById('pause');
  const pauseMenu = document.getElementById('pausemenu');
  const panel = document.getElementById('pausepanel');
  const menus = { sel: 0 };

  function build(container, items) {
    container.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.textContent = it.label;
      b.disabled = !!it.disabled;
      b.addEventListener('click', (e) => { e.stopPropagation(); game.audio.unlock(); game.audio.click(); it.action(); });
      b.addEventListener('mouseenter', () => { menus.sel = i; highlight(container); });
      container.appendChild(b);
    });
    menus.sel = items.findIndex((it) => !it.disabled);
    highlight(container);
  }
  function highlight(container) {
    [...container.children].forEach((b, i) => b.classList.toggle('sel', i === menus.sel));
  }

  function statsHtml() {
    const s = game.stats;
    const ms = game.missions;
    const next = ms.index < ORDER.length ? STORY[ORDER[ms.index]].title : 'Courier runs';
    return `<div class="stats">
      <span>Story</span><span>${ms.index} of ${ORDER.length} missions · next: ${next}</span>
      <span>Courier runs</span><span>${ms.courier}</span>
      <span>Sun Tokens</span><span>${game.pickups.tokens.size} of ${TOKEN_SPOTS.length}</span>
      <span>Cash</span><span>$${Math.round(game.money).toLocaleString('en-US')}</span>
      <span>Takedowns</span><span>${game.player.kills}</span>
      <span>Cars taken</span><span>${s.cars}</span>
      <span>Distance driven</span><span>${(s.distance / 1000).toFixed(1)} km</span>
      <span>Radio</span><span>${game.audio.stationName()}</span>
    </div>`;
  }

  menus.showTitle = () => {
    game.state = 'title';
    title.classList.remove('hidden');
    pause.classList.add('hidden');
    game.hud.show(false);
    const has = game.save.exists();
    build(titleMenu, [
      ...(has ? [{ label: 'Continue', action: () => { game.newGame(); game.save.load(); menus.play(); } }] : []),
      { label: 'New Game', action: () => { game.newGame(); menus.play(); } },
      { label: 'Controls', action: () => { document.getElementById('hint').innerHTML = CONTROLS; } },
    ]);
  };

  menus.play = () => {
    game.state = 'play';
    title.classList.add('hidden');
    pause.classList.add('hidden');
    game.hud.show(true);
    game.input.lock();
  };

  menus.showPause = () => {
    if (game.state !== 'play') return;
    game.state = 'paused';
    game.input.unlock();
    pause.classList.remove('hidden');
    panel.innerHTML = statsHtml();
    build(pauseMenu, [
      { label: 'Resume', action: () => menus.play() },
      { label: 'Save game', action: () => { game.save.write(false); panel.innerHTML = statsHtml(); } },
      { label: 'Load game', disabled: !game.save.exists(), action: () => { game.save.load(); menus.play(); } },
      { label: 'Radio station', action: () => { game.hud.toast(game.audio.nextStation(), 1.5); panel.innerHTML = statsHtml(); } },
      { label: 'Controls', action: () => { panel.innerHTML = CONTROLS; } },
      { label: 'Quit to title', action: () => menus.showTitle() },
    ]);
  };

  menus.update = () => {
    const inp = game.input;
    if (game.state === 'play' && (inp.hit('Escape') || inp.hit('KeyP'))) { menus.showPause(); return; }
    if (game.state === 'paused' && inp.hit('KeyP')) { menus.play(); return; }
    const container = game.state === 'title' ? titleMenu : game.state === 'paused' ? pauseMenu : null;
    if (!container) return;
    const buttons = [...container.children];
    const move = (inp.hit('ArrowDown', 'KeyS') ? 1 : 0) - (inp.hit('ArrowUp', 'KeyW') ? 1 : 0);
    if (move) {
      let i = menus.sel;
      do { i = (i + move + buttons.length) % buttons.length; } while (buttons[i].disabled);
      menus.sel = i;
      highlight(container);
      game.audio.click();
    }
    if (inp.hit('Enter', 'Space')) buttons[menus.sel]?.click();
  };

  // Escape releases pointer lock before the key event reaches the page; treat that as pause.
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.state === 'play' && !game.noAutoPause) menus.showPause();
  });

  return menus;
}
