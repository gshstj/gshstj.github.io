// [C 담당] 파티클. 상한(TUNE.maxParticles)을 넘으면 새로 만들지 않는다.
// 종류: px(네모 조각) / streak(속도 방향 선) / ring(퍼지는 원) / star(십자 반짝임)
//       bolt(번개) / slash(임팩트 선) / flame(솟는 불꽃) / puff(연기 덩이) / pip(마름모 표식)
import { GROUND_Y } from '../core/config.js';
import { TUNE } from './tuning.js';
import { line, ring, disc, lerp, easeOut, easeOut3 } from './pix.js';

const list = [];

export const count = () => list.length;
export function clear() { list.length = 0; }

const DEFAULTS = {
  type: 'px', x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.3, size: 1,
  colors: ['#ffffff'], back: false, delay: 0, bounce: false, shrink: false,
};

// keep: true 인 것(링, 번개 같은 핵심 연출)은 상한에 걸려도 가장 오래된 것을 밀어내고 넣는다
export function spawn(p) {
  if (list.length >= TUNE.maxParticles) {
    if (!p.keep) return null;
    list.shift();
  }
  const q = Object.assign({}, DEFAULTS, p);
  q.max = q.life;
  list.push(q);
  return q;
}

export function update(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.life -= dt;
    if (p.life <= 0) {
      list[i] = list[list.length - 1];
      list.pop();
      continue;
    }
    if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.bounce && p.y > GROUND_Y + 2 && p.vy > 0) {
      p.y = GROUND_Y + 2;
      p.vy *= -0.35;
      p.vx *= 0.6;
    }
  }
}

function colorOf(p, f) {
  const n = p.colors.length;
  return p.colors[Math.min(n - 1, (f * n) | 0)];
}

export function draw(g, back) {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.back !== back || p.delay > 0) continue;
    const f = 1 - p.life / p.max; // 0 → 1
    const c = colorOf(p, f);
    const x = Math.round(p.x), y = Math.round(p.y);
    switch (p.type) {
      case 'streak': {
        const k = p.len || 0.03;
        line(g, x, y, p.x - p.vx * k, p.y - p.vy * k, p.size, c);
        break;
      }
      case 'ring': {
        const r = lerp(p.r0 || 2, p.r1 || 20, easeOut3(f));
        const thick = f < 0.5 ? (p.thick || 2) : 1;
        ring(g, x, y, r, c, thick, p.ys || 1, f > 0.72 ? 2 : 1);
        break;
      }
      case 'star': {
        // 커졌다가 줄어드는 십자 반짝임
        const a = Math.round(p.size * (f < 0.25 ? f / 0.25 : 1 - (f - 0.25) / 0.75));
        g.fillStyle = c;
        g.fillRect(x - a, y, a * 2 + 1, 1);
        g.fillRect(x, y - a, 1, a * 2 + 1);
        if (a > 2) {
          const b = a >> 1;
          g.fillRect(x - b, y - 1, b * 2 + 1, 3);
          g.fillRect(x - 1, y - b, 3, b * 2 + 1);
        }
        break;
      }
      case 'bolt': {
        // 번개: 매 프레임 꺾임이 달라져 파직거린다
        const segs = p.segs || 4;
        let px = p.x, py = p.y;
        g.fillStyle = c;
        for (let s = 1; s <= segs; s++) {
          const k = s / segs;
          const jit = s === segs ? 0 : (p.jit || 4);
          const nx = lerp(p.x, p.x2, k) + (Math.random() - 0.5) * 2 * jit;
          const ny = lerp(p.y, p.y2, k) + (Math.random() - 0.5) * 2 * jit;
          line(g, px, py, nx, ny, f < 0.5 ? p.size : 1);
          px = nx; py = ny;
        }
        break;
      }
      case 'slash': {
        // 중심에서 양쪽으로 뻗었다가 가늘어지는 선
        const L = (p.len || 20) * easeOut(Math.min(1, f * 4)) * 0.5;
        const w = Math.max(1, Math.round(p.size * (1 - f)));
        line(g, p.x - p.dx * L, p.y - p.dy * L, p.x + p.dx * L, p.y + p.dy * L, w, c);
        break;
      }
      case 'flame': {
        const s = Math.max(1, Math.round(p.size * (1 - f)));
        const sway = Math.round(Math.sin((p.life + p.x) * 22) * 1);
        g.fillStyle = c;
        g.fillRect(x + sway - (s >> 1), y - (s >> 1), s, s);
        break;
      }
      case 'puff': {
        disc(g, x, y, Math.max(1, Math.round(p.size * (1 - f * 0.7))), c);
        break;
      }
      case 'pip': {
        g.fillStyle = c;
        g.fillRect(x - 1, y - 2, 3, 5);
        g.fillRect(x - 2, y - 1, 5, 3);
        g.fillStyle = '#ffffff';
        g.fillRect(x, y - 1, 1, 1);
        break;
      }
      default: {
        const s = p.shrink ? Math.max(1, Math.round(p.size * (1 - f))) : p.size;
        g.fillStyle = c;
        g.fillRect(x - (s >> 1), y - (s >> 1), s, s);
      }
    }
  }
}
