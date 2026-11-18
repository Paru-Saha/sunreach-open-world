// The Sunreach Bay Police Department: crimes raise a wanted level of up to five stars, cruisers
// are dispatched out of sight and route through the street grid to the player, then pursue and
// ram on sight; officers get out to fight or to cuff a player on foot; at four stars the SBPD
// helicopter joins in. Breaking line of sight long enough lets the stars fade one by one.
import * as THREE from 'three';
import { POLICE, CITY } from './config.js';
import { nodes, nearestNode, route } from './roads.js';
import { spawnVehicle, removeVehicle, carCircles } from './vehicles.js';
import { lineClear } from './collision.js';
import { giveTrafficAI } from './traffic.js';
import { damagePlayer } from './player.js';
import { clamp, wrapAngle, damp } from './rng.js';

const SEVERITY = {
  gunfire: { min: 1, add: 0, witness: false },
  assault: { min: 1, add: 0, witness: true },
  kill: { min: 2, add: 1, witness: false },
  'assault-cop': { min: 2, add: 0, witness: false },
  'kill-cop': { min: 3, add: 1, witness: false },
  carjack: { min: 1, add: 0, witness: true, copOnly: true },
  'steal-police': { min: 2, add: 0, witness: false },
  'hit-ped': { min: 1, add: 0, witness: true },
  'ram-police': { min: 1, add: 0, witness: false },
  explosion: { min: 2, add: 1, witness: false },
};

function buildHeli(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 5), new THREE.MeshPhongMaterial({ color: 0x1d3557, shininess: 80 }));
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), new THREE.MeshPhongMaterial({ color: 0x223344, shininess: 120 }));
  glass.position.set(0, 0.2, 2.4);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 6), new THREE.MeshLambertMaterial({ color: 0xf1faee }));
  tail.position.set(0, 0.5, -5);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.8, 1.0), new THREE.MeshLambertMaterial({ color: 0x1d3557 }));
  fin.position.set(0, 1.2, -7.6);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.5), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  rotor.position.y = 1.5;
  const rotor2 = rotor.clone();
  rotor2.rotation.y = Math.PI / 2;
  const hub = new THREE.Group();
  hub.add(rotor, rotor2);
  const skidMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 4.5), skidMat);
    skid.position.set(sx * 1.2, -1.5, 0);
    g.add(skid);
  }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4.5, 40, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.045, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  const light = new THREE.SpotLight(0xfff2cc, 40, 90, 0.35, 0.5, 1.2);
  light.position.set(0, -1, 1);
  g.add(body, glass, tail, fin, hub, beam, light);
  g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
  g.visible = false;
  scene.add(g, light.target);
  return { group: g, hub, beam, light, x: 0, z: 0, y: 60, heading: 0, active: false, cooldown: 2 };
}

export function createPolice(game) {
  const police = { stars: 0, seenT: 0, seen: false, units: [], bustT: 0, lastX: 0, lastZ: 0, flash: false, checkT: 0, peak: 0 };
  const heli = buildHeli(game.scene);
  police.heli = heli;

  police.setStars = (n) => {
    const before = police.stars;
    police.stars = clamp(n, 0, POLICE.maxStars);
    police.peak = Math.max(police.peak, police.stars);
    if (police.stars > before) { game.audio?.alert(); game.hud?.flashStars(); }
    if (police.stars === 0 && before > 0) {
      game.hud?.toast('Lost the cops', 2);
      game.missions?.onWantedCleared();
      for (const u of police.units) standDown(u);
    }
    police.seenT = 0;
  };

  function copNear(x, z, range) {
    for (const u of police.units) if (u.car && Math.hypot(u.car.x - x, u.car.z - z) < range) return true;
    for (const ped of game.peds.list) if (ped.kind === 'cop' && ped.state !== 'dead' && Math.hypot(ped.x - x, ped.z - z) < range) return true;
    return false;
  }

  /** Reports a crime at (x, z). */
  police.crime = (type, x, z, extra = 0) => {
    const s = SEVERITY[type];
    if (!s || game.state !== 'play') return;
    if (s.copOnly && !copNear(x, z, 45)) return;
    if (s.witness && !copNear(x, z, 60) && !game.peds.list.some((p) => p.kind === 'civ' && p.state !== 'dead' && Math.hypot(p.x - x, p.z - z) < 30)) return;
    const next = Math.max(police.stars + (police.stars > 0 ? s.add : 0) + extra, s.min);
    if (next > police.stars) police.setStars(next);
    police.lastX = x;
    police.lastZ = z;
    police.seenT = 0;
  };

  function standDown(u) {
    if (u.car && !u.car.destroyed && u.car.driver !== 'player') {
      u.car.siren = false;
      const a = nearestNode(u.car.x, u.car.z);
      const b = nodes[a.links[0]];
      giveTrafficAI(game, u.car, a, b);
    }
    for (const c of u.crew || []) { c.hostile = false; if (c.state === 'fight') c.state = 'walk'; }
    u.done = true;
  }

  function dispatch() {
    const p = game.player;
    const options = nodes.filter((n) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      return d > POLICE.spawnMin && d < POLICE.spawnMax;
    });
    const list = options.length ? options : nodes;
    const n = list[Math.floor(game.rng() * list.length)];
    if (game.vehicles.some((v) => Math.hypot(v.x - n.x, v.z - n.z) < 8)) return;
    const car = spawnVehicle(game, 'cruiser', n.x, n.z, Math.atan2(p.x - n.x, p.z - n.z));
    car.siren = true;
    car.driver = 'ai';
    car.ai = { kind: 'police', path: [], pathT: 0, stuck: 0, reverseT: 0 };
    police.units.push({ car, crew: [], deployed: false });
  }

  function deploy(u) {
    u.deployed = true;
    const car = u.car;
    car.driver = null;
    car.ai = null;
    car.ctrl = { throttle: 0, steer: 0, handbrake: true };
    for (const side of [1, -1]) {
      const lx = Math.cos(car.heading) * side;
      const lz = -Math.sin(car.heading) * side;
      const cop = game.peds.spawn('cop', car.x + lx * 2.2, car.z + lz * 2.2, { armed: police.stars >= 2, hostile: true });
      u.crew.push(cop);
    }
  }

  function drivePolice(u, dt) {
    const car = u.car;
    const ai = car.ai;
    const p = game.player;
    const tv = p.vehicle;
    const px = p.x + (tv ? tv.vx * 0.6 : 0);
    const pz = p.z + (tv ? tv.vz * 0.6 : 0);
    const d = Math.hypot(p.x - car.x, p.z - car.z);
    const sees = d < 55 && lineClear(car.x, 1.4, car.z, p.x, 1.2, p.z);
    let tx;
    let tz;
    if (sees) { tx = px; tz = pz; } else {
      ai.pathT -= dt;
      if (ai.pathT <= 0 || !ai.path.length) {
        ai.pathT = 1.5;
        const r = route(nearestNode(car.x, car.z).id, nearestNode(p.x, p.z).id);
        ai.path = r.map((id) => nodes[id]);
        if (ai.path.length > 1 && Math.hypot(ai.path[0].x - car.x, ai.path[0].z - car.z) < 14) ai.path.shift();
      }
      const w = ai.path[0] || { x: p.x, z: p.z };
      if (Math.hypot(w.x - car.x, w.z - car.z) < 9 && ai.path.length > 1) ai.path.shift();
      tx = w.x; tz = w.z;
    }
    if (!tv && d < 16 && !u.deployed && !p.dead) { deploy(u); return; }
    const want = Math.atan2(tx - car.x, tz - car.z);
    const diff = wrapAngle(want - car.heading);
    if (ai.reverseT > 0) {
      ai.reverseT -= dt;
      car.ctrl.throttle = -1;
      car.ctrl.steer = -Math.sign(diff);
      car.ctrl.handbrake = false;
      return;
    }
    let top = car.spec.max * (police.stars >= 3 ? 0.95 : 0.8);
    if (Math.abs(diff) > 0.6) top *= 0.45;
    if (!tv && d < 30) top = Math.min(top, 8);
    car.ctrl.steer = clamp(diff * 2.6, -1, 1);
    car.ctrl.throttle = clamp((top - car.speed) * 0.4, -1, 1);
    car.ctrl.handbrake = Math.abs(diff) > 1.2 && car.speed > 14;
    if (car.speed < 1 && car.ctrl.throttle > 0.3) {
      ai.stuck += dt;
      if (ai.stuck > 1.6) { ai.stuck = 0; ai.reverseT = 1.1; }
    } else ai.stuck = 0;
  }

  function updateHeli(dt) {
    const p = game.player;
    const want = police.stars >= 4 && !p.dead;
    if (want && !heli.active) {
      heli.active = true;
      heli.group.visible = true;
      heli.x = p.x - 140; heli.z = p.z - 140; heli.y = 70;
    }
    if (!heli.active) return;
    const t = game.time;
    const ox = Math.cos(t * 0.3) * 22;
    const oz = Math.sin(t * 0.3) * 22;
    const tx = want ? p.x + ox : p.x + 400;
    const tz = want ? p.z + oz : p.z - 400;
    const dx = tx - heli.x;
    const dz = tz - heli.z;
    heli.x += clamp(dx, -30 * dt, 30 * dt) * 1.3;
    heli.z += clamp(dz, -30 * dt, 30 * dt) * 1.3;
    heli.y = damp(heli.y, want ? 34 : 90, 0.6, dt);
    heli.heading = Math.atan2(p.x - heli.x, p.z - heli.z);
    heli.group.position.set(heli.x, heli.y, heli.z);
    heli.group.rotation.set(clamp(dz * 0.004, -0.2, 0.2), heli.heading, 0);
    heli.hub.rotation.y += dt * 30;
    heli.light.target.position.set(p.x, 0, p.z);
    const dist = Math.hypot(p.x - heli.x, p.z - heli.z, heli.y);
    heli.beam.position.set(0, -1, 0);
    heli.beam.scale.set(1, dist / 40, 1);
    heli.beam.lookAt(p.x, 0, p.z);
    heli.beam.rotateX(-Math.PI / 2);
    heli.beam.translateY(-dist / 2);
    game.audio?.rotor(dist);
    if (want && police.stars >= 5) {
      heli.cooldown -= dt;
      if (heli.cooldown <= 0 && lineClear(heli.x, heli.y - 2, heli.z, p.x, p.y + 1.2, p.z)) {
        heli.cooldown = 0.35;
        const from = new THREE.Vector3(heli.x, heli.y - 1.5, heli.z);
        const hitP = game.rng() < 0.18;
        const to = new THREE.Vector3(p.x + (hitP ? 0 : (game.rng() - 0.5) * 6), p.y + 1, p.z + (hitP ? 0 : (game.rng() - 0.5) * 6));
        game.effects?.tracer(from, to);
        game.effects?.sparks(to.x, 0.2, to.z, 3);
        game.audio?.gunshot(true, heli.x, heli.z);
        if (hitP) damagePlayer(game, 5, heli.x, heli.z);
      }
    }
    if (!want && Math.hypot(heli.x - p.x, heli.z - p.z) > 380) { heli.active = false; heli.group.visible = false; }
  }

  police.update = (dt) => {
    const p = game.player;
    // Units: drop finished or wrecked ones that are far away, run the rest.
    for (let i = police.units.length - 1; i >= 0; i -= 1) {
      const u = police.units[i];
      const car = u.car;
      const far = Math.hypot(car.x - p.x, car.z - p.z) > 320;
      if ((u.done || car.destroyed) && far) {
        if (game.vehicles.includes(car) && car.driver !== 'player') removeVehicle(game, car);
        police.units.splice(i, 1);
        continue;
      }
      if (car.driver === 'player') { u.done = true; continue; }
      if (u.done || car.destroyed) continue;
      if (u.deployed) {
        const crewDown = u.crew.every((c) => c.state === 'dead');
        if (p.vehicle && !crewDown && Math.hypot(car.x - p.x, car.z - p.z) > 30) {
          // Back in the car to give chase again.
          for (const c of u.crew) if (c.state !== 'dead') game.peds.remove(c);
          u.crew = [];
          u.deployed = false;
          car.driver = 'ai';
          car.ai = { kind: 'police', path: [], pathT: 0, stuck: 0, reverseT: 0 };
        }
        continue;
      }
      if (car.ai?.kind === 'police') drivePolice(u, dt);
    }

    if (police.stars > 0) {
      const active = police.units.filter((u) => !u.done && !u.car.destroyed).length;
      if (active < POLICE.carsPerStar[police.stars] && game.frame % 45 === 0) dispatch();

      police.checkT -= dt;
      if (police.checkT <= 0) {
        police.checkT = 0.25;
        police.seen = false;
        for (const u of police.units) {
          if (u.done || u.car.destroyed) continue;
          const c = u.car;
          if (Math.hypot(c.x - p.x, c.z - p.z) < POLICE.sightRange && lineClear(c.x, 1.6, c.z, p.x, 1.4, p.z)) { police.seen = true; break; }
        }
        if (!police.seen) {
          for (const ped of game.peds.list) {
            if (ped.kind === 'cop' && ped.state !== 'dead' && Math.hypot(ped.x - p.x, ped.z - p.z) < 45) { police.seen = true; break; }
          }
        }
        if (heli.active && police.stars >= 4) police.seen = true;
      }
      if (police.seen) { police.seenT = 0; police.lastX = p.x; police.lastZ = p.z; } else police.seenT += dt;
      police.flash = !police.seen;
      if (police.seenT > POLICE.coolBase + POLICE.coolPerStar * police.stars) {
        police.seenT = POLICE.coolBase * 0.4;
        police.setStars(police.stars - 1);
      }

      // Cuffs: an officer within reach of a player on foot at one or two stars.
      const cuffer = !p.vehicle && !p.dead && police.stars <= 2 && game.peds.list.find((c) => c.kind === 'cop' && c.state !== 'dead' && c.hostile && Math.hypot(c.x - p.x, c.z - p.z) < 1.7);
      if (cuffer && p.speed < 3) {
        police.bustT += dt;
        if (police.bustT > POLICE.bustTime) { police.bustT = 0; game.arrest(); }
      } else police.bustT = Math.max(0, police.bustT - dt * 2);
    } else {
      police.flash = false;
      police.bustT = 0;
    }
    updateHeli(dt);
  };

  /** Clears everything (respawn, load). */
  police.reset = () => {
    for (const u of police.units) {
      if (game.vehicles.includes(u.car) && u.car.driver !== 'player') removeVehicle(game, u.car);
      for (const c of u.crew) game.peds.remove(c);
    }
    for (const ped of [...game.peds.list]) if (ped.kind === 'cop') game.peds.remove(ped);
    police.units = [];
    police.stars = 0;
    police.seenT = 0;
    police.bustT = 0;
    heli.active = false;
    heli.group.visible = false;
  };

  police.unitsNear = (x, z, r) => police.units.filter((u) => !u.done && Math.hypot(u.car.x - x, u.car.z - z) < r);
  police.carCircles = carCircles;
  police.bounds = CITY;
  return police;
}
