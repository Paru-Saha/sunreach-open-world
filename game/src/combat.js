// Fighting: fists with a left-right combo, the Vela 9 pistol and the Gull SMG fired along the
// camera's aim (also from a car window), hits on people (headshots count double), cars and walls,
// enemy fire at the player, and explosion blasts that hurt everything nearby.
import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './config.js';
import { raycastBoxes } from './collision.js';
import { damageVehicle } from './vehicles.js';
import { damagePlayer } from './player.js';
import { panicTraffic } from './traffic.js';

const dir = new THREE.Vector3();
const origin = new THREE.Vector3();

/** Distance along a ray to a standing person (a vertical capsule), or Infinity; also whether it is the head. */
function rayPerson(o, d, ped) {
  const h2 = d.x * d.x + d.z * d.z;
  if (h2 < 1e-6) return [Infinity, false];
  const t = ((ped.x - o.x) * d.x + (ped.z - o.z) * d.z) / h2;
  if (t < 0) return [Infinity, false];
  const px = o.x + d.x * t - ped.x;
  const pz = o.z + d.z * t - ped.z;
  const y = o.y + d.y * t - ped.y;
  if (px * px + pz * pz > 0.2 || y < 0.1 || y > 2.05) return [Infinity, false];
  return [t, y > 1.62];
}

/** Distance along a ray to a car's body box, or Infinity. */
function rayCar(o, d, v) {
  const c = Math.cos(-v.heading);
  const s = Math.sin(-v.heading);
  const lx = o.x - v.x;
  const lz = o.z - v.z;
  const ox = lx * c + lz * s;
  const oz = -lx * s + lz * c;
  const dx = d.x * c + d.z * s;
  const dz = -d.x * s + d.z * c;
  const hw = v.spec.w / 2;
  const hl = v.spec.l / 2;
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const [oo, dd, lo, hi] of [[ox, dx, -hw, hw], [o.y - v.y, d.y, 0.2, 1.6], [oz, dz, -hl, hl]]) {
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return Infinity; continue; }
    let t1 = (lo - oo) / dd;
    let t2 = (hi - oo) / dd;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
  }
  return tmax >= Math.max(0, tmin) ? Math.max(0, tmin) : Infinity;
}

export function createCombat(game) {
  const combat = {};

  /** Casts a shot and returns the first thing it meets. */
  combat.trace = (o, d, range, skipCar, skipPed) => {
    let best = { t: raycastBoxes(o.x, o.y, o.z, d.x, d.y, d.z, range), kind: 'wall' };
    for (const ped of game.peds.list) {
      if (ped.state === 'dead' || ped === skipPed) continue;
      const [t, head] = rayPerson(o, d, ped);
      if (t < best.t) best = { t, kind: 'ped', ped, head };
    }
    for (const v of game.vehicles) {
      if (v === skipCar) continue;
      if (Math.abs(v.x - o.x) > range + 5 && Math.abs(v.z - o.z) > range + 5) continue;
      const t = rayCar(o, d, v);
      if (t < best.t) best = { t, kind: 'car', car: v };
    }
    if (best.t >= range) best.kind = 'none';
    return best;
  };

  function playerFire(w, spec) {
    const p = game.player;
    const cam = game.camera.camera;
    cam.getWorldDirection(dir);
    dir.x += (game.rng() - 0.5) * spec.spread * 2;
    dir.y += (game.rng() - 0.5) * spec.spread * 2;
    dir.z += (game.rng() - 0.5) * spec.spread * 2;
    dir.normalize();
    origin.copy(cam.position);
    // Start the ray level with the player so nothing behind them is hit.
    const skip = Math.max(0, (p.x - origin.x) * dir.x + (p.y + 1.4 - origin.y) * dir.y + (p.z - origin.z) * dir.z - 0.6);
    origin.addScaledVector(dir, skip);
    const hit = combat.trace(origin, dir, spec.range, p.vehicle, null);
    const end = origin.clone().addScaledVector(dir, hit.kind === 'none' ? spec.range : hit.t);
    const hx = Math.sin(p.heading);
    const hz = Math.cos(p.heading);
    const gun = p.vehicle
      ? new THREE.Vector3(p.x + Math.cos(p.vehicle.heading) * 1.1, p.y + 1.5, p.z - Math.sin(p.vehicle.heading) * 1.1)
      : new THREE.Vector3(p.x + hx * 0.7 - hz * 0.3, p.y + 1.5, p.z + hz * 0.7 + hx * 0.3);
    game.effects?.muzzle(gun.x, gun.y, gun.z);
    game.effects?.tracer(gun, end);
    game.audio?.gunshot(w === 'smg');
    game.camera.shake(w === 'smg' ? 0.05 : 0.12);
    if (hit.kind === 'ped') {
      game.peds.damage(hit.ped, spec.damage * (hit.head ? 2.2 : 1), 'player', p.x, p.z);
      if (hit.head && hit.ped.state === 'dead') game.hud?.toast('Headshot', 0.8);
    } else if (hit.kind === 'car') {
      damageVehicle(game, hit.car, spec.damage * 0.35, 'player');
      game.effects?.sparks(end.x, end.y, end.z, 6);
      if (hit.car.driver === 'ai' && hit.car.ai) hit.car.ai.panic = 8;
    } else if (hit.kind === 'wall') {
      game.effects?.sparks(end.x, end.y, end.z, 5);
    }
    game.police?.crime('gunfire', p.x, p.z);
    game.peds.scare(p.x, p.z, 45, p.x, p.z);
    panicTraffic(game, p.x, p.z, 60);
  }

  function punch() {
    const p = game.player;
    p.punchT = 0.3;
    p.punchLeft = !p.punchLeft;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    let target = null;
    let best = WEAPONS.fists.range + 0.4;
    for (const ped of game.peds.list) {
      if (ped.state === 'dead') continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < best && (dx * fx + dz * fz) / (d || 1) > 0.45) { best = d; target = ped; }
    }
    game.audio?.swing();
    if (target) {
      game.audio?.punch(target.x, target.z);
      target.x += fx * 0.4;
      target.z += fz * 0.4;
      game.peds.damage(target, WEAPONS.fists.damage * (p.punchLeft ? 1 : 1.3), 'player', p.x, p.z);
      game.camera.shake(0.08);
    }
  }

  combat.update = (dt) => {
    const p = game.player;
    const inp = game.input;
    p.cooldown = Math.max(0, p.cooldown - dt);
    if (p.dead || game.state !== 'play') { p.aiming = false; return; }

    if (inp.hit('KeyQ') || inp.wheel) combat.cycle(inp.wheel < 0 ? -1 : 1);
    if (inp.hit('Digit1')) combat.select('fists');
    if (inp.hit('Digit2')) combat.select('pistol');
    if (inp.hit('Digit3')) combat.select('smg');

    const w = p.weapon;
    const spec = WEAPONS[w];
    p.aiming = !p.vehicle && inp.rightDown && w !== 'fists';
    const wants = spec.auto ? inp.leftDown : inp.leftClicked;
    if (!wants || p.cooldown > 0) return;
    if (p.vehicle && w === 'fists') return;
    if (w === 'fists') { p.cooldown = spec.cooldown; punch(); return; }
    if (p.ammo[w] <= 0) {
      if (inp.leftClicked) { game.audio?.click(); game.hud?.toast('Out of ammo — Sunreach Surplus sells more', 1.5); }
      return;
    }
    p.ammo[w] -= 1;
    p.cooldown = spec.cooldown;
    if (!p.vehicle) p.heading = game.rig.yaw;
    playerFire(w, spec);
  };

  combat.select = (w) => {
    const p = game.player;
    if (!p.owned[w]) return;
    p.weapon = w;
    game.audio?.click();
  };
  combat.cycle = (step) => {
    const p = game.player;
    const owned = WEAPON_ORDER.filter((w) => p.owned[w]);
    const i = owned.indexOf(p.weapon);
    p.weapon = owned[(i + step + owned.length) % owned.length];
    game.audio?.click();
  };

  /** An officer or crew member fires at the player. */
  combat.npcFire = (ped, p) => {
    const from = new THREE.Vector3(ped.x + Math.sin(ped.heading) * 0.6, ped.y + 1.45, ped.z + Math.cos(ped.heading) * 0.6);
    const to = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    const d = from.distanceTo(to);
    const moving = p.vehicle ? Math.hypot(p.vehicle.vx, p.vehicle.vz) : p.speed;
    const chance = Math.max(0.12, 0.7 - d * 0.012 - moving * 0.03);
    const hits = game.rng() < chance;
    if (!hits) { to.x += (game.rng() - 0.5) * 3; to.y += (game.rng() - 0.3) * 2; to.z += (game.rng() - 0.5) * 3; }
    game.effects?.muzzle(from.x, from.y, from.z);
    game.effects?.tracer(from, to);
    game.audio?.gunshot(false, ped.x, ped.z);
    if (!hits) return;
    if (p.vehicle) {
      damageVehicle(game, p.vehicle, 3, null);
      damagePlayer(game, 2, ped.x, ped.z);
    } else damagePlayer(game, ped.kind === 'cop' ? 8 : 6, ped.x, ped.z);
  };

  /** Explosion damage falling off with distance. */
  combat.blast = (x, z, radius, damage, source, except) => {
    for (const ped of game.peds.list) {
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < radius && ped.state !== 'dead') { ped.vy = 6; game.peds.damage(ped, damage * (1 - d / radius), source, x, z); }
    }
    for (const v of game.vehicles) {
      if (v === except) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < radius) {
        damageVehicle(game, v, damage * 0.5 * (1 - d / radius), source);
        v.vx += ((v.x - x) / (d || 1)) * 8;
        v.vz += ((v.z - z) / (d || 1)) * 8;
      }
    }
    const p = game.player;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < radius && !p.vehicle) damagePlayer(game, damage * 0.6 * (1 - d / radius), x, z);
    game.camera.shake(Math.max(0, 1 - d / 60));
    game.peds.scare(x, z, 60, x, z);
    panicTraffic(game, x, z, 80);
  };

  return combat;
}
