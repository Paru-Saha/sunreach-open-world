// People on foot: civilians strolling the pavements around each block, stopping to chat and
// running when there is trouble; officers and Halloran crew who fight on foot; drivers pulled from
// their cars. Handles being hit by cars, punched and shot, and keeps the streets populated.
import { TRAFFIC, CITY, PLAYER } from './config.js';
import { createHumanoid, animateHumanoid, OUTFITS } from './characters.js';
import { resolveCircle, lineClear } from './collision.js';
import { blockRect, groundHeight } from './city.js';
import { closestOnCar } from './vehicles.js';
import { damagePlayer } from './player.js';
import { clamp, turnToward, wrapAngle } from './rng.js';

const INSET = 1.9;

function loopRect(bi, bj) {
  const r = blockRect(bi, bj);
  return { minX: r.minX + INSET, maxX: r.maxX - INSET, minZ: r.minZ + INSET, maxZ: r.maxZ - INSET };
}
function perimeter(r) { return 2 * (r.maxX - r.minX + r.maxZ - r.minZ); }
function pointOn(r, s) {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const P = 2 * (w + d);
  s = ((s % P) + P) % P;
  if (s < w) return [r.minX + s, r.minZ];
  if (s < w + d) return [r.maxX, r.minZ + (s - w)];
  if (s < 2 * w + d) return [r.maxX - (s - w - d), r.maxZ];
  return [r.minX, r.maxZ - (s - 2 * w - d)];
}
function project(r, x, z) {
  const w = r.maxX - r.minX;
  const d = r.maxZ - r.minZ;
  const cx = clamp(x, r.minX, r.maxX);
  const cz = clamp(z, r.minZ, r.maxZ);
  const opts = [[Math.abs(cz - r.minZ), cx - r.minX], [Math.abs(cx - r.maxX), w + (cz - r.minZ)], [Math.abs(cz - r.maxZ), w + d + (r.maxX - cx)], [Math.abs(cx - r.minX), 2 * w + d + (r.maxZ - cz)]];
  opts.sort((a, b) => a[0] - b[0]);
  return opts[0][1];
}

export function createPeds(game) {
  const peds = { list: [] };

  peds.spawn = (kind, x, z, opts = {}) => {
    const look = opts.look || (kind === 'cop' ? OUTFITS.cop : kind === 'thug' ? OUTFITS.thug : kind === 'odile' ? OUTFITS.odile : {});
    const model = createHumanoid(look, game.rng);
    game.scene.add(model.root);
    const ped = {
      kind, model, x, z, y: groundHeight(x, z), vy: 0, heading: game.rng() * Math.PI * 2, speed: 0,
      hp: kind === 'cop' ? 70 : kind === 'thug' ? 60 : 40, state: 'walk', fleeT: 0, deadT: 0, cooldown: 1,
      armed: !!opts.armed, hostile: !!opts.hostile, mission: opts.mission || null, idleT: 0, chatT: 0,
      punchT: 0, loop: null, s: 0, dir: game.rng() < 0.5 ? 1 : -1, walkSpeed: game.rng.range(1.2, 1.7), keep: !!opts.keep,
    };
    model.gun.visible = ped.armed;
    if (kind === 'civ' || opts.stroll) assignLoop(ped);
    if (kind === 'odile' || opts.idle) { ped.state = 'idle'; ped.keep = true; ped.loop = null; }
    peds.list.push(ped);
    return ped;
  };

  function assignLoop(ped) {
    const bi = clamp(Math.floor((ped.x + CITY.halfX) / CITY.cell), 0, CITY.blocksX - 1);
    const bj = clamp(Math.floor((ped.z + CITY.halfZ) / CITY.cell), 0, CITY.blocksZ - 1);
    ped.loop = loopRect(bi, bj);
    ped.s = project(ped.loop, ped.x, ped.z);
  }

  peds.remove = (ped) => {
    game.scene.remove(ped.model.root);
    const i = peds.list.indexOf(ped);
    if (i >= 0) peds.list.splice(i, 1);
  };

  /** Pulls the driver out of a car the player is taking; they run off. */
  peds.ejectDriver = (v, by) => {
    const lx = Math.cos(v.heading);
    const lz = -Math.sin(v.heading);
    const ped = peds.spawn(v.police ? 'cop' : 'civ', v.x + lx * 2.2, v.z + lz * 2.2, { armed: v.police });
    ped.state = v.police ? 'fight' : 'flee';
    ped.hostile = v.police;
    ped.fleeT = 8;
    ped.fx = by.x; ped.fz = by.z;
    ped.y = 0;
    ped.vy = 2;
  };

  /** Damage from fists, bullets, cars or blasts. */
  peds.damage = (ped, amount, source, fromX, fromZ) => {
    if (ped.state === 'dead') return;
    ped.hp -= amount;
    ped.model.hurt = 0.2;
    game.effects?.blood(ped.x, ped.y + 1.2, ped.z);
    if (source === 'player') {
      if (ped.kind === 'civ') { ped.state = 'flee'; ped.fleeT = 10; ped.fx = fromX; ped.fz = fromZ; }
      if (ped.kind === 'cop') ped.hostile = true;
    }
    if (ped.hp <= 0) {
      ped.state = 'dead';
      ped.deadT = 0;
      ped.model.gun.visible = false;
      game.audio?.groan(ped.x, ped.z);
      if (source === 'player') {
        game.player.kills += 1;
        game.police?.crime(ped.kind === 'cop' ? 'kill-cop' : 'kill', ped.x, ped.z);
        const cash = ped.kind === 'thug' ? 80 + Math.floor(game.rng() * 120) : ped.kind === 'cop' ? 40 : 10 + Math.floor(game.rng() * 50);
        game.pickups?.drop('cash', ped.x, ped.z, cash);
        if (ped.armed && game.rng() < 0.7) game.pickups?.drop('ammo', ped.x + 0.8, ped.z, 12);
      }
      game.missions?.onPedKilled(ped, source);
      scare(ped.x, ped.z, 30, fromX ?? ped.x, fromZ ?? ped.z);
    } else if (source === 'player') {
      game.police?.crime(ped.kind === 'cop' ? 'assault-cop' : 'assault', ped.x, ped.z);
    }
  };

  function scare(x, z, radius, fx, fz) {
    for (const o of peds.list) {
      if (o.kind !== 'civ' || o.state === 'dead') continue;
      if (Math.hypot(o.x - x, o.z - z) < radius) { o.state = 'flee'; o.fleeT = 8 + game.rng() * 5; o.fx = fx; o.fz = fz; }
    }
  }
  peds.scare = scare;

  function move(ped, tx, tz, speed, dt) {
    const want = Math.atan2(tx - ped.x, tz - ped.z);
    ped.heading = turnToward(ped.heading, want, 8 * dt);
    ped.speed = speed;
    ped.x += Math.sin(ped.heading) * speed * dt;
    ped.z += Math.cos(ped.heading) * speed * dt;
  }

  function combat(ped, dt) {
    const p = game.player;
    const tx = p.x;
    const tz = p.z;
    const d = Math.hypot(tx - ped.x, tz - ped.z);
    ped.cooldown -= dt;
    const want = Math.atan2(tx - ped.x, tz - ped.z);
    if (p.dead || (ped.kind === 'cop' && !game.police?.stars)) {
      ped.state = 'walk';
      ped.hostile = false;
      assignLoop(ped);
      return;
    }
    const sees = d < 60 && lineClear(ped.x, 1.5, ped.z, tx, 1.3, tz);
    const bust = ped.kind === 'cop' && game.police?.stars === 1 && !p.vehicle;
    if (ped.armed && !bust) {
      if (d > 16 || !sees) move(ped, tx, tz, 5.6, dt);
      else {
        ped.speed = 0;
        ped.heading = turnToward(ped.heading, want, 10 * dt);
        if (Math.abs(wrapAngle(want - ped.heading)) < 0.2 && ped.cooldown <= 0 && sees) {
          ped.cooldown = ped.kind === 'cop' ? 0.75 + game.rng() * 0.5 : 0.9 + game.rng() * 0.7;
          game.combat?.npcFire(ped, p);
        }
      }
      ped.aiming = sees && d <= 16;
    } else {
      ped.aiming = false;
      if (d > 1.3) move(ped, tx, tz, bust ? 6.4 : 5.2, dt);
      else {
        ped.speed = 0;
        ped.heading = turnToward(ped.heading, want, 10 * dt);
        if (!bust && ped.cooldown <= 0 && !p.vehicle) {
          ped.cooldown = 0.9;
          ped.punchT = 0.3;
          game.audio?.punch(ped.x, ped.z);
          damagePlayer(game, 7, ped.x, ped.z);
        }
      }
    }
  }

  function updatePed(ped, dt) {
    const m = ped.model;
    if (ped.state === 'dead') {
      ped.deadT += dt;
      ped.y = Math.max(groundHeight(ped.x, ped.z), ped.y + ped.vy * dt);
      ped.vy -= 20 * dt;
      animateHumanoid(m, { down: true }, dt);
      m.root.position.set(ped.x, ped.y, ped.z);
      m.root.rotation.y = ped.heading;
      return;
    }

    // Cars hurt.
    for (const v of game.vehicles) {
      if (Math.abs(v.x - ped.x) > 5 || Math.abs(v.z - ped.z) > 5) continue;
      const c = closestOnCar(v, ped.x, ped.z);
      if (c.d > v.radius + 0.35) continue;
      const sp = Math.hypot(v.vx, v.vz);
      const nx = (ped.x - c.x) / (c.d || 1);
      const nz = (ped.z - c.z) / (c.d || 1);
      ped.x = c.x + nx * (v.radius + 0.36);
      ped.z = c.z + nz * (v.radius + 0.36);
      if (sp > 5) {
        ped.vy = 3 + sp * 0.2;
        ped.x += nx * 0.5;
        ped.z += nz * 0.5;
        game.audio?.thud(ped.x, ped.z);
        const src = v.driver === 'player' ? 'player' : null;
        if (src) game.police?.crime('hit-ped', ped.x, ped.z);
        peds.damage(ped, sp * 4, src, v.x, v.z);
        if (ped.state === 'dead') return;
      } else if (ped.kind === 'civ' && ped.state === 'walk' && sp > 1) {
        ped.state = 'flee'; ped.fleeT = 3; ped.fx = v.x; ped.fz = v.z;
      }
    }

    ped.punchT = Math.max(0, ped.punchT - dt);
    if (ped.hostile || ped.state === 'fight') { ped.state = 'fight'; combat(ped, dt); }
    else if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const ax = ped.x - (ped.fx ?? ped.x);
      const az = ped.z - (ped.fz ?? ped.z) + 0.01;
      move(ped, ped.x + ax, ped.z + az, 6.2, dt);
      if (ped.fleeT <= 0) { ped.state = 'walk'; assignLoop(ped); }
    } else if (ped.state === 'idle') {
      ped.speed = 0;
      const p = game.player;
      if (Math.hypot(p.x - ped.x, p.z - ped.z) < 12) ped.heading = turnToward(ped.heading, Math.atan2(p.x - ped.x, p.z - ped.z), 3 * dt);
    } else if (ped.loop) {
      if (ped.chatT > 0) {
        ped.chatT -= dt;
        ped.speed = 0;
      } else {
        ped.s += ped.dir * ped.walkSpeed * dt;
        const [tx, tz] = pointOn(ped.loop, ped.s + ped.dir * 1.5);
        move(ped, tx, tz, ped.walkSpeed, dt);
        if (game.rng() < 0.0008) ped.chatT = 2 + game.rng() * 4;
      }
    }

    const hit = resolveCircle(ped.x, ped.z, 0.4, ped.y);
    if (hit) { ped.x = hit.x; ped.z = hit.z; }
    const ground = groundHeight(ped.x, ped.z);
    ped.vy -= 20 * dt;
    ped.y = Math.max(ground, ped.y + ped.vy * dt);
    if (ped.y <= ground) ped.vy = 0;

    m.root.position.set(ped.x, ped.y, ped.z);
    m.root.rotation.y = ped.heading;
    animateHumanoid(m, {
      speed: ped.speed,
      aiming: ped.aiming,
      punching: ped.punchT > 0 ? 1 - ped.punchT / 0.3 : 0,
      hands: ped.state === 'surrender',
      airborne: ped.y > ground + 0.2,
    }, dt);
  }

  peds.update = (dt) => {
    const p = game.player;
    let civs = 0;
    for (let i = peds.list.length - 1; i >= 0; i -= 1) {
      const ped = peds.list[i];
      const d = Math.hypot(ped.x - p.x, ped.z - p.z);
      if (!ped.keep && !ped.mission && (d > 210 || (ped.state === 'dead' && ped.deadT > 40))) { peds.remove(ped); continue; }
      if (ped.kind === 'civ' && ped.state !== 'dead') civs += 1;
      if (d < 160 || ped.mission || ped.hostile) updatePed(ped, dt);
    }
    if (game.frame % 20 === 0 && civs < TRAFFIC.peds) {
      const a = game.rng() * Math.PI * 2;
      const r = game.rng.range(50, 140);
      const x = clamp(p.x + Math.cos(a) * r, -CITY.halfX + 10, CITY.halfX - 10);
      const z = clamp(p.z + Math.sin(a) * r, -CITY.halfZ + 10, CITY.halfZ - 10);
      const ped = peds.spawn('civ', x, z);
      const [px, pz] = pointOn(ped.loop, ped.s);
      ped.x = px; ped.z = pz;
    }
  };

  /** Fills the pavements around a point right away (used at start and on respawn). */
  peds.seed = (x, z, count = TRAFFIC.peds) => {
    for (let k = 0; k < count; k += 1) {
      const px = clamp(x + game.rng.range(-130, 130), -CITY.halfX + 10, CITY.halfX - 10);
      const pz = clamp(z + game.rng.range(-110, 110), -CITY.halfZ + 10, CITY.halfZ - 10);
      const ped = peds.spawn('civ', px, pz);
      const [qx, qz] = pointOn(ped.loop, ped.s + game.rng() * 40);
      ped.x = qx; ped.z = qz;
      ped.s = project(ped.loop, qx, qz);
    }
  };

  /** The living person nearest (x, z) within range, optionally only hostile ones. */
  peds.nearest = (x, z, range, filter) => {
    let best = null;
    let bd = range;
    for (const ped of peds.list) {
      if (ped.state === 'dead') continue;
      if (filter && !filter(ped)) continue;
      const d = Math.hypot(ped.x - x, ped.z - z);
      if (d < bd) { bd = d; best = ped; }
    }
    return best;
  };

  peds.PLAYER_RADIUS = PLAYER.radius;
  return peds;
}
