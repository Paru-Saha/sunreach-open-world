// The round minimap: the whole bay drawn once to an offscreen canvas (sea, sand, districts,
// streets and buildings), then shown each frame rotated to the camera and zoomed out with speed,
// with blips for the player, police (flashing red and blue), the mission target (pinned to the
// rim when off-map), Odile, the shop and the clinic.
import { CITY } from './config.js';
import { nodes, roadX, roadZ } from './roads.js';
import { DISTRICTS, districtOfBlock, blockRect, SITES } from './city.js';
import { allBoxes } from './collision.js';

const SIZE = 1024;
const HALF = SIZE / 2;

function drawBase() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#17607f';
  g.fillRect(0, 0, SIZE, SIZE);
  // Land: everything north of the shore and east of the harbor.
  g.fillStyle = '#3d4636';
  g.fillRect(CITY.harborX + HALF, 0, SIZE, CITY.waterZ + HALF);
  g.fillStyle = '#b89d62';
  g.fillRect(CITY.harborX + HALF, CITY.halfZ + HALF, SIZE, CITY.waterZ - CITY.halfZ);
  for (let bj = 0; bj < CITY.blocksZ; bj += 1) {
    for (let bi = 0; bi < CITY.blocksX; bi += 1) {
      const r = blockRect(bi, bj);
      const d = DISTRICTS[districtOfBlock(bi, bj)];
      g.fillStyle = '#2b3038';
      g.fillRect(r.minX + HALF, r.minZ + HALF, r.maxX - r.minX, r.maxZ - r.minZ);
      g.fillStyle = d.color;
      g.globalAlpha = 0.3;
      g.fillRect(r.minX + HALF, r.minZ + HALF, r.maxX - r.minX, r.maxZ - r.minZ);
      g.globalAlpha = 1;
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.22)';
  for (const b of allBoxes()) {
    if (b.tag !== 'building') continue;
    g.fillRect(b.minX + HALF, b.minZ + HALF, b.maxX - b.minX, b.maxZ - b.minZ);
  }
  g.fillStyle = '#d9dde3';
  for (let i = 0; i <= CITY.blocksX; i += 1) g.fillRect(roadX(i) - CITY.road / 2 + HALF, -CITY.halfZ - CITY.road / 2 + HALF, CITY.road, CITY.halfZ * 2 + CITY.road);
  for (let j = 0; j <= CITY.blocksZ; j += 1) g.fillRect(-CITY.halfX - CITY.road / 2 + HALF, roadZ(j) - CITY.road / 2 + HALF, CITY.halfX * 2 + CITY.road, CITY.road);
  g.fillStyle = 'rgba(255,190,60,0.9)';
  for (const n of nodes) g.fillRect(n.x - 1.5 + HALF, n.z - 1.5 + HALF, 3, 3);
  return c;
}

export function createMinimap(game, canvas) {
  const g = canvas.getContext('2d');
  const base = drawBase();
  const W = canvas.width;
  const R = W / 2;
  const mm = { zoom: 0.9 };

  function toScreen(x, z, s, fx, fz, rx, rz) {
    const p = game.player;
    const dx = x - p.x;
    const dz = z - p.z;
    return [R + (rx * dx + rz * dz) * s, R - (fx * dx + fz * dz) * s];
  }

  function blip(x, z, s, f, r, color, shape, pin) {
    let [sx, sy] = toScreen(x, z, s, f[0], f[1], r[0], r[1]);
    const dx = sx - R;
    const dy = sy - R;
    const d = Math.hypot(dx, dy);
    if (d > R - 8) {
      if (!pin) return;
      sx = R + (dx / d) * (R - 8);
      sy = R + (dy / d) * (R - 8);
    }
    g.fillStyle = color;
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    if (shape === 'square') g.rect(sx - 4.5, sy - 4.5, 9, 9);
    else g.arc(sx, sy, shape === 'big' ? 6 : 4, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    if (shape && shape.length === 1) {
      g.fillStyle = '#000';
      g.font = 'bold 9px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(shape, sx, sy + 0.5);
    }
  }

  mm.draw = () => {
    const p = game.player;
    const yaw = game.rig.yaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = -Math.cos(yaw);
    const rz = Math.sin(yaw);
    const sp = p.vehicle ? Math.abs(p.vehicle.speed) : 0;
    mm.zoom += ((sp > 15 ? 0.55 : 0.9) - mm.zoom) * 0.05;
    const s = mm.zoom;
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(R, R, R, 0, Math.PI * 2);
    g.clip();
    const ox = HALF + p.x;
    const oz = HALF + p.z;
    g.setTransform(rx * s, -fx * s, rz * s, -fz * s, R - s * (rx * ox + rz * oz), R + s * (fx * ox + fz * oz));
    g.drawImage(base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (game.police.stars > 0) {
      g.fillStyle = `rgba(255,40,60,${0.12 + 0.08 * Math.sin(game.time * 8)})`;
      g.fillRect(0, 0, W, W);
    }
    const F = [fx, fz];
    const Rr = [rx, rz];
    blip(SITES.surplus.door.x, SITES.surplus.door.z, s, F, Rr, '#f2cc8f', '$', false);
    blip(SITES.clinic.door.x, SITES.clinic.door.z, s, F, Rr, '#ffffff', '+', false);
    const flash = Math.floor(game.time * 5) % 2 === 0;
    for (const u of game.police.units) {
      if (u.done || u.car.destroyed) continue;
      blip(u.car.x, u.car.z, s, F, Rr, flash ? '#ff3344' : '#3366ff', null, false);
    }
    for (const ped of game.peds.list) {
      if (ped.state === 'dead') continue;
      if (ped.kind === 'cop' && ped.hostile) blip(ped.x, ped.z, s, F, Rr, flash ? '#3366ff' : '#ff3344', null, false);
      if (ped.kind === 'thug' && ped.mission) blip(ped.x, ped.z, s, F, Rr, '#ff4040', null, true);
    }
    for (const m of game.missions.blips()) blip(m.x, m.z, s, F, Rr, m.color, m.shape || 'big', true);
    g.restore();
    // Player arrow, always pointing the way the player faces relative to the camera.
    const h = (p.vehicle ? p.vehicle.heading : p.heading) - yaw;
    g.save();
    g.translate(R, R);
    g.rotate(-h);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(6, 7);
    g.lineTo(0, 3);
    g.lineTo(-6, 7);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // North marker on the rim: world north is -z.
    g.fillStyle = '#fff';
    g.font = 'bold 11px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', R - rz * (R - 9), R + fz * (R - 9));
  };
  return mm;
}
