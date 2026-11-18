// Civilian traffic: cars that keep to the right-hand lane, pick a new street at each crossing,
// slow for corners, brake for whatever is in front of them, honk, back out when stuck and race
// off in a panic when shots ring out. Cars are spawned out of sight around the player and parked
// along the kerbs.
import { TRAFFIC, CITY } from './config.js';
import { nodes, lanePoint, nextNode, nearestNode, LANE } from './roads.js';
import { spawnVehicle, removeVehicle, CIVILIAN, carCircles } from './vehicles.js';
import { clamp, wrapAngle } from './rng.js';

const SEG = CITY.cell;

/** Starts AI on a car heading from node a to node b. */
export function giveTrafficAI(game, v, a, b) {
  v.driver = 'ai';
  v.ai = { kind: 'traffic', from: a, to: b, cruise: TRAFFIC.cruise * game.rng.range(0.85, 1.2), stuck: 0, reverseT: 0, honk: 0, panic: 0 };
}

function spawnOnSegment(game, a, b, along) {
  const p = lanePoint(a, b, along);
  const type = CIVILIAN[Math.floor(game.rng() * CIVILIAN.length)];
  const v = spawnVehicle(game, type, p.x, p.z, Math.atan2(p.dx, p.dz));
  giveTrafficAI(game, v, a, b);
  v.speed = 6;
  v.vx = p.dx * 6;
  v.vz = p.dz * 6;
  return v;
}

/** Fills the streets near (x, z) with moving cars and kerbside parked ones. */
export function seedTraffic(game, x, z, count = TRAFFIC.cars) {
  const near = nodes.filter((n) => Math.hypot(n.x - x, n.z - z) < 260);
  let made = 0;
  let guard = 0;
  while (made < count && guard < 400) {
    guard += 1;
    const a = near[Math.floor(game.rng() * near.length)];
    const b = nodes[a.links[Math.floor(game.rng() * a.links.length)]];
    const along = game.rng.range(14, SEG - 14);
    const p = lanePoint(a, b, along);
    if (Math.hypot(p.x - x, p.z - z) < 14) continue;
    if (game.vehicles.some((v) => Math.hypot(v.x - p.x, v.z - p.z) < 10)) continue;
    spawnOnSegment(game, a, b, along);
    made += 1;
  }
  for (let k = 0; k < 18; k += 1) {
    const a = near[Math.floor(game.rng() * near.length)];
    const b = nodes[a.links[Math.floor(game.rng() * a.links.length)]];
    const p = lanePoint(a, b, game.rng.range(16, SEG - 16));
    const px = p.x - p.dz * (CITY.road / 2 - 1.1 - LANE);
    const pz = p.z + p.dx * (CITY.road / 2 - 1.1 - LANE);
    if (Math.hypot(px - x, pz - z) < 8) continue;
    if (game.vehicles.some((v) => Math.hypot(v.x - px, v.z - pz) < 7)) continue;
    spawnVehicle(game, CIVILIAN[Math.floor(game.rng() * CIVILIAN.length)], px, pz, Math.atan2(p.dx, p.dz));
  }
}

function blockedAhead(game, v, range) {
  const fx = Math.sin(v.heading);
  const fz = Math.cos(v.heading);
  let nearest = Infinity;
  const check = (x, z, pad) => {
    const dx = x - v.x;
    const dz = z - v.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 1 || ahead > range) return;
    const side = Math.abs(dx * fz - dz * fx);
    if (side < pad) nearest = Math.min(nearest, ahead);
  };
  for (const o of game.vehicles) {
    if (o === v) continue;
    if (Math.abs(o.x - v.x) > range + 4 || Math.abs(o.z - v.z) > range + 4) continue;
    const c = carCircles(o);
    check(c[0], c[1], 2.2);
    check(c[2], c[3], 2.2);
  }
  const p = game.player;
  if (!p.vehicle && !p.dead) check(p.x, p.z, 1.8);
  for (const ped of game.peds?.list || []) {
    if (ped.dead || ped.inCar) continue;
    if (Math.abs(ped.x - v.x) > range || Math.abs(ped.z - v.z) > range) continue;
    check(ped.x, ped.z, 1.6);
  }
  return nearest;
}

/** One step of lane-following for any AI car (traffic, or a mission car on the run). */
export function driveTraffic(game, v, dt) {
  const ai = v.ai;
  const { from, to } = ai;
  const len = Math.hypot(to.x - from.x, to.z - from.z);
  const dx = (to.x - from.x) / len;
  const dz = (to.z - from.z) / len;
  const along = (v.x - from.x) * dx + (v.z - from.z) * dz;
  if (along > len - 9) {
    const next = nextNode(to, from.id, game.rng);
    ai.from = to;
    ai.to = next;
  }
  const look = clamp(along + 9, 4, len - 4);
  const t = along > len - 9 ? lanePoint(ai.from, ai.to, 7) : lanePoint(from, to, look);
  const want = Math.atan2(t.x - v.x, t.z - v.z);
  const diff = wrapAngle(want - v.heading);
  const panic = ai.panic > 0;
  ai.panic = Math.max(0, ai.panic - dt);
  let target = ai.cruise * (panic ? 1.8 : 1) * (1 - Math.min(0.6, Math.abs(diff) * 0.9));
  const ahead = blockedAhead(game, v, 9 + Math.abs(v.speed) * 0.9);
  if (ahead < Infinity) {
    target = Math.min(target, Math.max(0, (ahead - 5) * 0.8));
    if (ahead < 9 && Math.abs(v.speed) < 1) ai.honk += dt;
  } else ai.honk = Math.max(0, ai.honk - dt);
  if (ai.honk > 2.5) { game.audio?.horn(v.x, v.z); ai.honk = -4; }

  if (ai.reverseT > 0) {
    ai.reverseT -= dt;
    v.ctrl.throttle = -0.8;
    v.ctrl.steer = -Math.sign(diff);
    v.ctrl.handbrake = false;
    return;
  }
  v.ctrl.steer = clamp(diff * 2.4, -1, 1);
  v.ctrl.throttle = clamp((target - v.speed) * 0.6, -1, 1);
  v.ctrl.handbrake = false;
  if (target > 2 && v.speed < 0.6 && ahead === Infinity) {
    ai.stuck += dt;
    if (ai.stuck > 2.5) { ai.stuck = 0; ai.reverseT = 1.4; }
  } else ai.stuck = 0;
}

/** Runs every AI civilian driver, recycles far-away cars and tops traffic back up. */
export function updateTraffic(game, dt) {
  const p = game.player;
  let moving = 0;
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    const d = Math.hypot(v.x - p.x, v.z - p.z);
    if (v.driver === 'player' || v.ai?.kind === 'police' || v.mission) continue;
    if (d > 330 && v.driver !== 'player') { removeVehicle(game, v); continue; }
    if (v.ai?.kind === 'traffic' && !v.destroyed) {
      moving += 1;
      driveTraffic(game, v, dt);
    }
  }
  if (game.frame % 30 === 0 && moving < TRAFFIC.cars) {
    const n = nearestNode(p.x, p.z);
    const ring = nodes.filter((m) => {
      const d = Math.hypot(m.x - p.x, m.z - p.z);
      return d > 110 && d < 230 && Math.abs(m.i - n.i) + Math.abs(m.j - n.j) > 1;
    });
    if (ring.length) {
      const a = ring[Math.floor(game.rng() * ring.length)];
      const b = nodes[a.links[Math.floor(game.rng() * a.links.length)]];
      const pnt = lanePoint(a, b, 12);
      if (!game.vehicles.some((v) => Math.hypot(v.x - pnt.x, v.z - pnt.z) < 12)) spawnOnSegment(game, a, b, 12);
    }
  }
}

/** Makes nearby drivers flee after gunfire or an explosion. */
export function panicTraffic(game, x, z, radius) {
  for (const v of game.vehicles) {
    if (v.ai?.kind === 'traffic' && Math.hypot(v.x - x, v.z - z) < radius) v.ai.panic = 8;
  }
}
