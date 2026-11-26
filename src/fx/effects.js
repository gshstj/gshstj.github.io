// [C 담당] 이벤트별 연출: 타격 이펙트(단계 1~5), 강타, 패링, 헛발질, 피격, 단계 상승.
// 그리고 화면 전체 연출(번쩍임, 암전, 가장자리 붉은 기운, 임팩트 컷)과 카메라/시간 제어.
import { W, H, GROUND_Y } from '../core/config.js';
import { TUNE, levelOf, GOLD, FIRE, DUST } from './tuning.js';
import { clamp, rand, pick, line, makeCanvas, blit, seeded } from './pix.js';
import * as particles from './particles.js';
import { M } from './backgrounds.js';

// ── 카메라와 시간 ──
export const cam = {
  shake: 0, sx: 0, sy: 0,
  zoom: 0, zoomTarget: 0, zoomHold: 0,
  focusX: W / 2, focusY: H / 2,
  slowT: 0, slowScale: 1,
  look: 0, snap: true,
};

export function addShake(v) { cam.shake = Math.min(TUNE.shake.max, Math.max(cam.shake, v)); }
export function punchZoom(z, wx, wy, hold = TUNE.zoom.hold) {
  if (z >= cam.zoomTarget) { cam.zoomTarget = z; cam.focusX = wx; cam.focusY = wy; }
  cam.zoomHold = Math.max(cam.zoomHold, hold);
}
export function slow(t, scale) { cam.slowT = Math.max(cam.slowT, t); cam.slowScale = scale; }
function hitstop(game, t) { game.hitstop = Math.max(game.hitstop || 0, t); }

// ── 화면 전체 연출 상태 ──
export const screen = {
  flash: 0, flashColor: '#ffffff',   // 화면 번쩍임
  dim: 0, dimHold: 0,                // 배경 암전 (캐릭터는 밝게 남는다)
  miss: 0,                           // 헛발질: 화면이 살짝 어두워진다
  hurt: 0,                           // 피격: 가장자리가 붉게 번쩍
  vign: 0,                           // 카운터 찬스: 가장자리 붉은 기운
  cut: 0, cutX: 0, cutY: 0, cutDir: 1, cutAng: 0, // 5단계 강타의 임팩트 컷
  pillar: 0, pillarX: 0, pillarColor: '#ffffff', // 단계 상승 빛기둥
};

const decals = []; // 바닥 균열 { x, size, life, seed }

// 조금 뒤에 터뜨릴 연출 (실제 시간 기준)
const queue = [];
export function later(t, fn) { queue.push({ t, fn }); }

export function reset() {
  particles.clear();
  decals.length = 0;
  queue.length = 0;
  Object.assign(screen, { flash: 0, dim: 0, dimHold: 0, miss: 0, hurt: 0, vign: 0, cut: 0, pillar: 0 });
  Object.assign(cam, { shake: 0, zoom: 0, zoomTarget: 0, zoomHold: 0, slowT: 0, snap: true });
}

// ── 파티클 묶음 ──
// ang: 타격 방향 각도(라디안, 0 = 수평, +는 아래쪽). dir: 좌우(+1/-1)
function spray(x, y, dir, ang, n, o) {
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-(o.spread ?? 0.8), o.spread ?? 0.8);
    const s = rand(o.v0 ?? 60, o.v1 ?? 160);
    particles.spawn(Object.assign({
      x: x + rand(-2, 2), y: y + rand(-2, 2),
      vx: Math.cos(a) * s * dir, vy: Math.sin(a) * s + (o.lift ?? 0),
      life: rand(o.l0 ?? 0.15, o.l1 ?? 0.35),
    }, o.p));
  }
}
function radial(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + rand(-0.3, 0.3);
    const s = rand(o.v0 ?? 80, o.v1 ?? 200);
    particles.spawn(Object.assign({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(o.l0 ?? 0.12, o.l1 ?? 0.25),
    }, o.p));
  }
}
const star = (x, y, size, colors, life = 0.16) => particles.spawn({ type: 'star', x, y, size, colors, life, keep: true });
const ringFx = (x, y, r0, r1, colors, life, o = {}) => particles.spawn(Object.assign({ type: 'ring', x, y, r0, r1, colors, life, keep: true }, o));
const slashFx = (x, y, ang, dir, len, size, colors, life = 0.14) =>
  particles.spawn({ type: 'slash', x, y, dx: Math.cos(ang) * dir, dy: Math.sin(ang), len, size, colors, life, keep: true });

function dustFx(x, y, dir, ang, n) {
  spray(x, y, dir, ang, n, { v0: 40, v1: 130, lift: -40, l0: 0.2, l1: 0.45, p: { type: 'px', g: 500, size: 1, colors: DUST, bounce: true } });
  for (let i = 0; i < Math.ceil(n / 3); i++) {
    particles.spawn({ type: 'px', x: x + rand(-3, 3), y: y + rand(-3, 3), vx: dir * rand(20, 90), vy: rand(-90, -20), g: 500, life: rand(0.25, 0.5), size: 2, colors: DUST, bounce: true });
  }
}

function crack(x, size) {
  decals.push({ x, size, life: TUNE.crackTime, seed: (Math.random() * 1e6) | 0 });
  if (decals.length > TUNE.maxCracks) decals.shift();
}

// 킥 종류별 타격 방향 (라디안. +는 아래쪽)
const HIT_ANGLE = { calf: 0.4, high: -0.55, mid: 0, axe: 1.25, rise: -1.35, fly: 0.35, brazil: 1.1 };

// ── 단계별 타격 이펙트 ──
function levelHit(lv, x, y, dir, ang, crit, target) {
  const L = levelOf(lv);
  const gx = target ? target.x : x;
  switch (lv) {
    case 1: // 풋내기의 발: 먼지 파편
      dustFx(x, y, dir, ang, crit ? 12 : 7);
      star(x, y, crit ? 5 : 3, ['#ffffff', '#c9c1ae']);
      break;
    case 2: // 날 선 발: 흰 궤적선
      dustFx(x, y, dir, ang, 3);
      star(x, y, crit ? 7 : 5, L.colors);
      slashFx(x, y, ang, dir, crit ? 34 : 22, 2, ['#ffffff', '#e6ecf7', '#b8c2d8']);
      spray(x, y, dir, ang, crit ? 10 : 6, { spread: 1.1, v0: 120, v1: 260, l0: 0.08, l1: 0.18, p: { type: 'streak', drag: 4, size: 1, len: 0.035, colors: L.colors } });
      break;
    case 3: // 바람 가르는 발: 푸른 바람과 충격파 링
      star(x, y, crit ? 7 : 5, L.colors);
      slashFx(x, y, ang, dir, crit ? 38 : 26, 3, L.colors);
      ringFx(x, y, 3, crit ? 28 : 18, L.colors, crit ? 0.3 : 0.22);
      spray(x, y, dir, ang, crit ? 14 : 9, { spread: 0.55, v0: 140, v1: 320, l0: 0.14, l1: 0.3, p: { type: 'streak', drag: 3.5, size: 1, len: 0.05, colors: L.colors } });
      spray(x, y, dir, ang, 5, { spread: 1.4, v0: 30, v1: 90, l0: 0.2, l1: 0.4, p: { type: 'puff', size: 3, drag: 3, colors: ['#e8f8ff', '#8fd8ff', '#3f8fe0'], back: true } });
      break;
    case 4: { // 번개 발: 번개 스파크, 바닥 균열, 화면 번쩍임
      star(x, y, crit ? 8 : 6, L.colors);
      slashFx(x, y, ang, dir, crit ? 40 : 26, 3, L.colors);
      const nb = crit ? 6 : 3;
      for (let i = 0; i < nb; i++) {
        const a = ang + rand(-1.4, 1.4);
        const len = rand(14, crit ? 34 : 24);
        particles.spawn({ type: 'bolt', x, y, x2: x + Math.cos(a) * len * dir, y2: y + Math.sin(a) * len, segs: 4, jit: 4, size: 2,
          colors: ['#ffffff', '#fff3a0', '#ffd21f'], life: rand(0.1, 0.18), keep: true });
      }
      // 땅으로 내리꽂는 번개 한 줄기
      particles.spawn({ type: 'bolt', x, y, x2: gx + rand(-6, 6), y2: GROUND_Y + 2, segs: 5, jit: 5, size: 2,
        colors: ['#ffffff', '#fff3a0', '#ffd21f'], life: 0.14, keep: true });
      spray(x, y, dir, ang, crit ? 16 : 10, { spread: 1.3, v0: 80, v1: 240, lift: -50, l0: 0.15, l1: 0.4, p: { type: 'px', g: 520, size: 1, colors: L.colors, bounce: true } });
      crack(gx, crit ? 22 : 11);
      screen.flash = Math.max(screen.flash, crit ? 0.6 : 0.22);
      screen.flashColor = '#fffbe0';
      break;
    }
    default: { // 마스터의 발: 황금 불꽃, 이중 충격파, 배경 암전
      star(x, y, crit ? 9 : 6, L.colors);
      slashFx(x, y, ang, dir, crit ? 46 : 28, 4, L.colors);
      ringFx(x, y, 3, crit ? 30 : 15, GOLD, crit ? 0.32 : 0.2, { delay: crit ? 0.1 : 0 });
      ringFx(x, y, 3, crit ? 48 : 25, ['#fff6c8', '#ffb020', '#e0481a'], crit ? 0.42 : 0.28, { delay: crit ? 0.16 : 0.05, thick: 3 });
      spray(x, y, dir, ang, crit ? 26 : 12, { spread: 1.0, v0: 50, v1: 190, lift: -70, l0: 0.25, l1: 0.6,
        p: { type: 'flame', g: -160, drag: 2, size: 3, colors: FIRE } });
      spray(x, y, dir, ang, crit ? 12 : 6, { spread: 1.5, v0: 120, v1: 280, l0: 0.2, l1: 0.5, p: { type: 'px', g: 300, size: 1, colors: GOLD } });
      screen.dim = Math.max(screen.dim, crit ? 0.86 : 0.4);
      screen.dimHold = Math.max(screen.dimHold, crit ? 0.2 : 0.07);
      if (crit) crack(gx, 18);
    }
  }
}

// ── 강타(콤보 마무리, 카운터) 덧입힘: 황금 충격파, 불꽃, 방사선 ──
function critOverlay(lv, x, y, dir, ang, d, target) {
  const gx = target ? target.x : x;
  ringFx(x, y, 4, 34 + lv * 2, GOLD, 0.3, { thick: 3 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283 + rand(-0.2, 0.2);
    particles.spawn({ type: 'streak', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 6, vx: Math.cos(a) * rand(260, 380), vy: Math.sin(a) * rand(260, 380),
      drag: 6, life: rand(0.12, 0.22), size: 2, len: 0.045, colors: GOLD, keep: true });
  }
  spray(x, y, dir, ang, 10, { spread: 1.2, v0: 60, v1: 200, lift: -60, l0: 0.2, l1: 0.5, p: { type: 'flame', g: -120, drag: 2, size: 2, colors: FIRE } });
  star(x, y, 9 + lv, GOLD, 0.2);
  if (d.finisher || d.move === 'axe') {
    // 내려찍기 마무리: 바닥에서 흙먼지 기둥과 납작한 충격파
    ringFx(gx, GROUND_Y + 2, 6, 44 + lv * 3, ['#ffffff', '#e9dfc8', '#b8ad98'], 0.34, { ys: 0.22, thick: 2, back: true });
    for (let i = 0; i < 12; i++) {
      particles.spawn({ type: 'px', x: gx + rand(-16, 16), y: GROUND_Y, vx: rand(-50, 50), vy: rand(-230, -90), g: 620,
        life: rand(0.3, 0.6), size: pick([1, 2, 2]), colors: DUST, bounce: true });
    }
    for (let i = 0; i < 6; i++) {
      particles.spawn({ type: 'puff', x: gx + rand(-22, 22), y: GROUND_Y + 1, vx: rand(-70, 70), vy: rand(-20, 0), drag: 3,
        life: rand(0.3, 0.55), size: pick([3, 4]), colors: DUST, back: true });
    }
  }
  if (d.counter) {
    // 카운터: 붉고 흰 가위표
    slashFx(x, y, 0.8, 1, 38, 3, ['#ffffff', '#ff8a6a', '#e0301a'], 0.2);
    slashFx(x, y, -0.8, 1, 38, 3, ['#ffffff', '#ff8a6a', '#e0301a'], 0.2);
    ringFx(x, y, 2, 24, ['#ffffff', '#ff6a4a', '#b0201a'], 0.24);
  }
}

// ── 이벤트 처리 (index.js가 이벤트 버스에 연결한다) ──
export function kickHit(game, d) {
  const p = game.player;
  const lv = clamp(Math.round(d.level || (p && p.kick && p.kick.level) || 1), 1, 5);
  const target = d.target || null;
  const x = d.x ?? (target ? target.x : p ? p.x : W / 2);
  const y = d.y ?? (target ? target.y - 12 : GROUND_Y - 12);
  const dir = (target && p ? Math.sign(target.x - p.x) : 0) || (p ? p.facing : 1) || 1;
  const ang = HIT_ANGLE[d.move] ?? 0.2;
  const crit = !!d.crit;

  // 맞는 순간 화면이 하얗게 한 번 튄다 (강타는 더 세게)
  screen.flash = Math.max(screen.flash, crit ? 0.45 : 0.14);
  screen.flashColor = '#ffffff';
  levelHit(lv, x, y, dir, ang, crit, target);
  // 타격 지점에서 사방으로 튀는 파편
  radial(x, y, crit ? 14 : 6, { v0: 90, v1: crit ? 300 : 200, l0: 0.1, l1: 0.3,
    p: { type: 'px', g: 420, size: crit ? 2 : 1, colors: ['#ffffff', '#ffe9a8', '#ff9a50'], bounce: true } });

  if (crit) {
    critOverlay(lv, x, y, dir, ang, d, target);
    hitstop(game, TUNE.hitstop.crit + TUNE.hitstop.critPerLevel * (lv - 1));
    addShake(TUNE.shake.crit + TUNE.shake.perLevel * lv);
    punchZoom(TUNE.zoom.crit + TUNE.zoom.critPerLevel * (lv - 1), x, y, lv >= 5 ? 0.22 : TUNE.zoom.hold);
    if (lv >= 5) {
      // 임팩트 컷: 암전된 화면을 가르는 황금 선
      screen.cut = 0.24;
      screen.cutX = x; screen.cutY = y; screen.cutDir = dir; screen.cutAng = ang;
    }
  } else {
    // 콤보 1~3타: 가볍고 빠르게. 연타가 끊기지 않도록 히트스톱은 2프레임.
    hitstop(game, TUNE.hitstop.normal);
    addShake(TUNE.shake.normal + TUNE.shake.perLevel * lv);
  }
}

export function kickMiss(game, d) {
  // 헛발질: 잔상만 남고 화면이 살짝 어두워진다
  screen.miss = 1;
  const p = game.player;
  const dir = p ? p.facing : 1;
  const x = d.x ?? (p ? p.x + dir * 24 : W / 2), y = d.y ?? GROUND_Y - 10;
  for (let i = 0; i < 3; i++) {
    particles.spawn({ type: 'streak', x: x - dir * 4, y: y - 3 + i * 3, vx: dir * rand(70, 120), vy: 0, drag: 6,
      life: rand(0.12, 0.2), size: 1, len: 0.07, colors: ['#9a9ab0', '#6a6a82', '#44445a'] });
  }
}

export function parrySuccess(game, d) {
  const p = game.player;
  const x = d.x ?? (p ? p.x + p.facing * 14 : W / 2), y = d.y ?? GROUND_Y - 10;
  const WH = ['#ffffff', '#e8f6ff', '#9fd8ff', '#5a8ad0'];
  star(x, y, 11, WH, 0.22);
  ringFx(x, y, 3, 26, WH, 0.26, { thick: 2 });
  slashFx(x, y, 0.7, 1, 34, 3, WH, 0.18);
  slashFx(x, y, -0.7, 1, 34, 3, WH, 0.18);
  radial(x, y, 12, { v0: 160, v1: 340, l0: 0.14, l1: 0.26, p: { type: 'streak', drag: 5, size: 1, len: 0.05, colors: WH, keep: true } });
  radial(x, y, 12, { v0: 40, v1: 160, l0: 0.25, l1: 0.6, p: { type: 'px', g: 360, size: 1, colors: WH, bounce: true } });
  slow(TUNE.slow.parryTime, TUNE.slow.parryScale);
  hitstop(game, TUNE.hitstop.parry);
  addShake(TUNE.shake.parry);
  punchZoom(TUNE.zoom.parry, x, y, TUNE.slow.parryTime);
  screen.flash = Math.max(screen.flash, 0.3);
  screen.flashColor = '#ffffff';
}

export function parryFail(game, d) {
  const x = d.x ?? W / 2, y = d.y ?? GROUND_Y - 10;
  star(x, y, 3, ['#9a9ab0', '#55556a'], 0.14);
  spray(x, y, 1, -1.57, 4, { spread: 1.2, v0: 30, v1: 80, p: { type: 'px', g: 400, size: 1, colors: ['#9a9ab0', '#55556a'] } });
}

export function playerHit(game, d) {
  const p = game.player;
  const x = d.x ?? (p ? p.x : W / 2), y = d.y ?? GROUND_Y - 15;
  const RED = ['#ffffff', '#ff9a8a', '#e0403a', '#8a1a22'];
  star(x, y, 7, RED, 0.18);
  radial(x, y, 10, { v0: 60, v1: 200, l0: 0.2, l1: 0.45, p: { type: 'px', g: 420, size: 1, colors: RED, bounce: true } });
  slashFx(x, y, rand(-0.6, 0.6), 1, 26, 2, RED, 0.14);
  screen.hurt = 1;
  hitstop(game, TUNE.hitstop.playerHit);
  addShake(TUNE.shake.playerHit);
}

export function playerDead() {
  slow(TUNE.slow.deadTime, TUNE.slow.deadScale);
  addShake(TUNE.shake.max);
  screen.hurt = 1;
}

export function punchHit(game, d) {
  const x = d.x ?? W / 2, y = d.y ?? GROUND_Y - 20;
  star(x, y, 3, ['#ffffff', '#c9c1ae'], 0.12);
  dustFx(x, y, game.player ? game.player.facing : 1, -0.3, 3);
  addShake(TUNE.shake.punch);
}

const STEEL = ['#ffffff', '#a9c4e8', '#5a6e90'];

// 아래 셋은 enemies 담당이 따로 만든 이벤트(문자열 이름)에 붙는 연출이다. 발행되지 않으면 아무 일도 없다.
export function brace(game, d) {
  // 격투형이 연타를 막아 냄: 쇳빛 방어 스파크
  const e = d.enemy;
  const x = d.x ?? (e ? e.x : W / 2), y = d.y ?? (e ? e.y - 20 : GROUND_Y - 20);
  star(x, y, 6, STEEL, 0.18);
  ringFx(x, y, 2, 14, STEEL, 0.18);
  radial(x, y, 6, { v0: 50, v1: 140, l0: 0.12, l1: 0.26, p: { type: 'px', g: 300, size: 1, colors: STEEL } });
  addShake(1.5);
}

export function swap(game, d) {
  // 스피드형이 반대편으로 넘어감: 떠난 자리의 먼지와 지나간 바람 줄기
  const e = d.enemy;
  const fromX = d.fromX ?? (e ? e.x : W / 2), toX = d.toX ?? fromX;
  const dir = Math.sign(toX - fromX) || 1;
  for (let i = 0; i < 5; i++) {
    particles.spawn({ type: 'puff', x: fromX + rand(-4, 4), y: GROUND_Y + 1, vx: -dir * rand(20, 70), vy: rand(-26, -4), drag: 3,
      life: rand(0.2, 0.4), size: pick([2, 3]), colors: DUST, back: true });
  }
  for (let i = 0; i < 5; i++) {
    particles.spawn({ type: 'streak', x: fromX + dir * rand(0, 12), y: GROUND_Y - rand(6, 26), vx: dir * rand(260, 420), vy: 0, drag: 5,
      life: rand(0.14, 0.24), size: 1, len: 0.06, colors: ['#ffffff', '#9ae6a0', '#3a8a48'] });
  }
}

export function projectileEnd(game, d) {
  const pr = d.projectile || {};
  const x = d.x ?? pr.x, y = d.y ?? pr.y;
  if (x === undefined || y === undefined) return;
  if (d.reason === 'ground') {
    // 땅에 떨어져 깨지거나 튄다
    const cols = pr.type === 'bottle' ? ['#d8ffe0', '#9ae0a8', '#58b070', '#2a5a3a'] : DUST;
    spray(x, y, 1, -1.57, 7, { spread: 1.3, v0: 40, v1: 130, l0: 0.2, l1: 0.45, p: { type: 'px', g: 500, size: 1, colors: cols, bounce: true } });
  } else if (d.reason === 'enemy') {
    // 되받아친 투척물이 적에게 꽂힘
    star(x, y, 7, GOLD, 0.18);
    ringFx(x, y, 2, 18, GOLD, 0.22);
    radial(x, y, 8, { v0: 60, v1: 180, l0: 0.15, l1: 0.35, p: { type: 'px', g: 360, size: 1, colors: GOLD } });
    addShake(2.5);
  }
}

export function enemyHit(game, d) {
  if (d.armored && d.x !== undefined) { star(d.x, d.y, 4, STEEL, 0.14); return; } // 버티기에 막힌 타격
  // 킥이 아닌 타격(되받아친 투척물 등)도 작은 불똥은 튄다
  if (d.x === undefined) return;
  radial(d.x, d.y, 3, { v0: 40, v1: 110, l0: 0.1, l1: 0.22, p: { type: 'px', g: 300, size: 1, colors: ['#ffffff', '#ffe9a8', '#c9a060'] } });
}

export function enemyDown(game, d) {
  const e = d.enemy;
  const x = d.x ?? (e ? e.x : W / 2);
  const back = e ? -e.facing : 1;
  // 쓰러져 바닥에 닿을 때 이는 먼지
  for (let i = 0; i < 8; i++) {
    particles.spawn({ type: 'puff', x: x + back * rand(4, 26), y: GROUND_Y + 1, vx: rand(-40, 40) + back * 30, vy: rand(-26, -4), drag: 3,
      life: rand(0.3, 0.6), size: pick([2, 3, 4]), colors: DUST, delay: 0.24, back: i % 2 === 0 });
  }
  if (d.crit) addShake(3);
}

export function telegraph(game, d) {
  // 공격 예고: 눈가에 번뜩이는 살기
  const e = d.enemy;
  if (!e) return;
  const parryable = !e.attack || e.attack.parryable !== false;
  star(e.x + e.facing * 4, e.y - (e.h || 30) - 2, 5, parryable ? ['#ffffff', '#ffe45c', '#c98a00'] : ['#ffffff', '#ff6a5a', '#b0201a'], 0.2);
}

export function enemyAttack(game, d) {
  const e = d.enemy;
  if (!e) return;
  if (d.kind === 'dash') {
    // 돌진: 박차고 나가는 흙먼지
    for (let i = 0; i < 6; i++) {
      particles.spawn({ type: 'puff', x: e.x - e.facing * rand(2, 10), y: GROUND_Y + 1, vx: -e.facing * rand(30, 110), vy: rand(-30, -5), drag: 3,
        life: rand(0.2, 0.45), size: pick([2, 3]), colors: DUST, back: true });
    }
  } else if (d.kind !== 'throw') {
    const y = e.y - (d.kind === 'low' ? 5 : (e.h || 30) * 0.75);
    for (let i = 0; i < 2; i++) {
      particles.spawn({ type: 'streak', x: e.x + e.facing * 10, y: y - 1 + i * 3, vx: e.facing * rand(120, 180), vy: 0, drag: 7,
        life: 0.12, size: 1, len: 0.06, colors: ['#ffffff', '#c8c8d8', '#8a8aa0'] });
    }
  }
}

export function kickStart(game, d) {
  // 디딤발에서 이는 먼지 한 줌
  const p = game.player;
  if (!p) return;
  for (let i = 0; i < 2; i++) {
    particles.spawn({ type: 'px', x: p.x - p.facing * rand(1, 5), y: GROUND_Y, vx: -p.facing * rand(20, 60), vy: rand(-50, -15), g: 300,
      life: rand(0.15, 0.3), size: 1, colors: DUST, back: true });
  }
}

export function levelUp(game, d) {
  const p = game.player;
  if (!p) return;
  const lv = clamp(Math.round(d.level || (p.kick && p.kick.level) || 1), 1, 5);
  const L = levelOf(lv);
  const x = p.x, y = p.y;
  screen.pillar = 0.5; screen.pillarX = x; screen.pillarColor = L.main;
  screen.flash = Math.max(screen.flash, 0.4); screen.flashColor = L.main;
  ringFx(x, GROUND_Y + 2, 4, 46, L.colors, 0.5, { ys: 0.24, thick: 3, back: true });
  ringFx(x, GROUND_Y + 2, 4, 70, L.colors, 0.7, { ys: 0.24, thick: 2, back: true, delay: 0.12 });
  ringFx(x, y - 16, 6, 34, L.colors, 0.4, { thick: 2 });
  for (let i = 0; i < 34; i++) {
    particles.spawn({ type: lv === 5 ? 'flame' : 'px', x: x + rand(-13, 13), y: y - rand(0, 10), vx: rand(-14, 14), vy: rand(-240, -70), drag: 1.2,
      life: rand(0.4, 0.9), size: pick([1, 1, 2]), colors: L.colors, delay: rand(0, 0.25), back: i % 3 === 0 });
  }
  // 머리 위에 단계 수만큼 표식이 뜬다
  for (let i = 0; i < lv; i++) {
    particles.spawn({ type: 'pip', x: x + (i - (lv - 1) / 2) * 8, y: y - 46, vx: 0, vy: -10, drag: 2, life: 1.3, colors: [L.main, L.main, L.main, L.colors[L.colors.length - 1]],
      delay: 0.1 + i * 0.07, keep: true });
  }
  hitstop(game, TUNE.hitstop.levelUp);
  addShake(3);
  punchZoom(TUNE.zoom.levelUp, x, y - 18, 0.3);
}

// ── 매 스텝 갱신 (실제 시간) ──
export function update(game, dt) {
  for (let i = queue.length - 1; i >= 0; i--) {
    queue[i].t -= dt;
    if (queue[i].t <= 0) { const q = queue[i]; queue.splice(i, 1); q.fn(); }
  }
  // 흔들림
  cam.shake = Math.max(0, cam.shake - dt * TUNE.shake.decay);
  const amp = Math.min(cam.shake, M - 1);
  cam.sx = Math.round((Math.random() * 2 - 1) * amp);
  cam.sy = Math.round((Math.random() * 2 - 1) * amp * 0.7);

  // 슬로우
  cam.slowT = Math.max(0, cam.slowT - dt);
  game.timeScale = cam.slowT > 0 ? cam.slowScale : 1;

  // 줌
  if (cam.zoomHold > 0) {
    cam.zoomHold -= dt;
    cam.zoom += (cam.zoomTarget - cam.zoom) * Math.min(1, dt * 30);
  } else {
    cam.zoomTarget = 0;
    cam.zoom += (0 - cam.zoom) * Math.min(1, dt * 7);
    if (cam.zoom < 0.002) cam.zoom = 0;
  }

  // 플레이어 따라가기 (보는 방향으로 조금 앞서 본다)
  const p = game.player;
  const width = Math.max(W, game.stage ? game.stage.width : W);
  if (p) {
    cam.look += ((p.facing < 0 ? -1 : 1) * TUNE.camera.lookAhead - cam.look) * Math.min(1, dt * 2.5);
    const target = clamp(p.x + cam.look - W / 2, 0, width - W);
    if (cam.snap) { game.camera.x = target; cam.snap = false; }
    else game.camera.x += (target - game.camera.x) * Math.min(1, dt * TUNE.camera.follow);
  }
  game.camera.x = clamp(game.camera.x, 0, width - W);
  game.camera.y = 0;
  game.camera.zoom = 1 + cam.zoom;

  // 화면 연출 감쇠
  screen.flash = Math.max(0, screen.flash - dt * 4.5);
  if (screen.dimHold > 0) screen.dimHold -= dt; else screen.dim = Math.max(0, screen.dim - dt * 5);
  screen.miss = Math.max(0, screen.miss - dt * 5);
  screen.hurt = Math.max(0, screen.hurt - dt * 3);
  screen.cut = Math.max(0, screen.cut - dt);
  screen.pillar = Math.max(0, screen.pillar - dt);
  const vt = p && p.counterTime > 0 && p.alive !== false ? 1 : 0;
  screen.vign += (vt - screen.vign) * Math.min(1, dt * 10);

  for (let i = decals.length - 1; i >= 0; i--) {
    decals[i].life -= dt;
    if (decals[i].life <= 0) decals.splice(i, 1);
  }

  // 슬로우 중에는 파티클도 천천히 흐른다
  particles.update(dt * (cam.slowT > 0 ? 0.5 : 1));
}

// ── 그리기 ──
// 배경 위에 덮는 어둠 (5단계 암전, 헛발질). 캐릭터보다 먼저 그려서 캐릭터는 밝게 남는다.
export function drawBgDim(g) {
  const a = Math.max(screen.dim, screen.miss * 0.22);
  if (a <= 0.01) return;
  g.fillStyle = `rgba(6,4,14,${a.toFixed(3)})`;
  g.fillRect(0, 0, W + M * 2, H + M * 2);
}

// 바닥 균열 (월드 좌표)
export function drawDecals(g) {
  for (const d of decals) {
    const r = seeded(d.seed);
    const fade = d.life < 1 ? d.life : 1;
    g.globalAlpha = fade;
    const n = 5 + ((d.size / 5) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + r() * 0.8;
      let x = d.x, y = GROUND_Y + 3;
      const len = d.size * (0.5 + r() * 0.7);
      const steps = Math.max(2, (len / 4) | 0);
      for (let s = 0; s < steps; s++) {
        const nx = x + Math.cos(a) * 4 + (r() - 0.5) * 3, ny = y + Math.sin(a) * 1.3 + (r() - 0.5);
        line(g, x, y, nx, ny, s === 0 ? 2 : 1, '#0a0810');
        g.fillStyle = '#6a6480';
        g.fillRect(Math.round(nx), Math.round(ny) + 1, 1, 1);
        x = nx; y = ny;
      }
    }
    g.fillStyle = '#0a0810';
    g.fillRect(Math.round(d.x) - 2, GROUND_Y + 2, 5, 2);
    g.globalAlpha = 1;
  }
}

// 단계 상승 빛기둥 (월드 좌표, 캐릭터 뒤)
export function drawPillar(g) {
  if (screen.pillar <= 0) return;
  const k = screen.pillar / 0.5;
  const w = Math.round(22 * k);
  const x = Math.round(screen.pillarX);
  g.globalAlpha = 0.35;
  g.fillStyle = screen.pillarColor;
  g.fillRect(x - w, -M, w * 2, GROUND_Y + M + 2);
  g.globalAlpha = 0.6;
  g.fillRect(x - (w >> 1), -M, w, GROUND_Y + M + 2);
  g.globalAlpha = 0.9;
  g.fillStyle = '#ffffff';
  g.fillRect(x - (w >> 2), -M, Math.max(1, w >> 1), GROUND_Y + M + 2);
  g.globalAlpha = 1;
}

// 가장자리 기운 (붉은 테두리). 4x4 바이어 디더로 픽셀 느낌을 살려 미리 만들어 둔다.
let vignette = null;
function makeVignette() {
  const [c, g] = makeCanvas(W + M * 2, H + M * 2, 1);
  const img = g.createImageData(c.width, c.height);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const nx = (x / c.width) * 2 - 1, ny = (y / c.height) * 2 - 1;
      const d = Math.max(Math.abs(nx) ** 3, Math.abs(ny) ** 2.2, (nx * nx + ny * ny) * 0.62);
      const v = clamp((d - 0.42) / 0.58);
      const q = Math.floor(v * 5 + bayer[(y & 3) * 4 + (x & 3)] / 16) / 5; // 5단계로 끊고 디더
      const i = (y * c.width + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 40; img.data[i + 2] = 40;
      img.data[i + 3] = Math.round(clamp(q) * 230);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 화면 전체 연출 (장면 버퍼 좌표. 변환 없는 상태에서 부른다)
export function drawOverlays(g, game, time) {
  const FW = W + M * 2, FH = H + M * 2;
  // 임팩트 컷: 타격점을 지나 화면을 가로지르는 선
  if (screen.cut > 0) {
    const k = screen.cut / 0.24;
    const cx = screen.cutX - game.camera.x + M, cy = screen.cutY + M;
    const a = screen.cutAng * 0.5, dx = Math.cos(a) * screen.cutDir, dy = Math.sin(a) - 0.12;
    const wid = Math.max(1, Math.round(7 * k));
    line(g, cx - dx * 600, cy - dy * 600, cx + dx * 600, cy + dy * 600, wid, '#ffb020');
    line(g, cx - dx * 600, cy - dy * 600, cx + dx * 600, cy + dy * 600, Math.max(1, wid - 3), '#fff6c8');
    if (k > 0.5) {
      line(g, cx - dx * 600, cy - dy * 600 - 9, cx + dx * 600, cy + dy * 600 - 9, 1, '#ffd84d');
      line(g, cx - dx * 600, cy - dy * 600 + 11, cx + dx * 600, cy + dy * 600 + 11, 1, '#ffd84d');
    }
  }
  const vg = Math.max(screen.vign * (0.5 + 0.12 * Math.sin(time * 9)), screen.hurt * 0.85);
  if (vg > 0.01) {
    if (!vignette) vignette = makeVignette();
    g.globalAlpha = clamp(vg);
    blit(g, vignette, 0, 0);
    g.globalAlpha = 1;
  }
  if (screen.flash > 0.01) {
    g.globalAlpha = clamp(screen.flash);
    g.fillStyle = screen.flashColor;
    g.fillRect(0, 0, FW, FH);
    g.globalAlpha = 1;
  }
}
