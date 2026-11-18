// Remy Sol, the player: walking, sprinting and jumping relative to the camera, swimming, getting
// in and out of cars (pulling a driver out when it is taken by force), driving input, health and
// armour, and going down when the damage is too much.
import { PLAYER, CITY } from './config.js';
import { createHumanoid, animateHumanoid, OUTFITS } from './characters.js';
import { resolveCircle } from './collision.js';
import { groundHeight } from './city.js';
import { inWater } from './ocean.js';
import { nearestVehicle, closestOnCar } from './vehicles.js';
import { clamp, damp, turnToward } from './rng.js';

export function createPlayer(game) {
  const model = createHumanoid(OUTFITS.player, game.rng);
  game.scene.add(model.root);
  const p = {
    x: 0, y: 0, z: 0, vy: 0, vx: 0, vz: 0, heading: 0, speed: 0,
    hp: PLAYER.maxHealth, armor: 0, model, vehicle: null,
    weapon: 'fists', ammo: { pistol: 0, smg: 0 }, owned: { fists: true, pistol: false, smg: false },
    punchT: 0, punchLeft: false, cooldown: 0, aiming: false, grounded: true, swimming: false,
    dead: false, downT: 0, hurtT: 0, stamina: 1, kills: 0, carjackT: 0,
  };
  return p;
}

export function teleportPlayer(game, x, z, heading = 0) {
  const p = game.player;
  if (p.vehicle) exitVehicle(game, true);
  p.x = x; p.z = z; p.y = groundHeight(x, z); p.vy = 0; p.heading = heading;
  p.model.root.position.set(p.x, p.y, p.z);
  game.rig.yaw = heading;
}

/** Puts the player in a car; an occupied one is taken by force. */
export function enterVehicle(game, v) {
  const p = game.player;
  if (v.driver && v.driver !== 'player') {
    game.peds?.ejectDriver(v, p);
    game.police?.crime(v.police ? 'steal-police' : 'carjack', v.x, v.z, v.police ? 2 : 0);
    game.audio?.punch();
  }
  p.vehicle = v;
  v.driver = 'player';
  v.ai = null;
  v.siren = false;
  v.model.root.add(p.model.root);
  p.model.root.position.set(v.spec.w * 0.22, 0.25, -0.1);
  p.model.root.rotation.set(0, 0, 0);
  p.model.root.visible = v.spec.cabin === 0;
  game.rig.mouseIdle = 10;
  game.hud?.toast(`${v.spec.name}`, 1.6);
  game.audio?.door();
  game.missions?.onEnterVehicle(v);
}

/** Leaves the current car on the driver's side (or the other side when that is blocked). */
export function exitVehicle(game, quiet = false) {
  const p = game.player;
  const v = p.vehicle;
  if (!v) return;
  v.model.root.remove(p.model.root);
  game.scene.add(p.model.root);
  p.model.root.visible = true;
  v.driver = null;
  v.ctrl = { throttle: 0, steer: 0, handbrake: true };
  p.vehicle = null;
  const lx = Math.cos(v.heading);
  const lz = -Math.sin(v.heading);
  let x = v.x + lx * 2.3;
  let z = v.z + lz * 2.3;
  if (resolveCircle(x, z, PLAYER.radius)) { x = v.x - lx * 2.3; z = v.z - lz * 2.3; }
  p.x = x; p.z = z; p.y = groundHeight(x, z); p.vy = 0;
  p.heading = v.heading;
  game.rig.yaw = v.heading;
  game.rig.pitch = 0.2;
  if (!quiet) game.audio?.door();
}

/** Hurts the player; armour soaks most of it first. */
export function damagePlayer(game, amount, fromX, fromZ) {
  const p = game.player;
  if (p.dead || game.godMode) return;
  if (p.armor > 0) {
    const soak = Math.min(p.armor, amount * 0.7);
    p.armor -= soak;
    amount -= soak;
  }
  p.hp -= amount;
  p.hurtT = 0.35;
  game.hud?.hurt(fromX, fromZ);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    p.downT = 0;
    if (p.vehicle) exitVehicle(game, true);
    game.audio?.down();
  }
}

function driveInput(game, v) {
  const inp = game.input;
  v.ctrl.throttle = inp.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
  v.ctrl.steer = inp.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
  v.ctrl.handbrake = inp.down('Space');
  game.rig.lookBack = inp.down('KeyC');
  if (inp.hit('KeyH')) game.audio?.horn();
  if (inp.hit('KeyG') && v.police) { v.siren = !v.siren; }
}

export function updatePlayer(game, dt) {
  const p = game.player;
  const inp = game.input;
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.dead) {
    p.downT += dt;
    animateHumanoid(p.model, { down: true }, dt);
    p.model.root.position.set(p.x, p.y, p.z);
    return;
  }

  if (p.vehicle) {
    const v = p.vehicle;
    driveInput(game, v);
    p.x = v.x; p.z = v.z; p.y = v.y;
    animateHumanoid(p.model, { seated: true }, dt);
    if (v.destroyed && v.health <= 0 && !v.sinking) {
      exitVehicle(game, true);
      damagePlayer(game, 200, v.x, v.z);
      return;
    }
    if (v.sinking > 0.6) {
      exitVehicle(game, true);
      game.hud?.toast('Swim for it!', 2);
    }
    if (inp.hit('KeyF', 'KeyE') && Math.abs(v.speed) < 14) exitVehicle(game);
    return;
  }

  if (inp.hit('KeyF', 'KeyE')) {
    const v = nearestVehicle(game, p.x, p.z, PLAYER.enterRange);
    if (v && !game.interactBlocked) { enterVehicle(game, v); return; }
  }

  // Movement relative to the camera.
  const yaw = game.rig.yaw;
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const mf = inp.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']);
  const ms = inp.axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']);
  let mx = fx * mf + lx * ms;
  let mz = fz * mf + lz * ms;
  const len = Math.hypot(mx, mz);
  if (len > 0) { mx /= len; mz /= len; }
  p.swimming = inWater(p.x, p.z);
  const sprinting = inp.down('ShiftLeft', 'ShiftRight') && len > 0 && p.stamina > 0.05 && !p.aiming;
  p.stamina = clamp(p.stamina + (sprinting ? -0.12 : 0.18) * dt, 0, 1);
  let top = sprinting ? PLAYER.sprint : PLAYER.walk;
  if (p.swimming) top = 2.6;
  if (p.aiming) top = Math.min(top, 3.2);
  p.vx = damp(p.vx, mx * top, p.grounded ? 12 : 2, dt);
  p.vz = damp(p.vz, mz * top, p.grounded ? 12 : 2, dt);
  p.speed = Math.hypot(p.vx, p.vz);

  if (p.aiming) p.heading = turnToward(p.heading, yaw, 14 * dt);
  else if (p.speed > 0.4) p.heading = turnToward(p.heading, Math.atan2(p.vx, p.vz), 11 * dt);

  if (inp.hit('Space') && p.grounded && !p.swimming) { p.vy = PLAYER.jump; p.grounded = false; }
  p.vy -= PLAYER.gravity * dt;
  p.x += p.vx * dt;
  p.z += p.vz * dt;
  p.y += p.vy * dt;
  const floor = p.swimming ? -0.9 : groundHeight(p.x, p.z);
  if (p.y <= floor) { p.y = floor; p.vy = 0; p.grounded = true; }

  const hit = resolveCircle(p.x, p.z, PLAYER.radius, p.y);
  if (hit) { p.x = hit.x; p.z = hit.z; }
  // Cars are solid; a fast one knocks the player down.
  for (const v of game.vehicles) {
    if (Math.abs(p.x - v.x) > 5 || Math.abs(p.z - v.z) > 5) continue;
    const c = closestOnCar(v, p.x, p.z);
    const min = v.radius + PLAYER.radius - 0.15;
    if (c.d > min || c.d < 1e-4) continue;
    const dx = (p.x - c.x) / c.d;
    const dz = (p.z - c.z) / c.d;
    const d = 1;
    p.x = c.x + dx * min;
    p.z = c.z + dz * min;
    {
      const sp = Math.hypot(v.vx, v.vz);
      if (sp > 6 && v.driver !== 'player') {
        damagePlayer(game, sp * 1.6, v.x, v.z);
        p.vx += (dx / d) * sp * 0.6;
        p.vz += (dz / d) * sp * 0.6;
        p.vy = 4;
        p.grounded = false;
      }
    }
  }
  p.x = clamp(p.x, CITY.harborX - 60, CITY.bound);
  p.z = clamp(p.z, -CITY.bound, CITY.waterZ + 120);

  p.punchT = Math.max(0, p.punchT - dt);
  const r = p.model.root;
  r.position.set(p.x, p.y, p.z);
  r.rotation.y = p.heading;
  animateHumanoid(p.model, {
    speed: p.swimming ? p.speed * 0.6 : p.speed,
    aiming: p.aiming && p.weapon !== 'fists',
    pitch: -game.rig.pitch * 0.6,
    punching: p.punchT > 0 ? 1 - p.punchT / 0.3 : 0,
    punchLeft: p.punchLeft,
    airborne: !p.grounded,
  }, dt);
  p.model.gun.visible = p.weapon !== 'fists';
}
