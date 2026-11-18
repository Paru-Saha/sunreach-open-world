// The sea south of Coral Strand and the harbor basin to the west: a gently moving shader surface
// with sun glitter and a foam line on the beach, plus the sand strip, beach gear and anchored boats.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { SUN_DIR } from './sky.js';
import { sandTexture } from './textures.js';
import { createRng } from './rng.js';
import { addBox } from './collision.js';

export function buildOcean(scene) {
  const rng = createRng(4242);
  const uniforms = {
    time: { value: 0 },
    sunDir: { value: SUN_DIR },
    deep: { value: new THREE.Color(0x0e6d8f) },
    shallow: { value: new THREE.Color(0x3fc7c9) },
    fogColor: { value: new THREE.Color(PALETTE.fog) },
    shoreZ: { value: CITY.waterZ },
    harborX: { value: CITY.harborX },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: false,
    vertexShader: `uniform float time; varying vec3 vWorld; varying float vWave;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float wave = sin(w.x * 0.05 + time * 1.3) * 0.25 + sin(w.z * 0.08 - time * 1.7) * 0.18 + sin((w.x + w.z) * 0.13 + time * 2.3) * 0.08;
        w.y += wave;
        vWave = wave;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform float time; uniform vec3 sunDir; uniform vec3 deep; uniform vec3 shallow; uniform vec3 fogColor; uniform float shoreZ; uniform float harborX;
      varying vec3 vWorld; varying float vWave;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        float shore = min(max(vWorld.z - shoreZ, 0.0) + (vWorld.x < harborX ? 999.0 : 0.0), max(harborX - vWorld.x, 0.0) + (vWorld.z > shoreZ ? 999.0 : 0.0));
        float near = clamp(shore / 70.0, 0.0, 1.0);
        vec3 col = mix(shallow, deep, near);
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 n = normalize(vec3(sin(vWorld.x * 0.3 + time * 2.0) * 0.08, 1.0, cos(vWorld.z * 0.27 - time * 1.6) * 0.08));
        vec3 h = normalize(view + sunDir);
        float spec = pow(max(dot(n, h), 0.0), 220.0);
        float glitter = step(0.985, hash(floor(vWorld.xz * 1.5) + floor(time * 4.0))) * pow(max(dot(n, h), 0.0), 30.0);
        col += vec3(1.0, 0.85, 0.6) * (spec * 1.6 + glitter * 1.2);
        float fres = pow(1.0 - max(view.y, 0.0), 3.0);
        col = mix(col, vec3(0.95, 0.78, 0.62), fres * 0.45);
        float foam = smoothstep(4.0, 0.0, shore) * (0.6 + 0.4 * sin(time * 2.0 + vWorld.x * 0.2));
        col = mix(col, vec3(1.0), foam * 0.8);
        float d = length(cameraPosition - vWorld);
        col = mix(col, fogColor, smoothstep(220.0, 900.0, d));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 120, 120), material);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.35, 0);
  scene.add(sea);

  // Sand from the shore road down into the water, and a sand margin along the harbor.
  const sandMap = sandTexture(rng);
  sandMap.repeat.set(60, 8);
  const sandMat = new THREE.MeshLambertMaterial({ map: sandMap });
  const beachTop = CITY.halfZ + CITY.road / 2;
  const beachDepth = CITY.waterZ - beachTop + 30;
  const beachWidth = 1340;
  const beach = new THREE.Mesh(new THREE.PlaneGeometry(beachWidth, beachDepth, 1, 6), sandMat);
  beach.rotation.x = -Math.PI / 2;
  const pos = beach.geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const yLocal = pos.getY(i);
    const z = beachTop + beachDepth / 2 - yLocal;
    pos.setZ(i, z > CITY.waterZ ? -(z - CITY.waterZ) * 0.06 : 0.01);
  }
  beach.geometry.computeVertexNormals();
  beach.position.set(CITY.harborX + beachWidth / 2, 0, beachTop + beachDepth / 2);
  beach.receiveShadow = true;
  scene.add(beach);

  // Dry ground under the city stops at the harbor quay and the beach: cover the sea there.
  const land = new THREE.Mesh(new THREE.PlaneGeometry(CITY.halfX * 2 + 900, 1600), new THREE.MeshLambertMaterial({ color: PALETTE.ground }));
  land.rotation.x = -Math.PI / 2;
  land.position.set(CITY.harborX + (CITY.halfX * 2 + 900) / 2, -0.04, beachTop - 800);
  land.receiveShadow = true;
  scene.add(land);

  // Beach umbrellas, loungers and two lifeguard towers.
  const pole = new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6);
  const shade = new THREE.ConeGeometry(1.6, 0.6, 10, 1, true);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const shadeMats = [0xff6b6b, 0x4ecdc4, 0xffe66d, 0xf7fff7, 0xff9f1c].map((c) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide }));
  const towelMats = [0x3a86ff, 0xff006e, 0xffbe0b, 0x8338ec].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  for (let i = 0; i < 70; i += 1) {
    const x = rng.range(-CITY.halfX + 10, CITY.halfX + 150);
    const z = rng.range(beachTop + 14, CITY.waterZ - 10);
    const u = new THREE.Group();
    const p = new THREE.Mesh(pole, poleMat);
    p.position.y = 1.2;
    const s = new THREE.Mesh(shade, rng.pick(shadeMats));
    s.position.y = 2.3;
    s.castShadow = true;
    const towel = new THREE.Mesh(new THREE.BoxGeometry(1, 0.05, 2), rng.pick(towelMats));
    towel.position.set(1.2, 0.05, 0.4);
    u.add(p, s, towel);
    u.position.set(x, 0, z);
    u.rotation.y = rng() * Math.PI;
    scene.add(u);
  }
  const woodMat = new THREE.MeshLambertMaterial({ color: 0xf4f1de });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xe63946 });
  for (const x of [-120, 140]) {
    const t = new THREE.Group();
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), woodMat);
      leg.position.set(lx * 1.2, 1.5, lz * 1.2);
      t.add(leg);
    }
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 3), woodMat);
    cabin.position.y = 4;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.2, 4), redMat);
    roof.position.y = 5.6;
    roof.rotation.y = Math.PI / 4;
    t.add(cabin, roof);
    t.traverse((m) => { m.castShadow = true; });
    t.position.set(x, 0, CITY.waterZ - 22);
    scene.add(t);
    addBox(x - 1.6, x + 1.6, CITY.waterZ - 23.6, CITY.waterZ - 20.4, 6, 'prop');
  }

  // Boats bobbing offshore and in the harbor basin.
  const boats = [];
  const hullMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x1d3557 });
  for (let i = 0; i < 14; i += 1) {
    const b = new THREE.Group();
    const len = rng.range(8, 16);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(len * 0.32, 1.4, len), hullMat);
    hull.position.y = 0.5;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(len * 0.33, 0.25, len * 1.01), trimMat);
    trim.position.y = 0.2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(len * 0.24, 1.2, len * 0.35), hullMat);
    cab.position.set(0, 1.7, -len * 0.08);
    b.add(hull, trim, cab);
    const harbor = i < 5;
    b.position.set(harbor ? CITY.harborX - rng.range(20, 80) : rng.range(-300, 400), 0, harbor ? rng.range(-200, 200) : CITY.waterZ + rng.range(40, 260));
    b.rotation.y = rng() * Math.PI * 2;
    b.userData.phase = rng() * 6;
    scene.add(b);
    boats.push(b);
  }

  return {
    material,
    update(t) {
      uniforms.time.value = t;
      for (const b of boats) {
        b.position.y = Math.sin(t * 1.2 + b.userData.phase) * 0.25 - 0.1;
        b.rotation.z = Math.sin(t * 0.9 + b.userData.phase) * 0.04;
      }
    },
  };
}

/** True when a ground point is in the sea or the harbor basin. */
export function inWater(x, z) {
  return z > CITY.waterZ + 2 || x < CITY.harborX - 1;
}
