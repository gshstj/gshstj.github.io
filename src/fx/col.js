import { GROUND_Y } from '../core/config.js';
import { clamp, lerp, easeOut, rand, pick, line, disc } from './pix.js';
import * as particles from './particles.js';

const WATER = ['#ffffff', '#c8f4ff', '#58b8f0', '#1e6ab0'];
const st = { on: false, t: 0, dur: 0, x: 0, dir: 1, spray: 0 };

export function start(d) {
  Object.assign(st, { on: true, t: 0, dur: (d.duration || 0.75) + 0.55, x: d.x, dir: d.dir || 1, spray: 0 });
}

export const active = () => st.on;

export function update(dt) {
  if (!st.on) return;
  st.t += dt;
  if (st.t >= st.dur) { st.on = false; return; }
  if (st.t > st.dur - 0.45) return; // 잦아드는 중에는 더 뿌리지 않는다
  st.spray -= dt;
  while (st.spray <= 0) {
    st.spray += 0.012;
    // 밑동에서 튀는 물보라
    particles.spawn({ type: 'px', x: st.x + rand(-20, 20), y: GROUND_Y, vx: rand(-110, 110), vy: rand(-300, -90), g: 620,
      life: rand(0.3, 0.6), size: pick([1, 1, 2]), colors: WATER, bounce: true });
    // 기둥을 타고 빨려 올라가는 물줄기
    particles.spawn({ type: 'streak', x: st.x + rand(-16, 16), y: GROUND_Y - rand(0, 60), vx: rand(-30, 30), vy: rand(-520, -340),
      life: rand(0.25, 0.45), size: 1, len: 0.05, colors: WATER, back: Math.random() < 0.5 });
  }
}

// 높이 y에서의 기둥 중심과 반지름. 위로 갈수록 넓어지고 크게 휜다.
function axis(y, t) {
  const h = GROUND_Y - y;
  return [st.x + Math.sin(y * 0.045 - t * 9) * h * 0.06, 9 + h * 0.17 + Math.sin(y * 0.16 + t * 22) * 1.5];
}

// front: true면 기둥과 용의 앞면(주인공 위에 겹친다), false면 뒷면
export function draw(g, front) {
  if (!st.on) return;
  const t = st.t;
  const fade = clamp((st.dur - t) / 0.4);
  const top = lerp(GROUND_Y, -40, easeOut(clamp(t / 0.16)));
  g.save();

  if (!front) {
    for (let y = GROUND_Y; y > top; y -= 2) {
      const [cx, w] = axis(y, t);
      g.globalAlpha = 0.2 * fade;
      g.fillStyle = '#3aa0ea';
      g.fillRect(Math.round(cx - w), y, Math.round(w * 2), 2);
      g.globalAlpha = 0.22 * fade;
      g.fillStyle = '#c8f4ff';
      g.fillRect(Math.round(cx - w * 0.45), y, Math.round(w * 0.9), 2);
    }
  }

  // 기둥을 감아 도는 물줄기 다섯 가닥
  for (let i = 0; i < 5; i++) {
    for (let y = GROUND_Y; y > top; y -= 3) {
      const a = i * 1.2566 + y * 0.1 + t * 18;
      if ((Math.sin(a) > 0) !== front) continue;
      const [cx, w] = axis(y, t);
      g.globalAlpha = (front ? 0.85 : 0.4) * fade;
      g.fillStyle = front ? (i % 2 ? '#ffffff' : '#c8f4ff') : '#2a7cc8';
      g.fillRect(Math.round(cx + Math.cos(a) * w), y, 2, 3);
    }
  }

  const headY = t < 0.5 ? lerp(GROUND_Y + 14, 58, easeOut(t / 0.5)) : 58 - (t - 0.5) * 300;
  const LEN = 190, N = 46;
  g.globalAlpha = fade;
  const at = (s) => {
    const y = headY + s * LEN;
    const a = y * 0.07 - t * 11;
    const [cx, w] = axis(Math.min(y, GROUND_Y), t);
    return [cx + Math.cos(a) * (w + 5), y, Math.sin(a)];
  };
  for (let n = N; n >= 1; n--) {
    const s = n / N;
    const [x, y, depth] = at(s);
    if (y > GROUND_Y + 2 || (depth >= 0) !== front) continue;
    const r = lerp(5.5, 1.2, s);
    disc(g, x, y, r + 1, '#0b1f48');                      // 외곽선
    disc(g, x, y, r, front ? '#2fa4ec' : '#1b5fa6');      // 비늘
    if (front) disc(g, x - 1, y - 1, r * 0.45, '#b8ecff'); // 윤기
    if (n % 4 === 0 && r > 2) {
      // 등지느러미
      const [x2, y2] = at(s + 0.5 / N);
      const dx = x - x2, dy = y - y2, d = Math.hypot(dx, dy) || 1;
      line(g, x, y, x - dy / d * (r + 3), y + dx / d * (r + 3), 1, '#ffd84d');
    }
  }
  if (front && headY < GROUND_Y) {
    // 머리는 항상 앞에. 위를 보고 입을 벌린 채 솟는다.
    const [x, y] = at(0);
    line(g, x - 3, y + 2, x - 10, y + 12, 1, '#ffd84d');   // 뿔
    line(g, x + 3, y + 2, x + 10, y + 12, 1, '#ffd84d');
    line(g, x - 2, y + 3, x - 6, y + 14, 1, '#fff1a8');
    line(g, x + 2, y + 3, x + 6, y + 14, 1, '#fff1a8');
    disc(g, x, y, 8, '#0b1f48');
    disc(g, x, y, 7, '#2fa4ec');
    disc(g, x, y - 7, 5, '#0b1f48');                       // 주둥이
    disc(g, x, y - 7, 4, '#58c0f4');
    disc(g, x - 1, y - 2, 3, '#b8ecff');
    g.fillStyle = '#0b1f48';
    g.fillRect(Math.round(x) - 3, Math.round(y) - 11, 6, 2); // 벌린 입
    g.fillStyle = '#ff5a3a';
    g.fillRect(Math.round(x) - 2, Math.round(y) - 11, 4, 1);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(x) - 5, Math.round(y) - 4, 3, 2);  // 눈
    g.fillRect(Math.round(x) + 3, Math.round(y) - 4, 3, 2);
    g.fillStyle = '#ffd84d';
    g.fillRect(Math.round(x) - 4, Math.round(y) - 4, 1, 2);
    g.fillRect(Math.round(x) + 4, Math.round(y) - 4, 1, 2);
    // 수염: 뒤로 길게 흩날린다
    const sway = Math.sin(t * 26) * 3;
    line(g, x - 4, y - 8, x - 14 + sway, y + 4, 1, '#e8fbff');
    line(g, x + 4, y - 8, x + 14 + sway, y + 4, 1, '#e8fbff');
  }
  g.restore();
}
