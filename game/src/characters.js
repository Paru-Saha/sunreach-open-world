// Low-poly people for everyone on the street: the player, pedestrians, police officers and the
// Halloran crew. One rig (hips, torso, head, two arms, two legs) with outfits and simple procedural
// animation for walking, running, punching, aiming, sitting at a wheel and lying hurt.
import * as THREE from 'three';

const geo = {
  torso: new THREE.BoxGeometry(0.5, 0.62, 0.28),
  hips: new THREE.BoxGeometry(0.46, 0.2, 0.26),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3),
  hair: new THREE.BoxGeometry(0.32, 0.12, 0.32),
  cap: new THREE.BoxGeometry(0.34, 0.08, 0.4),
  arm: new THREE.BoxGeometry(0.15, 0.62, 0.15),
  leg: new THREE.BoxGeometry(0.19, 0.8, 0.2),
  shoe: new THREE.BoxGeometry(0.2, 0.1, 0.3),
  gun: new THREE.BoxGeometry(0.07, 0.12, 0.34),
  badge: new THREE.BoxGeometry(0.08, 0.08, 0.02),
};
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

export const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0xa86b3c];
export const SHIRTS = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xffffff, 0x1a535c, 0xf7a072, 0x9d4edd, 0x90be6d, 0xf28482, 0x48cae4];
export const PANTS = [0x2b2d42, 0x8d99ae, 0xe9d8a6, 0x3d5a80, 0x6c584c, 0xffffff];
export const HAIR = [0x2b1d14, 0x5a3825, 0xd4a017, 0x111111, 0x8b4513, 0xdddddd];

export const OUTFITS = {
  player: { skin: 0xc68642, shirt: 0x2ec4b6, pants: 0x22223b, hair: 0x111111, shoes: 0xffffff },
  cop: { skin: null, shirt: 0x1d3557, pants: 0x14213d, hair: 0x222222, shoes: 0x111111, cap: 0x14213d, badge: 0xffd166 },
  thug: { skin: null, shirt: 0xd62828, pants: 0x111111, hair: 0x111111, shoes: 0x333333, cap: 0xd62828 },
  odile: { skin: 0x8d5524, shirt: 0xf72585, pants: 0xfff1e6, hair: 0xdddddd, shoes: 0xf72585 },
  teo: { skin: 0x5c3a21, shirt: 0xffbe0b, pants: 0x3a86ff, hair: 0x111111, shoes: 0xffffff, cap: 0xffffff },
  vic: { skin: 0xffdbac, shirt: 0xffffff, pants: 0x1d3557, hair: 0xd4a017, shoes: 0x6b4423 },
};

function part(g, m, x, y, z, parent) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Builds a person. `look` is an outfit; missing colours are picked with `rng`. */
export function createHumanoid(look, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const skin = look.skin ?? pick(SKINS);
  const shirt = look.shirt ?? pick(SHIRTS);
  const pants = look.pants ?? pick(PANTS);
  const hair = look.hair ?? pick(HAIR);
  const shoes = look.shoes ?? 0x333333;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = part(geo.hips, mat(pants), 0, 0.92, 0, body);
  const torso = part(geo.torso, mat(shirt), 0, 1.33, 0, body);
  const head = part(geo.head, mat(skin), 0, 1.82, 0, body);
  part(geo.hair, mat(hair), 0, 0.17, -0.01, head);
  if (look.cap) {
    const cap = part(geo.cap, mat(look.cap), 0, 0.2, 0.04, head);
    cap.castShadow = false;
  }
  if (look.badge) part(geo.badge, mat(look.badge), 0.13, 0.12, 0.15, torso);

  const limb = (g, m, x, y) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    body.add(pivot);
    part(g, m, 0, -g.parameters.height / 2, 0, pivot);
    return pivot;
  };
  const armL = limb(geo.arm, mat(shirt), 0.33, 1.6);
  const armR = limb(geo.arm, mat(shirt), -0.33, 1.6);
  part(new THREE.BoxGeometry(0.13, 0.14, 0.13), mat(skin), 0, -0.66, 0, armL);
  part(new THREE.BoxGeometry(0.13, 0.14, 0.13), mat(skin), 0, -0.66, 0, armR);
  const legL = limb(geo.leg, mat(pants), 0.12, 0.84);
  const legR = limb(geo.leg, mat(pants), -0.12, 0.84);
  part(geo.shoe, mat(shoes), 0, -0.82, 0.05, legL);
  part(geo.shoe, mat(shoes), 0, -0.82, 0.05, legR);
  const gun = part(geo.gun, mat(0x222222), 0, -0.68, 0.14, armR);
  gun.visible = false;

  return { root, body, hips, torso, head, armL, armR, legL, legR, gun, phase: rng() * 6, punch: 0, hurt: 0 };
}

/**
 * Poses a person for this frame. `s` holds speed (m/s), and the flags aiming, punching (0..1
 * progress), seated, down (lying) and airborne.
 */
export function animateHumanoid(h, s, dt) {
  const speed = s.speed || 0;
  h.phase += dt * (2.2 + speed * 1.55);
  const swing = Math.min(1, speed / 4) * (speed > 6 ? 1.05 : 0.7);
  const sw = Math.sin(h.phase) * swing;
  h.body.rotation.set(0, 0, 0);
  h.body.position.set(0, 0, 0);

  if (s.down) {
    h.body.rotation.x = -Math.PI / 2;
    h.body.position.set(0, 0.18, 0.85);
    h.armL.rotation.set(0, 0, 1.2);
    h.armR.rotation.set(0.4, 0, -1.3);
    h.legL.rotation.set(0.2, 0, 0.2);
    h.legR.rotation.set(-0.1, 0, -0.15);
    return;
  }
  if (s.seated) {
    h.legL.rotation.set(-1.4, 0, 0);
    h.legR.rotation.set(-1.4, 0, 0);
    h.armL.rotation.set(-1.1, 0, 0);
    h.armR.rotation.set(-1.1, 0, 0);
    h.body.position.y = -0.35;
    return;
  }

  h.legL.rotation.set(sw, 0, 0);
  h.legR.rotation.set(-sw, 0, 0);
  h.armL.rotation.set(-sw * 0.8, 0, 0.06);
  h.armR.rotation.set(sw * 0.8, 0, -0.06);
  h.body.position.y = Math.abs(Math.cos(h.phase)) * 0.05 * swing;
  if (speed > 6) h.body.rotation.x = 0.12;

  if (s.airborne) {
    h.legL.rotation.x = -0.6;
    h.legR.rotation.x = 0.3;
    h.armL.rotation.set(-0.4, 0, 0.5);
    h.armR.rotation.set(-0.4, 0, -0.5);
  }
  if (s.aiming) {
    h.armR.rotation.set(-Math.PI / 2 + (s.pitch || 0), 0, 0);
    h.armL.rotation.set(-Math.PI / 2 + 0.2 + (s.pitch || 0), 0, -0.5);
  }
  if (s.punching > 0) {
    const p = Math.sin(Math.min(1, s.punching) * Math.PI);
    const arm = s.punchLeft ? h.armL : h.armR;
    arm.rotation.set(-Math.PI / 2 * (0.4 + p * 0.65), 0, 0);
    h.body.rotation.y = (s.punchLeft ? -1 : 1) * p * 0.35;
  }
  if (s.hands) {
    h.armL.rotation.set(-2.8, 0, 0.3);
    h.armR.rotation.set(-2.8, 0, -0.3);
  }
}
