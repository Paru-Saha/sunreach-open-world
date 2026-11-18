// Deterministic screenshot scenes behind ?shot=chase|cruise|combat|title&seed=n. Each one sets up
// a real moment of play with the game's own systems (a mission step, the wanted level, traffic,
// people, weapons), runs the simulation forward a fixed number of steps and renders one frame
// with the HUD, so the same seed always gives the same picture.
import { STEP } from './config.js';
import { spawnVehicle } from './vehicles.js';
import { enterVehicle } from './player.js';
import { seedTraffic } from './traffic.js';
import { lanePoint, nodeAt } from './roads.js';

function startMission(game, id, step) {
  const ms = game.missions;
  ms.index = ['homecoming', 'spin', 'beach', 'wheels', 'tide'].indexOf(id);
  ms.start(id);
  while (ms.active && ms.active.step < step) {
    const m = ms.active;
    m.step += 1;
    const s = m.def.steps[m.step];
    s.setup?.(m.data);
    game.hud.objective(s.text);
    m.timeLeft = s.timer || null;
  }
  ms.queue = [];
  game.hud.subT = 0;
  game.hud.bigT = 0;
  document.getElementById('big').style.opacity = 0;
}

function run(game, steps, each) {
  for (let i = 0; i < steps; i += 1) {
    each?.(i);
    game.step(STEP);
    game.frame += 1;
    game.input.pressed.clear();
    game.input.leftClicked = false;
  }
}

function finish(game, cameraFn) {
  let frames = 0;
  const tick = () => {
    frames += 1;
    if (cameraFn) cameraFn(); else game.placeCamera(STEP, frames === 1);
    if (game.state !== 'title') { game.hud.update(0.016); game.minimap.draw(); }
    game.render();
    if (frames < 4) requestAnimationFrame(tick);
    else { document.title = 'ready'; window.__shotReady = true; }
  };
  requestAnimationFrame(tick);
}

const SCENES = {
  /** Cover: a four-star police chase down Sol Boulevard with the SBPD helicopter overhead. */
  chase(game) {
    game.newGame();
    game.menus.play();
    game.noAutoPause = true;
    game.hud.bigT = 0;
    document.getElementById('big').style.opacity = 0;
    startMission(game, 'spin', 1);
    game.missions.active.timeLeft = 112;
    const p = game.player;
    const car = spawnVehicle(game, 'vesper', -3.4, 34, 0, 0xe84a5f);
    enterVehicle(game, car);
    car.vx = 0; car.vz = 27; car.speed = 27;
    seedTraffic(game, 0, 40, 24);
    game.peds.seed(0, 40, 30);
    game.police.setStars(4);
    const cops = [[-3.4, 18], [-0.5, 4], [-4.2, -10]].map(([x, z]) => {
      const c = spawnVehicle(game, 'cruiser', x, z, 0);
      c.siren = true; c.driver = 'ai'; c.vz = 26; c.speed = 26;
      c.ai = { kind: 'police', path: [], pathT: 0, stuck: 0, reverseT: 0 };
      game.police.units.push({ car: c, crew: [], deployed: false });
      return c;
    });
    // Clear the boulevard ahead so the chase has room.
    for (const v of [...game.vehicles]) if (v !== car && !cops.includes(v) && Math.abs(v.x) < 8 && v.z > 10 && v.z < 120) { game.scene.remove(v.model.root); game.vehicles.splice(game.vehicles.indexOf(v), 1); }
    p.owned.pistol = true; p.ammo.pistol = 31; p.weapon = 'pistol';
    const heli = game.police.heli;
    heli.active = true; heli.group.visible = true; heli.x = 8; heli.z = 30; heli.y = 34;
    run(game, 24, () => { car.ctrl.throttle = 1; car.ctrl.steer = 0; });
    // Close the pursuers up for the frame: one on the bumper, one alongside, one further back.
    const place = (c, dx, dz, h) => { c.x = car.x + dx; c.z = car.z + dz; c.heading = h; c.vx = Math.sin(h) * 26; c.vz = Math.cos(h) * 26; };
    place(cops[0], 0.2, -8.5, -0.05);
    place(cops[1], 4.6, -15, 0.12);
    place(cops[2], -0.8, -27, 0);
    heli.x = car.x + 7; heli.z = car.z - 48; heli.y = 19;
    run(game, 4, () => { car.ctrl.throttle = 1; car.ctrl.steer = 0.05; });
    heli.x = car.x + 7; heli.z = car.z - 48; heli.y = 19;
    game.hud.toast('', 0);
    finish(game, () => {
      const cam = game.rig.camera;
      cam.fov = 60;
      cam.updateProjectionMatrix();
      cam.position.set(car.x + 3.8, 2.3, car.z + 9.5);
      cam.lookAt(car.x - 0.6, 3.4, car.z - 20);
      game.rig.yaw = Math.PI;
      game.sky.follow(car.x, car.z - 10);
    });
  },

  /** Cruising Shoreline Parade in Halloran's gold Vesper on the Hot Wheels mission. */
  cruise(game) {
    game.newGame();
    game.menus.play();
    game.noAutoPause = true;
    game.hud.bigT = 0;
    document.getElementById('big').style.opacity = 0;
    startMission(game, 'wheels', 1);
    const m = game.missions.active.data;
    const a = nodeAt(2, 6);
    const b = nodeAt(3, 6);
    const pnt = lanePoint(a, b, 30);
    m.car.x = pnt.x; m.car.z = pnt.z; m.car.heading = Math.PI / 2;
    enterVehicle(game, m.car);
    m.car.vx = 18; m.car.speed = 18;
    game.police.setStars(0);
    seedTraffic(game, pnt.x + 40, pnt.z, 26);
    game.peds.seed(pnt.x + 40, pnt.z - 20, 34);
    run(game, 90, () => { m.car.ctrl.throttle = 0.6; m.car.ctrl.steer = 0; });
    game.hud.toast('', 0);
    game.hud.subtitle('Teo', "Gold paint, white leather. Halloran's going to lose his mind.", 10);
    finish(game);
  },

  /** On foot on Coral Strand Beach, trading fire with the Marina Crew. */
  combat(game) {
    game.newGame();
    game.menus.play();
    game.noAutoPause = true;
    game.hud.bigT = 0;
    document.getElementById('big').style.opacity = 0;
    const p = game.player;
    p.owned.pistol = true; p.ammo.pistol = 48; p.weapon = 'pistol';
    p.armor = 60; p.hp = 74;
    game.money = 3420;
    game.hud.shownMoney = 3420;
    startMission(game, 'beach', 0);
    const thugs = game.missions.active.data.thugs;
    thugs[5].hp = 0; thugs[5].state = 'dead';
    thugs[4].hp = 0; thugs[4].state = 'dead';
    for (const t of thugs) t.hostile = t.state !== 'dead';
    p.x = 96; p.z = 248; p.y = 0;
    game.rig.yaw = 0.15;
    game.rig.pitch = 0.04;
    p.heading = 0.15;
    game.police.setStars(2);
    seedTraffic(game, 96, 230, 14);
    game.peds.seed(96, 230, 16);
    game.godMode = true;
    run(game, 70, (i) => {
      game.input.rightDown = true;
      if (i === 40 || i === 69) game.input.leftClicked = true;
    });
    finish(game);
  },

  /** The title screen over the bay. */
  title(game) {
    game.menus.showTitle();
    seedTraffic(game, 60, 40, 24);
    game.peds.seed(60, 40, 30);
    game.time = 61;
    run(game, 40);
    finish(game);
  },
};

export function runShot(game, name) {
  const scene = SCENES[name] || SCENES.chase;
  scene(game);
}
