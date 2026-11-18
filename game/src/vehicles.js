// Cars of Sunreach Bay: seven original models built from boxes, an arcade driving model with
// grip, drift on the handbrake and weight transfer, collisions with the city and each other,
// damage that smokes, burns and finally explodes, and police light bars that flash.
import * as THREE from 'three';
import { VEHICLE, PALETTE, CITY } from './config.js';
import { resolveCircle } from './collision.js';
import { groundHeight } from './city.js';
import { inWater } from './ocean.js';
import { clamp, damp } from './rng.js';

export const MODELS = {
  vesper: { name: 'Vesper GT', w: 2.0, l: 4.4, h: 0.5, cabin: 0.42, cabinLen: 0.38, top: 0.48, max: 52, accel: 21, grip: 9.5, hp: 90 },
  marlin: { name: 'Marlin Sedan', w: 2.0, l: 4.7, h: 0.62, cabin: 0.55, cabinLen: 0.48, top: 0.58, max: 40, accel: 14, grip: 8.5, hp: 100 },
  cab: { name: 'Sunreach Cab', w: 2.0, l: 4.7, h: 0.62, cabin: 0.55, cabinLen: 0.48, top: 0.58, max: 40, accel: 14, grip: 8.5, hp: 100, color: 0xffc300 },
  gull: { name: 'Gull Van', w: 2.2, l: 5.2, h: 1.1, cabin: 0.85, cabinLen: 0.7, top: 0.95, max: 31, accel: 10, grip: 7.5, hp: 140 },
  pickup: { name: 'Saltmarsh Pickup', w: 2.1, l: 5.0, h: 0.72, cabin: 0.6, cabinLen: 0.32, top: 0.62, max: 37, accel: 13, grip: 8, hp: 130, bed: true },
  breeze: { name: 'Breeze Roadster', w: 1.95, l: 4.2, h: 0.5, cabin: 0, cabinLen: 0.3, top: 0, max: 47, accel: 18, grip: 10, hp: 80 },
  cruiser: { name: 'SBPD Cruiser', w: 2.05, l: 4.9, h: 0.62, cabin: 0.55, cabinLen: 0.48, top: 0.58, max: 50, accel: 18, grip: 9.5, hp: 130, police: true },
};
export const CIVILIAN = ['marlin', 'marlin', 'cab', 'gull', 'pickup', 'breeze', 'vesper', 'marlin', 'cab'];

const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xcfd2d6 });
const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
hubGeo.rotateZ(Math.PI / 2);
const glassMat = new THREE.MeshPhongMaterial({ color: 0x1c2a38, shininess: 120, specular: 0xaaccee });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x222428 });
const chromeMat = new THREE.MeshPhongMaterial({ color: 0xdddddd, shininess: 100 });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1a1714 });
const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) paintCache.set(color, new THREE.MeshPhongMaterial({ color, shininess: 90, specular: 0x555555 }));
  return paintCache.get(color);
}

function box(w, h, d, m, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildModel(spec, color) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paintMat = spec.police ? paint(0xf8f9fa) : paint(color);
  const { w, l, h } = spec;
  const base = 0.42;
  box(w, h, l, paintMat, 0, base + h / 2, 0, body);
  box(w * 1.01, 0.18, l * 1.01, darkMat, 0, base + 0.06, 0, body);
  if (spec.police) {
    box(w * 1.02, h * 0.55, l * 0.5, paint(0x111827), 0, base + h * 0.35, 0, body);
  }
  if (spec.cabin > 0) {
    const cl = l * spec.cabinLen;
    const cabin = box(w * 0.86, spec.cabin, cl, spec.police ? paint(0xf8f9fa) : paintMat, 0, base + h + spec.cabin / 2, spec.bed ? l * 0.12 : -l * 0.04, body);
    box(w * 0.88, spec.cabin * 0.7, cl * 1.02, glassMat, 0, base + h + spec.cabin * 0.45, cabin.position.z, body);
    box(w * 0.8, spec.cabin * 0.68, 0.06, glassMat, 0, base + h + spec.cabin * 0.42, cabin.position.z + cl / 2 + 0.02, body);
  } else {
    box(w * 0.8, 0.35, 0.06, glassMat, 0, base + h + 0.18, l * 0.12, body);
    box(w * 0.36, 0.3, 0.5, darkMat, w * 0.2, base + h + 0.1, -l * 0.08, body);
    box(w * 0.36, 0.3, 0.5, darkMat, -w * 0.2, base + h + 0.1, -l * 0.08, body);
  }
  if (spec.bed) box(w * 0.9, 0.08, l * 0.36, darkMat, 0, base + h + 0.02, -l * 0.28, body);
  box(w * 0.96, 0.14, 0.12, chromeMat, 0, base + 0.18, l / 2 + 0.05, body);
  box(w * 0.96, 0.14, 0.12, chromeMat, 0, base + 0.18, -l / 2 - 0.05, body);

  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff4d6 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x8a1010 });
  box(0.42, 0.16, 0.06, headMat, w * 0.32, base + h * 0.65, l / 2 + 0.01, body);
  box(0.42, 0.16, 0.06, headMat, -w * 0.32, base + h * 0.65, l / 2 + 0.01, body);
  box(0.42, 0.14, 0.06, tailMat, w * 0.33, base + h * 0.7, -l / 2 - 0.01, body);
  box(0.42, 0.14, 0.06, tailMat, -w * 0.33, base + h * 0.7, -l / 2 - 0.01, body);

  let bar = null;
  if (spec.police) {
    const top = base + h + spec.cabin;
    bar = {
      red: box(0.6, 0.16, 0.3, new THREE.MeshBasicMaterial({ color: 0x550000 }), 0.35, top + 0.08, -l * 0.04, body),
      blue: box(0.6, 0.16, 0.3, new THREE.MeshBasicMaterial({ color: 0x000055 }), -0.35, top + 0.08, -l * 0.04, body),
    };
    box(0.12, 0.17, 0.3, darkMat, 0, top + 0.08, -l * 0.04, body);
  }
  if (spec === MODELS.cab) {
    const top = base + h + spec.cabin;
    box(0.7, 0.24, 0.3, new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, top + 0.12, -l * 0.04, body);
  }

  const wheels = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * (w / 2 - 0.08), 0.38, sz * (l / 2 - 0.85));
    const tyre = new THREE.Mesh(wheelGeo, wheelMat);
    tyre.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    tyre.add(hub);
    pivot.add(tyre);
    root.add(pivot);
    wheels.push({ pivot, tyre, front: sz > 0 });
  }
  return { root, body, wheels, bar, tailMat, headMat, paintMat };
}

let nextId = 1;

/** Places a new car in the world. */
export function spawnVehicle(game, type, x, z, heading, color) {
  const spec = MODELS[type];
  const col = color ?? spec.color ?? PALETTE.car[Math.floor(game.rng() * PALETTE.car.length)];
  const model = buildModel(spec, col);
  game.scene.add(model.root);
  const v = {
    id: nextId++, type, spec, model, color: col,
    x, z, y: 0, heading, vx: 0, vz: 0, speed: 0, yawRate: 0, steerVis: 0, roll: 0, pitch: 0,
    health: spec.hp, maxHealth: spec.hp, driver: null, ai: null, ctrl: { throttle: 0, steer: 0, handbrake: false },
    siren: false, burning: 0, destroyed: false, sinking: 0, smokeT: 0, lastHit: 0, skid: 0, radius: VEHICLE.radius,
    police: !!spec.police, horn: 0, removeT: 0,
  };
  syncModel(v, 0);
  game.vehicles.push(v);
  return v;
}

export function removeVehicle(game, v) {
  game.scene.remove(v.model.root);
  const i = game.vehicles.indexOf(v);
  if (i >= 0) game.vehicles.splice(i, 1);
}

export const forwardOf = (v) => ({ x: Math.sin(v.heading), z: Math.cos(v.heading) });

/** Damages a car; at zero it explodes. `source` is 'player' when the player caused it. */
export function damageVehicle(game, v, amount, source) {
  if (v.destroyed) return;
  v.health -= amount;
  if (source === 'player') v.lastHit = game.time;
  if (v.health <= 0) explodeVehicle(game, v, source);
}

export function explodeVehicle(game, v, source) {
  if (v.destroyed) return;
  v.destroyed = true;
  v.health = 0;
  v.burning = 0;
  v.vx *= 0.3;
  v.vz *= 0.3;
  v.model.root.traverse((o) => { if (o.isMesh && o.material !== wheelMat) o.material = burntMat; });
  game.effects?.explosion(v.x, 1, v.z);
  game.audio?.explosion(v.x, v.z);
  game.combat?.blast(v.x, v.z, 7, 120, source, v);
  if (source === 'player') game.police?.crime('explosion', v.x, v.z, v.police ? 2 : 1);
  v.removeT = 25;
}

function syncModel(v, dt) {
  const r = v.model.root;
  r.position.set(v.x, v.y, v.z);
  r.rotation.y = v.heading;
  v.model.body.rotation.z = v.roll;
  v.model.body.rotation.x = v.pitch;
  for (const wh of v.model.wheels) {
    wh.tyre.rotation.x += (v.speed * dt) / 0.38;
    if (wh.front) wh.pivot.rotation.y = v.steerVis * 0.5;
  }
}

/** Integrates one car for one step from its ctrl (throttle, steer, handbrake). */
function drive(game, v, dt) {
  const spec = v.spec;
  const c = v.destroyed || v.sinking ? { throttle: 0, steer: 0, handbrake: true } : v.ctrl;
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  const sx = Math.cos(v.heading);
  const sz = -Math.sin(v.heading);
  let vLong = v.vx * fx + v.vz * fz;
  let vLat = v.vx * sx + v.vz * sz;
  const before = vLong;

  if (c.throttle > 0) {
    if (vLong < -0.5) vLong += VEHICLE.brake * dt;
    else vLong += spec.accel * c.throttle * Math.max(0, 1 - Math.max(0, vLong) / spec.max) * dt;
  } else if (c.throttle < 0) {
    if (vLong > 0.5) vLong -= VEHICLE.brake * -c.throttle * dt;
    else vLong -= VEHICLE.reverseAccel * -c.throttle * Math.max(0, 1 + Math.min(0, vLong) / (spec.max * 0.35)) * dt;
  } else {
    const roll = VEHICLE.rolling * dt;
    vLong = Math.abs(vLong) < roll ? 0 : vLong - Math.sign(vLong) * roll;
  }
  vLong -= vLong * Math.abs(vLong) * 0.0009 * dt * 10;
  if (c.handbrake) vLong = damp(vLong, 0, 1.2, dt);

  const speedFactor = clamp(vLong / 5, -1, 1);
  const turn = VEHICLE.turnRate / (1 + Math.abs(vLong) / 32);
  const targetYaw = c.steer * turn * speedFactor * (c.handbrake ? 1.45 : 1);
  v.yawRate = damp(v.yawRate, targetYaw, 10, dt);
  v.heading += v.yawRate * dt;
  const grip = c.handbrake ? VEHICLE.driftGrip : spec.grip;
  const lat0 = vLat;
  vLat *= Math.exp(-grip * dt);
  v.skid = Math.abs(lat0) > 4.5 ? Math.min(1, Math.abs(lat0) / 10) : 0;

  const nfx = Math.sin(v.heading);
  const nfz = Math.cos(v.heading);
  const nsx = Math.cos(v.heading);
  const nsz = -Math.sin(v.heading);
  v.vx = nfx * vLong + nsx * vLat;
  v.vz = nfz * vLong + nsz * vLat;
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  v.speed = vLong;

  // Two circles, front and back, against buildings.
  const off = spec.l * 0.28;
  for (const sgn of [1, -1]) {
    const cx = v.x + nfx * off * sgn;
    const cz = v.z + nfz * off * sgn;
    const hit = resolveCircle(cx, cz, v.radius);
    if (!hit) continue;
    v.x += hit.x - cx;
    v.z += hit.z - cz;
    const impact = -(v.vx * hit.nx + v.vz * hit.nz);
    if (impact > 0) {
      v.vx += hit.nx * impact * 1.25;
      v.vz += hit.nz * impact * 1.25;
      v.vx *= 0.85;
      v.vz *= 0.85;
      if (impact > 4) {
        damageVehicle(game, v, (impact - 3) * 2.2, v.driver === 'player' ? 'self' : null);
        game.effects?.sparks(cx - hit.nx * v.radius, 0.8, cz - hit.nz * v.radius, Math.min(20, impact * 2));
        game.audio?.crash(Math.min(1, impact / 20), v.x, v.z);
        if (v.driver === 'player') game.camera?.shake(Math.min(0.6, impact / 30));
      }
    }
  }
  const b = CITY.bound;
  v.x = clamp(v.x, CITY.harborX - 40, b);
  v.z = clamp(v.z, -b, CITY.waterZ + 60);

  // Water: the car floods and sinks; anyone inside must get out.
  if (inWater(v.x, v.z)) {
    v.sinking += dt;
    v.vx *= Math.exp(-2 * dt);
    v.vz *= Math.exp(-2 * dt);
    if (v.sinking > 0.2 && !v.splashed) { v.splashed = true; game.effects?.splash(v.x, v.z); game.audio?.splash(); }
    if (v.sinking > 4 && !v.destroyed) { v.destroyed = true; v.health = 0; v.removeT = 6; }
  }
  const ground = groundHeight(v.x, v.z);
  v.y = damp(v.y, ground - Math.min(2.5, v.sinking * 0.7), 12, dt);

  // Body lean from acceleration and cornering.
  const accel = (vLong - before) / dt;
  v.pitch = damp(v.pitch, clamp(-accel * 0.004, -0.06, 0.06), 6, dt);
  v.roll = damp(v.roll, clamp(-v.yawRate * vLong * 0.004, -0.08, 0.08), 6, dt);
  v.steerVis = damp(v.steerVis, c.steer, 10, dt);
}

/** The two collision circle centres of a car, front and back along its length. */
export function carCircles(v) {
  const off = v.spec.l * 0.28;
  const fx = Math.sin(v.heading) * off;
  const fz = Math.cos(v.heading) * off;
  return [v.x + fx, v.z + fz, v.x - fx, v.z - fz];
}

/** Closest point on a car's centre line to (x, z): returns { x, z, d } with the distance. */
export function closestOnCar(v, x, z) {
  const [ax, az, bx, bz] = carCircles(v);
  const ex = bx - ax;
  const ez = bz - az;
  const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1), 0, 1);
  const cx = ax + ex * t;
  const cz = az + ez * t;
  return { x: cx, z: cz, d: Math.hypot(x - cx, z - cz) };
}

function collidePairs(game) {
  const list = game.vehicles;
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j += 1) {
      const b = list[j];
      if (Math.abs(b.x - a.x) > 7 || Math.abs(b.z - a.z) > 7) continue;
      const ca = carCircles(a);
      const cb = carCircles(b);
      let best = null;
      for (let p = 0; p < 4; p += 2) {
        for (let q = 0; q < 4; q += 2) {
          const ddx = cb[q] - ca[p];
          const ddz = cb[q + 1] - ca[p + 1];
          const dd = ddx * ddx + ddz * ddz;
          if (!best || dd < best[2]) best = [ddx, ddz, dd];
        }
      }
      const [dx, dz, d2] = best;
      const min = a.radius + b.radius;
      if (d2 >= min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const push = (min - d) / 2;
      a.x -= nx * push; a.z -= nz * push;
      b.x += nx * push; b.z += nz * push;
      const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rel < 0) {
        const imp = -rel * 0.8;
        a.vx -= nx * imp; a.vz -= nz * imp;
        b.vx += nx * imp; b.vz += nz * imp;
        if (-rel > 5) {
          const dmg = (-rel - 4) * 1.6;
          const src = a.driver === 'player' || b.driver === 'player' ? 'player' : null;
          damageVehicle(game, a, dmg, src);
          damageVehicle(game, b, dmg, src);
          game.effects?.sparks(a.x + nx * a.radius, 0.8, a.z + nz * a.radius, 12);
          game.audio?.crash(Math.min(1, -rel / 18), a.x, a.z);
          if (src) {
            const other = a.driver === 'player' ? b : a;
            if (other.police) game.police?.crime('ram-police', other.x, other.z, 1);
            other.ai && (other.ai.honk = 2);
          }
        }
      }
    }
  }
}

export function updateVehicles(game, dt) {
  const flash = Math.floor(game.time * 6) % 2 === 0;
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    drive(game, v, dt);
    syncModel(v, dt);
    // Brake lights.
    const braking = v.ctrl.throttle < 0 && v.speed > 0.5;
    v.model.tailMat.color.setHex(braking ? 0xff2020 : 0x8a1010);
    if (v.model.bar) {
      const on = v.siren && !v.destroyed;
      v.model.bar.red.material.color.setHex(on && flash ? 0xff2020 : 0x550000);
      v.model.bar.blue.material.color.setHex(on && !flash ? 0x2050ff : 0x000055);
    }
    if (!v.destroyed && v.health < v.maxHealth * 0.25) {
      v.burning += dt;
      if (v.burning > 9) explodeVehicle(game, v, v.lastHit && game.time - v.lastHit < 12 ? 'player' : null);
    }
    v.smokeT -= dt;
    if (v.smokeT <= 0 && (v.health < v.maxHealth * 0.5 || v.destroyed)) {
      v.smokeT = v.destroyed ? 0.25 : v.burning > 0 ? 0.08 : 0.18;
      const f = forwardOf(v);
      game.effects?.smoke(v.x + f.x * v.spec.l * 0.35, 1.3, v.z + f.z * v.spec.l * 0.35, v.burning > 0 && !v.destroyed);
    }
    if (v.skid > 0 && Math.abs(v.speed) > 6 && game.frame % 3 === 0) {
      const f = forwardOf(v);
      game.effects?.dust(v.x - f.x * v.spec.l * 0.4, 0.3, v.z - f.z * v.spec.l * 0.4, v.skid);
    }
    if (v.removeT > 0 && v.driver !== 'player') {
      v.removeT -= dt;
      if (v.removeT <= 0) removeVehicle(game, v);
    }
  }
  collidePairs(game);
}

/** The closest usable car to a point within range, or null. */
export function nearestVehicle(game, x, z, range) {
  let best = null;
  let bestD = range * range;
  for (const v of game.vehicles) {
    if (v.destroyed || v.sinking) continue;
    const d = (v.x - x) ** 2 + (v.z - z) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}
