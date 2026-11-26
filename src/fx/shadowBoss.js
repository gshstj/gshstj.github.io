// 보스 "어둠의 주인공" 그림. 주인공과 같은 리그와 같은 킥 모션을 쓰되 온몸이 어둡고 눈과 신발만 붉다.
// 적 엔티티(type 'shadow', 'shadow2')의 state, action, attack을 보고 자세를 고른다. 손은 항상 주머니에.
import { GROUND_Y } from '../core/config.js';
import { HERO, kickDef } from './hero.js';
import { drawChar, mixPose } from './rig.js';
import { clamp, lerp, smooth, easeOut, pathAt, rand, line } from './pix.js';
import { mem } from './enemySprites.js';
import { SENIOR } from './portrait.js';
import * as particles from './particles.js';

const DARK = {
  ...HERO,
  colors: {
    top: '#1d1830', topD: '#120f20', arm: '#272042', armFar: '#0e0c18', armShadow: '#0a0812',
    pants: '#15121f', pantsFar: '#0c0a14', stripe: '#b0203a',
    shoe: '#c02440', shoeFar: '#6a1226', sole: '#ff5a78', soleFar: '#802038',
  },
  // rows를 복사해야 머리 그림 캐시가 주인공과 따로 잡힌다
  head: {
    ...HERO.head, rows: HERO.head.rows.slice(),
    pal: { h: '#0a0812', H: '#2a1f44', s: '#3a3350', d: '#2a2440', e: '#221c36', k: '#ff2a40', w: '#ff8a9a', m: '#120e1c' },
  },
  torsoExtra(g, j) {
    g.fillStyle = '#120f20';
    g.fillRect(j.sx - 5, j.sy - 1, 3, 4);
    g.fillStyle = '#272042';
    g.fillRect(j.sx - 4, j.sy - 1, 2, 2);
    g.fillStyle = '#b0203a';
    g.fillRect(j.sx + 2, j.sy + 2, 1, 3);
  },
};

// 주인공 리그로 그리는 적: 어둠의 주인공 둘, 그리고 1세대 발 마스터(프롤로그의 선배와 같은 모습)
const SPEC = { shadow: DARK, shadow2: DARK, master: SENIOR };
export const isShadow = (e) => !!SPEC[e.type];

const stand = () => ({ hip: [0, -15], lean: 1, sh: 0, head: [0, 0], near: [2, 0], far: [-2, 0] });
const moveOf = (e, m) => {
  if (e.action === 'brace') m.move = 'axe';
  else if (e.action) m.move = e.action;
  return m.move || 'calf';
};

// 킥 자세: 경로의 시점 T에서의 모습
function kickPose(def, T) {
  const P = stand();
  const f = pathAt(def.keys, T);
  const b = smooth(clamp(T / 0.03));
  P.hip = [def.hip[0] * b, -15 + def.hip[1] * b];
  P.lean = lerp(1, def.lean, b);
  if (def.leg === 'near') { P.near = f; P.stretchNear = true; P.far = [-2, 0]; }
  else { P.far = f; P.stretchFar = true; P.near = [1, 0]; }
  return P;
}

function poseFor(e, m, time) {
  const t = e.stateTime || 0;
  const def = kickDef(moveOf(e, m));
  let P = stand();
  switch (e.state) {
    case 'walk': {
      const back = (e.vx || 0) * e.facing < 0 ? -1 : 1;
      const ph = t * 12 * back;
      P.near = [5 * Math.cos(ph), -3 * Math.max(0, -Math.sin(ph))];
      P.far = [5 * Math.cos(ph + Math.PI), -3 * Math.max(0, Math.sin(ph))];
      P.hip = [0, -15 + Math.abs(Math.cos(ph)) * 0.9];
      break;
    }
    case 'windup': {
      // 예고: 찰 다리를 접어 든다. 타격이 가까울수록 깊이 접는다.
      const a = e.attack;
      const k = a && a.windup ? clamp(1 - a.timeToHit / a.windup) : clamp(t / 0.2);
      P = kickPose(def, lerp(0, def.keys[1][0] * 1.4, smooth(k)));
      P.lean = (P.lean || 0) - 1;
      break;
    }
    case 'attack':
      // 큰 기술은 궤적이 보이도록 조금 천천히 뻗고, 뻗은 채 멈춘다
      P = kickPose(def, lerp(def.keys[1][0], def.impact, easeOut(clamp(t / (def.big ? 0.12 : 0.05)))));
      break;
    case 'recover':
      P = mixPose(kickPose(def, def.impact), stand(), smooth(clamp(t / 0.28)));
      break;
    case 'hurt': {
      const f = 1 - clamp(t / 0.3);
      P.hip = [-2 * f, -15 + f];
      P.lean = 1 - 4 * f;
      P.head = [-f, 0];
      P.near = [3, -3 * f];
      P.far = [-3 - f, 0];
      break;
    }
    case 'stun': {
      const s = Math.sin(time * 7);
      P.hip = [s, -13];
      P.lean = 1 + s * 2.5;
      P.head = [1, 2];
      break;
    }
    case 'down':
      P.lean = 0; P.near = [1, 0]; P.far = [-1, 0];
      break;
    default:
      P.sh = Math.sin(time * 2.6 + 1) > 0.2 ? 0 : 1;
  }
  return P;
}

export function draw(g, e, time) {
  const m = mem(e);
  const P = poseFor(e, m, time);
  const x = Math.round(e.x), y = Math.round(e.y), fc = e.facing < 0 ? -1 : 1;
  const S = SPEC[e.type] || DARK;
  const dark = S === DARK;
  const o = {};
  if (dark) o.outline = e.armor ? '#7aa0e0' : '#5a1fd0'; // 보랏빛 기운. 버티는 중에는 푸른 쇳빛
  else if (e.action === 'brazil') o.outline = Math.sin(time * 30) > 0 ? '#ffd84d' : '#ffffff'; // 새 기술을 꺼낼 때 금빛
  if (m.flash > 0) { o.flash = m.flash > 0.05 ? 1 : 0.45; o.flashColor = m.armored ? '#a9c4e8' : '#ffffff'; }
  if (e.launched && e.state === 'hurt') { o.rot = -clamp((e.stateTime || 0) / 0.2) * 1.15; o.pivotY = -3; }
  if (e.state === 'stun') { o.flash = Math.sin(time * 24) > 0.6 ? 0.3 : 0; o.flashColor = '#ffe45c'; }
  if (e.state === 'down' || e.alive === false) {
    const t = e.stateTime || 0;
    if (e.alive === false && t > 1.6 && (t > 2.4 || Math.floor(t * 20) % 2)) return; // 깜빡이다 사라진다
    const fall = clamp(t / 0.28);
    o.rot = -fall * fall * Math.PI / 2;
    o.pivotY = -6 * fall;
  }

  // 킥 궤적: 뻗는 다리를 따라 붉은 잔상
  if (e.state === 'attack' && e.alive !== false) {
    const def = kickDef(moveOf(e, m));
    for (let i = 3; i >= 1; i--) {
      const Pg = kickPose(def, Math.max(0, def.impact - i * 0.009));
      const tint = dark ? (i === 1 ? '#ff2a40' : '#7a1fd0') : (i === 1 ? '#ffffff' : '#ffd84d');
      drawChar(g, S, Pg, x, y, fc, { ghost: tint, alpha: 0.5 - i * 0.1 });
    }
  }
  drawChar(g, S, P, x, y, fc, o);
  if (!dark) return;

  // 발밑에서 피어오르는 어둠
  if (e.alive !== false && Math.random() < 0.3) {
    particles.spawn({ type: 'px', x: e.x + rand(-6, 6), y: GROUND_Y - rand(0, 26), vx: rand(-6, 6), vy: rand(-26, -8),
      life: rand(0.3, 0.6), size: 1, colors: ['#c08cff', '#6a2cff', '#2a1050'], back: Math.random() < 0.6 });
  }
  // 붉은 눈빛이 움직일 때 꼬리를 남긴다
  if (e.alive !== false && Math.abs(e.vx || 0) > 40) {
    line(g, x + fc * 3, y - 30, x - fc * 4, y - 30, 1, '#ff2a40');
  }
}
