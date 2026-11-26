// [C 담당] 주인공: 주머니에 두 손을 넣은 남자.
// 어떤 동작에서도 팔은 주머니 자세로 고정이고, 다리만 움직인다.
// 오른발 = 화면에 가까운 다리(밝은 바지, 흰 줄무늬), 왼발 = 먼 다리(어두운 바지, 줄무늬 없음).
import { levelOf } from './tuning.js';
import { clamp, lerp, smooth, easeOut, pathAt, mixPt, line, rand, pick } from './pix.js';
import { drawChar, legJoints, drawLegFlat } from './rig.js';
import * as particles from './particles.js';

export const HERO = {
  thigh: 7, shin: 7, legW: 3, torsoH: 11, bw: 3, fw: 3, arms: 'pocket',
  colors: {
    top: '#e9ecf4', topD: '#b4bbd0', arm: '#f7f8fc', armFar: '#8c95b2', armShadow: '#7d86a6',
    pants: '#3a5fd0', pantsFar: '#263f96', stripe: '#f2f4fa',
    shoe: '#ee4b4f', shoeFar: '#a92d3c', sole: '#ffffff', soleFar: '#c4c6d6',
  },
  head: {
    ox: -3, oy: 1,
    unit: 0.5, // 논리 픽셀의 절반 크기로 찍은 세밀한 얼굴
    pal: { h: '#1c1c28', H: '#4a4a6e', s: '#f4cba3', d: '#cf9f7c', e: '#b98564', k: '#15151c', w: '#ffffff', m: '#a3564a' },
    rows: [
      '....hhh..hhh....',
      '...hhhhhhhhhh...',
      '..hhhHHhhhhhhh..',
      '.hhhHHHhhhhhhhh.',
      '.hhhHhhhhhhhhhh.',
      'hhhhhhhhhhhhhhh.',
      'hhhhhhhhhhhhsss.',
      'hhhhhhhhhhssssss',
      'hhhhhhdsssswkkss',
      '.hhhhddssssskkss',
      '.hhhdedsssssssss',
      '..hhdddssssssss.',
      '..hhddssssssmms.',
      '...hdddsssssss..',
      '....dddssssss...',
      '.....dddsss.....',
    ],
  },
  // 후드와 끈
  torsoExtra(g, j) {
    g.fillStyle = '#b4bbd0';
    g.fillRect(j.sx - 5, j.sy - 1, 3, 4);
    g.fillStyle = '#e9ecf4';
    g.fillRect(j.sx - 4, j.sy - 1, 2, 2);
    g.fillStyle = '#8c95b2';
    g.fillRect(j.sx + 2, j.sy + 2, 1, 3);
  },
};

// 킥 4종. keys = [시간, 발 x, 발 y] (발 중앙 기준, 앞이 +x, 위가 -y)
// leg: 기본으로 쓰는 다리 (kick.foot이 오면 그쪽을 따른다)
// swing: 궤적 이펙트를 그리는 구간, impact: 맞는 순간의 시간
const KICKS = {
  // 오른발 빗겨차기 카프킥: 뒤로 살짝 접었다가 하단을 비스듬히 후려친다
  calf: {
    leg: 'near', swing: [0.012, 0.046], impact: 0.046, retract: 0.14, hip: [2, 0], lean: 0,
    keys: [[0, 2, 0], [0.014, -3, -6], [0.03, 8, -12], [0.046, 21, -5], [0.09, 19, -5]],
  },
  // 왼발 하이킥: 무릎을 접어 올렸다가 머리 높이로 뻗는다
  high: {
    leg: 'far', swing: [0.014, 0.046], impact: 0.046, retract: 0.15, hip: [2, -1], lean: -1,
    keys: [[0, -2, 0], [0.014, 4, -12], [0.03, 12, -24], [0.046, 19, -31], [0.09, 17, -30]],
  },
  // 오른발 미들킥: 중단을 곧게 밀어 찬다
  mid: {
    leg: 'near', swing: [0.014, 0.046], impact: 0.046, retract: 0.14, hip: [2, 0], lean: 0,
    keys: [[0, 2, 0], [0.014, 2, -11], [0.03, 10, -17], [0.046, 23, -17], [0.09, 21, -17]],
  },
  // 왼발 내려찍기: 다리를 머리 위까지 들었다가 찍는다 (마무리)
  axe: {
    leg: 'far', swing: [0.04, 0.1], impact: 0.07, syncAt: 0.04, retract: 0.2, hip: [2, -1], lean: -1, big: true,
    keys: [[0, -2, 0], [0.02, 8, -22], [0.04, 11, -36], [0.052, 14, -35], [0.07, 19, -20], [0.09, 19, -3], [0.11, 18, 0]],
    retractMid: [9, -3],
  },
  rise: {
    leg: 'near', swing: [0.02, 0.1], impact: 0.1, retract: 0.3, hip: [1, -1], lean: -1, big: true,
    keys: [[0, 2, 0], [0.03, 9, -7], [0.07, 13, -24], [0.1, 9, -39], [2, 9, -39]],
    retractMid: [10, -12],
  },
  // 날아차기(점프 중 K): 공중에서 오른발을 앞으로 곧게 뻗은 채 내려온다
  fly: {
    leg: 'near', swing: [0, 0.03], impact: 0.03, retract: 0.14, hip: [1, 0], lean: -2, big: true,
    keys: [[0, 3, -3], [0.03, 18, -7], [3, 18, -7]],
  },
  // 브라질리언 킥(1세대 발 마스터의 기술): 미들킥처럼 나가다가 무릎을 꺾어 머리 위에서 내리꽂는다
  brazil: {
    leg: 'near', swing: [0.016, 0.09], impact: 0.09, retract: 0.22, hip: [2, -1], lean: -1, big: true,
    keys: [[0, 2, 0], [0.016, 3, -11], [0.04, 16, -17], [0.058, 19, -24], [0.074, 21, -36], [0.09, 23, -25], [0.4, 22, -24]],
  },
};

// 모르는 move가 오면 기본(카프킥) 모션으로 대체
export const kickDef = (move) => KICKS[move] || KICKS.calf;
export const KICK_MOVES = Object.keys(KICKS);

const st = {
  kickT: 9,          // 킥 시작부터 흐른 연출 시간 (히트스톱 중에도 임팩트 자세까지는 흐른다)
  emitT: 9,          // 궤적 파티클을 어디까지 뿌렸는지
  prevState: 'idle', prevST: 0,
  move: 'calf', leg: 'near',
  from: null,        // 직전 자세의 발 위치 (콤보로 이어 찰 때 디딤발을 부드럽게)
  lastFoot: null,    // 킥이 끝난 순간 차던 발의 위치 (거두기 시작점)
  pose: null, hipW: [0, -15],
  flash: 0, aura: 0, auraLevel: 1, wisp: 0,
};

const stand = () => ({ hip: [0, -15], lean: 1, sh: 0, head: [0, 0], near: [2, 0], far: [-2, 0] });

function legOf(p, def) {
  const foot = p.kick && p.kick.foot;
  return foot === 'left' ? 'far' : foot === 'right' ? 'near' : def.leg;
}

function poseFor(p, time) {
  const P = stand();
  const t = p.stateTime || 0;
  switch (p.state) {
    case 'walk': {
      // 어슬렁 걷기. 상체는 거의 흔들리지 않는다
      const back = (p.vx || 0) * p.facing < 0 ? -1 : 1; // 적을 본 채 뒷걸음질하면 발을 거꾸로 굴린다
      const ph = t * 11 * back;
      P.near = [5 * Math.cos(ph), -3 * Math.max(0, -Math.sin(ph))];
      P.far = [5 * Math.cos(ph + Math.PI), -3 * Math.max(0, Math.sin(ph))];
      P.hip = [0, -15 + Math.abs(Math.cos(ph)) * 0.9];
      P.sh = 0;
      break;
    }
    case 'jump': {
      // 올라갈 때는 다리를 접고, 내려올 때는 편다. 손은 그대로 주머니.
      const k = clamp(((p.vy || 0) + 420) / 840);
      const up = { near: [3, -6], far: [-1, -4] }, dn = { near: [2, -1], far: [-3, -3] };
      P.near = mixPt(up.near, dn.near, k);
      P.far = mixPt(up.far, dn.far, k);
      P.lean = lerp(0, 1, k);
      break;
    }
    case 'punch': {
      // 타격(J): 손을 쓰지 않는 어깨치기. 반 걸음 내딛으며 어깨로 민다.
      const u = clamp(t / 0.18);
      const f = u < 0.3 ? easeOut(u / 0.3) : 1 - smooth((u - 0.3) / 0.7);
      P.hip = [4 * f, -15 + f];
      P.lean = 1 + 4 * f;
      P.near = [2 + 6 * f, 0];
      P.far = [-3, 0];
      P.head = [-f, f];
      break;
    }
    case 'hurt': {
      const f = 1 - clamp(t / 0.3);
      P.hip = [-2 * f, -15 + f];
      P.lean = 1 - 4 * f;
      P.head = [-f, 0];
      P.near = [3, -3 * f];
      P.far = [-3 - f, 0];
      break;
    }
    case 'dead':
      P.lean = 0; P.near = [1, 0]; P.far = [-1, 0];
      break;
    case 'kick': {
      const def = kickDef(st.move);
      const T = st.kickT;
      const f = pathAt(def.keys, T);
      const b = smooth(clamp(T / 0.03));
      P.hip = [def.hip[0] * b, -15 + def.hip[1] * b];
      P.lean = lerp(1, def.lean, b);
      const sup = smooth(clamp(T / 0.05));
      if (st.leg === 'near') {
        P.near = f; P.stretchNear = true;
        P.far = st.from ? mixPt(st.from.far, [-2, 0], sup) : [-2, 0];
        if (st.move === 'fly') P.far = [-5, -9]; // 날아차기: 뒷다리는 접어 올린다
      } else {
        P.far = f; P.stretchFar = true;
        P.near = st.from ? mixPt(st.from.near, [1, 0], sup) : [1, 0];
      }
      break;
    }
    case 'recover': {
      // 발 거두기: 뻗은 자리에서 무릎을 접어 제자리로
      const def = kickDef(st.move);
      const u = clamp(t / def.retract);
      const hold = st.lastFoot || [def.keys[def.keys.length - 1][1], def.keys[def.keys.length - 1][2]];
      const home = st.leg === 'near' ? [2, 0] : [-2, 0];
      const mid = def.retractMid || [(hold[0] + home[0]) / 2 - 2, Math.min(hold[1] * 0.6, -5)];
      const f = pathAt([[0, hold[0], hold[1]], [0.5, mid[0], mid[1]], [1, home[0], home[1]]], smooth(u));
      const b = 1 - smooth(u);
      P.hip = [def.hip[0] * b, -15 + def.hip[1] * b];
      P.lean = lerp(1, def.lean, b);
      if (st.leg === 'near') { P.near = f; P.stretchNear = true; }
      else { P.far = f; P.stretchFar = true; P.near = [lerp(2, 1, b), 0]; }
      break;
    }
    default:
      // idle: 숨쉬기 (어깨가 1px 오르내린다)
      P.sh = Math.sin(time * 2.6) > 0.2 ? 0 : 1;
      P.head = [0, 0];
  }
  return P;
}

export function update(game, dt, time) {
  const p = game.player;
  if (!p) return;
  const k = p.kick || {};
  const inKick = p.state === 'kick';

  // 새 킥 시작 감지 (콤보로 이어 차면 stateTime이 다시 0이 된다)
  if (inKick && (st.prevState !== 'kick' || p.stateTime < st.prevST - 1e-6)) {
    st.from = st.pose ? { near: st.pose.near.slice(), far: st.pose.far.slice() } : null;
    st.kickT = 0;
    st.emitT = 0;
    st.move = k.move || st.move || 'calf';
    st.leg = legOf(p, kickDef(st.move));
    st.lastFoot = null;
  }
  if (inKick || p.state === 'recover') {
    const def = kickDef(st.move);
    const before = st.kickT;
    // player가 발이 닿는 시점(kick.hitAt)을 알려 주면, 임팩트 자세가 딱 그때 나오도록 모션 속도를 맞춘다.
    // (느린 킥일수록 준비 동작이 길게 보인다. 내려찍기는 다리를 머리 위로 드는 모습이 또렷해진다.)
    const rate = k.hitAt > 0 && st.kickT < def.impact ? Math.min(1, def.impact / k.hitAt) : 1;
    st.kickT += dt * rate * (game.hitstop > 0 ? 1 : game.timeScale);
    // 히트스톱 중에는 임팩트 자세에서 멈춘다
    if (game.hitstop > 0) st.kickT = Math.min(st.kickT, Math.max(before, def.impact));
    emitSwing(p, def, k.level || 1);
  }
  st.prevState = p.state;
  st.prevST = p.stateTime;

  st.pose = poseFor(p, time);
  if (inKick) st.lastFoot = (st.leg === 'near' ? st.pose.near : st.pose.far).slice();

  st.flash = Math.max(0, st.flash - dt);
  st.aura = Math.max(0, st.aura - dt);

  // 발끝 기운: 카운터 찬스 중에는 붉은 잔광, 3단계부터는 단계 색 기운이 피어오른다
  st.wisp -= dt;
  if (st.wisp <= 0 && p.alive !== false) {
    const lv = clamp(k.level || 1, 1, 5);
    const foot = st.leg === 'far' && inKick ? st.pose.far : st.pose.near;
    const wx = p.x + p.facing * (foot[0] + 2), wy = p.y + foot[1] - 2;
    if (p.counterTime > 0) {
      st.wisp = 0.03;
      particles.spawn({ type: 'flame', x: wx + rand(-2, 2), y: wy, vx: rand(-8, 8), vy: rand(-40, -15),
        life: rand(0.25, 0.45), size: 2, colors: ['#ffffff', '#ffd84d', '#ff6a3a', '#b0201a'] });
    } else if (lv >= 3) {
      st.wisp = lv === 5 ? 0.07 : 0.14;
      const L = levelOf(lv);
      particles.spawn({ type: lv === 5 ? 'flame' : 'px', x: wx + rand(-3, 3), y: wy + 1, vx: rand(-6, 6), vy: rand(-28, -10),
        life: rand(0.25, 0.5), size: lv === 5 ? 2 : 1, colors: L.colors, back: Math.random() < 0.5 });
    } else st.wisp = 0.2;
  }
}

// 다리 궤적을 따라 단계별 파티클을 뿌린다 (3 바람 / 4 불똥 / 5 불꽃)
function emitSwing(p, def, level) {
  const lv = clamp(level, 1, 5);
  const from = Math.max(def.swing[0], st.emitT), to = Math.min(def.swing[1], st.kickT);
  st.emitT = Math.max(st.emitT, st.kickT);
  if (to <= from) return;
  if (lv < 3) return;
  const L = levelOf(lv);
  const total = (lv === 5 ? 16 : 9) + (def.big ? 5 : 0);
  const n = Math.max(1, Math.round(total * (to - from) / (def.swing[1] - def.swing[0])));
  for (let i = 0; i < n; i++) {
    const tt = lerp(from, to, (i + Math.random()) / n);
    const a = pathAt(def.keys, tt), b = pathAt(def.keys, tt + 0.004);
    const wx = p.x + p.facing * (a[0] + 3), wy = p.y + a[1] - 2;
    const tx = (b[0] - a[0]) * p.facing, ty = b[1] - a[1];
    const d = Math.hypot(tx, ty) || 1;
    if (lv === 3) {
      particles.spawn({ type: 'streak', x: wx + rand(-2, 2), y: wy + rand(-2, 2), vx: tx / d * rand(60, 140), vy: ty / d * rand(60, 140),
        drag: 5, life: rand(0.12, 0.24), size: 1, len: 0.06, colors: L.colors });
    } else if (lv === 4) {
      particles.spawn({ type: 'px', x: wx, y: wy, vx: tx / d * 50 + rand(-60, 60), vy: ty / d * 50 + rand(-80, 30), g: 400,
        life: rand(0.12, 0.3), size: 1, colors: L.colors });
    } else {
      particles.spawn({ type: 'flame', x: wx + rand(-2, 2), y: wy + rand(-2, 2), vx: tx / d * 25 + rand(-12, 12), vy: rand(-60, -20),
        life: rand(0.2, 0.45), size: pick([2, 3, 3, 4]), colors: L.colors });
    }
  }
}

// 타격 순간: 다리를 임팩트 자세로 맞춘다 (히트스톱 동안 뻗은 다리가 보이도록)
export function syncImpact(game) {
  const p = game.player;
  if (!p || p.state !== 'kick') return 0;
  const k = p.kick || {};
  if (st.prevState !== 'kick' || p.stateTime < st.prevST - 1e-6) {
    // 같은 스텝에 시작한 킥: update보다 이벤트가 먼저 오므로 여기서 시작 처리
    st.from = st.pose ? { near: st.pose.near.slice(), far: st.pose.far.slice() } : null;
    st.emitT = 0;
    st.move = k.move || st.move || 'calf';
    st.leg = legOf(p, kickDef(st.move));
    st.prevState = 'kick';
    st.prevST = p.stateTime;
    st.kickT = 0;
  }
  // 내려찍기는 다리를 머리 위로 든 자세(syncAt)부터 보여 주고, 찍는 순간까지 남은 시간을 돌려준다
  const def = kickDef(st.move);
  st.kickT = Math.max(st.kickT, def.syncAt ?? def.impact);
  return Math.max(0, def.impact - st.kickT);
}

export function flash(t = 0.12) { st.flash = t; }
export function aura(level, t = 1.1) { st.aura = t; st.auraLevel = level; }

function zigzag(g, x0, y0, x1, y1, jit, color) {
  const mx = (x0 + x1) / 2 + rand(-jit, jit), my = (y0 + y1) / 2 + rand(-jit, jit);
  line(g, x0, y0, mx, my, 1, color);
  line(g, mx, my, x1, y1, 1);
}

// 다리 궤적(초승달 모양). 발이 지나간 길을 경로에서 바로 계산하므로 임팩트 순간에도 온전히 보인다.
function drawArc(g, def, T, lv) {
  const A = levelOf(lv).arc;
  if (!A) return;
  // 휘두르는 동안은 온전히 보이고, 다 뻗은 뒤에는 꼬리부터 줄어들며 가늘어진다
  const fade = clamp((T - def.swing[1]) / A.len);
  const head = Math.min(T, def.swing[1]);
  const tail = lerp(def.swing[0], def.swing[1], fade * fade);
  if (head - tail < 0.002) return;
  const n = 10, pts = [];
  const hx = st.hipW[0], hy = st.hipW[1];
  for (let i = 0; i <= n; i++) {
    const f = pathAt(def.keys, lerp(tail, head, i / n));
    const dx = f[0] - hx, dy = f[1] - 2 - hy, d = Math.hypot(dx, dy) || 1;
    pts.push([f[0] + dx / d * 4, f[1] - 2 + dy / d * 4]);
  }
  const W = (A.w + (def.big ? 2 : 0)) * (1 - fade * 0.6);
  for (const [col, kf] of [[A.outer, 1], [A.mid, 0.6], [A.core, 0.25]]) {
    for (let i = 0; i < n; i++) {
      const w = Math.max(1, Math.round(W * kf * (i + 1) / n));
      line(g, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, col);
    }
  }
  if (lv === 4) {
    // 번개: 궤적 주변에서 파직거리는 가지
    for (let b = 0; b < 4; b++) {
      const i = (Math.random() * (n - 2)) | 0;
      zigzag(g, pts[i][0] + rand(-5, 5), pts[i][1] + rand(-5, 5), pts[i + 2][0] + rand(-3, 3), pts[i + 2][1] + rand(-3, 3), 4,
        b % 2 ? '#ffffff' : '#fff3a0');
    }
  }
  if (lv === 5) {
    // 황금 불꽃: 궤적 바깥으로 일렁이는 불꽃 혀
    for (let i = 2; i <= n; i += 2) {
      const h = 2 + ((Math.random() * 5) | 0);
      g.fillStyle = i % 4 ? '#ffb81e' : '#ff5a14';
      g.fillRect(Math.round(pts[i][0]) - 1, Math.round(pts[i][1]) - h - 2, 2, h);
    }
  }
}

export function draw(g, game, time) {
  const p = game.player;
  if (!p) return;
  if (!st.pose) st.pose = poseFor(p, time);
  const P = Object.assign({}, st.pose);
  const k = p.kick || {};
  const lv = clamp(k.level || 1, 1, 5);
  const L = levelOf(lv);
  const def = kickDef(st.move);
  const T = st.kickT;
  const kicking = p.state === 'kick';
  const trailOn = (kicking || p.state === 'recover') && T < def.swing[1] + 0.25;
  const hipX = P.hip[0] + (st.leg === 'far' ? 1 : 0), hipY = P.hip[1] + 1;
  st.hipW = [hipX, hipY];

  const x = Math.round(p.x), y = Math.round(p.y), fc = p.facing < 0 ? -1 : 1;
  const local = (fn) => { g.save(); g.translate(x, y); g.scale(fc, 1); fn(); g.restore(); };

  // 잔상 다리 (단계가 오를수록 많아진다)
  if (kicking && T < def.swing[1] + 0.05) {
    local(() => {
      for (let i = L.after; i >= 1; i--) {
        const Tk = T - i * 0.009;
        if (Tk <= 0) continue;
        const J = legJoints(HERO, hipX, hipY, pathAt(def.keys, Tk), true);
        g.globalAlpha = 0.55 - i * 0.09;
        drawLegFlat(g, HERO, J, L.afterColor);
      }
    });
  }
  // 왼발(먼 다리) 킥의 궤적은 몸 뒤에, 오른발 킥의 궤적은 몸 앞에 그린다
  if (trailOn && st.leg === 'far') local(() => drawArc(g, def, T, lv));

  // 차는 발이 단계 색으로 빛난다 (4단계부터)
  if (kicking && lv >= 4 && T < def.swing[1] + 0.06) {
    if (st.leg === 'near') P.shoeNear = L.arc.core; else P.shoeFar = L.arc.core;
  }
  if (p.counterTime > 0 && Math.sin(time * 30) > 0) { P.shoeNear = '#ffd9a0'; P.shoeFar = '#ff8a5a'; }

  const o = {};
  if (st.flash > 0) { o.flash = clamp(st.flash / 0.1); o.flashColor = '#ffffff'; }
  if (st.aura > 0) {
    o.outline = Math.sin(time * 40) > 0 ? levelOf(st.auraLevel).main : '#ffffff';
    if (st.aura > 0.9) { o.flash = 1; o.flashColor = levelOf(st.auraLevel).main; }
  }
  if (p.invuln > 0 && p.state !== 'hurt' && p.alive !== false && Math.floor(p.invuln * 20) % 2) o.alpha = 0.35;
  if (p.state === 'dead') {
    // 쓰러져도 손은 주머니에
    const fall = clamp(p.stateTime / 0.3);
    o.rot = -fall * fall * Math.PI / 2;
    o.pivotY = -6 * fall;
  }
  drawChar(g, HERO, P, x, y, fc, o);

  if (trailOn && st.leg === 'near') local(() => drawArc(g, def, T, lv));

  // 카운터 찬스: 발끝 잔광
  if (p.counterTime > 0 && p.alive !== false) {
    local(() => {
      const pulse = Math.sin(time * 18) > 0 ? 1 : 0;
      for (const f of [P.near, P.far]) {
        const fx = Math.round(f[0]) + 3, fy = Math.round(f[1]) - 2;
        g.fillStyle = '#ff5a3a';
        g.fillRect(fx - 3 - pulse, fy, 7 + pulse * 2, 1);
        g.fillRect(fx, fy - 3 - pulse, 1, 7 + pulse * 2);
        g.fillStyle = '#fff6c8';
        g.fillRect(fx - 1, fy, 3, 1);
        g.fillRect(fx, fy - 1, 1, 3);
      }
    });
  }
}
