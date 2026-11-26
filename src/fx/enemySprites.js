// [C 담당] 적 3종 스프라이트와 공격 예고 표시, 투척물.
// brawler(격투형, 덩치) / shooter(사격형, 던지는 자세) / speedster(스피드형, 날렵함)
// 모르는 타입은 기본(회색) 그림, 모르는 상태는 idle 자세로 대체한다.
import { TUNE } from './tuning.js';
import { clamp, lerp, smooth, easeOut, line, diamond, sprite, disc } from './pix.js';
import { drawChar, mixPose } from './rig.js';

const SKIN = '#e0a878', SKIN_D = '#b47c52';

const SPECS = {
  // 격투형: 넓은 어깨, 굵은 팔다리, 민머리에 가까운 스포츠 머리
  brawler: {
    hipY: -17, thigh: 8, shin: 8, legW: 4, torsoH: 14, bw: 5, fw: 5, upperArm: 6, foreArm: 6, armW: 4, fist: 4,
    lean: 1, stance: 4, walkRate: 8, stride: 5, defKind: 'high',
    guard: (sy) => ({ nearHand: [8, sy + 4], farHand: [10, sy + 6] }),
    colors: {
      skin: SKIN, skinD: SKIN_D, top: '#c8504a', topD: '#8f3038', topL: '#e07a6a', arm: SKIN, armFar: SKIN_D,
      pants: '#4a4660', pantsFar: '#33304a', shoe: '#2a2836', shoeFar: '#1c1a26', sole: '#8a8798', soleFar: '#5c5a6a',
    },
    head: {
      ox: -4, oy: 1,
      unit: 0.5, // 논리 픽셀의 절반 크기로 찍은 세밀한 얼굴
      pal: { h: '#2b1d1a', s: SKIN, d: SKIN_D, e: '#8f5c3a', k: '#1a1010', w: '#f4f0e0' },
      rows: [
        '....hhhhhhhhhhh...',
        '...hhhhhhhhhhhhh..',
        '..hhhhhhhhhhhhhhh.',
        '..hhhdsssssssssss.',
        '..hhdssssssssssss.',
        '..hddssskkkkkkkks.',
        '..dddsssswwkksss..',
        '..ddedssssskkssss.',
        '..ddddsssssssssss.',
        '..dddsssssssssssss',
        '..dddssssssssssss.',
        '...ddsskkkkkkkks..',
        '...ddsskkkkkkkk...',
        '...dddsssssssss...',
        '....dddssssssss...',
        '....ddddsssssss...',
        '.....ddddsssss....',
        '......dddddd......',
      ],
    },
    torsoExtra(g, j) {
      // 민소매 져지의 흰 줄
      g.fillStyle = '#f4f0e0';
      g.fillRect(j.hx - 4, j.hy - 4, 10, 1);
      g.fillRect(j.sx + 2, j.sy + 3, 2, 3);
    },
  },
  // 사격형: 마른 몸, 앞챙 모자, 손에 든 공
  shooter: {
    hipY: -15, thigh: 7, shin: 7, legW: 3, torsoH: 12, bw: 3, fw: 3, upperArm: 5, foreArm: 6, armW: 3, fist: 3,
    lean: 0, stance: 3, walkRate: 10, stride: 4, defKind: 'throw', holds: true,
    guard: (sy, hy) => ({ nearHand: [5, hy + 1], farHand: [3, hy - 2] }),
    colors: {
      skin: SKIN, skinD: SKIN_D, top: '#4d8fc0', topD: '#2f5f8a', topL: '#7fb8e0', arm: '#4d8fc0', armFar: '#2f5f8a',
      pants: '#b9a06a', pantsFar: '#8a7648', shoe: '#f0f0f0', shoeFar: '#b0b0b8', sole: '#5a5a66', soleFar: '#44444e',
    },
    head: {
      ox: -4, oy: 1,
      unit: 0.5, // 논리 픽셀의 절반 크기로 찍은 세밀한 얼굴
      pal: { c: '#2f5f8a', C: '#7fb8e0', b: '#1f3f60', s: SKIN, d: SKIN_D, e: '#8f5c3a', k: '#1a1010', w: '#f4f0e0', m: '#8a4a3a', h: '#3a2a20' },
      rows: [
        '....cccccccc......',
        '...cccCCCcccc.....',
        '..cccCCCCccccc....',
        '..ccccCCccccccc...',
        '..cccccccccccccbbb',
        '..ccccccccccbbbbbb',
        '..hhdsssssssss....',
        '..hhdsssswkkss....',
        '..hhdssssskkss....',
        '..hdedsssssssss...',
        '...dddssssssss....',
        '...dddsssssmms....',
        '....ddssssssss....',
        '....dddssssss.....',
        '.....dddsss.......',
        '......ddd.........',
      ],
    },
    torsoExtra(g, j) {
      g.fillStyle = '#f0f0f0';
      g.fillRect(j.sx + 2, j.sy + 1, 1, 8); // 점퍼 지퍼
    },
  },
  // 스피드형: 낮게 웅크린 자세, 뒤로 넘긴 흰 머리, 휘날리는 붉은 머리띠
  speedster: {
    hipY: -12, thigh: 7, shin: 7, legW: 3, torsoH: 10, bw: 3, fw: 2, upperArm: 5, foreArm: 5, armW: 2, fist: 2,
    lean: 3, stance: 4, walkRate: 18, stride: 7, defKind: 'dash',
    guard: (sy, hy) => ({ nearHand: [-5, hy + 1], farHand: [-7, hy - 1] }),
    colors: {
      skin: SKIN, skinD: SKIN_D, top: '#5fbf6a', topD: '#3a8a48', topL: '#9ae6a0', arm: '#5fbf6a', armFar: '#3a8a48',
      pants: '#2f6e3c', pantsFar: '#1f4c2a', stripe: '#d8f5dc', shoe: '#f4f060', shoeFar: '#b0ac38', sole: '#ffffff', soleFar: '#b8b8b8',
    },
    head: {
      ox: -4, oy: 1,
      unit: 0.5, // 논리 픽셀의 절반 크기로 찍은 세밀한 얼굴
      pal: { h: '#e6ecf0', H: '#a9b6c2', b: '#e04848', s: SKIN, d: SKIN_D, k: '#1a1010', w: '#f4f0e0', m: '#262633' },
      rows: [
        'hh..hhhhhh......',
        'hhhhhhHHhhhh....',
        'hhhhhHHhhhhhhh..',
        'HhhhhhhhHHhhhhh.',
        'HHhhhhhhhHhhhhhh',
        '.HhhhhhhhhhhhHhh',
        'bbbbbbbbbbbbbbbb',
        'bbbbbbbbbbbbbbbb',
        '..hhdsssswkkkss.',
        '..hddsssswkkkss.',
        '...ddsmmmmmmmmmm',
        '....dsmmmmmmmmmm',
        '....dsmmmmmmmmm.',
        '....ddmmmmmmmm..',
        '.....ddddd......',
        '......ddd.......',
      ],
    },
    // 머리띠 끝자락이 뒤로 휘날린다
    headBack(g, j, P) {
      const w = P.wave || 0;
      g.fillStyle = '#e04848';
      g.fillRect(j.headX - 3, j.headY + 3 + (w > 0 ? 1 : 0), 3, 1);
      g.fillRect(j.headX - 5, j.headY + 4 + (w > 0 ? 0 : 1), 3, 1);
      g.fillStyle = '#a82c3a';
      g.fillRect(j.headX - 2, j.headY + 5 - (w > 0 ? 1 : 0), 2, 1);
    },
  },
  // 모르는 타입
  default: {
    hipY: -15, thigh: 7, shin: 7, legW: 3, torsoH: 12, bw: 3, fw: 3, upperArm: 5, foreArm: 6, armW: 3, fist: 3,
    lean: 0, stance: 3, walkRate: 10, stride: 4, defKind: 'high',
    guard: (sy) => ({ nearHand: [6, sy + 5], farHand: [8, sy + 7] }),
    colors: {
      skin: SKIN, skinD: SKIN_D, top: '#9a9aa8', topD: '#6a6a7a', arm: '#9a9aa8', armFar: '#6a6a7a',
      pants: '#55556a', pantsFar: '#3c3c50', shoe: '#2a2836', shoeFar: '#1c1a26', sole: '#8a8798', soleFar: '#5c5a6a',
    },
    head: {
      ox: -4, oy: 1,
      pal: { h: '#3a3a44', s: SKIN, d: SKIN_D, k: '#1a1010' },
      rows: [
        '..hhhhh.',
        '.hhhhhhh',
        '.hhsssss',
        '.hsssks.',
        '..ssssss',
        '..dssss.',
        '...dss..',
      ],
    },
  },
};

// 중량형: 격투형의 틀을 키운 거구. 어두운 풀색 점퍼에 굵은 팔다리.
SPECS.heavy = {
  ...SPECS.brawler,
  hipY: -20, thigh: 9, shin: 10, legW: 6, torsoH: 18, bw: 8, fw: 7, upperArm: 8, foreArm: 7, armW: 6, fist: 6,
  lean: 2, stance: 6, walkRate: 5, stride: 5,
  guard: (sy) => ({ nearHand: [10, sy + 7], farHand: [12, sy + 9] }),
  colors: {
    skin: SKIN, skinD: SKIN_D, top: '#4c6a48', topD: '#2f4530', topL: '#6f9468', arm: '#4c6a48', armFar: '#2f4530',
    pants: '#2e2c3a', pantsFar: '#201e2a', shoe: '#5a3a24', shoeFar: '#3c2618', sole: '#b09a80', soleFar: '#7a6a58',
  },
  head: { ...SPECS.brawler.head, rows: SPECS.brawler.head.rows.slice(), pal: { ...SPECS.brawler.head.pal, h: '#16161c' } },
  torsoExtra(g, j) {
    // 점퍼 지퍼와 허리띠
    g.fillStyle = '#c8c8b0';
    g.fillRect(j.sx + 3, j.sy + 2, 1, 12);
    g.fillStyle = '#1c1a26';
    g.fillRect(j.hx - 8, j.hy - 2, 16, 2);
  },
};

export const ENEMY_TYPES = Object.keys(SPECS).filter((k) => k !== 'default');
export const specOf = (type) => SPECS[type] || SPECS.default;
export const heightOf = (e) => { const S = specOf(e.type); return -S.hipY + S.torsoH + S.head.rows.length * (S.head.unit || 1) - 1; };

// 적마다 기억해 둘 연출 상태 (마지막 공격 종류, 피격 번쩍임)
const memo = new WeakMap();
export function mem(e) {
  let m = memo.get(e);
  if (!m) { m = { kind: null, flash: 0 }; memo.set(e, m); }
  return m;
}

function base(S, time) {
  const hy = S.hipY, sy = hy - S.torsoH;
  return Object.assign({ hip: [0, hy], lean: S.lean, sh: 0, head: [0, 0], near: [S.stance, 0], far: [-S.stance, 0] }, S.guard(sy, hy));
}

// 공격 종류별 "예고" 자세 (다 웅크렸을 때)
function windupPose(S, kind) {
  const B = base(S), hy = S.hipY, sy = hy - S.torsoH;
  switch (kind) {
    case 'low':   // 하단 발차기: 앞발을 뒤로 당긴다
      return Object.assign(B, { lean: S.lean - 2, hip: [-1, hy], near: [-6, -6], far: [-1, 0] });
    case 'dash':  // 돌진: 땅을 짚을 듯 낮게 웅크린다
      return Object.assign(B, { lean: S.lean + 5, hip: [-2, hy + 4], near: [5, 0], far: [-9, 0], nearHand: [7, -2], farHand: [-8, hy - 4] });
    case 'throw': // 투척: 팔을 머리 뒤로 젖히고 앞발을 든다
      return Object.assign(B, { lean: S.lean - 3, hip: [-1, hy], near: [-3, 0], far: [5, -4], nearHand: [-7, sy - 5], farHand: [8, sy + 4] });
    default:      // 'high' 주먹: 주먹을 뒤로 당긴다
      return Object.assign(B, { lean: S.lean - 3, hip: [-1, hy], nearHand: [-6, sy + 5], farHand: [9, sy + 4] });
  }
}

// 공격 종류별 "뻗은" 자세
function strikePose(S, kind) {
  const B = base(S), hy = S.hipY, sy = hy - S.torsoH;
  switch (kind) {
    case 'low':
      return Object.assign(B, { lean: S.lean - 2, hip: [1, hy], near: [18, -4], far: [-2, 0], stretchNear: true });
    case 'dash':
      return Object.assign(B, { lean: S.lean + 7, hip: [3, hy + 3], near: [-9, -5], far: [-4, -1], nearHand: [14, sy + 8], farHand: [-9, sy + 3], stretchArm: true });
    case 'throw':
      return Object.assign(B, { lean: S.lean + 4, hip: [2, hy], near: [6, 0], far: [-4, 0], nearHand: [13, sy + 3], farHand: [-3, hy - 2], stretchArm: true });
    default:
      return Object.assign(B, { lean: S.lean + 4, hip: [3, hy], near: [7, 0], far: [-4, 0], nearHand: [18, sy + 4], farHand: [5, sy + 6], stretchArm: true });
  }
}

function poseFor(e, S, time) {
  const t = e.stateTime || 0, hy = S.hipY, sy = hy - S.torsoH;
  const m = mem(e);
  if (e.attack && e.attack.kind) m.kind = e.attack.kind;
  const kind = m.kind || S.defKind;
  let P = base(S, time);
  switch (e.state) {
    case 'walk': {
      const back = (e.vx || 0) * e.facing < 0 ? -1 : 1; // 뒷걸음질이면 발을 반대로 굴린다
      const ph = t * S.walkRate * back;
      P.near = [S.stride * Math.cos(ph), -3 * Math.max(0, -Math.sin(ph))];
      P.far = [S.stride * Math.cos(ph + Math.PI), -3 * Math.max(0, Math.sin(ph))];
      P.hip = [0, hy + Math.abs(Math.cos(ph))];
      P.wave = Math.sin(time * 20);
      break;
    }
    case 'windup': {
      const W = windupPose(S, kind);
      // timeToHit가 0에 가까울수록 더 깊이 웅크린다. 직전에는 부르르 떤다.
      const tth = e.attack ? e.attack.timeToHit : 0;
      const k = e.attack ? clamp(Math.max(t / 0.18, 1 - tth / 0.35)) : clamp(t / 0.2);
      P = mixPose(P, W, smooth(k));
      if (tth < TUNE.parryHint + 0.05 && Math.sin(time * 70) > 0) P.hip = [P.hip[0] - 1, P.hip[1]];
      break;
    }
    case 'attack': {
      P = mixPose(windupPose(S, kind), strikePose(S, kind), easeOut(clamp(t / 0.05)));
      P.wave = 1;
      break;
    }
    case 'recover': {
      P = mixPose(strikePose(S, kind), P, smooth(clamp(t / 0.4)));
      P.head = [0, 1];
      break;
    }
    case 'hurt': {
      const f = 1 - clamp(t / 0.3);
      P.hip = [-2 * f, hy + f];
      P.lean = S.lean - 5 * f;
      P.head = [-2 * f, -f];
      P.near = [S.stance + 1, -3 * f];
      P.nearHand = [lerp(P.nearHand[0], -3, f), lerp(P.nearHand[1], sy - 1, f)];
      P.farHand = [lerp(P.farHand[0], 6, f), lerp(P.farHand[1], sy - 3, f)];
      break;
    }
    case 'stun': {
      // 비틀비틀. 팔이 축 늘어지고 고개가 떨어진다
      const s = Math.sin(time * 7);
      P.hip = [s, hy + 2];
      P.lean = S.lean + s * 2.5;
      P.head = [1, 2];
      P.nearHand = [S.fw + 4 + s, hy + 3];
      P.farHand = [S.fw + 1 - s, hy + 5];
      P.near = [S.stance + 1, 0];
      break;
    }
    case 'down':
      P.lean = 0; P.near = [2, 0]; P.far = [-1, 0];
      P.nearHand = [3, sy - 3]; P.farHand = [1, sy - 5];
      break;
    case 'idle':
    default: {
      // 타입마다 숨 고르는 리듬이 다르다 (스피드형은 통통 튄다)
      const rate = e.type === 'speedster' ? 9 : e.type === 'brawler' ? 2.2 : 3;
      const b = Math.sin(time * rate + (e.x || 0)) > 0 ? 0 : 1;
      P.hip = [0, hy + b];
      P.wave = Math.sin(time * 6);
    }
  }
  return P;
}

const BALL = { pal: { w: '#f4f4f0', g: '#b9b9c4', r: '#e04848' }, rows: ['.ww.', 'wwwr', 'wrwg', '.gg.'] };

export function drawEnemy(g, e, time) {
  const S = specOf(e.type);
  const m = mem(e);
  const P = poseFor(e, S, time);
  const x = Math.round(e.x), y = Math.round(e.y), fc = e.facing < 0 ? -1 : 1;
  const o = {};
  if (m.flash > 0) {
    o.flash = m.flash > 0.05 ? 1 : 0.45; // 맞는 순간 하얗게 번쩍
    if (m.armored) o.flashColor = '#a9c4e8'; // 버티며 맞았을 때는 푸른 쇳빛
  }
  if (e.launched && e.state === 'hurt') {
    // 강타에 날아가는 중: 뒤로 젖혀진 채 뜬다
    o.rot = -clamp((e.stateTime || 0) / 0.2) * 1.15;
    o.pivotY = -S.bw;
  }
  if (e.state === 'stun') { o.flash = Math.sin(time * 24) > 0.6 ? 0.25 : 0; o.flashColor = '#ffe45c'; }

  if (e.state === 'down' || e.alive === false) {
    const t = e.stateTime || 0;
    if (e.alive === false && t > TUNE.corpseTime) {
      if (t > TUNE.corpseTime + 0.6 || Math.floor(t * 20) % 2) return; // 깜빡이다 사라진다
    }
    const fall = clamp(t / 0.28);
    o.rot = -fall * fall * Math.PI / 2;
    o.pivotY = -(S.bw + 3) * fall;
  }

  // 사격형은 손에 공을 들고 있다 (던진 뒤에는 빈손)
  const holding = S.holds && e.alive !== false && (e.state === 'idle' || e.state === 'walk' || e.state === 'windup');
  if (holding) {
    o.extra = (bg, j) => {
      if (!j.nearHand) return;
      const bob = e.state === 'idle' ? Math.round(Math.max(0, Math.sin(time * 5)) * 4) : 0; // 공을 던졌다 받는다
      const item = e.attack && e.attack.projectile === 'bottle' ? BOTTLE : BALL; // 던지려는 것을 손에 든다
      sprite(bg, item.rows, item.pal, Math.round(j.nearHand[0]) - 1, Math.round(j.nearHand[1]) - item.rows.length - bob);
    };
  }

  // 돌진 잔상
  const speed = Math.abs(e.vx || 0);
  if (e.alive !== false && (speed > 170 || (e.state === 'attack' && (m.kind || S.defKind) === 'dash'))) {
    const dir = speed > 1 ? Math.sign(e.vx) : fc;
    for (let i = 2; i >= 1; i--) {
      drawChar(g, S, P, x - dir * i * 9, y, fc, { ghost: S.colors.topL || S.colors.top, alpha: 0.4 - i * 0.12 });
    }
  }

  drawChar(g, S, P, x, y, fc, o);

  if (e.state === 'stun' && e.alive !== false) drawStunStars(g, x, y - heightOf(e) - 3, time);
}

function drawStunStars(g, x, y, time) {
  for (let i = 0; i < 3; i++) {
    const a = time * 6 + i * 2.094;
    const sx = Math.round(x + Math.cos(a) * 7), sy = Math.round(y + Math.sin(a) * 2);
    g.fillStyle = Math.sin(a) > 0 ? '#ffe45c' : '#c9a020';
    g.fillRect(sx - 1, sy, 3, 1);
    g.fillRect(sx, sy - 1, 1, 3);
  }
}

const BOOT = ['kk...', 'kk...', 'kk...', 'kkkkk', 'kkkkk']; // 발 모양
const BANG = ['.kk..', '.kk..', '.kk..', '.....', '.kk..']; // 느낌표

// 공격 예고 표시. 바깥 마름모가 안쪽 표식으로 좁혀 들어오고, 겹치는 순간이 타격이다.
// 패링 가능: 노란 발 모양 표식. 패링 타이밍(timeToHit <= parryHint)이 되면 하얗게 번쩍인다.
// 패링 불가: 붉은 느낌표. 번쩍이지 않는다 (피해야 한다).
export function drawTelegraph(g, e, time) {
  const a = e.attack;
  if (!a || a.phase !== 'windup' || e.alive === false) return;
  const tth = Math.max(0, a.timeToHit || 0);
  const x = Math.round(e.x), y = Math.round(e.y) - heightOf(e) - 13;
  const now = a.parryable && tth <= TUNE.parryHint;
  const blink = Math.sin(time * 60) > 0;
  const main = a.parryable ? (now ? (blink ? '#ffffff' : '#ffe45c') : '#ffd21f') : '#ff4040';
  const dark = a.parryable ? '#5a3c00' : '#5a0c14';
  // 표식 바탕 (마름모)
  g.fillStyle = main;
  for (let r = 0; r <= 6; r++) {
    g.fillRect(x - r, y - 6 + r, r * 2 + 1, 1);
    g.fillRect(x - r, y + 6 - r, r * 2 + 1, 1);
  }
  diamond(g, x, y, 7, '#0d0b16');
  sprite(g, a.parryable ? BOOT : BANG, { k: dark }, x - 2, y - 2);
  // 좁혀 들어오는 마름모
  const r = 8 + Math.round(Math.min(tth, 0.9) * 34);
  if (r > 8) diamond(g, x, y, r, now ? '#ffffff' : main, now ? 2 : 1);
  if (now) {
    // 지금이다: 네 귀퉁이 반짝임
    g.fillStyle = '#ffffff';
    g.fillRect(x - 11, y, 3, 1); g.fillRect(x + 9, y, 3, 1);
    g.fillRect(x, y - 11, 1, 3); g.fillRect(x, y + 9, 1, 3);
  }
}

// 투척물. type: 'bottle' | 'can' | 그 밖은 공. 되받아친 것(reflected)은 황금색으로 빛난다.
const BOTTLE = { pal: { g: '#58b070', G: '#9ae0a8', k: '#2a5a3a', w: '#f4f4f0' }, rows: ['.w.', '.g.', 'gGg', 'gGg', 'gGg', 'kgk'] };
const CAN = { pal: { r: '#d0444a', R: '#f08a80', s: '#c8c8d0' }, rows: ['sss', 'rRr', 'rRr', 'sss'] };

export function drawProjectile(g, pr, time) {
  const x = Math.round(pr.x), y = Math.round(pr.y);
  const dir = pr.vx < 0 ? -1 : 1;
  const sp = Math.hypot(pr.vx || 0, pr.vy || 0);
  // 날아가는 꼬리
  if (sp > 20) {
    const kx = -(pr.vx || 0) / sp, ky = -(pr.vy || 0) / sp;
    g.globalAlpha = 0.5;
    line(g, x + kx * 3, y + ky * 3, x + kx * (pr.reflected ? 14 : 8), y + ky * (pr.reflected ? 14 : 8), pr.reflected ? 3 : 1, pr.reflected ? '#ffd84d' : '#ffffff');
    g.globalAlpha = 1;
  }
  const spin = Math.floor(time * 14) % 4;
  g.save();
  g.translate(x, y);
  if (pr.type === 'bottle' || pr.type === 'can') {
    g.rotate(spin * dir * Math.PI / 2);
    const sp2 = pr.type === 'bottle' ? BOTTLE : CAN;
    // 외곽선
    g.fillStyle = '#0d0b16';
    g.fillRect(-2, -Math.ceil(sp2.rows.length / 2) - 1, 5, sp2.rows.length + 2);
    sprite(g, sp2.rows, sp2.pal, -1, -Math.ceil(sp2.rows.length / 2));
  } else {
    const r = Math.max(2, Math.round(Math.max(pr.w || 6, pr.h || 6) / 2));
    disc(g, 0, 0, r + 1, '#0d0b16');
    disc(g, 0, 0, r, '#f4f4f0');
    g.fillStyle = '#b9b9c4';
    g.fillRect(-r + 1, r - 1, r * 2 - 1, 1);
    // 실밥이 돌아간다
    g.fillStyle = '#e04848';
    const st = [[-1, -2, 3, 1], [2, -1, 1, 3], [-1, 2, 3, 1], [-2, -1, 1, 3]][spin];
    g.fillRect(st[0], st[1], st[2], st[3]);
  }
  g.restore();
  if (pr.reflected) {
    // 되받아친 투척물: 황금 테두리 반짝임
    g.fillStyle = Math.sin(time * 40) > 0 ? '#ffd84d' : '#fff6c8';
    g.fillRect(x - 5, y, 2, 1); g.fillRect(x + 4, y, 2, 1);
    g.fillRect(x, y - 5, 1, 2); g.fillRect(x, y + 4, 1, 2);
  } else if (pr.parryable === false) {
    g.fillStyle = '#ff4040';
    g.fillRect(x - 5, y, 1, 1); g.fillRect(x + 5, y, 1, 1);
  }
}
