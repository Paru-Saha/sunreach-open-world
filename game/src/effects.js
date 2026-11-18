// Visual effects from one pool of sprites: exhaust and engine smoke, fire, tyre dust, sparks,
// blood puffs, water splashes and explosion fireballs, plus bullet tracers drawn as one line
// buffer and two always-present flash lights (so adding a flash never recompiles shaders).
import * as THREE from 'three';
import { softSprite } from './textures.js';

const MAX = 220;
const TRACERS = 40;

export function createEffects(game) {
  const tex = softSprite();
  const parts = [];
  for (let i = 0; i < MAX; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    game.scene.add(s);
    parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, g: 0, alpha: 1, additive: false });
  }
  let cursor = 0;

  function emit(x, y, z, o) {
    const p = parts[cursor];
    cursor = (cursor + 1) % MAX;
    p.s.visible = true;
    p.s.position.set(x, y, z);
    p.life = 0;
    p.max = o.life;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.size = o.size; p.grow = o.grow || 0; p.g = o.g || 0; p.alpha = o.alpha ?? 1;
    p.s.material.color.setHex(o.color);
    const add = !!o.additive;
    if (p.s.material.blending !== (add ? THREE.AdditiveBlending : THREE.NormalBlending)) {
      p.s.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
      p.s.material.needsUpdate = true;
    }
    p.s.scale.setScalar(o.size);
    p.s.material.opacity = p.alpha;
    return p;
  }

  // Tracers.
  const tracerPos = new Float32Array(TRACERS * 6);
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 0.9 });
  const tracerLines = new THREE.LineSegments(tracerGeo, tracerMat);
  tracerLines.frustumCulled = false;
  game.scene.add(tracerLines);
  const tracerLife = new Float32Array(TRACERS);
  let tcur = 0;

  const flash = new THREE.PointLight(0xffc477, 0, 14, 2);
  const boom = new THREE.PointLight(0xff7a2a, 0, 60, 1.6);
  game.scene.add(flash, boom);
  let flashT = 0;
  let boomT = 0;

  const fx = {
    smoke(x, y, z, fire) {
      if (fire) emit(x, y, z, { life: 0.5, size: 1.1, grow: 1.5, vy: 2.5, color: 0xff8a2a, additive: true, alpha: 0.9 });
      emit(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5, { life: 2.2, size: 1.2, grow: 2.2, vy: 2.2, vx: 0.6, color: fire ? 0x3a3330 : 0x8c8780, alpha: 0.55 });
    },
    dust(x, y, z, k) {
      emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), { life: 1.0, size: 1.2, grow: 2.5 * k + 1, vy: 0.6, color: 0xe8e2d8, alpha: 0.45 * k + 0.1 });
    },
    sparks(x, y, z, n) {
      for (let i = 0; i < n; i += 1) emit(x, y, z, { life: 0.35 + Math.random() * 0.2, size: 0.18, vx: (Math.random() - 0.5) * 9, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 9, g: 18, color: 0xffd27a, additive: true });
    },
    blood(x, y, z) {
      for (let i = 0; i < 5; i += 1) emit(x, y, z, { life: 0.45, size: 0.3, grow: 0.6, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3, g: 9, color: 0xa4161a, alpha: 0.85 });
    },
    splash(x, z) {
      for (let i = 0; i < 26; i += 1) emit(x, 0, z, { life: 1.0, size: 0.8, grow: 1.4, vx: (Math.random() - 0.5) * 7, vy: 4 + Math.random() * 5, vz: (Math.random() - 0.5) * 7, g: 14, color: 0xffffff, alpha: 0.8 });
    },
    muzzle(x, y, z) {
      emit(x, y, z, { life: 0.06, size: 0.9, color: 0xffd27a, additive: true });
      flash.position.set(x, y, z);
      flash.intensity = 30;
      flashT = 0.06;
    },
    tracer(a, b) {
      const k = tcur * 6;
      tracerPos[k] = a.x; tracerPos[k + 1] = a.y; tracerPos[k + 2] = a.z;
      tracerPos[k + 3] = b.x; tracerPos[k + 4] = b.y; tracerPos[k + 5] = b.z;
      tracerLife[tcur] = 0.07;
      tcur = (tcur + 1) % TRACERS;
      tracerGeo.attributes.position.needsUpdate = true;
    },
    explosion(x, y, z) {
      for (let i = 0; i < 16; i += 1) emit(x, y, z, { life: 0.7 + Math.random() * 0.4, size: 2.4, grow: 6, vx: (Math.random() - 0.5) * 12, vy: Math.random() * 9, vz: (Math.random() - 0.5) * 12, g: 4, color: i % 2 ? 0xffb347 : 0xff5a1f, additive: true });
      for (let i = 0; i < 14; i += 1) emit(x, y + 1, z, { life: 3, size: 3, grow: 4, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 3, vz: (Math.random() - 0.5) * 4, color: 0x2b2522, alpha: 0.7 });
      fx.sparks(x, y + 0.5, z, 24);
      boom.position.set(x, y + 2, z);
      boom.intensity = 900;
      boomT = 0.6;
    },
    pickup(x, y, z, color) {
      for (let i = 0; i < 10; i += 1) emit(x, y, z, { life: 0.6, size: 0.35, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3, g: 6, color, additive: true });
    },
    update(dt) {
      for (const p of parts) {
        if (!p.s.visible) continue;
        p.life += dt;
        if (p.life >= p.max) { p.s.visible = false; continue; }
        p.vy -= p.g * dt;
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.s.position.z += p.vz * dt;
        if (p.s.position.y < 0.05) { p.s.position.y = 0.05; p.vy = 0; }
        const t = p.life / p.max;
        p.s.scale.setScalar(p.size + p.grow * t);
        p.s.material.opacity = p.alpha * (1 - t) * (1 - t * 0.2);
      }
      let any = false;
      for (let i = 0; i < TRACERS; i += 1) {
        if (tracerLife[i] <= 0) continue;
        tracerLife[i] -= dt;
        if (tracerLife[i] <= 0) {
          tracerPos.fill(0, i * 6, i * 6 + 6);
          any = true;
        }
      }
      if (any) tracerGeo.attributes.position.needsUpdate = true;
      flashT -= dt;
      if (flashT <= 0) flash.intensity = 0;
      boomT -= dt;
      boom.intensity = boomT > 0 ? 900 * (boomT / 0.6) : 0;
    },
  };
  return fx;
}
