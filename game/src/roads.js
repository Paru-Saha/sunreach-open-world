// The road network of Sunreach Bay: a grid of intersections, right-hand lanes between them,
// street names, and breadth-first routes that traffic and police cars follow.
import { CITY } from './config.js';

export const AVENUES = ['Harbor Way', 'Dockside Ave', 'Marlin St', 'Flamingo Ave', 'Sol Boulevard', 'Pelican St', 'Mangrove Ave', 'Saltmarsh Rd', 'Eastreach Hwy'];
export const STREETS = ['Hillcrest Dr', 'Palmetto Rd', 'Jacaranda St', 'Neon Mile', 'Coral Way', 'Breeze Ave', 'Shoreline Parade'];

export const LANE = 3.4;
const NI = CITY.blocksX + 1;
const NJ = CITY.blocksZ + 1;

export const roadX = (i) => -CITY.halfX + i * CITY.cell;
export const roadZ = (j) => -CITY.halfZ + j * CITY.cell;

/** All intersections, each with its grid index, position and neighbour ids. */
export const nodes = [];
for (let j = 0; j < NJ; j += 1) {
  for (let i = 0; i < NI; i += 1) {
    nodes.push({ id: j * NI + i, i, j, x: roadX(i), z: roadZ(j), links: [] });
  }
}
for (const n of nodes) {
  if (n.i > 0) n.links.push(n.id - 1);
  if (n.i < NI - 1) n.links.push(n.id + 1);
  if (n.j > 0) n.links.push(n.id - NI);
  if (n.j < NJ - 1) n.links.push(n.id + NI);
}

export const nodeAt = (i, j) => nodes[j * NI + i];

/** The intersection nearest to a point. */
export function nearestNode(x, z) {
  const i = Math.max(0, Math.min(NI - 1, Math.round((x + CITY.halfX) / CITY.cell)));
  const j = Math.max(0, Math.min(NJ - 1, Math.round((z + CITY.halfZ) / CITY.cell)));
  return nodeAt(i, j);
}

/**
 * A point on the right-hand lane from node a to node b, `along` metres from a's centre.
 * Returns { x, z, dx, dz } with the lane's unit direction.
 */
export function lanePoint(a, b, along) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const dx = (b.x - a.x) / len;
  const dz = (b.z - a.z) / len;
  return { x: a.x + dx * along - dz * LANE, z: a.z + dz * along + dx * LANE, dx, dz };
}

/** A neighbour of `node` to drive to next, avoiding a U-turn back to `prevId` when it can. */
export function nextNode(node, prevId, rng) {
  const options = node.links.filter((id) => id !== prevId);
  const list = options.length ? options : node.links;
  return nodes[list[Math.floor(rng() * list.length)]];
}

/** Breadth-first route of node ids from one intersection to another (inclusive). */
export function route(fromId, toId) {
  if (fromId === toId) return [fromId];
  const prev = new Map([[fromId, -1]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    for (const nb of nodes[id].links) {
      if (prev.has(nb)) continue;
      prev.set(nb, id);
      if (nb === toId) {
        const path = [toId];
        let cur = id;
        while (cur !== -1) { path.push(cur); cur = prev.get(cur); }
        return path.reverse();
      }
      queue.push(nb);
    }
  }
  return [fromId];
}

/** Distance from a point to the nearest road centre line, and whether that point is on asphalt. */
export function onRoad(x, z) {
  const fx = (x + CITY.halfX) / CITY.cell;
  const fz = (z + CITY.halfZ) / CITY.cell;
  const inX = x >= -CITY.halfX - CITY.road / 2 && x <= CITY.halfX + CITY.road / 2;
  const inZ = z >= -CITY.halfZ - CITY.road / 2 && z <= CITY.halfZ + CITY.road / 2;
  const dx = Math.abs(fx - Math.round(fx)) * CITY.cell;
  const dz = Math.abs(fz - Math.round(fz)) * CITY.cell;
  return (dx < CITY.road / 2 && inZ) || (dz < CITY.road / 2 && inX);
}

/** The name of the street a point stands on or nearest to. */
export function streetName(x, z) {
  const fi = (x + CITY.halfX) / CITY.cell;
  const fj = (z + CITY.halfZ) / CITY.cell;
  const i = Math.max(0, Math.min(NI - 1, Math.round(fi)));
  const j = Math.max(0, Math.min(NJ - 1, Math.round(fj)));
  const dx = Math.abs(fi - i);
  const dz = Math.abs(fj - j);
  return dx < dz ? AVENUES[i] : STREETS[j];
}

/** The block index (bi, bj) containing a point, or null outside the grid. */
export function blockAt(x, z) {
  const bi = Math.floor((x + CITY.halfX) / CITY.cell);
  const bj = Math.floor((z + CITY.halfZ) / CITY.cell);
  if (bi < 0 || bj < 0 || bi >= CITY.blocksX || bj >= CITY.blocksZ) return null;
  return { bi, bj };
}
