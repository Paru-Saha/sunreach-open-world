// Missions and story flow: Odile's pink marker starts the next job, each job is a list of steps
// with an objective line, a 3D marker and minimap blip, checks that advance or fail it, and a
// payout. Five story missions (Homecoming, Spin Cycle, Beach Rules, Hot Wheels, Low Tide), then
// endless courier runs. Dialogue plays as timed subtitles while the game keeps going.
import * as THREE from 'three';
import { SITES } from './city.js';
import { STORY, ORDER, CAST } from './story.js';
import { OUTFITS } from './characters.js';
import { spawnVehicle, removeVehicle } from './vehicles.js';
import { exitVehicle } from './player.js';
import { giveTrafficAI, driveTraffic } from './traffic.js';
import { nearestNode, nodes } from './roads.js';

const GARAGE = { x: 200, z: 78 };
const BAG = { x: -280, z: -9 };
const PLAZA_DROP = { x: 40, z: 20 };
const VILLA_CAR = { x: 40, z: -165.6 };
const CHOP = { x: 320, z: 120 };
const DOCKS = { x: -320, z: 150 };
const COURIER_SPOTS = [
  { x: -120, z: -233, name: 'Hillcrest Dr' }, { x: 280, z: -73, name: 'Saltmarsh Rd' }, { x: -280, z: 167, name: 'Old Harbor' },
  { x: 120, z: 233, name: 'Shoreline Parade' }, { x: -40, z: 87, name: 'Coral Way' }, { x: 200, z: -153, name: 'Palmetto Rd' },
];

function makeBeam(color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 60, 24, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }),
  );
  beam.position.y = 30;
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.3, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.25;
  g.add(beam, ring);
  g.visible = false;
  return { g, beam, ring };
}

export function createMissions(game) {
  const ms = { index: 0, active: null, done: [], courier: 0, queue: [], sayT: 0, cooldown: 0 };
  const marker = makeBeam(0xffd23f);
  const giver = makeBeam(0xff5fa2);
  game.scene.add(marker.g, giver.g);

  const door = SITES.odile.door;
  ms.odile = game.peds.spawn('odile', door.x, door.z - 1.2, { idle: true });
  ms.odile.heading = 0;

  /** Queues lines of dialogue: [[speakerKey, text], ...]. */
  ms.say = (lines) => { for (const l of lines) ms.queue.push(l); };

  function setMarker(pos) {
    if (!pos) { marker.g.visible = false; return; }
    marker.g.visible = true;
    marker.g.position.set(pos.x, 0, pos.z);
  }

  const near = (pos, r) => Math.hypot(game.player.x - pos.x, game.player.z - pos.z) < r;

  // ---- Mission definitions ----
  const DEFS = {
    homecoming: {
      reward: 300,
      steps: [
        { text: 'Steal a car. Any car will do: walk up and press F.', update: () => (game.player.vehicle ? 'next' : null) },
        {
          text: "Drive it back to Odile's Suds.",
          marker: () => GARAGE,
          update: () => {
            const p = game.player;
            if (!p.vehicle) { game.hud.objective('Get back in a car.'); return null; }
            game.hud.objective("Drive it back to Odile's Suds.");
            return near(GARAGE, 6) && Math.abs(p.vehicle.speed) < 8 ? 'pass' : null;
          },
        },
      ],
      onPass: () => { const p = game.player; p.owned.pistol = true; p.ammo.pistol += 36; p.weapon = 'pistol'; game.hud.toast('Vela 9 pistol: right mouse to aim, left to fire', 4); },
    },
    spin: {
      reward: 1200,
      setup: (m) => { m.bag = game.pickups.add('bag', BAG.x, BAG.z, 0, { mission: 'spin' }); },
      steps: [
        { text: 'Grab the black bag at the Old Harbor warehouse.', blip: (m) => m.bag, update: (m) => (m.gotBag ? 'next' : null) },
        {
          text: 'Lose any police, then hand the bag to Teo at Sol Plaza.',
          timer: 170,
          marker: () => PLAZA_DROP,
          setup: (m) => { m.teo = game.peds.spawn('civ', PLAZA_DROP.x + 1.5, PLAZA_DROP.z + 1.5, { look: OUTFITS.teo, idle: true, mission: 'spin' }); },
          update: () => {
            if (!near(PLAZA_DROP, 5)) return null;
            if (game.police.stars > 0) { game.hud.prompt('Teo will not take it with the police on you. <kbd>Lose them</kbd>'); return null; }
            return 'pass';
          },
          timeout: 'Too slow. Teo packed up and left.',
        },
      ],
      onPickup: (m, item) => {
        if (item === m.bag) {
          m.gotBag = true;
          game.police.setStars(Math.max(game.police.stars, 2));
          ms.say(STORY.spin.mid);
        }
      },
      cleanup: (m) => { if (m.bag) game.pickups.remove(m.bag); if (m.teo) game.peds.remove(m.teo); },
    },
    beach: {
      reward: 1500,
      setup: (m) => {
        m.thugs = [];
        const spots = [[70, 262], [84, 270], [96, 260], [112, 276], [126, 266], [140, 272]];
        spots.forEach(([x, z], i) => m.thugs.push(game.peds.spawn('thug', x, z, { armed: i % 2 === 0, idle: true, mission: 'beach' })));
      },
      steps: [
        {
          text: 'Clear the Marina Crew off Coral Strand Beach.',
          blip: (m) => m.thugs.find((t) => t.state !== 'dead'),
          update: (m) => {
            const alive = m.thugs.filter((t) => t.state !== 'dead');
            const angry = m.thugs.some((t) => t.hostile || t.hp < (t.armed ? 60 : 60)) || alive.some((t) => near(t, 28));
            if (angry) for (const t of alive) t.hostile = true;
            game.hud.objective(`Clear the Marina Crew off Coral Strand Beach (${m.thugs.length - alive.length}/${m.thugs.length}).`);
            return alive.length === 0 ? 'pass' : null;
          },
        },
      ],
      onPass: () => { const p = game.player; p.owned.smg = true; p.ammo.smg += 90; game.hud.toast('Gull SMG: press 3 or Q to switch', 4); },
      cleanup: (m) => { for (const t of m.thugs || []) if (t.state !== 'dead') game.peds.remove(t); },
    },
    wheels: {
      reward: 2500,
      setup: (m) => {
        m.car = spawnVehicle(game, 'vesper', VILLA_CAR.x, VILLA_CAR.z, Math.PI / 2, 0xd4af37);
        m.car.mission = true;
        m.car.maxHealth = m.car.health = 160;
      },
      steps: [
        {
          text: "Steal Halloran's gold Vesper GT in Palmetto Heights.",
          blip: (m) => m.car,
          update: (m) => {
            if (m.car.destroyed || m.car.sinking) return 'fail:The Vesper is wrecked.';
            return game.player.vehicle === m.car ? 'next' : null;
          },
        },
        {
          text: 'Deliver the Vesper to the chop yard on Eastreach Hwy. Keep it in one piece.',
          marker: () => CHOP,
          setup: () => { game.police.setStars(Math.max(game.police.stars, 2)); game.hud.toast('A neighbour called it in!', 2); },
          update: (m) => {
            const p = game.player;
            if (m.car.destroyed || m.car.health < m.car.maxHealth * 0.3) return 'fail:The Vesper is wrecked.';
            if (p.vehicle !== m.car) { game.hud.objective('Get back in the Vesper.'); return null; }
            game.hud.objective(`Deliver the Vesper to the chop yard on Eastreach Hwy. Condition ${Math.round((m.car.health / m.car.maxHealth) * 100)}%`);
            return near(CHOP, 7) && Math.abs(m.car.speed) < 8 ? 'pass' : null;
          },
        },
      ],
      onPass: (m) => { if (game.player.vehicle === m.car) exitVehicle(game, true); removeVehicle(game, m.car); m.car = null; },
      cleanup: (m) => { if (m.car) m.car.mission = false; },
    },
    tide: {
      reward: 5000,
      steps: [
        { text: 'Get to the Harbor Docks before Halloran.', marker: () => DOCKS, update: () => (near(DOCKS, 9) ? 'next' : null) },
        {
          text: "Take out Vic Halloran's car.",
          setup: (m) => {
            const a = nearestNode(DOCKS.x, DOCKS.z - 40);
            const b = nodes[a.id + 1];
            m.vic = spawnVehicle(game, 'vesper', a.x + 10, a.z + 3.4, Math.PI / 2, 0x111111);
            m.vic.mission = true;
            m.vic.maxHealth = m.vic.health = 200;
            giveTrafficAI(game, m.vic, a, b);
            m.vic.ai.cruise = 24;
            ms.say(STORY.tide.mid);
          },
          blip: (m) => m.vic,
          update: (m, dt) => {
            const v = m.vic;
            if (!v.destroyed && v.driver === 'ai') { v.ai.panic = 1; driveTraffic(game, v, dt); }
            if (v.destroyed) {
              m.ledger = game.pickups.add('ledger', v.x + 2.5, v.z, 0, { mission: 'tide' });
              return 'next';
            }
            if (Math.hypot(v.x - game.player.x, v.z - game.player.z) > 380) return 'fail:Halloran got away.';
            return null;
          },
        },
        { text: 'Grab the ledger from the wreck.', blip: (m) => m.ledger, update: (m) => (m.gotLedger ? 'next' : null) },
        { text: 'Bring the ledger to Odile.', marker: () => door, update: () => (near(door, 4) ? 'pass' : null) },
      ],
      onPickup: (m, item) => { if (item === m.ledger) m.gotLedger = true; },
      onPass: () => { game.hud.big('SUNREACH BAY IS YOURS', 'Story complete · courier runs unlocked at Odile\'s', 6, '#ff9e5e'); },
      cleanup: (m) => { if (m.vic) m.vic.mission = false; if (m.ledger) game.pickups.remove(m.ledger); },
    },
    courier: {
      reward: 0,
      setup: (m) => {
        m.dest = COURIER_SPOTS[Math.floor(game.rng() * COURIER_SPOTS.length)];
        m.reward = 300 + Math.round(Math.hypot(m.dest.x - door.x, m.dest.z - door.z));
      },
      steps: [
        {
          text: 'Deliver the package.',
          timer: 0,
          setup: (m) => { m.timeLeft = Math.round(Math.hypot(m.dest.x - door.x, m.dest.z - door.z) / 10) + 35; game.hud.objective(`Deliver the package to ${m.dest.name}.`); },
          marker: (m) => m.dest,
          update: (m) => (near(m.dest, 5) ? 'pass' : null),
          timeout: 'The customer gave up waiting.',
        },
      ],
    },
  };

  ms.nextId = () => (ms.index < ORDER.length ? ORDER[ms.index] : 'courier');

  ms.start = (id) => {
    const def = DEFS[id];
    const m = { id, def, step: -1, data: {} };
    ms.active = m;
    game.audio.missionStart();
    game.hud.big(STORY[id].title.toUpperCase(), id === 'courier' ? `Run ${ms.courier + 1}` : `Mission ${ms.index + 1} of ${ORDER.length}`, 3, '#ff5fa2');
    ms.say(STORY[id].intro);
    def.setup?.(m.data);
    advance(m);
  };

  function advance(m) {
    m.step += 1;
    const s = m.def.steps[m.step];
    if (!s) { ms.pass(); return; }
    game.hud.objective(s.text);
    m.timeLeft = s.timer || null;
    s.setup?.(m.data);
    if (m.data.timeLeft) { m.timeLeft = m.data.timeLeft; m.data.timeLeft = 0; }
  }

  ms.pass = () => {
    const m = ms.active;
    if (!m) return;
    const reward = m.id === 'courier' ? m.data.reward : m.def.reward;
    game.money += reward;
    game.stats.missions += 1;
    m.def.onPass?.(m.data);
    m.def.cleanup?.(m.data);
    ms.say(STORY[m.id].outro);
    if (m.id === 'courier') ms.courier += 1; else { ms.done.push(m.id); ms.index += 1; }
    if (m.id !== 'tide') game.hud.big('MISSION PASSED', `+$${reward.toLocaleString('en-US')}`, 4, '#ffcf5a');
    game.audio.missionPass();
    ms.active = null;
    ms.cooldown = 4;
    game.hud.objective(ms.idleText());
    game.hud.timer(null);
    setMarker(null);
    game.save?.write(true);
  };

  ms.fail = (reason) => {
    const m = ms.active;
    if (!m) return;
    m.def.cleanup?.(m.data);
    ms.active = null;
    ms.cooldown = 3;
    game.hud.big('MISSION FAILED', reason, 4, '#ff4d6d');
    game.audio.missionFail();
    game.hud.objective(ms.idleText());
    game.hud.timer(null);
    setMarker(null);
  };

  ms.idleText = () => (ms.index < ORDER.length ? `Visit Odile at Odile's Suds in Saltmarsh to start "${STORY[ORDER[ms.index]].title}".` : "Free roam. Odile has courier runs, and there are Sun Tokens to find.");

  ms.update = (dt) => {
    // Dialogue.
    ms.sayT -= dt;
    if (ms.sayT <= 0 && ms.queue.length) {
      const [who, text] = ms.queue.shift();
      const dur = 2.2 + text.length * 0.045;
      game.hud.subtitle(CAST[who].name, text, dur);
      ms.sayT = dur + 0.15;
    }
    const t = game.time;
    giver.beam.material.opacity = 0.22 + 0.08 * Math.sin(t * 3);
    marker.beam.material.opacity = 0.26 + 0.1 * Math.sin(t * 4);
    marker.ring.scale.setScalar(1 + 0.15 * Math.sin(t * 5));

    const p = game.player;
    ms.cooldown -= dt;
    if (!ms.active) {
      giver.g.visible = true;
      giver.g.position.set(door.x, 0, door.z + 1);
      if (ms.cooldown <= 0 && !p.dead && !p.vehicle && Math.hypot(p.x - door.x, p.z - (door.z + 1)) < 2.2) {
        if (game.police.stars > 0) game.hud.prompt('Odile: "Not with the police on your tail!"');
        else ms.start(ms.nextId());
      }
      return;
    }
    giver.g.visible = false;
    const m = ms.active;
    const s = m.def.steps[m.step];
    setMarker(s.marker ? s.marker(m.data) : null);
    if (m.timeLeft != null && m.timeLeft > 0) {
      m.timeLeft -= dt;
      game.hud.timer(m.timeLeft);
      if (m.timeLeft <= 0) { ms.fail(s.timeout || 'Out of time.'); return; }
    } else game.hud.timer(null);
    const r = s.update(m.data, dt);
    if (r === 'next') advance(m);
    else if (r === 'pass') ms.pass();
    else if (r && r.startsWith('fail:')) ms.fail(r.slice(5));
  };

  ms.blips = () => {
    const out = [];
    if (!ms.active) { out.push({ x: door.x, z: door.z, color: '#ff5fa2', shape: 'O' }); return out; }
    const m = ms.active;
    const s = m.def.steps[m.step];
    if (!s) return out;
    const b = s.marker ? s.marker(m.data) : s.blip ? s.blip(m.data) : null;
    if (b) out.push({ x: b.x, z: b.z, color: s.marker ? '#ffd23f' : '#ff4040' });
    return out;
  };

  ms.onEnterVehicle = () => {};
  ms.onPedKilled = () => {};
  ms.onWantedCleared = () => {};
  ms.onPickup = (item) => { const m = ms.active; if (m) m.def.onPickup?.(m.data, item); };

  /** Restores progress from a save. */
  ms.load = (data) => {
    if (ms.active) { ms.active.def.cleanup?.(ms.active.data); ms.active = null; }
    ms.index = data.index || 0;
    ms.done = data.done || [];
    ms.courier = data.courier || 0;
    ms.queue = [];
    setMarker(null);
    game.hud.objective(ms.idleText());
    game.hud.timer(null);
  };
  ms.serialize = () => ({ index: ms.index, done: ms.done, courier: ms.courier });
  return ms;
}
