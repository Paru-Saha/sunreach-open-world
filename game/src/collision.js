// Static collision for the city: every building, wall and prop is an axis-aligned box kept in a
// spatial hash. Characters and cars are circles pushed out of boxes; bullets, the camera and police
// line of sight use ray tests against the same boxes.

const CELL = 16;
const boxes = [];
const hash = new Map();
const key = (cx, cz) => (cx + 512) * 4096 + (cz + 512);

/** Adds a solid box: x/z extents on the ground and a height. Returns its index. */
export function addBox(minX, maxX, minZ, maxZ, height, tag = 'building') {
  const box = { minX, maxX, minZ, maxZ, minY: 0, maxY: height, tag };
  const index = boxes.length;
  boxes.push(box);
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx += 1) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz += 1) {
      const k = key(cx, cz);
      if (!hash.has(k)) hash.set(k, []);
      hash.get(k).push(index);
    }
  }
  return index;
}

export function clearBoxes() {
  boxes.length = 0;
  hash.clear();
}

export const allBoxes = () => boxes;

const seen = new Set();
function nearby(x, z, r) {
  const out = [];
  seen.clear();
  for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx += 1) {
    for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz += 1) {
      const list = hash.get(key(cx, cz));
      if (!list) continue;
      for (const i of list) if (!seen.has(i)) { seen.add(i); out.push(boxes[i]); }
    }
  }
  return out;
}

/**
 * Pushes a circle at (x, z) with radius r out of every box it overlaps (below height y + 1).
 * Returns null when it touches nothing, else { x, z, nx, nz } with the corrected position and the
 * push direction of the deepest contact.
 */
export function resolveCircle(x, z, r, y = 0) {
  let hit = null;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const b of nearby(x, z, r)) {
      if (y > b.maxY) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      let dx = x - cx;
      let dz = z - cz;
      let d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx;
      let nz;
      let push;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        push = r - d;
      } else {
        const left = x - b.minX;
        const right = b.maxX - x;
        const top = z - b.minZ;
        const bottom = b.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) { nx = -1; nz = 0; push = left + r; } else if (m === right) { nx = 1; nz = 0; push = right + r; } else if (m === top) { nx = 0; nz = -1; push = top + r; } else { nx = 0; nz = 1; push = bottom + r; }
      }
      x += nx * push;
      z += nz * push;
      hit = { x, z, nx, nz };
    }
  }
  return hit;
}

/** True when the ground point lies inside a box. */
export function pointBlocked(x, z, pad = 0) {
  for (const b of nearby(x, z, pad + 0.1)) {
    if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
  }
  return false;
}

/**
 * Distance along a ray (origin o, unit direction d) to the first box it meets within maxDist,
 * or Infinity. Uses the slab method over every box, which is cheap at this city's size.
 */
export function raycastBoxes(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  const ix = 1 / (dx || 1e-9);
  const iy = 1 / (dy || 1e-9);
  const iz = 1 / (dz || 1e-9);
  for (const b of boxes) {
    let t1 = (b.minX - ox) * ix;
    let t2 = (b.maxX - ox) * ix;
    let tmin = Math.min(t1, t2);
    let tmax = Math.max(t1, t2);
    t1 = (b.minY - oy) * iy;
    t2 = (b.maxY - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.minZ - oz) * iz;
    t2 = (b.maxZ - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best) best = Math.max(tmin, 0);
  }
  return best;
}

/** True when nothing solid stands between two points (used for police sight and AI aim). */
export function lineClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 0.01) return true;
  return raycastBoxes(ax, ay, az, dx / len, dy / len, dz / len, len) >= len - 0.05;
}
