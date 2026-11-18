// Street furniture and greenery: instanced palm trees with drooping fronds, streetlights at every
// crossing, the Sol Plaza fountain, backyard pools in Palmetto Heights and the Marlin parking lot.
import * as THREE from 'three';
import { CITY } from './config.js';
import { createRng } from './rng.js';
import { addBox } from './collision.js';
import { nodes } from './roads.js';
import { blockRect, districtOfBlock } from './city.js';

function palmGeometries() {
  const trunk = new THREE.CylinderGeometry(0.2, 0.36, 9, 7, 6);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i += 1) {
    const t = (p.getY(i) + 4.5) / 9;
    p.setX(i, p.getX(i) + t * t * 0.9);
    p.setY(i, p.getY(i) + 4.5);
  }
  trunk.computeVertexNormals();

  const verts = [];
  const fronds = 9;
  const steps = 6;
  for (let f = 0; f < fronds; f += 1) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const len = 4.4 + (f % 3) * 0.4;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const pts = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      const r = t * len;
      const y = 9 + 0.7 * t - 2.6 * t * t;
      const w = 0.75 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.05));
      pts.push([0.9 + dx * r - dz * w, y, dz * r + dx * w, 0.9 + dx * r + dz * w, y - 0.05, dz * r - dx * w]);
    }
    for (let s = 0; s < steps; s += 1) {
      const [l0x, l0y, l0z, r0x, r0y, r0z] = pts[s];
      const [l1x, l1y, l1z, r1x, r1y, r1z] = pts[s + 1];
      verts.push(l0x, l0y, l0z, r0x, r0y, r0z, l1x, l1y, l1z);
      verts.push(r0x, r0y, r0z, r1x, r1y, r1z, l1x, l1y, l1z);
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  leaves.computeVertexNormals();
  return { trunk, leaves };
}

export function buildProps(scene) {
  const rng = createRng(9090);
  const palms = [];
  const half = CITY.road / 2;

  // Palms along the shore road, ringing Palmetto Heights blocks and through Sol Plaza.
  for (let x = -CITY.halfX; x < CITY.halfX + 300; x += 16) palms.push([x + rng.range(-2, 2), CITY.halfZ + half + 3]);
  for (let bj = 0; bj < CITY.blocksZ; bj += 1) {
    for (let bi = 0; bi < CITY.blocksX; bi += 1) {
      const d = districtOfBlock(bi, bj);
      const r = blockRect(bi, bj);
      const every = d === 'heights' ? 14 : d === 'strand' ? 18 : d === 'marsh' ? 30 : 0;
      if (!every) continue;
      for (let x = r.minX + 4; x < r.maxX - 2; x += every) {
        palms.push([x, r.minZ + 1.6]);
        palms.push([x, r.maxZ - 1.6]);
      }
    }
  }
  const plaza = blockRect(4, 3);
  for (let k = 0; k < 14; k += 1) {
    const a = (k / 14) * Math.PI * 2;
    palms.push([(plaza.minX + plaza.maxX) / 2 + Math.cos(a) * 22, (plaza.minZ + plaza.maxZ) / 2 + Math.sin(a) * 22]);
  }
  for (let k = 0; k < 60; k += 1) {
    const a = rng() * Math.PI * 2;
    const r = rng.range(CITY.halfX + 40, CITY.halfX + 220);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.75;
    if (z > CITY.halfZ || x < CITY.harborX + 10) continue;
    palms.push([x, z]);
  }

  const { trunk, leaves } = palmGeometries();
  const trunkMesh = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x8b6b4a }), palms.length);
  const leafMesh = new THREE.InstancedMesh(leaves, new THREE.MeshLambertMaterial({ color: 0x3f8f3a, side: THREE.DoubleSide }), palms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const v = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  palms.forEach(([x, z], i) => {
    q.setFromAxisAngle(up, rng() * Math.PI * 2);
    const k = rng.range(0.8, 1.25);
    s.set(k, k * rng.range(0.9, 1.15), k);
    v.set(x, 0.1, z);
    m.compose(v, q, s);
    trunkMesh.setMatrixAt(i, m);
    leafMesh.setMatrixAt(i, m);
  });
  trunkMesh.castShadow = leafMesh.castShadow = true;
  scene.add(trunkMesh, leafMesh);

  // Streetlights on one corner of every crossing.
  const lights = nodes.map((n) => [n.x + half + 1, n.z + half + 1]);
  const poleMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), new THREE.MeshLambertMaterial({ color: 0x5b6670 }), lights.length);
  const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), new THREE.MeshLambertMaterial({ color: 0x5b6670 }), lights.length);
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), lights.length);
  lights.forEach(([x, z], i) => {
    q.setFromAxisAngle(up, Math.PI / 4);
    s.set(1, 1, 1);
    v.set(x, 3.5, z);
    m.compose(v, q, s);
    poleMesh.setMatrixAt(i, m);
    v.set(x - 0.85, 7, z - 0.85);
    m.compose(v, q, s);
    armMesh.setMatrixAt(i, m);
    v.set(x - 1.7, 6.9, z - 1.7);
    m.compose(v, q, s);
    lampMesh.setMatrixAt(i, m);
  });
  poleMesh.castShadow = true;
  scene.add(poleMesh, armMesh, lampMesh);

  // Sol Plaza fountain.
  const pcx = (plaza.minX + plaza.maxX) / 2;
  const pcz = (plaza.minZ + plaza.maxZ) / 2;
  const stone = new THREE.MeshLambertMaterial({ color: 0xe9dcc4 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 1, 24), stone);
  basin.position.set(pcx, 0.6, pcz);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.2, 24), new THREE.MeshPhongMaterial({ color: 0x48cae4, shininess: 90 }));
  water.position.set(pcx, 1.0, pcz);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 4, 12), stone);
  column.position.set(pcx, 2.4, pcz);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1, 0.6, 16), stone);
  bowl.position.set(pcx, 4.4, pcz);
  const sunDisc = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.25, 8, 24), new THREE.MeshPhongMaterial({ color: 0xffc94a, emissive: 0x6b4a00, shininess: 120 }));
  sunDisc.position.set(pcx, 6.6, pcz);
  [basin, water, column, bowl, sunDisc].forEach((o) => { o.castShadow = true; o.receiveShadow = true; scene.add(o); });
  addBox(pcx - 6.5, pcx + 6.5, pcz - 6.5, pcz + 6.5, 1.2, 'prop');

  // Marlin Parking: painted bays on asphalt.
  const lot = blockRect(2, 4);
  const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(lot.maxX - lot.minX - 8, lot.maxZ - lot.minZ - 8), new THREE.MeshLambertMaterial({ color: 0x45474e }));
  lotMesh.rotation.x = -Math.PI / 2;
  lotMesh.position.set((lot.minX + lot.maxX) / 2, 0.16, (lot.minZ + lot.maxZ) / 2);
  lotMesh.receiveShadow = true;
  scene.add(lotMesh);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  for (let row = 0; row < 3; row += 1) {
    for (let k = 0; k < 12; k += 1) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 5), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(lot.minX + 8 + k * 4.4, 0.17, lot.minZ + 12 + row * 18);
      scene.add(line);
    }
  }

  // Backyard pools in the middle of Palmetto Heights blocks.
  const poolMat = new THREE.MeshPhongMaterial({ color: 0x3ddbd9, shininess: 120, specular: 0xffffff });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (let bj = 0; bj < 2; bj += 1) {
    for (let bi = 2; bi < 6; bi += 1) {
      if (bi === 3 && bj === 0) continue;
      const r = blockRect(bi, bj);
      const rim = new THREE.Mesh(new THREE.BoxGeometry(12, 0.2, 7), rimMat);
      rim.position.set((r.minX + r.maxX) / 2, 0.2, (r.minZ + r.maxZ) / 2);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 5.6), poolMat);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(rim.position.x, 0.31, rim.position.z);
      scene.add(rim, pool);
    }
  }

  return { palms: palms.length, lot, plaza: { x: pcx, z: pcz } };
}
