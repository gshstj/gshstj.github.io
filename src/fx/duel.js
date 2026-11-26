// 2인 대전의 두 파이터 그림. 둘 다 주인공과 같은 몸이고 바지 색만 다르다 (1P 파랑, 2P 빨강).
// 주인공 그림(hero.js)은 한 명만 기억하는 방식이라, 여기서는 파이터의 상태만 보고 그때그때 자세를 계산한다.
import { HERO, HEROINE, kickDefFor, specFor, spinOf, sweepRing } from './hero.js';
import { drawChar, mixPose } from './rig.js';
import { clamp, lerp, smooth, easeOut, pathAt, mixPt, line } from './pix.js';

// 1P는 파란 바지(남), 2P는 빨간 바지(여). 대전 파이터가 아닌 주인공(궁극기를 쓰는 스토리 주인공)은 고른 캐릭터를 따른다.
const charOf = (f) => (f.index === 1 ? 'red' : f.index === 0 ? 'blue' : undefined);
const specOf = (f) => (f.index === 1 ? HEROINE : f.index === 0 ? HERO : specFor());
let cur = null; // 지금 그리는 파이터 (킥 모션을 캐릭터에 맞게 고르려고)
const kickDef = (move) => kickDefFor(cur ? charOf(cur) : undefined, move);

const stand = () => ({ hip: [0, -15], lean: 1, sh: 0, head: [0, 0], near: [2, 0], far: [-2, 0] });

function kickPose(def, T, move) {
  const P = stand();
  const f = pathAt(def.keys, T);
  const b = smooth(clamp(T / 0.03));
  P.hip = [def.hip[0] * b, -15 + def.hip[1] * b];
  P.lean = lerp(1, def.lean, b);
  if (def.leg === 'near') { P.near = f; P.stretchNear = true; P.far = move === 'fly' ? [-5, -9] : [-2, 0]; }
  else { P.far = f; P.stretchFar = true; P.near = [1, 0]; }
  return P;
}

// 킥이 진행된 정도를 모션 시간으로 바꾼다. 발이 닿는 시점(hitAt)에 임팩트 자세가 딱 나오게 맞춘다.
const motionT = (k, def) => (k.hitAt > 0 ? def.impact * clamp(k.time / k.hitAt) : def.impact);

// ── 궁극기: 회전 채찍차기 ──
// 몸을 지면과 수평으로 눕혀 띄우고, 몸통을 축으로 옆으로 빙글 돌다가 한쪽 다리를 채찍처럼 후려친다.
// 누운 몸에서는 자세 좌표의 "아래(발 쪽)"가 화면에서는 상대 쪽이 된다.
const WHIP_LIFT = 15;   // 몸이 뜨는 높이
const WHIP_SPINS = 2.5; // 예고 동안 도는 횟수
function whipState(f) {
  const k = f.kick;
  let lay, spin, lash;
  if (f.state === 'kick') {
    const u = k.hitAt > 0 ? clamp(k.time / k.hitAt) : 1; // 0..1 예고 진행
    lay = smooth(clamp(u / 0.3));                         // 눕는 정도
    spin = u * WHIP_SPINS;                                // 지금까지 돈 횟수
    lash = clamp((u - 0.72) / 0.28);                      // 다리를 후려치는 정도
    lash = lash * lash;
  } else {
    // 거두기: 다리를 접으며 일어선다
    const r = smooth(clamp((f.stateTime || 0) / Math.max(0.1, k.recoverTime || 0.4)));
    lay = 1 - r;
    spin = WHIP_SPINS;
    lash = 1 - r;
  }
  return { lay, spin, lash };
}

function whipPose(w) {
  const P = stand();
  // 옆으로 구르는 모습: 반 바퀴마다 앞다리와 뒷다리가 바뀌어 보이고 어깨가 넘어간다
  const roll = Math.sin(w.spin * Math.PI * 2);
  P.lean = roll * 2;
  P.sh = 0;
  P.head = [0, 0];
  const tuck = [3 + roll * 2, -8], tuck2 = [-3 - roll * 2, -7];
  // 후려치는 다리: 접혀 있다가 발끝까지 길게 뻗는다 (누운 몸에서는 아래로 뻗는 것이 상대 쪽이다)
  const whipFoot = mixPt([9, -9], [3, 9], w.lash);
  if (roll >= 0) { P.near = w.lash > 0 ? whipFoot : tuck; P.far = tuck2; P.stretchNear = w.lash > 0; }
  else { P.far = w.lash > 0 ? whipFoot : tuck; P.near = tuck2; P.stretchFar = w.lash > 0; }
  return P;
}

function poseFor(f, time) {
  const t = f.stateTime || 0;
  const k = f.kick;
  let P = stand();
  switch (f.state) {
    case 'walk': {
      const back = (f.vx || 0) * f.facing < 0 ? -1 : 1;
      const ph = t * 11 * back;
      P.near = [5 * Math.cos(ph), -3 * Math.max(0, -Math.sin(ph))];
      P.far = [5 * Math.cos(ph + Math.PI), -3 * Math.max(0, Math.sin(ph))];
      P.hip = [0, -15 + Math.abs(Math.cos(ph)) * 0.9];
      break;
    }
    case 'jump': {
      const u = clamp(((f.vy || 0) + 420) / 840);
      P.near = mixPt([3, -6], [2, -1], u);
      P.far = mixPt([-1, -4], [-3, -3], u);
      P.lean = lerp(0, 1, u);
      break;
    }
    case 'guard': {
      // 가드(체크): 앞다리의 무릎을 들어 정강이로 막는다. 손은 그대로 주머니에.
      const u = smooth(clamp(t / 0.06));
      P.near = mixPt([2, 0], [6, -10], u);
      P.far = [-3, 0];
      P.hip = [-1 * u, -15 + u];
      P.lean = 1 - 2 * u;
      break;
    }
    case 'kick':
      P = kickPose(kickDef(k.move), motionT(k, kickDef(k.move)), k.move);
      break;
    case 'recover': {
      const def = kickDef(k.move);
      P = mixPose(kickPose(def, def.impact, k.move), stand(), smooth(clamp(t / Math.max(0.1, k.recoverTime || 0.2))));
      break;
    }
    case 'hurt': {
      const u = 1 - clamp(t / 0.3);
      P.hip = [-2 * u, -15 + u];
      P.lean = 1 - 4 * u;
      P.head = [-u, 0];
      P.near = [3, -3 * u];
      P.far = [-3 - u, 0];
      break;
    }
    case 'dead':
      P.lean = 0; P.near = [1, 0]; P.far = [-1, 0];
      break;
    default:
      P.sh = Math.sin(time * 2.6 + f.index) > 0.2 ? 0 : 1;
  }
  return P;
}

// 궁극기를 그린다: 누운 몸, 몸을 감아 도는 회전선, 채찍 궤적
function drawWhip(g, f, S, x, y, fc, o, time) {
  const w = whipState(f);
  const lift = WHIP_LIFT * w.lay;
  const cy = y - lift - 6;      // 누운 몸의 중심 높이
  const tint = f.index === 1 ? '#ff7a7a' : '#7ab0ff';

  // 몸통을 감아 도는 회전선 (뒤쪽 절반)
  const rings = (front) => {
    if (w.lay < 0.5 || f.state !== 'kick') return;
    for (let i = 0; i < 3; i++) {
      const bx = x + fc * (-10 + i * 9);
      const ph = w.spin * Math.PI * 2 + i * 1.3;
      for (let s = 0; s < 6; s++) {
        const a = ph + s * 0.5;
        if ((Math.sin(a) > 0) !== front) continue;
        g.fillStyle = s === 0 ? '#ffffff' : s < 3 ? '#ffd84d' : tint;
        g.fillRect(Math.round(bx + Math.sin(a) * 2), Math.round(cy + Math.cos(a) * 9), 2, 2);
      }
    }
  };
  rings(false);
  drawChar(g, S, whipPose(w), x, y - lift, fc, Object.assign({}, o, { rot: -w.lay * Math.PI / 2, pivotY: -6 }));
  rings(true);

  // 채찍 궤적: 몸 위에서 크게 돌아 상대 쪽으로 내리꽂히는 초승달
  if (w.lash > 0 && f.state === 'kick' || (f.state === 'recover' && (f.stateTime || 0) < 0.12)) {
    const n = 12, sweep = f.state === 'kick' ? w.lash : 1;
    const hx = x + fc * 8, R = 27;
    let px = 0, py = 0;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI * 0.62 + (i / n) * sweep * Math.PI * 0.72; // 위에서 앞으로
      const qx = hx + fc * Math.cos(a) * R, qy = cy + Math.sin(a) * R * 0.85;
      if (i > 0) {
        const wd = Math.max(1, Math.round(5 * i / n));
        line(g, px, py, qx, qy, wd, '#ffb81e');
        if (wd > 2) line(g, px, py, qx, qy, wd - 2, '#fff6c8');
      }
      px = qx; py = qy;
    }
  }
}

export function draw(g, f, time) {
  cur = f;
  const S = specOf(f);
  const k = f.kick;
  let x = Math.round(f.x);
  const y = Math.round(f.y), fc = f.facing < 0 ? -1 : 1;
  const o = {};
  if (f.flash > 0) {
    o.flash = f.flash > 0.06 ? 1 : 0.45; // 맞는 순간 하얗게 번쩍이며 떨린다
    x += Math.sin(time * 190) > 0 ? 1.5 : -1.5;
  }
  if (k.ult && f.state === 'kick') o.outline = Math.sin(time * 40) > 0 ? '#ffd84d' : '#ffffff'; // 궁극기: 금빛
  else if (f.guarding) o.outline = '#a9c4e8'; // 가드 중: 푸른 쇳빛
  else if (f.counterTime > 0) o.outline = Math.sin(time * 30) > 0 ? '#ff8a5a' : '#ffffff'; // 카운터 찬스
  else if (f.alive && f.noAttack > 0 && f.state !== 'hurt') o.alpha = 0.6 + 0.3 * Math.sin(time * 40); // 공격 불능

  if (k.ult && (f.state === 'kick' || f.state === 'recover')) {
    drawWhip(g, f, S, x, y, fc, o, time);
    return;
  }

  const P = poseFor(f, time);
  if (f.state === 'dead') {
    const fall = clamp((f.stateTime || 0) / 0.3);
    o.rot = -fall * fall * Math.PI / 2;
    o.pivotY = -6 * fall;
  }
  // 차는 다리의 잔상 (발이 닿기 직전까지)
  if (f.state === 'kick' && k.move && k.time <= k.hitAt + 0.04) {
    const def = kickDef(k.move);
    const T = motionT(k, def);
    const tint = f.index === 1 ? '#ff7a7a' : '#7ab0ff';
    for (let i = 3; i >= 1; i--) {
      const Tg = T - i * 0.009;
      if (Tg <= 0) continue;
      drawChar(g, S, kickPose(def, Tg, k.move), x, y, fc, { ghost: i === 1 ? '#ffffff' : tint, alpha: 0.45 - i * 0.1 });
    }
  }
  // 돌려 차는 킥(빨간 바지): 발이 나가기 전에는 등을 돌린 모습, 뛰어 차는 킥은 몸을 띄운다
  let sp = { turned: false, hop: 0, dash: 0, rot: 0, u: 1 };
  if (f.state === 'kick' && k.move) {
    const def = kickDef(k.move);
    sp = spinOf(def, motionT(k, def));
    const kx0 = x + fc * Math.round(sp.dash), ky0 = y - Math.round(sp.hop);
    if ((def.spin || def.roll) && sp.u < 1) sweepRing(g, kx0, ky0 - 14, sp.u, '#ffd0e0');
    if (sp.rot) { o.rot = sp.rot; o.pivotY = -15; }
  }
  drawChar(g, S, P, x + fc * Math.round(sp.dash), y - Math.round(sp.hop), sp.turned ? -fc : fc, o);
}
