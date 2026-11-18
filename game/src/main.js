// Sunreach Bay: boots the renderer, builds the bay, wires every system together and runs the
// fixed-step game loop: title flyover, play, pause, blacking out and being cuffed, and the
// deterministic screenshot scenes reached with ?shot=name&seed=n.
import * as THREE from 'three';
import { STEP, ECONOMY, PLAYER } from './config.js';
import { createRng } from './rng.js';
import { createInput } from './input.js';
import { buildSky } from './sky.js';
import { buildCity, SITES } from './city.js';
import { buildProps } from './props.js';
import { buildOcean } from './ocean.js';
import { createPlayer, updatePlayer, teleportPlayer, exitVehicle } from './player.js';
import { updateVehicles, nearestVehicle } from './vehicles.js';
import { seedTraffic, updateTraffic } from './traffic.js';
import { createPeds } from './peds.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMinimap } from './minimap.js';
import { createPickups } from './pickups.js';
import { createMissions } from './missions.js';
import { createSave } from './save.js';
import { createMenus } from './menus.js';
import { createCameraRig, applyMouse, updateFootCamera, updateCarCamera, updateOrbitCamera } from './camera.js';
import { runShot } from './shots.js';

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: !!shot });
renderer.setPixelRatio(shot ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 2200);

const game = {
  scene, renderer,
  rng: createRng(Number(params.get('seed')) || (Date.now() % 100000)),
  input: createInput(canvas),
  time: 0, frame: 0, vehicles: [], state: 'title', money: 0,
  stats: { missions: 0, kills: 0, cars: 0, distance: 0 },
  interactBlocked: false,
};
game.rig = createCameraRig(camera);
game.camera = game.rig;
game.sky = buildSky(scene, renderer);
game.city = buildCity(scene);
game.props = buildProps(scene);
game.ocean = buildOcean(scene);
game.effects = createEffects(game);
game.audio = createAudio(game);
game.player = createPlayer(game);
game.peds = createPeds(game);
game.police = createPolice(game);
game.combat = createCombat(game);
game.hud = createHud(game);
game.pickups = createPickups(game);
game.missions = createMissions(game);
game.minimap = createMinimap(game, document.getElementById('minimap'));
game.save = createSave(game);
game.menus = createMenus(game);

/** Moves the player somewhere fresh (respawn, load) and refills the streets around them. */
game.respawnAt = (x, z, heading = 0) => {
  const p = game.player;
  if (p.vehicle) exitVehicle(game, true);
  p.dead = false;
  p.downT = 0;
  p.model.root.visible = true;
  teleportPlayer(game, x, z, heading);
  game.rig.pitch = 0.18;
  game.police.reset();
  const moving = game.vehicles.filter((v) => v.ai?.kind === 'traffic' && Math.hypot(v.x - x, v.z - z) < 260).length;
  if (moving < 12) seedTraffic(game, x, z, 18);
  const walkers = game.peds.list.filter((q) => q.kind === 'civ' && Math.hypot(q.x - x, q.z - z) < 160).length;
  if (walkers < 15) game.peds.seed(x, z, 26);
};

game.newGame = () => {
  const p = game.player;
  game.money = ECONOMY.startMoney;
  game.stats = { missions: 0, kills: 0, cars: 0, distance: 0 };
  p.hp = PLAYER.maxHealth;
  p.armor = 0;
  p.ammo = { pistol: 0, smg: 0 };
  p.owned = { fists: true, pistol: false, smg: false };
  p.weapon = 'fists';
  p.kills = 0;
  game.pickups.reset();
  game.pickups.tokens = new Set();
  game.pickups.placeTokens();
  game.missions.load({});
  const door = SITES.odile.door;
  game.respawnAt(door.x - 3, door.z + 8, Math.PI); // on the kerb, looking at the laundromat
  game.hud.shownMoney = game.money;
  game.hud.big('SUNREACH BAY', 'Saltmarsh · 5:42 PM · Remy Sol is home', 4, '#ff9e5e');
};

function blackout(text, sub, site, fee) {
  const fade = document.getElementById('fade');
  fade.style.opacity = 1;
  game.missions.fail(text === 'CUFFED' ? 'You were arrested.' : 'You blacked out.');
  setTimeout(() => {
    game.money = Math.max(0, game.money - fee);
    const p = game.player;
    p.hp = PLAYER.maxHealth;
    if (text === 'CUFFED') { p.ammo.pistol = Math.floor(p.ammo.pistol / 2); p.ammo.smg = Math.floor(p.ammo.smg / 2); }
    game.respawnAt(site.door.x, site.door.z + 2, Math.PI);
    game.hud.big(text, sub, 4, text === 'CUFFED' ? '#4cc9f0' : '#ff4d6d');
    fade.style.opacity = 0;
  }, 900);
}
game.arrest = () => {
  if (game.player.arrested) return;
  game.player.arrested = true;
  game.state = 'busy';
  exitVehicle(game, true);
  blackout('CUFFED', `Released from ${SITES.precinct.name} · -$${ECONOMY.arrestFee}`, SITES.precinct, ECONOMY.arrestFee);
  setTimeout(() => { game.state = 'play'; game.player.arrested = false; }, 1000);
};

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
canvas.addEventListener('click', () => { game.audio.unlock(); if (game.state === 'play') game.input.lock(); });
window.addEventListener('keydown', () => game.audio.unlock(), { once: true });

let lastCar = null;
/** One fixed simulation step. */
function step(dt) {
  game.time += dt;
  const playing = game.state === 'play';
  const p = game.player;
  if (playing) {
    updatePlayer(game, dt);
    game.combat.update(dt);
    if (p.vehicle && p.vehicle !== lastCar) { game.stats.cars += 1; lastCar = p.vehicle; }
    if (p.vehicle) game.stats.distance += Math.abs(p.vehicle.speed) * dt;
    if (p.vehicle && game.input.hit('KeyR')) game.hud.toast(game.audio.nextStation(), 1.5);
  }
  if (playing || game.state === 'title' || game.state === 'busy') {
    updateTraffic(game, dt);
    if (playing) game.police.update(dt);
    game.peds.update(dt);
    updateVehicles(game, dt);
  }
  if (playing) {
    game.pickups.update(dt);
    game.missions.update(dt);
    if (p.dead && p.downT > 3.2 && !p.respawning) {
      p.respawning = true;
      blackout('BLACKED OUT', `${SITES.clinic.name} patched you up · -$${ECONOMY.deathFee}`, SITES.clinic, ECONOMY.deathFee);
      setTimeout(() => { p.respawning = false; }, 1000);
    }
  }
  game.effects.update(dt);
  game.ocean.update(game.time);
}

function contextPrompt() {
  const p = game.player;
  if (game.state !== 'play' || p.dead) return;
  if (!p.vehicle) {
    const v = nearestVehicle(game, p.x, p.z, PLAYER.enterRange);
    if (v && !game.interactBlocked) game.hud.prompt(`<kbd>F</kbd> ${v.driver === 'ai' ? 'Take' : 'Get in'} the ${v.spec.name}`);
  } else if (p.vehicle.police && !p.vehicle.siren) game.hud.prompt('<kbd>G</kbd> Siren');
}

/** Places the camera for this frame. */
function placeCamera(dt, snap = false) {
  const p = game.player;
  if (game.state === 'title') {
    updateOrbitCamera(game.rig, 60, 18, 40, 150, 70, game.time);
    game.sky.follow(60, 40);
    return;
  }
  if (p.vehicle) updateCarCamera(game.rig, p.vehicle, dt, snap);
  else updateFootCamera(game.rig, p.x, p.y, p.z, p.aiming, dt, snap);
  game.sky.follow(p.x, p.z);
}
game.placeCamera = placeCamera;
game.step = step;

function render() {
  renderer.render(scene, camera);
}
game.render = render;

if (shot) {
  runShot(game, shot);
} else {
  game.menus.showTitle();
  seedTraffic(game, 60, 40, 22);
  game.peds.seed(60, 40, 28);
  let last = performance.now();
  let acc = 0;
  const frame = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt;
    if (game.state === 'play') applyMouse(game.rig, game.input);
    let ran = 0;
    while (acc >= STEP && ran < 6) {
      if (ran === 0) game.menus.update();
      step(STEP);
      acc -= STEP;
      game.frame += 1;
      ran += 1;
      // One-shot presses belong to the first step that sees them.
      game.input.pressed.clear();
      game.input.leftClicked = false;
      game.input.wheel = 0;
    }
    if (ran >= 6) acc = 0;
    contextPrompt();
    placeCamera(dt);
    if (game.state !== 'title') {
      game.hud.update(dt);
      if (game.frame % 2 === 0) game.minimap.draw();
    }
    game.audio.update(dt);
    render();
    game.input.mouseDX = 0;
    game.input.mouseDY = 0;
    if (ran > 0) game.input.endFrame();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
window.__game = game;
