// Golden-hour sky and light: a gradient dome with a sun glow, warm low sun with soft shadows that
// follow the player, a sky/sand hemisphere fill, distance haze and far hills on the horizon.
import * as THREE from 'three';
import { PALETTE, CITY } from './config.js';
import { createRng } from './rng.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();

export function buildSky(scene, renderer) {
  scene.fog = new THREE.Fog(PALETTE.fog, 160, 760);
  scene.background = new THREE.Color(PALETTE.fog);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(PALETTE.skyTop) },
        horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
        sunDir: { value: SUN_DIR },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.55));
          float s = max(dot(normalize(vDir), sunDir), 0.0);
          col += vec3(1.0, 0.75, 0.45) * pow(s, 18.0) * 0.55;
          col += vec3(1.0, 0.95, 0.8) * smoothstep(0.9975, 0.999, s);
          col = mix(col, vec3(0.98, 0.8, 0.64), smoothstep(0.08, 0.0, vDir.y) * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  // Clouds: a few soft, flattened puffs lit warm from below.
  const rng = createRng(77);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff1e0, emissive: 0x6b4a3a, emissiveIntensity: 0.35, fog: false, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 18; i += 1) {
    const c = new THREE.Group();
    const a = rng() * Math.PI * 2;
    const r = rng.range(600, 1000);
    for (let k = 0; k < 5; k += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(20, 40), 10, 8), cloudMat);
      puff.position.set(k * 28 - 56 + rng.range(-8, 8), rng.range(-6, 6), rng.range(-10, 10));
      puff.scale.y = 0.45;
      c.add(puff);
    }
    c.position.set(Math.cos(a) * r, rng.range(170, 300), Math.sin(a) * r);
    c.lookAt(0, c.position.y, 0);
    scene.add(c);
  }

  // Hills ringing the bay to the north, east and west.
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x9aa86e, flatShading: true });
  for (let i = 0; i < 26; i += 1) {
    const a = Math.PI * (1.05 + rng() * 0.95);
    const r = rng.range(620, 900);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(rng.range(90, 200), rng.range(60, 160), 7), hillMat);
    hill.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
    scene.add(hill);
  }

  const hemi = new THREE.HemisphereLight(0xbfdcff, 0xe2c39a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90; sc.near = 10; sc.far = 600;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.6;
  scene.add(sun);
  scene.add(sun.target);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  return {
    sun,
    hemi,
    dome,
    /** Keeps the shadow box centred on what the camera is looking at. */
    follow(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + SUN_DIR.x * 300, SUN_DIR.y * 300, z + SUN_DIR.z * 300);
      dome.position.set(x, 0, z);
    },
    bounds: CITY,
  };
}
