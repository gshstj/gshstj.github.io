// [C 담당] 픽셀 그리기 도우미. 모든 그림은 정수 좌표의 fillRect로 찍는다.

import { RENDER_SCALE } from '../core/config.js';

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeOut3 = (t) => 1 - (1 - t) * (1 - t) * (1 - t);
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 그리기 밀도. 논리 좌표 1px을 D x D 개의 실제 픽셀로 그린다 (480x270 논리 = 1920x1080 픽셀).
// 좌표와 크기는 전부 논리 단위 그대로 쓰고, 도우미들이 1/D 눈금에 맞춰 찍는다.
export const D = RENDER_SCALE;

// 오프스크린 캔버스. w, h는 논리 크기. d = 밀도 (1이면 예전처럼 논리 픽셀 그대로)
export function makeCanvas(w, h, d = D) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * d);
  c.height = Math.ceil(h * d);
  c._d = d;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g._d = d;
  g.scale(d, d);
  return [c, g];
}

// makeCanvas로 만든 캔버스를 논리 크기로 찍는다
export function blit(g, c, x, y) {
  const d = c._d || 1;
  g.drawImage(c, x, y, c.width / d, c.height / d);
}

// 논리 좌표를 픽셀 눈금(1/밀도)에 맞춘다
export const snap = (g, v) => { const d = g._d || 1; return Math.round(v * d) / d; };
export const q = (v) => Math.round(v * D) / D;

// 픽셀 아트 2배 확대 (Scale2x). 계단진 대각선과 곡선을 매끈하게 채운다.
function scale2x(src, w, h) {
  const dst = new Uint32Array(w * h * 4);
  const W2 = w * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const P = src[i];
      const A = y > 0 ? src[i - w] : P, B = x < w - 1 ? src[i + 1] : P;
      const C = x > 0 ? src[i - 1] : P, E = y < h - 1 ? src[i + w] : P;
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (A !== E && C !== B) {
        if (C === A) e0 = A;
        if (A === B) e1 = B;
        if (E === C) e2 = C;
        if (B === E) e3 = E;
      }
      const o = y * 2 * W2 + x * 2;
      dst[o] = e0; dst[o + 1] = e1; dst[o + W2] = e2; dst[o + W2 + 1] = e3;
    }
  }
  return dst;
}

// 픽셀 버퍼(Uint32Array, w x h)를 times번 2배 확대해 캔버스로 만든다
function upscaleBuffer(buf, w, h, times, unit = 1) {
  for (let i = 0; i < times; i++) { buf = scale2x(buf, w, h); w *= 2; h *= 2; }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c._d = (1 << times) / unit;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(buf);
  g.putImageData(img, 0, 0);
  return c;
}

// 밀도 1로 그린 캔버스를 화면 밀도(D)로 매끈하게 확대한 새 캔버스를 돌려준다
export function upscaleCanvas(c) {
  const times = Math.round(Math.log2(D));
  if (times < 1) return c;
  const g = c.getContext('2d');
  const img = g.getImageData(0, 0, c.width, c.height);
  return upscaleBuffer(new Uint32Array(img.data.buffer), c.width, c.height, times);
}

// 시드가 있는 난수 (배경을 매번 같은 모양으로 만들기 위해)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rect(g, color, x, y, w, h) {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
}

// 굵은 선. size = 굵기(논리 px). 고밀도에서는 끝이 둥근 캡슐 모양으로 한 줄씩 채운다.
export function line(g, x0, y0, x1, y1, size = 1, color) {
  if (color) g.fillStyle = color;
  const d = g._d || 1;
  if (d === 1) return lineLo(g, x0, y0, x1, y1, size);
  const r = Math.max(0.5, size * d / 2);
  const ax = x0 * d, ay = y0 * d, bx = x1 * d, by = y1 * d;
  const dx = bx - ax, dy = by - ay;
  const yTop = Math.min(ay, by), yBot = Math.max(ay, by);
  const Y0 = Math.floor(yTop - r), Y1 = Math.ceil(yBot + r);
  if (!(Y1 - Y0 < 6000)) return;
  const flat = Math.abs(dy) < 1e-6;
  const m = flat ? 0 : dx / dy;
  const k = flat ? 0 : r * m / Math.sqrt(1 + m * m);
  for (let Y = Y0; Y < Y1; Y++) {
    const yc = Y + 0.5;
    let lo, hi;
    if (flat) {
      const t = yc - ay;
      if (Math.abs(t) > r) continue;
      const w = Math.sqrt(r * r - t * t);
      lo = Math.min(ax, bx) - w; hi = Math.max(ax, bx) + w;
    } else {
      const sLo = Math.max(yTop, yc - r), sHi = Math.min(yBot, yc + r);
      if (sLo > sHi) continue;
      const s1 = clamp(yc + k, sLo, sHi), s2 = clamp(yc - k, sLo, sHi);
      hi = ax + m * (s1 - ay) + Math.sqrt(Math.max(0, r * r - (yc - s1) * (yc - s1)));
      lo = ax + m * (s2 - ay) - Math.sqrt(Math.max(0, r * r - (yc - s2) * (yc - s2)));
    }
    const X0 = Math.round(lo), X1 = Math.round(hi);
    if (X1 > X0) g.fillRect(X0 / d, Y / d, (X1 - X0) / d, 1 / d);
  }
}

// 밀도 1용 픽셀 선 (브레젠험). 배경처럼 논리 픽셀로 그린 뒤 확대하는 그림에 쓴다.
function lineLo(g, x0, y0, x1, y1, size) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const o = size >> 1;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
    g.fillRect(x0 - o, y0 - o, size, size);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// 원 테두리. ys = 세로 납작 비율(바닥 링용), step = 점선 간격
export function ring(g, cx, cy, r, color, thick = 1, ys = 1, step = 1) {
  g.fillStyle = color;
  const d = g._d || 1;
  if (d === 1 || step > 1 || r < 1) {
    const o = d === 1 ? thick >> 1 : thick / 2;
    if (r < 1) { g.fillRect(snap(g, cx - o), snap(g, cy - o), thick, thick); return; }
    const n = Math.max(8, Math.ceil(6.3 * r));
    for (let i = 0; i < n; i += step) {
      const a = (i / n) * 6.2832;
      g.fillRect(snap(g, cx + Math.cos(a) * r - o), snap(g, cy + Math.sin(a) * r * ys - o), thick, thick);
    }
    return;
  }
  // 고밀도: 바깥 타원에서 안쪽 타원을 뺀 고리를 한 줄씩 채운다
  const ro = (r + thick / 2) * d, ri = Math.max(0, (r - thick / 2) * d);
  const X = cx * d, Yc = cy * d;
  const Y0 = Math.floor(Yc - ro * ys), Y1 = Math.ceil(Yc + ro * ys);
  for (let Y = Y0; Y < Y1; Y++) {
    const yy = (Y + 0.5 - Yc) / ys;
    if (Math.abs(yy) >= ro) continue;
    const xo = Math.sqrt(ro * ro - yy * yy);
    if (Math.abs(yy) < ri) {
      const xi = Math.sqrt(ri * ri - yy * yy);
      const a0 = Math.round(X - xo), a1 = Math.round(X - xi), b0 = Math.round(X + xi), b1 = Math.round(X + xo);
      if (a1 > a0) g.fillRect(a0 / d, Y / d, (a1 - a0) / d, 1 / d);
      if (b1 > b0) g.fillRect(b0 / d, Y / d, (b1 - b0) / d, 1 / d);
    } else {
      const a0 = Math.round(X - xo), a1 = Math.round(X + xo);
      if (a1 > a0) g.fillRect(a0 / d, Y / d, (a1 - a0) / d, 1 / d);
    }
  }
}

// 채운 원 (ys로 타원)
export function disc(g, cx, cy, r, color, ys = 1) {
  g.fillStyle = color;
  const d = g._d || 1;
  if (d === 1) {
    cx = Math.round(cx); cy = Math.round(cy);
    const ry = Math.max(1, Math.round(r * ys));
    for (let y = -ry; y <= ry; y++) {
      const k = y / (ry + 0.5);
      const w = Math.round(r * Math.sqrt(Math.max(0, 1 - k * k)));
      g.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
    return;
  }
  const R = (r + 0.5) * d, X = (cx + 0.5) * d, Yc = (cy + 0.5) * d;
  const Y0 = Math.floor(Yc - R * ys), Y1 = Math.ceil(Yc + R * ys);
  for (let Y = Y0; Y < Y1; Y++) {
    const yy = (Y + 0.5 - Yc) / ys;
    if (Math.abs(yy) >= R) continue;
    const w = Math.sqrt(R * R - yy * yy);
    const a0 = Math.round(X - w), a1 = Math.round(X + w);
    if (a1 > a0) g.fillRect(a0 / d, Y / d, (a1 - a0) / d, 1 / d);
  }
}

// 마름모 테두리
export function diamond(g, cx, cy, r, color, thick = 1) {
  cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
  line(g, cx, cy - r, cx + r, cy, thick, color);
  line(g, cx + r, cy, cx, cy + r, thick);
  line(g, cx, cy + r, cx - r, cy, thick);
  line(g, cx - r, cy, cx, cy - r, thick);
}

// 문자열 픽셀 배열 그리기. pal = { 문자: 색 }, '.'은 투명
// unit = 글자 하나의 크기(논리 px). 0.5면 논리 픽셀의 절반 크기로 찍은 세밀한 그림이다.
// 고밀도에서는 처음 한 번 매끈하게 확대해 두고 그것을 찍는다.
const spriteCache = new WeakMap();
function hex(col) {
  const n = parseInt(col.slice(1), 16);
  return (0xff000000 | ((n & 0xff) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; // ABGR (리틀 엔디언)
}
export function sprite(g, rows, pal, x, y, unit = 1) {
  const d = g._d || 1;
  if (d === 1 && unit === 1) {
    x = Math.round(x); y = Math.round(y);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      let c = 0;
      while (c < row.length) {
        const ch = row[c];
        let e = c + 1;
        while (e < row.length && row[e] === ch) e++;
        const col = pal[ch];
        if (col) { g.fillStyle = col; g.fillRect(x + c, y + r, e - c, 1); }
        c = e;
      }
    }
    return;
  }
  let c = spriteCache.get(rows);
  if (!c) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const buf = new Uint32Array(w * h);
    for (let r = 0; r < h; r++) for (let i = 0; i < rows[r].length; i++) {
      const col = pal[rows[r][i]];
      if (col) buf[r * w + i] = hex(col);
    }
    c = upscaleBuffer(buf, w, h, Math.max(0, Math.round(Math.log2(d * unit))), unit);
    spriteCache.set(rows, c);
  }
  blit(g, c, snap(g, x), snap(g, y));
}

// 키프레임 경로 [[t, x, y], ...] 를 캣멀롬으로 부드럽게 따라간다
export function pathAt(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  if (t >= keys[n - 1][0]) return [keys[n - 1][1], keys[n - 1][2]];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1], p0 = keys[i - 1] || a, p3 = keys[i + 2] || b;
  const u = (t - a[0]) / (b[0] - a[0]);
  const cr = (v0, v1, v2, v3) => 0.5 * (2 * v1 + (v2 - v0) * u
    + (2 * v0 - 5 * v1 + 4 * v2 - v3) * u * u + (3 * v1 - v0 - 3 * v2 + v3) * u * u * u);
  return [cr(p0[1], a[1], b[1], p3[1]), Math.min(0, cr(p0[2], a[2], b[2], p3[2]))];
}

export const mixPt = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
