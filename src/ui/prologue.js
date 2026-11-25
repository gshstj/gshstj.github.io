// [D 담당] 프롤로그. 기획서 2장의 내용을 몇 컷의 글과 실루엣 연출로 보여준다.
// Enter: 글이 다 안 나왔으면 한 번에 보여주고, 다 나왔으면 다음 컷. Enter 길게 또는 Esc: 건너뛰기.
import { W, H } from '../core/config.js';
import { pressed, down } from '../core/input.js';
import { text, rich } from './text.js';
import { figure } from './figures.js';
import { T } from './tuning.js';

// 그림이 들어가는 창 (화면 좌표)과 그 안에서의 바닥 높이
const VX = 40, VY = 18, VW = 400, VH = 150, GY = 126;

const HERO = { who: 'hero' };
const SENIOR = { who: 'senior' };
const THUG = { who: 'brawler' };
const SHADOW = '#07070c'; // 어둠 속 실루엣 색

const ease = (v) => Math.max(0, Math.min(1, v));

// ---- 배경 ----

function hallway(ctx) {
  ctx.fillStyle = '#1b1d2c';
  ctx.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 5; i++) {
    const x = 18 + i * 80;
    ctx.fillStyle = '#2b3350';
    ctx.fillRect(x, 20, 52, 46);
    ctx.fillStyle = '#1b1d2c';
    ctx.fillRect(x + 25, 20, 2, 46);
    ctx.fillRect(x, 42, 52, 2);
  }
  ctx.fillStyle = '#242636';
  ctx.fillRect(0, GY, VW, VH - GY);
  ctx.fillStyle = '#34374c';
  ctx.fillRect(0, GY, VW, 1);
}

function alley(ctx) {
  ctx.fillStyle = '#12141f';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#1d2133';
  ctx.fillRect(80, 30, 240, GY - 30);
  ctx.fillStyle = '#232840';
  for (let y = 40; y < GY; y += 12) ctx.fillRect(80, y, 240, 1);
  // 가로등 빛
  ctx.fillStyle = 'rgba(255,214,120,0.10)';
  ctx.beginPath();
  ctx.moveTo(296, 26);
  ctx.lineTo(150, GY);
  ctx.lineTo(320, GY);
  ctx.closePath();
  ctx.fill();
  // 양쪽 벽
  ctx.fillStyle = '#0a0b12';
  ctx.fillRect(0, 0, 80, VH);
  ctx.fillRect(320, 0, 80, VH);
  ctx.fillRect(298, 22, 24, 2);
  ctx.fillStyle = '#ffd678';
  ctx.fillRect(292, 22, 8, 3);
  // 바닥과 쓰레기통
  ctx.fillStyle = '#191b29';
  ctx.fillRect(0, GY, VW, VH - GY);
  ctx.fillStyle = '#2a2d42';
  ctx.fillRect(80, GY, 240, 1);
  ctx.fillStyle = '#0f1019';
  ctx.fillRect(96, GY - 18, 14, 18);
  ctx.fillRect(94, GY - 20, 18, 3);
}

// ---- 컷 ----

// 1. 가장 약한 놈: 움츠린 주인공과 양옆의 덩치들
function cutWeak(ctx, t) {
  hallway(ctx);
  const bob = Math.round(Math.sin(t * 2.2) * 1.5);
  figure(ctx, 124, GY + 4 + bob, { ...THUG, pose: 'loom', scale: 2, facing: 1, dark: SHADOW });
  figure(ctx, 280, GY + 4 - bob, { ...THUG, pose: 'loom', scale: 2, facing: -1, dark: SHADOW });
  const shiver = Math.floor(t * 12) % 2;
  figure(ctx, 202 + shiver, GY, { ...HERO, pose: 'hunch', scale: 2, facing: 1 });
}

// 2. 맞고 밀리는 날들: 밀쳐져 쓰러지고, 덩치들은 등을 돌려 떠난다
function cutBeaten(ctx, t) {
  hallway(ctx);
  ctx.fillStyle = 'rgba(90,10,20,0.18)';
  ctx.fillRect(0, 0, VW, VH);
  const away = Math.max(0, t - 0.5) * 14;
  ctx.globalAlpha = ease(1.2 - away / 90);
  figure(ctx, 262 + away, GY + 4, { ...THUG, pose: 'walk', scale: 2, facing: 1, t, dark: SHADOW });
  figure(ctx, 316 + away * 1.2, GY + 4, { ...THUG, pose: 'walk', scale: 2, facing: 1, t: t + 0.4, dark: SHADOW });
  ctx.globalAlpha = 1;
  if (t < 0.3) {
    figure(ctx, 214 - t * 60, GY, { ...HERO, pose: 'hunch', scale: 2, facing: 1 });
  } else {
    figure(ctx, 190, GY, { ...HERO, pose: 'down', scale: 2, facing: 1 });
  }
  if (t > 0.26 && t < 0.42) {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - (t - 0.26) / 0.16)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

// 3. 골목 끝의 선배: 주머니에 손을 넣고 덩치 앞에 서 있다. 앞쪽 어둠 속에서 주인공이 본다.
function cutAlley(ctx, t) {
  alley(ctx);
  figure(ctx, 186, GY, { ...SENIOR, pose: 'stand', scale: 2, facing: 1, t });
  figure(ctx, 252 - Math.min(8, t * 6), GY, { ...THUG, pose: 'stand', scale: 2, facing: -1, t });
  figure(ctx, 34, GY + 96, { ...HERO, pose: 'stand', scale: 4, facing: 1, dark: SHADOW });
}

// 4. 발차기 한 번: 카프킥, 번쩍, 덩치가 넘어간다
function cutKick(ctx, t) {
  const hitT = 0.75;
  const fall = ease((t - hitT - 0.05) / 0.45);
  const landed = t - (hitT + 0.5);
  let sx = 0, sy = 0;
  if (t > hitT && t < hitT + 0.15) { sx = (Math.random() - 0.5) * 6; sy = (Math.random() - 0.5) * 4; }
  if (landed > 0 && landed < 0.15) sy = (Math.random() - 0.5) * 6;
  ctx.save();
  ctx.translate(Math.round(sx), Math.round(sy));
  alley(ctx);
  const kicking = t > hitT - 0.07 && t < hitT + 0.3;
  figure(ctx, 190, GY, { ...SENIOR, pose: kicking ? 'kick' : 'stand', scale: 2, facing: 1 });
  figure(ctx, 244 + fall * 10, GY, { ...THUG, pose: fall > 0 ? 'down' : 'stand', scale: 2, facing: -1, fall });
  // 발 궤적과 타격 불꽃
  if (kicking) {
    const a = 1 - ease((t - hitT) / 0.3);
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(182, GY - 10);
    ctx.quadraticCurveTo(204, GY - 36, 234, GY - 12);
    ctx.stroke();
    if (t > hitT) {
      ctx.fillStyle = `rgba(255,216,77,${a})`;
      const r = 4 + (t - hitT) * 60;
      for (let i = 0; i < 8; i++) {
        const ang = i * Math.PI / 4 + 0.3;
        ctx.fillRect(Math.round(234 + Math.cos(ang) * r) - 1, Math.round(GY - 10 + Math.sin(ang) * r) - 1, 3, 3);
      }
    }
  }
  // 넘어지며 이는 먼지
  if (landed > 0 && landed < 0.6) {
    ctx.fillStyle = `rgba(170,170,190,${0.6 * (1 - landed / 0.6)})`;
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(256 + i * 12 + landed * (i - 2) * 20), Math.round(GY - 3 - landed * (10 + i * 3)), 4, 3);
  }
  ctx.restore();
  if (t > hitT && t < hitT + 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${1 - (t - hitT) / 0.1})`;
    ctx.fillRect(0, 0, VW, VH);
  }
}

// 5. 다짐: 가로등 아래, 주머니에 손을 넣은 주인공
function cutVow(ctx, t) {
  ctx.fillStyle = '#0c0d15';
  ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = 'rgba(255,214,120,0.09)';
  ctx.beginPath();
  ctx.moveTo(190, 0);
  ctx.lineTo(210, 0);
  ctx.lineTo(280, GY);
  ctx.lineTo(120, GY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#171927';
  ctx.fillRect(0, GY, VW, VH - GY);
  ctx.fillStyle = 'rgba(255,214,120,0.12)';
  ctx.fillRect(120, GY, 160, 2);
  figure(ctx, 200, GY, { ...HERO, pose: 'stand', scale: 3, facing: 1, t });
}

// 6. 카프킥 마스터가 되겠다: 금빛 속에서 한 번 찬다
function cutMaster(ctx, t) {
  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, VW, VH);
  const glow = ease(t / 1.2);
  for (let i = 4; i >= 1; i--) {
    ctx.fillStyle = `rgba(255,190,70,${0.05 * glow})`;
    ctx.beginPath();
    ctx.arc(200, GY - 50, 24 * i + Math.sin(t * 2 + i) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,216,77,${0.5 * glow})`;
  ctx.fillRect(110, GY, 180, 1);
  const kicking = t > 0.7;
  figure(ctx, 190, GY, { ...HERO, pose: kicking ? 'kick' : 'stand', scale: 3, facing: 1, t });
  if (kicking) {
    const a = 0.35 + 0.65 * (1 - ease((t - 0.7) / 0.5));
    ctx.strokeStyle = `rgba(255,216,77,${a})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(178, GY - 14);
    ctx.quadraticCurveTo(210, GY - 56, 258, GY - 18);
    ctx.stroke();
  }
}

const CUTS = [
  { lines: ['학교에서 가장 약한 놈.', '그게 나였다.'], draw: cutWeak },
  { lines: ['맞고, 밀리고, 무시당하는 날들이 이어졌다.'], draw: cutBeaten },
  { lines: ['어느 날, 골목 끝에서 한 선배를 봤다.', '덩치 앞에서도 주머니에서 손을 빼지 않았다.'], draw: cutAlley },
  { lines: ['발차기 한 번.', '그걸로 덩치가 쓰러졌다.'], draw: cutKick },
  { lines: ['나는 주머니에서 손을 빼지 않은 채 중얼거렸다.', '"발로 이기는 놈이 되겠다."'], draw: cutVow },
  { lines: ['"카프킥 마스터가 되겠다."'], draw: cutMaster, big: true },
];

export const CUT_COUNT = CUTS.length;
export function drawCutAt(ctx, index, t) { CUTS[index].draw(ctx, t); }

const s = { cut: 0, t: 0, reveal: false, hold: 0, armed: false, dip: 0 };

const totalChars = (cut) => cut.lines.reduce((n, l) => n + l.length, 0);

export function enterPrologue() {
  Object.assign(s, { cut: 0, t: 0, reveal: false, hold: 0, armed: false, dip: T.cutDip });
}

// 끝났으면(마지막 컷을 넘겼거나 건너뛰었으면) true
export function updatePrologue(dt, canInput) {
  s.t += dt;
  s.dip = Math.max(0, s.dip - dt);
  if (!canInput) return false;
  if (pressed('pause')) return true;

  // Enter 길게 누르기. 이 장면에서 새로 누른 것만 센다.
  if (pressed('confirm')) s.armed = true;
  if (s.armed && down('confirm')) {
    s.hold += dt;
    if (s.hold >= T.holdSkip) return true;
  } else {
    s.hold = 0;
    s.armed = false;
  }

  if (pressed('confirm')) {
    const cut = CUTS[s.cut];
    if (!s.reveal && s.t * T.typeSpeed < totalChars(cut)) {
      s.reveal = true;
    } else if (s.cut < CUTS.length - 1) {
      s.cut++;
      s.t = 0;
      s.reveal = false;
      s.dip = T.cutDip;
    } else {
      return true;
    }
  }
  return false;
}

export function drawPrologue(ctx) {
  const cut = CUTS[s.cut];
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // 그림
  ctx.save();
  ctx.beginPath();
  ctx.rect(VX, VY, VW, VH);
  ctx.clip();
  ctx.translate(VX, VY);
  cut.draw(ctx, s.t);
  ctx.restore();
  if (s.dip > 0) {
    ctx.fillStyle = `rgba(0,0,0,${s.dip / T.cutDip})`;
    ctx.fillRect(VX, VY, VW, VH);
  }

  // 글 (한 글자씩 나온다)
  const total = totalChars(cut);
  let left = s.reveal ? total : Math.floor(s.t * T.typeSpeed);
  const size = cut.big ? 18 : 12;
  let y = cut.big ? 212 : (cut.lines.length > 1 ? 196 : 205);
  for (const line of cut.lines) {
    const shown = line.slice(0, Math.max(0, left));
    left -= line.length;
    const quote = line.startsWith('"');
    if (shown) text(ctx, shown, W / 2, y, { size, align: 'center', bold: quote, color: quote ? '#ffd84d' : '#eeeef4' });
    y += size + 7;
  }

  // 진행 표시
  for (let i = 0; i < CUTS.length; i++) {
    ctx.fillStyle = i === s.cut ? '#ffd84d' : i < s.cut ? '#8a8aa0' : '#33333f';
    ctx.fillRect(W / 2 - CUTS.length * 5 + i * 10, 250, 6, 2);
  }
  if (left >= 0 && Math.floor(s.t * 2.5) % 2 === 0) {
    rich(ctx, s.cut < CUTS.length - 1 ? '[Enter] 다음' : '[Enter] 시작', W - 44, 256, { size: 10, align: 'right', color: '#e8e8f0' });
  }

  // 건너뛰기 안내와 길게 누르기 게이지
  rich(ctx, '[Esc] 건너뛰기', W - 44, 13, { size: 10, align: 'right', color: '#8a8aa0' });
  if (s.hold > 0.12) {
    const r = Math.min(1, s.hold / T.holdSkip);
    text(ctx, '건너뛰는 중', VX, 13, { size: 10, color: '#e8e8f0' });
    ctx.fillStyle = '#33333f';
    ctx.fillRect(VX + 62, 7, 60, 4);
    ctx.fillStyle = '#ffd84d';
    ctx.fillRect(VX + 62, 7, Math.round(60 * r), 4);
  }
}
