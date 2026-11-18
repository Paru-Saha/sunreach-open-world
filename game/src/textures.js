// Procedural canvas textures: building facades, asphalt with lane paint, pavement, sand and soft
// sprites. Nothing is loaded from disk; every pixel is drawn here at start-up.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function shade(color, f) {
  const c = new THREE.Color(color);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

function speckle(g, w, h, count, colors, rng, size = 1) {
  for (let i = 0; i < count; i += 1) {
    g.fillStyle = colors[Math.floor(rng() * colors.length)];
    g.fillRect(rng() * w, rng() * h, size, size);
  }
}

/**
 * A facade tile covering 4 windows by 4 floors (16 m x 14 m). Styles: tower (glass curtain wall),
 * hotel (pastel with balconies), house, warehouse (corrugated panels), shop.
 */
export function facadeTexture(style, base, rng) {
  const [c, g] = canvas(256, 256);
  const cols = 4;
  const rows = 4;
  const cw = 256 / cols;
  const rh = 256 / rows;
  if (style === 'tower') {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, shade(base, 1.15));
    grad.addColorStop(1, shade(base, 0.7));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const lit = rng() < 0.12;
        g.fillStyle = lit ? 'rgba(255,230,170,0.55)' : `rgba(20,40,70,${0.15 + rng() * 0.25})`;
        g.fillRect(k * cw + 3, r * rh + 4, cw - 6, rh - 8);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        g.fillRect(k * cw + 3, r * rh + 4, (cw - 6) * 0.35, rh - 8);
      }
    }
    g.fillStyle = 'rgba(230,240,250,0.85)';
    for (let k = 0; k <= cols; k += 1) g.fillRect(k * cw - 2, 0, 4, 256);
    for (let r = 0; r <= rows; r += 1) g.fillRect(0, r * rh - 3, 256, 6);
  } else if (style === 'warehouse') {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 8) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x, 0, 2, 256);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 3, 0, 2, 256);
    }
    g.fillStyle = 'rgba(40,40,40,0.35)';
    for (let k = 0; k < cols; k += 1) g.fillRect(k * cw + 14, 20, cw - 28, 14);
    speckle(g, 256, 256, 500, ['rgba(80,50,30,0.15)', 'rgba(255,255,255,0.08)'], rng, 2);
  } else {
    g.fillStyle = hex(base);
    g.fillRect(0, 0, 256, 256);
    speckle(g, 256, 256, 900, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.08)'], rng, 2);
    for (let r = 0; r < rows; r += 1) {
      for (let k = 0; k < cols; k += 1) {
        const x = k * cw;
        const y = r * rh;
        if (style === 'house' && rng() < 0.35) continue;
        const lit = rng() < 0.1;
        const wx = x + cw * 0.22;
        const wy = y + rh * 0.2;
        const ww = cw * 0.56;
        const wh = rh * 0.55;
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        const glass = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        glass.addColorStop(0, lit ? '#ffe3a8' : '#8fc3df');
        glass.addColorStop(1, lit ? '#f7b866' : '#3f6f93');
        g.fillStyle = glass;
        g.fillRect(wx, wy, ww, wh);
        if (style === 'hotel') {
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(x + 4, y + rh * 0.8, cw - 8, 5);
          g.fillStyle = 'rgba(255,255,255,0.6)';
          for (let b = x + 6; b < x + cw - 6; b += 6) g.fillRect(b, y + rh * 0.68, 2, rh * 0.12);
        }
        if (style === 'shop' && r === rows - 1) {
          g.fillStyle = k % 2 ? '#e76f51' : '#ffffff';
          g.fillRect(x, y + 6, cw, 10);
        }
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let r = 1; r < rows; r += 1) g.fillRect(0, r * rh - 2, 256, 3);
  }
  return toTexture(c);
}

/** Asphalt with a dashed yellow centre line and white edge lines; u across, v along (8 m per tile). */
export function roadTexture(rng) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3b3d44';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1400, ['#46484f', '#2f3137', '#55565b'], rng, 1);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(30, 0, 14, 128);
  g.fillRect(84, 0, 14, 128);
  g.fillStyle = '#f2f0e6';
  g.fillRect(5, 0, 3, 128);
  g.fillRect(120, 0, 3, 128);
  g.fillStyle = '#f2c14e';
  g.fillRect(61, 0, 2, 72);
  g.fillRect(65, 0, 2, 72);
  return toTexture(c);
}

/** Plain asphalt for intersections. */
export function junctionTexture(rng) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#3b3d44';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 1400, ['#46484f', '#2f3137', '#55565b'], rng, 1);
  g.fillStyle = 'rgba(242,240,230,0.9)';
  for (let i = 0; i < 6; i += 1) {
    g.fillRect(14 + i * 17, 2, 9, 14);
    g.fillRect(14 + i * 17, 112, 9, 14);
    g.fillRect(2, 14 + i * 17, 14, 9);
    g.fillRect(112, 14 + i * 17, 14, 9);
  }
  return toTexture(c, false);
}

/** Pale pavement slabs. */
export function pavementTexture(rng) {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#cfc5b3';
  g.fillRect(0, 0, 64, 64);
  speckle(g, 64, 64, 300, ['#c2b8a6', '#d9d0bf'], rng, 1);
  g.fillStyle = '#b0a694';
  g.fillRect(0, 0, 64, 1);
  g.fillRect(0, 0, 1, 64);
  g.fillRect(0, 32, 64, 1);
  g.fillRect(32, 0, 1, 64);
  return toTexture(c);
}

/** Warm sand with ripples. */
export function sandTexture(rng) {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#efd8a4';
  g.fillRect(0, 0, 128, 128);
  speckle(g, 128, 128, 2400, ['#e6cc94', '#f6e3b8', '#dcc089'], rng, 1);
  return toTexture(c);
}

/** Grass for parks and lawns. */
export function grassTexture(rng) {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#7fb069';
  g.fillRect(0, 0, 64, 64);
  speckle(g, 64, 64, 900, ['#6fa25c', '#8fc07a', '#5f9150'], rng, 1);
  return toTexture(c);
}

/** A soft round sprite used for smoke, dust and glows. */
export function softSprite() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

/** A sign texture with text, used for landmarks such as the laundromat and the shop. */
export function signTexture(text, bg, fg) {
  const [c, g] = canvas(512, 128);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.font = 'bold 60px Trebuchet MS, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  return toTexture(c, false);
}
