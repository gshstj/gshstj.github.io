// 2인 대전 (한 키보드를 둘이 나눠 쓴다). 기획은 대전_기획서.md.
// 내보내기: startMatch(game), update(game, dt), drawHud(ctx, game, time)
// game.pvp = { fighters: [1P, 2P], phase: 'intro'|'fight'|'ko'|'result', round, wins, time, overtime, winner, matchWinner }
import { W, H } from '../core/config.js';
import { emit } from '../core/events.js';
import { text, rich } from '../ui/text.js';
import { PV } from './tuning.js';
import { createFighter, stepFighter, applyHits } from './fighter.js';

export const PVP_EV = { ROUND_START: 'pvp:round', OVERTIME: 'pvp:overtime', KO: 'pvp:ko' };

const STAGE = { id: 'pvp', name: '2인 대전', width: W, bg: 'alley', waves: [] };

// 키 입력. 공용 입력은 WASD와 방향키를 한 사람 것으로 합쳐 버리므로, 대전은 키 코드를 직접 본다.
const held = new Set();
const pressedAt = {}; // code -> 눌린 시각(ms). 히트스톱 중에 눌러도 사라지지 않게 시각으로 기억한다
let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  addEventListener('keydown', (e) => {
    if (e.code === 'ArrowDown') e.preventDefault(); // 2P 가드 키로 화면이 스크롤되지 않게
    if (e.repeat) return;
    held.add(e.code);
    pressedAt[e.code] = performance.now();
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());
}
function took(code) {
  const t = pressedAt[code];
  if (!t) return false;
  pressedAt[code] = 0;
  return performance.now() - t < PV.latchMs;
}
function readInput(i) {
  const K = PV.keys[i];
  return { dir: (held.has(K.right) ? 1 : 0) - (held.has(K.left) ? 1 : 0), kick: took(K.kick), jump: took(K.jump), jumpHeld: held.has(K.jump), guard: held.has(K.guard) };
}
const NONE = { dir: 0, kick: false, jump: false, jumpHeld: false, guard: false };

function startRound(game) {
  const s = game.pvp;
  s.fighters = [createFighter(0, W / 2 - PV.startGap, 1), createFighter(1, W / 2 + PV.startGap, -1)];
  s.phase = 'intro';
  s.phaseTime = 0;
  s.time = 0;
  s.overtime = false;
  s.winner = -1;
  for (const k of Object.keys(pressedAt)) pressedAt[k] = 0;
  emit(PVP_EV.ROUND_START, { round: s.round });
}

export function startMatch(game) {
  hook();
  game.stage = STAGE;
  game.stageIndex = 0;
  game.enemies.length = 0;
  game.projectiles.length = 0;
  game.pvp = { fighters: [], phase: 'intro', phaseTime: 0, round: 1, wins: [0, 0], time: 0, overtime: false, winner: -1, matchWinner: -1 };
  startRound(game);
}

// 결과 화면에서 다시 붙는다
export function rematch(game) { startMatch(game); }

function separate(a, b) {
  if (!a.alive || !b.alive || !a.onGround || !b.onGround) return;
  const dx = b.x - a.x;
  if (Math.abs(dx) >= PV.bodyGap) return;
  const push = (PV.bodyGap - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
  a.x -= push;
  b.x += push;
}

export function update(game, dt) {
  const s = game.pvp;
  if (!s) return;
  const [a, b] = s.fighters;
  s.phaseTime += dt;
  const fighting = s.phase === 'fight';
  if (fighting) {
    s.time += dt;
    if (!s.overtime && s.time >= PV.overtimeAt) {
      s.overtime = true;
      s.overtimeFlash = 2.2;
      emit(PVP_EV.OVERTIME, {});
    }
  }
  s.overtimeFlash = Math.max(0, (s.overtimeFlash || 0) - dt);

  const hits = [];
  stepFighter(game, a, b, fighting ? readInput(0) : NONE, dt, hits);
  stepFighter(game, b, a, fighting ? readInput(1) : NONE, dt, hits);
  applyHits(hits, s.overtime ? PV.overtimeMult : 1);
  separate(a, b);

  if (s.phase === 'intro') {
    if (s.phaseTime >= PV.introTime) { s.phase = 'fight'; s.phaseTime = 0; }
  } else if (fighting) {
    if (!a.alive || !b.alive) {
      s.phase = 'ko';
      s.phaseTime = 0;
      s.winner = a.alive ? 0 : b.alive ? 1 : -1; // 둘 다 쓰러지면 무승부
      if (s.winner >= 0) s.wins[s.winner]++;
      emit(PVP_EV.KO, { winner: s.winner });
    }
  } else if (s.phase === 'ko') {
    if (s.phaseTime >= PV.koTime) {
      const champ = s.wins.findIndex((w) => w >= PV.roundsToWin);
      if (champ >= 0) { s.phase = 'result'; s.phaseTime = 0; s.matchWinner = champ; }
      else { s.round++; startRound(game); }
    }
  }
}

// ── 화면 ──
function hpBar(ctx, f, x, w, flip, color) {
  const r = Math.max(0, Math.min(1, f.hp / f.maxHp));
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - 1, 11, w + 2, 10);
  ctx.fillStyle = '#2a2a38';
  ctx.fillRect(x, 12, w, 8);
  const fw = Math.round(w * r);
  ctx.fillStyle = f.flash > 0 ? '#ffffff' : color;
  ctx.fillRect(flip ? x + w - fw : x, 12, fw, 8);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(flip ? x + w - fw : x, 12, fw, 2);
}

export function drawHud(ctx, game, t) {
  const s = game.pvp;
  if (!s || !s.fighters.length) return;
  const [a, b] = s.fighters;
  const bw = 180;
  hpBar(ctx, a, 12, bw, false, PV.colors[0]);
  hpBar(ctx, b, W - 12 - bw, bw, true, PV.colors[1]);
  text(ctx, `1P ${PV.names[0]}`, 12, 32, { size: 10, bold: true, color: PV.colors[0] });
  text(ctx, `2P ${PV.names[1]}`, W - 12, 32, { size: 10, bold: true, align: 'right', color: PV.colors[1] });
  // 이긴 라운드 표시
  for (let i = 0; i < PV.roundsToWin; i++) {
    ctx.fillStyle = i < s.wins[0] ? '#ffd84d' : '#3a3a4a';
    ctx.fillRect(12 + bw - 8 - i * 10, 25, 7, 7);
    ctx.fillStyle = i < s.wins[1] ? '#ffd84d' : '#3a3a4a';
    ctx.fillRect(W - 12 - bw + 1 + i * 10, 25, 7, 7);
  }
  // 궁극기 게이지: 준 데미지만큼 찬다. 다 차면 금색으로 깜빡인다
  const mw = 110;
  s.fighters.forEach((f, i) => {
    const r = Math.max(0, Math.min(1, f.meter / PV.ult.cost));
    const x = i === 0 ? 12 : W - 12 - mw;
    const fw = Math.round(mw * r);
    const full = r >= 1;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, 36, mw + 2, 5);
    ctx.fillStyle = full ? (Math.floor(t * 8) % 2 ? '#ffd84d' : '#fff6c8') : '#b08a2a';
    ctx.fillRect(i === 0 ? x : x + mw - fw, 37, fw, 3);
    if (full) text(ctx, i === 0 ? '궁극기! S+F' : '궁극기! ↓+K', i === 0 ? x : x + mw, 50, { size: 8, bold: true, align: i === 0 ? 'left' : 'right', color: '#ffd84d' });
  });
  // 시계. 60초가 지나면 붉어지고 "x2"가 붙는다
  const sec = Math.floor(s.time);
  text(ctx, String(sec), W / 2, 22, { size: 14, bold: true, align: 'center', color: s.overtime ? '#ff5a5a' : '#f4f4fa' });
  if (s.overtime) text(ctx, '데미지 x2', W / 2, 34, { size: 9, bold: true, align: 'center', color: '#ff8a5a' });
  else text(ctx, `${PV.overtimeAt}초부터 x2`, W / 2, 33, { size: 8, align: 'center', color: '#8a8aa0' });
  // 공격 불능 표시
  for (const f of s.fighters) {
    if (f.alive && f.noAttack > 0) {
      const sx = f.x - (game.camera.x || 0);
      text(ctx, '공격 불가', sx, f.y - f.h - 14, { size: 8, bold: true, align: 'center', color: '#ffb0b0' });
    }
  }

  const big = (str, color, sub) => {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 92, W, sub ? 60 : 44);
    text(ctx, str, W / 2, 124, { size: 28, bold: true, align: 'center', color });
    if (sub) rich(ctx, sub, W / 2, 144, { size: 11, align: 'center', color: '#e8e8f0' });
  };
  if (s.phase === 'intro') {
    big(s.phaseTime < PV.introTime - 0.5 ? `ROUND ${s.round}` : 'FIGHT!', '#ffd84d');
  } else if (s.phase === 'fight' && s.overtimeFlash > 0 && Math.floor(s.overtimeFlash * 6) % 2 === 0) {
    big('데미지 2배!', '#ff5a5a');
  } else if (s.phase === 'ko') {
    big(s.winner < 0 ? '무승부' : 'K.O.', s.winner < 0 ? '#e8e8f0' : PV.colors[s.winner], s.winner < 0 ? '' : `${s.winner + 1}P ${PV.names[s.winner]} 승`);
  } else if (s.phase === 'result') {
    big(`${s.matchWinner + 1}P ${PV.names[s.matchWinner]} 우승!`, PV.colors[s.matchWinner], '[Enter] 다시 붙기   [Esc] 타이틀로');
  }

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, H - 19, W, 19);
  rich(ctx, '1P [A][D] 이동 [W] 점프 [S] 가드 [F] 킥', 8, H - 6, { size: 8, color: '#a8c4ff' });
  rich(ctx, '2P [←][→] 이동 [↑] 점프 [↓] 가드 [K] 킥', W - 8, H - 6, { size: 8, align: 'right', color: '#ffb0b0' });
}
