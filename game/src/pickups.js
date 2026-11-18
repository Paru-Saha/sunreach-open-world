// Things to grab: dropped cash, ammo boxes, health and armour, the ten hidden Sun Tokens scattered
// around the bay, and the counters at Sunreach Surplus (ammo, armour, the Gull SMG) and Sunreach
// General (patch-up), used with E.
import * as THREE from 'three';
import { ECONOMY, PLAYER } from './config.js';
import { SITES } from './city.js';
import { CITY } from './config.js';
import { pointBlocked } from './collision.js';

/** Hidden token spots: rooftops of the beach, ends of piers, alleys and the plaza. */
export const TOKEN_SPOTS = [
  [-140, 280], [205, 296], [CITY.harborX + 6, -150], [CITY.harborX + 6, 170], [-6, -200],
  [118, 9], [282, -151], [-200, 89], [42, 169], [320, 200],
];

/** Moves a spot off any building it landed in, toward open ground. */
function clearSpot(x, z) {
  for (let r = 0; r < 30 && pointBlocked(x, z, 0.6); r += 1) {
    const a = r * 2.4;
    x += Math.cos(a) * 2;
    z += Math.sin(a) * 2;
  }
  return [x, z];
}

const KINDS = {
  cash: { color: 0x3ddc84, geo: () => new THREE.BoxGeometry(0.5, 0.25, 0.3) },
  ammo: { color: 0x9a8c6a, geo: () => new THREE.BoxGeometry(0.5, 0.35, 0.35) },
  health: { color: 0xff4d6d, geo: () => new THREE.OctahedronGeometry(0.35) },
  armor: { color: 0x4cc9f0, geo: () => new THREE.CylinderGeometry(0.35, 0.35, 0.12, 6) },
  token: { color: 0xffc94a, geo: () => new THREE.TorusGeometry(0.45, 0.12, 8, 20) },
  ledger: { color: 0x7b2cbf, geo: () => new THREE.BoxGeometry(0.45, 0.1, 0.6) },
  bag: { color: 0x2b2d42, geo: () => new THREE.SphereGeometry(0.4, 10, 8) },
};

export function createPickups(game) {
  const list = [];
  const pk = { list, tokens: new Set() };

  pk.add = (kind, x, z, amount = 0, opts = {}) => {
    const k = KINDS[kind];
    const mesh = new THREE.Mesh(k.geo(), new THREE.MeshPhongMaterial({ color: k.color, emissive: k.color, emissiveIntensity: 0.35, shininess: 90 }));
    mesh.castShadow = true;
    mesh.position.set(x, 0.8, z);
    game.scene.add(mesh);
    const item = { kind, x, z, amount, mesh, t: game.rng() * 6, life: opts.life ?? Infinity, id: opts.id, mission: opts.mission };
    list.push(item);
    return item;
  };
  pk.drop = (kind, x, z, amount) => pk.add(kind, x, z, amount, { life: 40 });
  pk.remove = (item) => {
    game.scene.remove(item.mesh);
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };

  pk.placeTokens = () => {
    for (const item of [...list]) if (item.kind === 'token') pk.remove(item);
    TOKEN_SPOTS.forEach(([x, z], id) => {
      if (pk.tokens.has(id)) return;
      const [cx, cz] = clearSpot(x, z);
      pk.add('token', cx, cz, 0, { id });
    });
  };

  function collect(item) {
    const p = game.player;
    switch (item.kind) {
      case 'cash': game.money += item.amount; game.audio.cash(); game.hud.toast(`+$${item.amount}`, 1); break;
      case 'ammo': {
        const w = p.owned.smg ? 'smg' : 'pistol';
        if (!p.owned.pistol) { p.owned.pistol = true; }
        p.ammo[w] += item.amount;
        game.audio.pickup();
        game.hud.toast(`+${item.amount} ammo`, 1);
        break;
      }
      case 'health': p.hp = Math.min(PLAYER.maxHealth, p.hp + 40); game.audio.pickup(); break;
      case 'armor': p.armor = Math.min(PLAYER.maxArmor, p.armor + 50); game.audio.pickup(); break;
      case 'token':
        pk.tokens.add(item.id);
        game.money += ECONOMY.tokenReward;
        game.audio.token();
        game.hud.big('SUN TOKEN', `${pk.tokens.size} of ${TOKEN_SPOTS.length} found · +$${ECONOMY.tokenReward}`, 2.5, '#ffc94a');
        if (pk.tokens.size === TOKEN_SPOTS.length) { p.armor = PLAYER.maxArmor; game.hud.toast('All tokens! Free armour forever at Surplus.', 4); }
        break;
      default: game.audio.pickup();
    }
    game.effects.pickup(item.x, 1, item.z, KINDS[item.kind].color);
    game.missions.onPickup(item);
    pk.remove(item);
  }

  function counter(site, lines) {
    const p = game.player;
    if (p.vehicle || !site.door) return;
    if (Math.hypot(p.x - site.door.x, p.z - site.door.z) > 3.2) return;
    game.hud.prompt(lines.map(([key, label]) => `<kbd>${key}</kbd> ${label}`).join(' &nbsp; '));
    return true;
  }

  function buy(cost, fn) {
    if (game.money < cost) { game.hud.toast('Not enough cash', 1.2); game.audio.click(); return; }
    game.money -= cost;
    fn();
    game.audio.cash();
  }

  pk.update = (dt) => {
    const p = game.player;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const item = list[i];
      item.t += dt;
      item.life -= dt;
      if (item.life <= 0) { pk.remove(item); continue; }
      item.mesh.rotation.y += dt * 2.2;
      item.mesh.position.y = 0.8 + Math.sin(item.t * 3) * 0.15;
      const reach = p.vehicle ? 3 : 1.4;
      if (!p.dead && Math.hypot(p.x - item.x, p.z - item.z) < reach) collect(item);
    }
    const inp = game.input;
    const tokenDiscount = pk.tokens.size === TOKEN_SPOTS.length;
    if (counter(SITES.surplus, [['E', `Ammo $${ECONOMY.ammoPrice}`], ['R', `Armour $${tokenDiscount ? 0 : ECONOMY.armorPrice}`], ...(p.owned.smg ? [] : [['T', `Gull SMG $${ECONOMY.smgPrice}`]])])) {
      game.interactBlocked = true;
      if (inp.hit('KeyE')) buy(ECONOMY.ammoPrice, () => { p.owned.pistol = true; const w = p.owned.smg ? 'smg' : 'pistol'; p.ammo[w] += ECONOMY.ammoPack; game.hud.toast(`+${ECONOMY.ammoPack} rounds`, 1.2); });
      if (inp.hit('KeyR')) buy(tokenDiscount ? 0 : ECONOMY.armorPrice, () => { p.armor = PLAYER.maxArmor; game.hud.toast('Armour on', 1.2); });
      if (inp.hit('KeyT') && !p.owned.smg) buy(ECONOMY.smgPrice, () => { p.owned.smg = true; p.ammo.smg += 90; p.weapon = 'smg'; game.hud.toast('Gull SMG bought', 1.5); });
    } else if (counter(SITES.clinic, [['E', `Patch up $${ECONOMY.healPrice}`]])) {
      game.interactBlocked = true;
      if (inp.hit('KeyE') && p.hp < PLAYER.maxHealth) buy(ECONOMY.healPrice, () => { p.hp = PLAYER.maxHealth; game.hud.toast('All patched up', 1.2); });
    } else game.interactBlocked = false;
  };

  pk.reset = () => { for (const item of [...list]) pk.remove(item); };
  return pk;
}
