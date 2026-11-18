// The game camera: an over-the-shoulder orbit on foot that tightens when aiming, a chase camera
// behind cars that swings with velocity and widens its field of view with speed, a slow orbit for
// the title screen, collision with buildings so walls never block the view, and impact shake.
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { raycastBoxes } from './collision.js';
import { clamp, damp, wrapAngle } from './rng.js';

export function createCameraRig(camera) {
  const rig = {
    camera,
    yaw: 0,          // where the camera looks, same convention as headings: forward = (sin, cos)
    pitch: 0.18,
    dist: CAMERA.footDistance,
    shakeAmt: 0,
    carYaw: 0,
    lookBack: false,
    mouseIdle: 10,
    target: new THREE.Vector3(),
    fov: CAMERA.fov,
    shake(a) { rig.shakeAmt = Math.min(1, rig.shakeAmt + a); },
    forward() { return { x: Math.sin(rig.yaw), z: Math.cos(rig.yaw) }; },
  };
  return rig;
}

const tmp = new THREE.Vector3();

function place(rig, tx, ty, tz, yaw, pitch, dist, side, dt, snap) {
  const cp = Math.cos(pitch);
  let dx = -Math.sin(yaw) * cp;
  let dy = Math.sin(pitch);
  let dz = -Math.cos(yaw) * cp;
  // Shoulder offset to the right of the view direction.
  const rx = -Math.cos(yaw);
  const rz = Math.sin(yaw);
  const ox = tx + rx * side;
  const oz = tz + rz * side;
  const hit = raycastBoxes(ox, ty, oz, dx, dy, dz, dist + 0.3);
  const d = Math.max(1.2, Math.min(dist, hit - 0.35));
  const cam = rig.camera;
  const px = ox + dx * d;
  const py = Math.max(0.6, ty + dy * d);
  const pz = oz + dz * d;
  if (snap) cam.position.set(px, py, pz);
  else {
    const k = 1 - Math.exp(-18 * dt);
    cam.position.x += (px - cam.position.x) * k;
    cam.position.y += (py - cam.position.y) * k;
    cam.position.z += (pz - cam.position.z) * k;
  }
  tmp.set(ox - dx * 6, ty - dy * 6 + 0.2, oz - dz * 6);
  cam.lookAt(tmp);
  if (rig.shakeAmt > 0.001) {
    const s = rig.shakeAmt * 0.35;
    cam.position.x += (Math.random() - 0.5) * s;
    cam.position.y += (Math.random() - 0.5) * s;
    cam.rotation.z += (Math.random() - 0.5) * s * 0.1;
    rig.shakeAmt = damp(rig.shakeAmt, 0, 5, dt);
  }
}

/** Mouse look: applies this frame's mouse movement to yaw and pitch. */
export function applyMouse(rig, input, sensitivity = 1) {
  const s = CAMERA.mouseSpeed * sensitivity;
  if (input.mouseDX || input.mouseDY) rig.mouseIdle = 0;
  rig.yaw -= input.mouseDX * s;
  rig.pitch = clamp(rig.pitch + input.mouseDY * s, -0.55, 1.1);
}

/** Camera for a person on foot at (x, y, z). */
export function updateFootCamera(rig, x, y, z, aiming, dt, snap = false) {
  rig.dist = damp(rig.dist, aiming ? CAMERA.aimDistance : CAMERA.footDistance, 10, dt);
  rig.fov = damp(rig.fov, aiming ? CAMERA.fov - 14 : CAMERA.fov, 8, dt);
  syncFov(rig);
  place(rig, x, y + 1.65, z, rig.yaw, rig.pitch, rig.dist, aiming ? 0.75 : 0.45, dt, snap);
}

/** Chase camera behind a car; mouse swings it and it eases back behind after a moment. */
export function updateCarCamera(rig, v, dt, snap = false) {
  rig.mouseIdle += dt;
  const moving = Math.hypot(v.vx, v.vz);
  const velYaw = moving > 3 && v.speed > 0 ? Math.atan2(v.vx, v.vz) : v.heading;
  const behind = rig.lookBack ? velYaw + Math.PI : velYaw;
  if (rig.mouseIdle > 1.6 || snap) {
    rig.yaw += wrapAngle(behind - rig.yaw) * (1 - Math.exp(-(snap ? 99 : 3.2) * dt));
    rig.pitch = damp(rig.pitch, 0.2, 2, dt);
  }
  const speedK = clamp(Math.abs(v.speed) / 45, 0, 1);
  rig.fov = damp(rig.fov, CAMERA.fov + CAMERA.fovBoost * speedK, 4, dt);
  syncFov(rig);
  const dist = CAMERA.carDistance + speedK * 2.2 + (v.type === 'gull' ? 2 : 0);
  place(rig, v.x, v.y + 1.7, v.z, rig.yaw, rig.pitch + 0.06, dist, 0, dt, snap);
}

/** A slow orbit around a point, used behind the title screen and cut-scenes. */
export function updateOrbitCamera(rig, x, y, z, radius, height, t) {
  const a = t * 0.05;
  rig.camera.position.set(x + Math.sin(a) * radius, y + height, z + Math.cos(a) * radius);
  rig.camera.lookAt(x, y, z);
  rig.fov = CAMERA.fov;
  syncFov(rig);
}

function syncFov(rig) {
  if (Math.abs(rig.camera.fov - rig.fov) > 0.01) {
    rig.camera.fov = rig.fov;
    rig.camera.updateProjectionMatrix();
  }
}
