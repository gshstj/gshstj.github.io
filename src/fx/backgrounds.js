// [C 담당] 배경. stage.bg 키로 고른다: 'alley'(뒷골목), 'classroom'(교실). 모르는 키는 기본 배경.
// 스테이지 폭에 맞춰 처음 한 번 오프스크린 캔버스에 그려 두고, 매 프레임에는 겹(레이어)만 찍는다.
// 레이어마다 따라오는 속도(p)가 달라 멀리 있는 것이 천천히 움직인다.
import { W, H } from '../core/config.js';
import { makeCanvas, blit, q, upscaleCanvas, seeded, rect, line, disc, ring, sprite } from './pix.js';

export const M = 8;        // 화면 흔들림용 여백 (장면 버퍼가 화면보다 사방으로 M만큼 크다)
const PAD = 16;            // 레이어 좌우 여유
const FLOOR = 206;         // 벽과 바닥이 만나는 y
const CH = H + M * 2;

export const BG_KEYS = ['alley', 'classroom'];

// 레이어 캔버스를 만든다. 그릴 때의 좌표는 (0,0)이 월드 원점이 되도록 옮겨 둔다.
function layer(width) {
  const [c, g] = makeCanvas(Math.ceil(width) + PAD * 2, CH, 1); // 논리 픽셀로 그린 뒤 get()에서 확대한다
  g.translate(PAD, M);
  return [c, g, Math.ceil(width)];
}

// 세로 그라데이션을 띠로 칠한다 (경계는 한 줄 걸러 점을 찍어 섞는다)
function bands(g, x0, x1, list, yEnd) {
  for (let i = 0; i < list.length; i++) {
    const [col, y] = list[i];
    const y2 = i + 1 < list.length ? list[i + 1][1] : yEnd;
    rect(g, col, x0, y, x1 - x0, y2 - y);
    if (i > 0) {
      g.fillStyle = col;
      for (let x = x0; x < x1; x += 2) g.fillRect(x + ((y >> 1) & 1), y - 1, 1, 1);
    }
  }
}

// 위에서 아래로 퍼지는 빛 (한 줄씩 찍어서 가장자리가 픽셀로 떨어진다)
function lightCone(g, x, y0, y1, w0, w1, color) {
  g.fillStyle = color;
  for (let y = y0; y < y1; y++) {
    const half = Math.round((w0 + (w1 - w0) * (y - y0) / (y1 - y0)) / 2);
    g.fillRect(x - half, y, half * 2, 1);
  }
}

// ───────────────────────── 뒷골목 (밤, 보라와 청록) ─────────────────────────
function buildAlley(sw) {
  const r = seeded(11);
  const layers = [];
  const extra = sw - W;

  // 1) 밤하늘과 달
  {
    const [c, g, w] = layer(W + extra * 0.06);
    bands(g, -PAD, w + PAD, [['#0b0a1c', -M], ['#100e26', 36], ['#17133a', 76], ['#221a4c', 112], ['#33215a', 142], ['#4a2a66', 168], ['#63356e', 190]], H + M);
    for (let i = 0; i < 110; i++) {
      g.fillStyle = ['#ffffff', '#9fb4ff', '#ffe9a8', '#6f78b8'][(r() * 4) | 0];
      g.fillRect((r() * (w + PAD * 2) - PAD) | 0, (r() * 150 - M) | 0, 1, 1);
    }
    const mx = Math.round(w * 0.72), my = 46;
    ring(g, mx, my, 21, '#2a2258', 1, 1, 2);
    ring(g, mx, my, 18, '#3a2f6e', 1, 1, 2);
    disc(g, mx, my, 14, '#f4eccb');
    disc(g, mx - 4, my - 3, 3, '#dccf9f');
    disc(g, mx + 5, my + 4, 2, '#dccf9f');
    disc(g, mx + 2, my - 7, 1, '#dccf9f');
    layers.push({ c, p: 0.06 });
  }

  // 2) 먼 건물 숲
  const skyline = (p, body, lit, minH, maxH, winW, winH, litRate) => {
    const [c, g, w] = layer(W + extra * p);
    let x = -PAD;
    while (x < w + PAD) {
      const bw = 22 + ((r() * 34) | 0), bh = minH + ((r() * (maxH - minH)) | 0);
      const top = FLOOR - bh;
      rect(g, body, x, top, bw, H + M - top);
      if (r() < 0.35) rect(g, body, x + 4 + ((r() * (bw - 10)) | 0), top - 6 - ((r() * 10) | 0), 2, 18); // 안테나
      if (r() < 0.25) { rect(g, body, x + 3, top - 7, 9, 7); rect(g, body, x + 4, top - 10, 7, 3); }       // 물탱크
      for (let wy = top + 5; wy < FLOOR - 6; wy += winH + 4) {
        for (let wx = x + 3; wx < x + bw - winW - 1; wx += winW + 3) {
          if (r() < litRate) rect(g, lit[(r() * lit.length) | 0], wx, wy, winW, winH);
        }
      }
      x += bw + ((r() * 5) | 0);
    }
    layers.push({ c, p });
  };
  skyline(0.2, '#15122e', ['#e9b84a', '#58c9c0', '#8a6a3a'], 50, 120, 2, 3, 0.22);
  skyline(0.45, '#1d1840', ['#f2c860', '#3a9a98', '#7a5a34'], 60, 150, 3, 4, 0.14);

  // 3) 골목 벽과 바닥 (플레이어와 같은 속도)
  {
    const [c, g, w] = layer(sw);
    const lights = [];

    const bricks = (x0, x1, top) => {
      rect(g, '#3a2a48', x0, top, x1 - x0, FLOOR - top);
      g.fillStyle = '#2a1e36';
      for (let y = top; y < FLOOR; y += 5) g.fillRect(x0, y, x1 - x0, 1);
      for (let y = top, row = 0; y < FLOOR; y += 5, row++) {
        for (let x = x0 + (row % 2 ? 5 : 0); x < x1; x += 10) {
          g.fillStyle = '#2a1e36';
          g.fillRect(x, y, 1, 5);
          const v = r();
          if (v < 0.12) rect(g, '#4a3558', x + 1, y + 1, Math.min(9, x1 - x - 1), 4);
          else if (v < 0.2) rect(g, '#32233e', x + 1, y + 1, Math.min(9, x1 - x - 1), 4);
        }
      }
      // 위쪽은 밤 그늘, 아래쪽은 때
      g.fillStyle = 'rgba(10,8,28,0.35)';
      g.fillRect(x0, top, x1 - x0, Math.min(40, FLOOR - top));
      g.fillStyle = 'rgba(10,8,28,0.2)';
      g.fillRect(x0, top + 40, x1 - x0, 30);
      g.fillStyle = 'rgba(16,10,24,0.4)';
      g.fillRect(x0, FLOOR - 10, x1 - x0, 10);
      rect(g, '#55406a', x0 - 1, top - 3, x1 - x0 + 2, 3); // 옥상 턱
      rect(g, '#6a547e', x0 - 1, top - 3, x1 - x0 + 2, 1);
    };
    const pipe = (x, top) => {
      rect(g, '#2a2638', x, top, 3, FLOOR - top);
      rect(g, '#4a4660', x, top, 1, FLOOR - top);
      for (let y = top + 12; y < FLOOR; y += 34) rect(g, '#1c1828', x - 1, y, 5, 2);
    };
    const windowLit = (x, y) => {
      rect(g, '#1c1828', x - 1, y - 1, 22, 18);
      rect(g, '#f2c860', x, y, 20, 16);
      rect(g, '#ffe9a0', x, y, 20, 5);
      rect(g, '#1c1828', x + 9, y, 2, 16);
      g.fillStyle = '#1c1828';
      for (let i = 2; i < 20; i += 4) g.fillRect(x + i, y, 1, 16); // 창살
      rect(g, '#55406a', x - 2, y + 17, 24, 2);
      lightCone(g, x + 10, y + 19, FLOOR, 20, 44, 'rgba(255,214,120,0.06)');
    };
    const trashCan = (x) => {
      rect(g, '#0d0b16', x - 1, FLOOR - 17, 14, 18);
      rect(g, '#5a6272', x, FLOOR - 14, 12, 14);
      rect(g, '#3e4452', x, FLOOR - 14, 3, 14);
      g.fillStyle = '#3e4452';
      for (let i = 4; i < 12; i += 3) g.fillRect(x + i, FLOOR - 13, 1, 12);
      rect(g, '#7a8496', x - 1, FLOOR - 16, 14, 3);
      rect(g, '#9aa4b6', x, FLOOR - 16, 12, 1);
      rect(g, '#7a8496', x + 4, FLOOR - 18, 4, 2);
    };
    const dumpster = (x) => {
      rect(g, '#0d0b16', x - 1, FLOOR - 25, 42, 26);
      rect(g, '#2f6e5c', x, FLOOR - 20, 40, 20);
      rect(g, '#1f4c40', x, FLOOR - 20, 40, 3);
      rect(g, '#1f4c40', x, FLOOR - 6, 40, 2);
      g.fillStyle = '#245a4a';
      for (let i = 6; i < 40; i += 8) g.fillRect(x + i, FLOOR - 17, 1, 11);
      rect(g, '#3f8a74', x - 1, FLOOR - 24, 42, 4);
      rect(g, '#5aa890', x, FLOOR - 24, 40, 1);
      rect(g, '#1c1828', x + 3, FLOOR - 1, 5, 2);
      rect(g, '#1c1828', x + 32, FLOOR - 1, 5, 2);
      // 삐져나온 쓰레기 봉지
      disc(g, x + 12, FLOOR - 26, 4, '#1c1a2a');
      disc(g, x + 20, FLOOR - 27, 5, '#262438');
    };
    const crate = (x, y, s) => {
      rect(g, '#0d0b16', x - 1, y - s - 1, s + 2, s + 2);
      rect(g, '#8a6642', x, y - s, s, s);
      rect(g, '#6a4c30', x, y - s, s, 2);
      rect(g, '#6a4c30', x, y - 2, s, 2);
      line(g, x + 1, y - s + 2, x + s - 2, y - 3, 1, '#6a4c30');
    };
    const door = (x) => {
      rect(g, '#1c1828', x - 2, FLOOR - 52, 30, 52);
      rect(g, '#4a5468', x, FLOOR - 50, 26, 50);
      rect(g, '#3a4254', x, FLOOR - 50, 3, 50);
      rect(g, '#3a4254', x + 4, FLOOR - 44, 18, 16);
      rect(g, '#3a4254', x + 4, FLOOR - 24, 18, 18);
      rect(g, '#c8c8d0', x + 21, FLOOR - 27, 2, 4);
      // 문 위의 등
      rect(g, '#1c1828', x + 10, FLOOR - 62, 6, 4);
      rect(g, '#fff0b0', x + 11, FLOOR - 58, 4, 3);
      lights.push({ kind: 'lamp', x: x + 13, y: FLOOR - 56 });
      lightCone(g, x + 13, FLOOR - 55, FLOOR, 6, 70, 'rgba(255,224,140,0.10)');
      lightCone(g, x + 13, FLOOR - 55, FLOOR, 4, 40, 'rgba(255,224,140,0.10)');
    };
    const vending = (x) => {
      rect(g, '#0d0b16', x - 1, FLOOR - 45, 26, 46);
      rect(g, '#2a6fb0', x, FLOOR - 44, 24, 44);
      rect(g, '#1c4c80', x, FLOOR - 44, 3, 44);
      rect(g, '#d8f6ff', x + 4, FLOOR - 40, 17, 22);
      const cols = ['#e04848', '#f2c860', '#58c9c0', '#f4f4f0', '#e07ad0'];
      for (let ry = 0; ry < 3; ry++) for (let cx = 0; cx < 5; cx++) rect(g, cols[(r() * 5) | 0], x + 5 + cx * 3, FLOOR - 38 + ry * 7, 2, 4);
      rect(g, '#1c4c80', x + 4, FLOOR - 15, 17, 3);
      rect(g, '#0d0b16', x + 6, FLOOR - 9, 12, 5);
      rect(g, '#f2c860', x + 19, FLOOR - 15, 2, 2);
      lights.push({ kind: 'vend', x: x + 12, y: FLOOR - 29 });
      g.fillStyle = 'rgba(140,230,255,0.10)';
      g.fillRect(x - 8, FLOOR - 48, 40, 48);
      g.fillRect(x - 3, FLOOR - 46, 30, 46);
    };
    const shutter = (x, wd) => {
      rect(g, '#1c1828', x - 2, FLOOR - 62, wd + 4, 62);
      rect(g, '#6a6f82', x, FLOOR - 58, wd, 58);
      g.fillStyle = '#4c5062';
      for (let y = FLOOR - 56; y < FLOOR; y += 4) g.fillRect(x, y, wd, 1);
      rect(g, '#3a3e4e', x, FLOOR - 60, wd, 3);
      // 낙서: 스프레이로 그린 왕관과 발자국
      const gx = x + 8, gy = FLOOR - 40;
      const tag = ['p...p...p', 'pp.ppp.pp', 'ppppppppp', 'ppppppppp', '.ttttttt.'];
      sprite(g, tag, { p: '#e05aa8', t: '#48d0c0' }, gx, gy);
      line(g, gx + 14, gy + 10, gx + 30, gy + 4, 2, '#48d0c0');
      line(g, gx + 30, gy + 4, gx + 36, gy + 12, 2, '#48d0c0');
      rect(g, '#e05aa8', gx + 20, gy + 14, 14, 2);
      g.fillStyle = '#e05aa8';
      for (let i = 0; i < 4; i++) g.fillRect(gx + 22 + i * 3, gy + 16, 1, 2 + ((r() * 5) | 0)); // 흘러내린 페인트
    };
    const neon = (x, y) => {
      rect(g, '#1c1828', x - 2, y - 2, 40, 18);
      const sign = ['k..k.kkk..kkk.k..k', 'k.k...k..k....k.k.', 'kk....k..k....kk..', 'k.k...k..k....k.k.', 'k..k.kkk..kkk.k..k'];
      sprite(g, sign, { k: '#ff6ad0' }, x, y + 2);
      sprite(g, sign, { k: '#ffd0f0' }, x, y + 1);
      rect(g, '#48d0c0', x, y + 10, 36, 1);
      rect(g, '#48d0c0', x, y + 12, 22, 1);
      g.fillStyle = 'rgba(255,106,208,0.07)';
      g.fillRect(x - 10, y - 8, 56, 34);
      lights.push({ kind: 'neon', x, y, w: 36, h: 14 });
    };
    const poster = (x, y, col) => {
      rect(g, '#e8e0c8', x, y, 11, 14);
      rect(g, col, x + 1, y + 1, 9, 6);
      rect(g, '#8a8270', x + 2, y + 9, 7, 1);
      rect(g, '#8a8270', x + 2, y + 11, 5, 1);
      rect(g, '#3a2a48', x + 8, y + 12, 3, 2); // 찢어진 귀퉁이
    };
    const acUnit = (x, y) => {
      rect(g, '#1c1828', x - 1, y - 1, 22, 14);
      rect(g, '#9aa0b0', x, y, 20, 12);
      rect(g, '#6c7284', x, y + 9, 20, 3);
      ring(g, x + 7, y + 5, 3, '#4c5062');
      g.fillStyle = '#6c7284';
      for (let i = 13; i < 19; i += 2) g.fillRect(x + i, y + 2, 1, 6);
      rect(g, '#1c1828', x + 3, y + 12, 2, 4);
      rect(g, '#1c1828', x + 15, y + 12, 2, 4);
    };
    const fence = (x0, x1) => {
      // 철망 울타리. 뒤로 먼 건물이 비친다.
      g.fillStyle = 'rgba(12,10,28,0.55)';
      g.fillRect(x0, 150, x1 - x0, FLOOR - 150);
      g.fillStyle = '#4a4c66';
      for (let y = 152; y < FLOOR; y += 4) for (let x = x0 + ((y >> 2) & 1) * 2; x < x1; x += 4) g.fillRect(x, y, 1, 1);
      g.fillStyle = '#343650';
      for (let y = 154; y < FLOOR; y += 4) for (let x = x0 + 2 - ((y >> 2) & 1) * 2; x < x1; x += 4) g.fillRect(x, y, 1, 1);
      rect(g, '#6a6c86', x0, 148, x1 - x0, 2);
      for (let x = x0 + 2; x < x1; x += 22) { rect(g, '#6a6c86', x, 146, 2, FLOOR - 146); rect(g, '#3c3e56', x + 2, 148, 1, FLOOR - 148); }
    };

    // 구간을 번갈아 깐다: 벽돌 벽 / 철망 틈 / 문 있는 벽 / 틈 / 셔터 벽
    const plan = ['brickA', 'gap', 'brickB', 'gap', 'brickC'];
    let x = -PAD - 30, idx = 0;
    while (x < w + PAD) {
      const kind = plan[idx++ % plan.length];
      if (kind === 'gap') {
        fence(x, x + 62);
        crate(x + 8, FLOOR, 13);
        crate(x + 22, FLOOR, 11);
        crate(x + 11, FLOOR - 13, 10);
        x += 62;
      } else if (kind === 'brickA') {
        const wd = 176;
        bricks(x, x + wd, 58);
        pipe(x + 12, 58);
        windowLit(x + 40, 96);
        poster(x + 82, 150, '#e04848');
        poster(x + 95, 153, '#58c9c0');
        acUnit(x + 120, 110);
        trashCan(x + 26);
        trashCan(x + 142);
        rect(g, '#262438', x + 156, FLOOR - 6, 9, 6); // 쓰레기 봉지
        disc(g, x + 160, FLOOR - 7, 4, '#262438');
        x += wd;
      } else if (kind === 'brickB') {
        const wd = 150;
        bricks(x, x + wd, 26);
        door(x + 22);
        vending(x + 78);
        pipe(x + 134, 26);
        poster(x + 58, 148, '#f2c860');
        x += wd;
      } else {
        const wd = 196;
        bricks(x, x + wd, 44);
        shutter(x + 18, 92);
        neon(x + 40, 104);
        dumpster(x + 130);
        pipe(x + 184, 44);
        x += wd;
      }
    }

    // 빨랫줄 같은 전선과 걸린 운동화
    for (let x0 = -PAD; x0 < w + PAD; x0 += 190) {
      g.fillStyle = '#0d0b16';
      for (let i = 0; i <= 190; i++) {
        const k = i / 190;
        g.fillRect(x0 + i, Math.round(30 + 22 * 4 * k * (1 - k)), 1, 1);
      }
      const sxp = x0 + 70;
      rect(g, '#0d0b16', sxp, 50, 1, 8);
      rect(g, '#e8484c', sxp - 2, 58, 5, 3);
      rect(g, '#f4f4f0', sxp - 2, 60, 5, 1);
      rect(g, '#0d0b16', sxp + 5, 50, 1, 5);
      rect(g, '#e8484c', sxp + 3, 55, 5, 3);
    }

    // 바닥: 보도 턱과 아스팔트
    rect(g, '#5d5470', -PAD, FLOOR, w + PAD * 2, 1);
    rect(g, '#4a4258', -PAD, FLOOR + 1, w + PAD * 2, 3);
    rect(g, '#2a2536', -PAD, FLOOR + 4, w + PAD * 2, 1);
    bands(g, -PAD, w + PAD, [['#332e44', FLOOR + 5], ['#2d283d', 220], ['#272236', 234], ['#211c2e', 248], ['#1b1726', 260]], H + M);
    for (let i = 0; i < w * 0.9; i++) {
      const px = (r() * (w + PAD * 2) - PAD) | 0, py = (FLOOR + 5 + r() * (H + M - FLOOR - 5)) | 0;
      g.fillStyle = r() < 0.5 ? '#3c3650' : '#1a1624';
      g.fillRect(px, py, r() < 0.2 ? 2 : 1, 1);
    }
    for (let px = 40; px < w; px += 150 + ((r() * 80) | 0)) {
      // 물웅덩이: 네온과 가로등이 비친다
      const py = 228 + ((r() * 26) | 0), pw = 16 + ((r() * 14) | 0);
      disc(g, px, py, pw, '#171a34', 0.16);
      g.fillStyle = '#3a4c8a';
      g.fillRect(px - pw + 5, py - 1, pw - 2, 1);
      g.fillStyle = '#c05aa0';
      g.fillRect(px + 2, py + 1, (pw / 2) | 0, 1);
    }
    for (let px = 110; px < w; px += 260) {
      // 맨홀
      disc(g, px, 244, 11, '#151220', 0.3);
      ring(g, px, 244, 10, '#3c3650', 1, 0.3);
      rect(g, '#3c3650', px - 6, 244, 13, 1);
    }
    for (let px = 20; px < w; px += 90 + ((r() * 70) | 0)) {
      // 갈라진 금
      let cx = px, cy = FLOOR + 8 + ((r() * 40) | 0);
      g.fillStyle = '#15121e';
      for (let i = 0; i < 9; i++) { g.fillRect(cx, cy, 2, 1); cx += r() < 0.5 ? 2 : 1; cy += r() < 0.4 ? 1 : 0; }
    }
    for (let px = 60; px < w; px += 120 + ((r() * 90) | 0)) {
      // 굴러다니는 캔과 종이
      const py = FLOOR + 6 + ((r() * 8) | 0);
      if (r() < 0.5) { rect(g, '#c8c8d0', px, py, 4, 2); rect(g, '#d0444a', px + 1, py, 2, 2); }
      else { rect(g, '#d8d0b8', px, py, 4, 1); rect(g, '#b8b098', px + 1, py + 1, 3, 1); }
    }
    // 가로등 빛이 바닥에 고인다
    for (const L of lights) {
      if (L.kind === 'lamp') { disc(g, L.x, FLOOR + 10, 36, 'rgba(255,224,140,0.07)', 0.22); disc(g, L.x, FLOOR + 8, 22, 'rgba(255,224,140,0.07)', 0.2); }
      if (L.kind === 'vend') disc(g, L.x, FLOOR + 8, 24, 'rgba(140,230,255,0.08)', 0.25);
    }
    layers.push({ c, p: 1 });

    return {
      layers,
      // 살아 있는 빛: 네온이 가끔 깜빡이고 자판기가 은은하게 숨쉰다
      animate(g2, time) {
        for (const L of lights) {
          if (L.kind === 'neon') {
            const k = (time * 0.7 + L.x * 0.013) % 1;
            if (k > 0.9 && Math.sin(time * 90) > 0) { g2.fillStyle = 'rgba(28,24,40,0.8)'; g2.fillRect(L.x - 1, L.y, L.w + 2, L.h); }
          } else if (L.kind === 'vend' && Math.sin(time * 3 + L.x) > 0.6) {
            g2.fillStyle = 'rgba(216,246,255,0.12)';
            g2.fillRect(L.x - 8, L.y - 11, 17, 22);
          } else if (L.kind === 'lamp') {
            // 등 주위를 도는 날벌레
            const a = time * 5 + L.x;
            g2.fillStyle = '#fff6c8';
            g2.fillRect(Math.round(L.x + Math.cos(a) * 6), Math.round(L.y + 4 + Math.sin(a * 1.7) * 3), 1, 1);
            g2.fillRect(Math.round(L.x + Math.cos(a * 0.8 + 2) * 8), Math.round(L.y + 6 + Math.sin(a * 1.3 + 1) * 4), 1, 1);
          }
        }
      },
    };
  }
}

// ───────────────────────── 교실 (낮, 따뜻한 나무색과 칠판 녹색) ─────────────────────────
function buildClassroom(sw) {
  const r = seeded(23);
  const layers = [];
  const extra = sw - W;

  // 1) 창밖 풍경
  {
    const [c, g, w] = layer(W + extra * 0.3);
    bands(g, -PAD, w + PAD, [['#6fb8f0', -M], ['#86c6f5', 40], ['#a2d4f8', 70], ['#bfe2fa', 95], ['#d8eefc', 115]], H + M);
    for (let x = -PAD + 10; x < w + PAD; x += 70 + ((r() * 60) | 0)) {
      const y = 50 + ((r() * 50) | 0), cw = 18 + ((r() * 16) | 0);
      rect(g, '#ffffff', x, y, cw, 5);
      rect(g, '#ffffff', x + 4, y - 3, cw - 10, 3);
      rect(g, '#e2f0fa', x + 2, y + 5, cw - 5, 2);
    }
    // 건너편 교사와 나무
    for (let x = -PAD; x < w + PAD; x += 150) {
      rect(g, '#b9c8d6', x + 20, 104, 90, 60);
      rect(g, '#9fb0c0', x + 20, 104, 90, 3);
      g.fillStyle = '#7f95aa';
      for (let wy = 112; wy < 150; wy += 10) for (let wx = x + 25; wx < x + 106; wx += 9) g.fillRect(wx, wy, 5, 5);
      disc(g, x + 126, 128, 12, '#5a9a58');
      disc(g, x + 136, 122, 9, '#6fb06a');
      disc(g, x + 120, 136, 9, '#4a8a4c');
      rect(g, '#6a4c30', x + 127, 138, 3, 30);
    }
    rect(g, '#7fae6a', -PAD, 150, w + PAD * 2, H);
    layers.push({ c, p: 0.3 });
  }

  // 2) 교실 벽과 바닥
  {
    const [c, g, w] = layer(sw);
    const sun = [];
    // 벽
    rect(g, '#bfb08f', -PAD, -M, w + PAD * 2, M + 12);
    rect(g, '#a89a7a', -PAD, 11, w + PAD * 2, 2);
    bands(g, -PAD, w + PAD, [['#d6c7a6', 13], ['#e2d3b3', 24], ['#e9dcc0', 40]], 152);
    // 아랫벽 나무 판자
    rect(g, '#a67c52', -PAD, 152, w + PAD * 2, FLOOR - 152);
    g.fillStyle = '#8f6842';
    for (let x = -PAD; x < w + PAD; x += 12) g.fillRect(x, 154, 1, FLOOR - 158);
    rect(g, '#c79a6b', -PAD, 150, w + PAD * 2, 2);
    rect(g, '#7a5836', -PAD, 152, w + PAD * 2, 1);
    rect(g, '#5e4330', -PAD, FLOOR - 4, w + PAD * 2, 4);
    // 형광등
    for (let x = -PAD + 30; x < w + PAD; x += 110) {
      rect(g, '#8a7e64', x, 2, 44, 3);
      rect(g, '#ffffff', x + 2, 5, 40, 2);
      g.fillStyle = 'rgba(255,255,240,0.25)';
      g.fillRect(x - 2, 7, 48, 3);
    }

    const windowAt = (x) => {
      const y = 44, ww = 76, wh = 96;
      rect(g, '#f4efe2', x - 3, y - 3, ww + 6, wh + 6);
      rect(g, '#c9c0aa', x - 3, y + wh + 3, ww + 6, 1);
      g.clearRect(x, y, ww, wh); // 유리: 뚫어서 창밖 레이어가 보이게
      g.fillStyle = 'rgba(255,255,255,0.14)';
      for (let i = 0; i < 26; i++) { g.fillRect(x + 8 + i, y + 30 - i, 6, 1); g.fillRect(x + 40 + i, y + 70 - i, 9, 1); }
      rect(g, '#f4efe2', x + ((ww / 2) | 0) - 1, y, 3, wh);
      rect(g, '#f4efe2', x, y + 30, ww, 3);
      rect(g, '#c9c0aa', x + ((ww / 2) | 0) + 2, y, 1, wh);
      rect(g, '#c9c0aa', x, y + 33, ww, 1);
      // 한쪽으로 걷은 커튼
      rect(g, '#f2e3a2', x, y, 13, wh);
      g.fillStyle = '#d8c680';
      for (let i = 3; i < 13; i += 4) g.fillRect(x + i, y, 1, wh);
      rect(g, '#c9a85a', x - 1, y + 52, 15, 3);
      rect(g, '#b0a892', x - 4, y - 6, ww + 8, 2); // 커튼 봉
      // 창턱
      rect(g, '#d8cfba', x - 5, y + wh + 3, ww + 10, 3);
      rect(g, '#a89a7a', x - 5, y + wh + 6, ww + 10, 1);
      if (r() < 0.6) {
        // 화분
        rect(g, '#b8603a', x + 50, y + wh - 4, 8, 7);
        rect(g, '#8a4428', x + 50, y + wh - 4, 8, 2);
        disc(g, x + 54, y + wh - 8, 4, '#4a9a50');
        rect(g, '#6fc06a', x + 52, y + wh - 13, 2, 4);
      }
      sun.push(x + ww / 2);
    };
    const board = (x) => {
      const y = 56, bw = 132, bh = 76;
      rect(g, '#6a4628', x - 4, y - 4, bw + 8, bh + 8);
      rect(g, '#8a5a34', x - 3, y - 3, bw + 6, bh + 6);
      rect(g, '#2e6b52', x, y, bw, bh);
      g.fillStyle = '#3a7c60';
      for (let i = 0; i < 26; i++) g.fillRect(x + ((r() * (bw - 14)) | 0), y + ((r() * (bh - 2)) | 0), 6 + ((r() * 10) | 0), 1); // 지운 자국
      // 분필 글씨
      g.fillStyle = '#eef2e8';
      for (let ly = 0; ly < 4; ly++) {
        let cx = x + 8;
        while (cx < x + 62) { const lw = 2 + ((r() * 7) | 0); g.fillRect(cx, y + 10 + ly * 9, lw, 1); cx += lw + 2; }
      }
      // 분필로 그린 낙서: 하단을 차는 막대 인간
      const dx = x + 84, dy = y + 20;
      ring(g, dx, dy, 3, '#eef2e8');
      line(g, dx, dy + 4, dx, dy + 16, 1, '#eef2e8');
      line(g, dx, dy + 16, dx - 4, dy + 28, 1);
      line(g, dx, dy + 16, dx + 14, dy + 24, 1);
      line(g, dx, dy + 7, dx - 5, dy + 13, 1);
      line(g, dx, dy + 7, dx + 4, dy + 13, 1);
      g.fillStyle = '#ffe45c';
      g.fillRect(dx + 17, dy + 21, 1, 7); g.fillRect(dx + 14, dy + 24, 7, 1); // 타격 표시
      g.fillStyle = '#ff9ab0';
      g.fillRect(x + 104, y + 8, 22, 1); g.fillRect(x + 104, y + 8, 1, 26); g.fillRect(x + 125, y + 8, 1, 26); g.fillRect(x + 104, y + 33, 22, 1); // 당번 칸
      g.fillStyle = '#eef2e8';
      g.fillRect(x + 108, y + 14, 12, 1); g.fillRect(x + 108, y + 20, 9, 1); g.fillRect(x + 108, y + 26, 13, 1);
      // 분필 받침
      rect(g, '#a57446', x - 2, y + bh + 3, bw + 4, 3);
      rect(g, '#7a5230', x - 2, y + bh + 6, bw + 4, 1);
      rect(g, '#ffffff', x + 20, y + bh + 2, 5, 1);
      rect(g, '#ff9ab0', x + 30, y + bh + 2, 4, 1);
      rect(g, '#ffe45c', x + 37, y + bh + 2, 3, 1);
      rect(g, '#3a3a44', x + 96, y + bh, 12, 3);
      rect(g, '#c8b890', x + 96, y + bh, 12, 1);
      // 시계
      disc(g, x + 66, 30, 9, '#4a4032');
      disc(g, x + 66, 30, 8, '#f8f4e8');
      line(g, x + 66, 30, x + 66, 24, 1, '#2a2620');
      line(g, x + 66, 30, x + 70, 32, 1, '#2a2620');
      g.fillStyle = '#2a2620';
      g.fillRect(x + 66, 23, 1, 1); g.fillRect(x + 73, 30, 1, 1); g.fillRect(x + 66, 37, 1, 1); g.fillRect(x + 59, 30, 1, 1);
      // 급훈 액자와 스피커
      rect(g, '#6a4628', x + 6, 22, 34, 16);
      rect(g, '#f4efe2', x + 8, 24, 30, 12);
      g.fillStyle = '#2a2620';
      for (let i = 0; i < 4; i++) g.fillRect(x + 12 + i * 6, 27, 4, 6);
      rect(g, '#5a5446', x + 96, 22, 22, 16);
      g.fillStyle = '#3a362c';
      for (let i = 0; i < 6; i++) g.fillRect(x + 98, 24 + i * 2, 18, 1);
    };
    const lockers = (x) => {
      const y = 108;
      rect(g, '#3a4658', x - 2, y - 2, 88, FLOOR - y - 2);
      for (let i = 0; i < 6; i++) {
        const lx = x + i * 14;
        rect(g, ['#7f95aa', '#8aa0b4', '#768ca2'][i % 3], lx, y, 13, FLOOR - y - 5);
        rect(g, '#5c7084', lx, y + 44, 13, 1);
        g.fillStyle = '#5c7084';
        for (let v = 0; v < 3; v++) { g.fillRect(lx + 3, y + 4 + v * 2, 7, 1); g.fillRect(lx + 3, y + 50 + v * 2, 7, 1); }
        rect(g, '#e8e0c8', lx + 9, y + 24, 2, 4);
        rect(g, '#e8e0c8', lx + 9, y + 70, 2, 4);
      }
      rect(g, '#e04848', x + 17, y + 12, 5, 5);
      rect(g, '#ffe45c', x + 59, y + 60, 6, 4);
      // 사물함 위에 올려둔 공과 상자
      disc(g, x + 20, y - 7, 5, '#e8843a');
      line(g, x + 16, y - 7, x + 24, y - 7, 1, '#8a4a1c');
      rect(g, '#b99a6a', x + 50, y - 12, 18, 10);
      rect(g, '#8f7448', x + 50, y - 12, 18, 2);
    };
    const bulletin = (x) => {
      rect(g, '#6a4628', x - 2, 58, 64, 70);
      rect(g, '#c79458', x, 60, 60, 66);
      const cols = ['#f4f4f0', '#ffe9a0', '#a8e0f0', '#ffc0cc', '#c8f0b0'];
      for (let i = 0; i < 7; i++) {
        const px = x + 4 + ((r() * 40) | 0), py = 64 + ((r() * 44) | 0);
        const pw = 9 + ((r() * 7) | 0), ph = 10 + ((r() * 8) | 0);
        rect(g, cols[(r() * 5) | 0], px, py, pw, ph);
        rect(g, '#9a8a70', px + 2, py + 3, pw - 4, 1);
        rect(g, '#9a8a70', px + 2, py + 6, pw - 5, 1);
        rect(g, '#e04848', px + (pw >> 1), py, 1, 1);
      }
    };
    const desk = (x) => {
      // 뒷줄 책상과 의자 (싸우는 자리보다 뒤에 있어 조금 어둡다)
      rect(g, '#6a7480', x + 2, FLOOR - 22, 2, 22);
      rect(g, '#6a7480', x + 22, FLOOR - 22, 2, 22);
      rect(g, '#565e6a', x + 4, FLOOR - 8, 18, 1);
      rect(g, '#8f6c44', x, FLOOR - 25, 26, 3);
      rect(g, '#b8905e', x, FLOOR - 26, 26, 1);
      rect(g, '#7a5a38', x + 2, FLOOR - 22, 22, 5);
      rect(g, '#6a7480', x + 30, FLOOR - 15, 2, 15);
      rect(g, '#6a7480', x + 41, FLOOR - 34, 2, 34);
      rect(g, '#9a7448', x + 29, FLOOR - 17, 13, 2);
      rect(g, '#9a7448', x + 40, FLOOR - 34, 3, 12);
    };

    const plan = ['win', 'win', 'board', 'win', 'lockers', 'win', 'bulletin'];
    let x = -PAD + 26, idx = 0;
    while (x < w + PAD) {
      const kind = plan[idx++ % plan.length];
      if (kind === 'win') { windowAt(x); x += 96; }
      else if (kind === 'board') { board(x + 6); x += 158; }
      else if (kind === 'lockers') { lockers(x + 4); x += 104; }
      else { bulletin(x + 4); x += 80; }
    }
    for (let dx = -PAD + 8; dx < w + PAD; dx += 74 + ((r() * 30) | 0)) desk(dx);

    // 바닥: 나무 마루
    rect(g, '#7a5836', -PAD, FLOOR, w + PAD * 2, 1);
    bands(g, -PAD, w + PAD, [['#cfa672', FLOOR + 1], ['#c79d68', 222], ['#bd935e', 240], ['#b08652', 256]], H + M);
    const seams = [FLOOR + 5, 213, 222, 233, 246, 261];
    g.fillStyle = '#a17a48';
    for (let i = 0; i < seams.length; i++) {
      g.fillRect(-PAD, seams[i], w + PAD * 2, 1);
      const y2 = i + 1 < seams.length ? seams[i + 1] : H + M;
      for (let px = -PAD + ((r() * 40) | 0); px < w + PAD; px += 46 + ((r() * 30) | 0)) g.fillRect(px, seams[i], 1, y2 - seams[i]);
    }
    for (let i = 0; i < w * 0.3; i++) {
      g.fillStyle = r() < 0.5 ? '#d9b27e' : '#a8804c';
      g.fillRect((r() * (w + PAD * 2) - PAD) | 0, (FLOOR + 2 + r() * (H + M - FLOOR)) | 0, 3 + ((r() * 5) | 0), 1);
    }
    // 창으로 들어온 햇살이 바닥에 비스듬히 떨어진다
    for (const sx of sun) {
      for (let y = FLOOR + 1; y < H + M; y++) {
        const k = y - FLOOR;
        g.fillStyle = 'rgba(255,240,190,0.16)';
        g.fillRect(Math.round(sx - 30 - k * 0.9), y, 28, 1);
        g.fillRect(Math.round(sx + 4 - k * 0.9), y, 28, 1);
      }
      lightCone(g, sx, 143, FLOOR, 76, 96, 'rgba(255,240,190,0.07)');
    }
    layers.push({ c, p: 1 });

    return {
      layers,
      // 햇살 속에 떠다니는 먼지
      animate(g2, time) {
        g2.fillStyle = 'rgba(255,250,220,0.7)';
        for (let i = 0; i < sun.length; i++) {
          for (let k = 0; k < 4; k++) {
            const a = time * 0.35 + k * 1.7 + i;
            g2.fillRect(Math.round(sun[i] - 26 + ((a * 13) % 50)), Math.round(150 + ((a * 9 + k * 17) % 50) + Math.sin(a * 3) * 2), 1, 1);
          }
        }
      },
    };
  }
}

// ───────────────────────── 기본 배경 (모르는 bg 키) ─────────────────────────
function buildDefault(sw) {
  const [c, g, w] = layer(sw);
  bands(g, -PAD, w + PAD, [['#12121e', -M], ['#191928', 60], ['#20202f', 120], ['#28283a', 170]], FLOOR);
  g.fillStyle = '#2f2f44';
  for (let x = -PAD; x < w + PAD; x += 40) g.fillRect(x, -M, 1, FLOOR + M);
  for (let y = 26; y < FLOOR; y += 40) g.fillRect(-PAD, y, w + PAD * 2, 1);
  rect(g, '#4a4a62', -PAD, FLOOR, w + PAD * 2, 1);
  bands(g, -PAD, w + PAD, [['#34344a', FLOOR + 1], ['#2b2b3d', 226], ['#232332', 246]], H + M);
  g.fillStyle = '#3f3f58';
  for (let x = -PAD; x < w + PAD; x += 40) g.fillRect(x, FLOOR + 1, 1, 8);
  return { layers: [{ c, p: 1 }], animate() {} };
}

const BUILDERS = { alley: buildAlley, classroom: buildClassroom };
const cache = new Map();

function get(key, sw) {
  const id = (BUILDERS[key] ? key : 'default') + ':' + sw;
  if (!cache.has(id)) {
    if (cache.size > 6) cache.clear();
    const built = (BUILDERS[key] || buildDefault)(sw);
    for (const L of built.layers) L.c = upscaleCanvas(L.c);
    cache.set(id, built);
  }
  return cache.get(id);
}

// g는 장면 버퍼(화면보다 사방 M만큼 큰 캔버스)의 컨텍스트. 변환이 없는 상태에서 부른다.
export function draw(g, key, stageWidth, camX, time) {
  const sw = Math.max(W, Math.round(stageWidth || W));
  const bgd = get(key, sw);
  for (const L of bgd.layers) blit(g, L.c, q(M - PAD - camX * L.p), 0);
  g.save();
  g.translate(q(M - camX), M);
  bgd.animate(g, time);
  g.restore();
}
