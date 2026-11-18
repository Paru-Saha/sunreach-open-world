// Builds Sunreach Bay: five districts on an 8 x 6 grid of blocks, asphalt roads with crossings,
// raised pavements, buildings with procedural facades, landmark sites with signs, and the container
// yard of the Old Harbor. Every solid building is also registered as a collision box.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';
import { createRng } from './rng.js';
import { addBox } from './collision.js';
import { roadX, roadZ } from './roads.js';
import { facadeTexture, roadTexture, junctionTexture, pavementTexture, grassTexture, signTexture } from './textures.js';

export const DISTRICTS = {
  harbor: { name: 'Old Harbor', style: 'warehouse', color: '#9fb3c8' },
  heights: { name: 'Palmetto Heights', style: 'house', color: '#9be08a' },
  neon: { name: 'Neon Mile', style: 'tower', color: '#ff6fb5' },
  strand: { name: 'Coral Strand', style: 'hotel', color: '#ffb36b' },
  marsh: { name: 'Saltmarsh', style: 'shop', color: '#7fd6e6' },
  beach: { name: 'Coral Strand Beach', style: 'beach', color: '#ffe08a' },
  docks: { name: 'Harbor Docks', style: 'docks', color: '#9fb3c8' },
};

export function districtOfBlock(bi, bj) {
  if (bj === CITY.blocksZ - 1) return 'strand';
  if (bi <= 1) return 'harbor';
  if (bi >= 6) return 'marsh';
  if (bj <= 1) return 'heights';
  return 'neon';
}

export function districtAt(x, z) {
  if (z > CITY.halfZ + CITY.road / 2) return 'beach';
  if (x < -CITY.halfX - CITY.road / 2) return 'docks';
  const bi = Math.max(0, Math.min(CITY.blocksX - 1, Math.floor((x + CITY.halfX) / CITY.cell)));
  const bj = Math.max(0, Math.min(CITY.blocksZ - 1, Math.floor((z + CITY.halfZ) / CITY.cell)));
  return districtOfBlock(bi, bj);
}

/** Block extents (the raised pavement area between four roads). */
export function blockRect(bi, bj) {
  const h = CITY.road / 2;
  return { minX: roadX(bi) + h, maxX: roadX(bi + 1) - h, minZ: roadZ(bj) + h, maxZ: roadZ(bj + 1) - h };
}

/** Height of the walkable ground: pavements are a kerb above the road. */
export function groundHeight(x, z) {
  const h = CITY.road / 2;
  const fx = ((x + CITY.halfX) % CITY.cell + CITY.cell) % CITY.cell;
  const fz = ((z + CITY.halfZ) % CITY.cell + CITY.cell) % CITY.cell;
  const inGrid = x > -CITY.halfX && x < CITY.halfX && z > -CITY.halfZ && z < CITY.halfZ;
  if (inGrid && fx > h && fx < CITY.cell - h && fz > h && fz < CITY.cell - h) return 0.15;
  return 0;
}

/** Special blocks: landmark sites the story and shops use. */
export const SITES = {
  odile: { bi: 6, bj: 3, name: "Odile's Suds", sign: "ODILE'S SUDS", bg: '#2a9d8f', fg: '#fff6e0' },
  surplus: { bi: 7, bj: 1, name: 'Sunreach Surplus', sign: 'SURPLUS', bg: '#3d405b', fg: '#f2cc8f' },
  clinic: { bi: 3, bj: 0, name: 'Sunreach General', sign: '+ SUNREACH GENERAL', bg: '#ffffff', fg: '#e63946' },
  precinct: { bi: 5, bj: 2, name: 'SBPD Precinct 4', sign: 'SBPD PRECINCT 4', bg: '#1d3557', fg: '#f1faee' },
  plaza: { bi: 4, bj: 3, name: 'Sol Plaza' },
  lot: { bi: 2, bj: 4, name: 'Marlin Parking' },
};

/** The pavement point in front of a site, on the south edge of its block. */
export function siteDoor(site) {
  const r = blockRect(site.bi, site.bj);
  return { x: (r.minX + r.maxX) / 2, z: r.maxZ - 2 };
}

function scaledBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f += 1) {
    const sw = f < 2 ? d : w;
    const su = f === 2 || f === 3 ? 0 : sw / 16;
    const sv = f === 2 || f === 3 ? 0 : h / 14;
    for (let k = 0; k < 4; k += 1) {
      const idx = f * 4 + k;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  return geo;
}

export function buildCity(scene) {
  const rng = createRng(20261118);
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const facadeCache = new Map();
  const roofMats = [0x8d8d86, 0xb5654a, 0x6f7b80, 0xd8d2c4].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  function facade(style, color) {
    const k = `${style}:${color}`;
    if (!facadeCache.has(k)) {
      const map = facadeTexture(style, color, rng);
      const mat = style === 'tower'
        ? new THREE.MeshPhongMaterial({ map, shininess: 70, specular: 0x667788 })
        : new THREE.MeshLambertMaterial({ map });
      facadeCache.set(k, mat);
    }
    return facadeCache.get(k);
  }

  const buildings = [];
  function building(cx, cz, w, d, h, style, color, roof = roofMats[0]) {
    const side = facade(style, color);
    const mesh = new THREE.Mesh(scaledBox(w, h, d), [side, side, roof, roof, side, side]);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addBox(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h);
    buildings.push({ x: cx, z: cz, w, d, h, style });
    return mesh;
  }

  function sign(text, bg, fg, x, y, z, rotY, width = 14) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, bg, fg), toneMapped: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    group.add(m);
    return m;
  }

  // Roads and pavements sit on the dry land plane that ocean.js lays down.
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTexture(rng) });
  const junctionMat = new THREE.MeshLambertMaterial({ map: junctionTexture(rng) });
  const pave = pavementTexture(rng);
  const paveMat = new THREE.MeshLambertMaterial({ map: pave });
  const grass = grassTexture(rng);
  const grassMat = new THREE.MeshLambertMaterial({ map: grass });

  const segLen = CITY.cell - CITY.road;
  for (let j = 0; j <= CITY.blocksZ; j += 1) {
    for (let i = 0; i <= CITY.blocksX; i += 1) {
      const jx = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, CITY.road), junctionMat);
      jx.rotation.x = -Math.PI / 2;
      jx.position.set(roadX(i), 0.02, roadZ(j));
      jx.receiveShadow = true;
      group.add(jx);
      if (i < CITY.blocksX) {
        const geo = new THREE.PlaneGeometry(CITY.road, segLen);
        geo.attributes.uv.array.forEach((_, k, arr) => { if (k % 2 === 1) arr[k] *= segLen / 8; });
        const seg = new THREE.Mesh(geo, roadMat);
        seg.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        seg.position.set(roadX(i) + CITY.cell / 2, 0.02, roadZ(j));
        seg.receiveShadow = true;
        group.add(seg);
      }
      if (j < CITY.blocksZ) {
        const geo = new THREE.PlaneGeometry(CITY.road, segLen);
        geo.attributes.uv.array.forEach((_, k, arr) => { if (k % 2 === 1) arr[k] *= segLen / 8; });
        const seg = new THREE.Mesh(geo, roadMat);
        seg.rotation.x = -Math.PI / 2;
        seg.position.set(roadX(i), 0.02, roadZ(j) + CITY.cell / 2);
        seg.receiveShadow = true;
        group.add(seg);
      }
    }
  }

  // Blocks.
  const parks = [];
  for (let bj = 0; bj < CITY.blocksZ; bj += 1) {
    for (let bi = 0; bi < CITY.blocksX; bi += 1) {
      const r = blockRect(bi, bj);
      const w = r.maxX - r.minX;
      const d = r.maxZ - r.minZ;
      const cx = (r.minX + r.maxX) / 2;
      const cz = (r.minZ + r.maxZ) / 2;
      const slabGeo = new THREE.BoxGeometry(w, 0.15, d);
      slabGeo.attributes.uv.array.forEach((_, k, arr) => { arr[k] *= k % 2 === 0 ? w / 4 : d / 4; });
      const slab = new THREE.Mesh(slabGeo, paveMat);
      slab.position.set(cx, 0.075, cz);
      slab.receiveShadow = true;
      group.add(slab);

      const district = districtOfBlock(bi, bj);
      const inset = CITY.sidewalk + 1;
      const ix0 = r.minX + inset;
      const iz0 = r.minZ + inset;
      const iw = w - inset * 2;
      const id = d - inset * 2;
      const site = Object.entries(SITES).find(([, s]) => s.bi === bi && s.bj === bj);

      if (district === 'heights' || (site && (site[0] === 'plaza'))) {
        const lawn = new THREE.Mesh(new THREE.PlaneGeometry(iw, id), grassMat);
        lawn.rotation.x = -Math.PI / 2;
        lawn.position.set(cx, 0.16, cz);
        lawn.receiveShadow = true;
        grass.repeat.set(8, 8);
        group.add(lawn);
      }

      if (site) {
        const [key, s] = site;
        if (key === 'plaza') { parks.push({ x: cx, z: cz, kind: 'plaza' }); continue; }
        if (key === 'lot') { parks.push({ x: cx, z: cz, kind: 'lot' }); continue; }
        const style = key === 'precinct' ? 'tower' : key === 'clinic' ? 'hotel' : 'shop';
        const color = key === 'precinct' ? PALETTE.glass[2] : key === 'clinic' ? 0xf5f5f0 : key === 'odile' ? 0xffd6a5 : 0xb7b7a4;
        const h = key === 'precinct' ? 26 : key === 'clinic' ? 22 : 9;
        const bw = Math.min(iw, 40);
        const bd = 26;
        building(cx, r.maxZ - inset - bd / 2 - 4, bw, bd, h, style, color, roofMats[2]);
        sign(s.sign, s.bg, s.fg, cx, Math.min(h - 2, 7), r.maxZ - inset - 4 + 0.06, 0, Math.min(bw - 4, 18));
        // A smaller back building fills the rest of the lot.
        building(cx, r.minZ + inset + 10, iw, 18, h * 0.6 + 4, 'shop', 0xd9cfc1, roofMats[0]);
        s.door = siteDoor(s);
        continue;
      }

      if (district === 'neon') {
        const lots = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [lx, lz] of lots) {
          const lw = iw / 2 - 3;
          const ld = id / 2 - 3;
          const bx = ix0 + lx * (iw / 2) + iw / 4;
          const bz = iz0 + lz * (id / 2) + id / 4;
          const tall = rng() < 0.6;
          const h = tall ? rng.range(36, 92) : rng.range(14, 28);
          const col = rng.pick(PALETTE.glass);
          building(bx, bz, lw, ld, h, 'tower', col, roofMats[2]);
          if (tall && rng() < 0.6) building(bx, bz, lw * 0.6, ld * 0.6, h + rng.range(6, 14), 'tower', col, roofMats[0]);
        }
      } else if (district === 'strand') {
        for (let k = 0; k < 2; k += 1) {
          const bw = iw / 2 - 4;
          const bx = ix0 + k * (iw / 2) + iw / 4;
          const h = rng.range(14, 36);
          building(bx, cz - 4, bw, id - 12, h, 'hotel', rng.pick(PALETTE.pastel), roofMats[3]);
        }
      } else if (district === 'heights') {
        for (let a = 0; a < 3; a += 1) {
          for (let b = 0; b < 3; b += 1) {
            if (a === 1 && b === 1) continue;
            if (rng() < 0.15) continue;
            const bx = ix0 + (a + 0.5) * (iw / 3);
            const bz = iz0 + (b + 0.5) * (id / 3);
            const s = rng.range(9, 13);
            building(bx, bz, s, s * rng.range(0.8, 1.1), rng.range(5, 9), 'house', rng.pick(PALETTE.pastel), roofMats[rng() < 0.6 ? 1 : 3]);
          }
        }
        parks.push({ x: cx, z: cz, kind: 'pool' });
      } else if (district === 'harbor') {
        for (let k = 0; k < 2; k += 1) {
          const bz = iz0 + (k + 0.5) * (id / 2);
          building(cx, bz, iw - 4, id / 2 - 6, rng.range(8, 14), 'warehouse', rng.pick(PALETTE.warehouse), roofMats[2]);
        }
      } else {
        const lots = [[0, 0], [1, 0], [0, 1], [1, 1]];
        for (const [lx, lz] of lots) {
          if (rng() < 0.2) continue;
          const bx = ix0 + lx * (iw / 2) + iw / 4;
          const bz = iz0 + lz * (id / 2) + id / 4;
          building(bx, bz, iw / 2 - 5, id / 2 - 5, rng.range(6, 13), 'shop', rng.pick(PALETTE.pastel), roofMats[0]);
        }
      }
    }
  }

  // Neon signs on downtown roofs, glowing in the golden light.
  const neonWords = ['LUMEN', 'OASIS', 'VELA', 'SOLARA', 'PALMA', 'NOVA'];
  const neonColors = ['#ff4fa3', '#36e2ff', '#ffd23f', '#7cff6b'];
  let n = 0;
  for (const b of buildings) {
    if (b.style !== 'tower' || b.h < 40 || n >= 10) continue;
    const word = neonWords[n % neonWords.length];
    const col = neonColors[n % neonColors.length];
    sign(word, '#120a1c', col, b.x, b.h - 5, b.z + b.d / 2 + 0.1, 0, Math.min(b.w * 0.8, 16));
    n += 1;
  }

  // Old Harbor container yard and quay, west of Harbor Way.
  const yardMin = CITY.harborX + 4;
  const yardMax = -CITY.halfX - CITY.road / 2 - 3;
  const containerColors = [0xd64933, 0x2e86ab, 0xf6ae2d, 0x33658a, 0x5c946e, 0xe0e0e0];
  const ribbed = new Map();
  for (let z = -CITY.halfZ + 10; z < CITY.halfZ - 10; z += 16) {
    if (rng() < 0.3) continue;
    const stacks = rng.int(1, 3);
    const cx = rng.range(yardMin + 4, yardMax - 4);
    for (let s = 0; s < stacks; s += 1) {
      const color = rng.pick(containerColors);
      if (!ribbed.has(color)) ribbed.set(color, new THREE.MeshLambertMaterial({ map: facadeTexture('warehouse', color, rng) }));
      const m = new THREE.Mesh(scaledBox(6, 2.6, 12), ribbed.get(color));
      m.position.set(cx, 1.3 + s * 2.6, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
    addBox(cx - 3, cx + 3, z - 6, z + 6, stacks * 2.6);
  }
  const quay = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, CITY.halfZ * 2 + 80), new THREE.MeshLambertMaterial({ color: 0x8a8378 }));
  quay.position.set(CITY.harborX + 2, 0.4, 0);
  quay.receiveShadow = true;
  group.add(quay);
  for (let z = -CITY.halfZ; z < CITY.halfZ; z += 70) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 6), new THREE.MeshLambertMaterial({ color: 0x9c7a54 }));
    pier.position.set(CITY.harborX - 15, 0.5, z);
    pier.castShadow = true;
    group.add(pier);
  }

  return { group, buildings, parks };
}
