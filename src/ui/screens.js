// [D 담당] 전투 밖의 화면: 타이틀, 일시정지, 게임오버, 스테이지 클리어, 엔딩.
import { W, H } from '../core/config.js';
import { text, rich, panel, mmss } from './text.js';
import { figure } from './figures.js';
import { KICK_LEVELS } from './hud.js';

const blink = (t, speed = 2.5) => Math.floor(t * speed) % 2 === 0;
const fadeIn = (t, dur = 0.3) => Math.max(0, Math.min(1, t / dur));

export function drawTitle(ctx, t, character = 'blue', charFlash = 0) {
  ctx.fillStyle = '#0d0e18';
  ctx.fillRect(0, 0, W, H);
  // 가로등 빛
  ctx.fillStyle = 'rgba(255,200,90,0.07)';
  ctx.beginPath();
  ctx.moveTo(350, 0);
  ctx.lineTo(380, 0);
  ctx.lineTo(470, 214);
  ctx.lineTo(240, 214);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#151624';
  ctx.fillRect(0, 214, W, H - 214);
  ctx.fillStyle = '#2a2c40';
  ctx.fillRect(0, 214, W, 1);

  // 주머니에 손을 넣은 채 차는 주인공
  // 발이 지나간 궤적 (인물 뒤에 깔린다)
  const a = 0.55 + Math.sin(t * 3) * 0.25;
  // 바닥을 스치듯 휘두른 초승달 모양. 발끝(왼쪽)으로 갈수록 굵어진다.
  const crescent = (cx, cy, rx, ry, thick, color) => {
    const n = 28, a0 = Math.PI * 0.08, a1 = Math.PI * 0.99;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, ang = a0 + (a1 - a0) * k, w = thick * Math.pow(k, 1.4);
      pts.push([cx + rx * Math.cos(ang), cy + (ry + w / 2) * Math.sin(ang), cx + (rx - w) * Math.cos(ang), cy + (ry - w / 2) * Math.sin(ang)]);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][2], pts[i][3]);
    ctx.closePath();
    ctx.fill();
  };
  crescent(356, 194, 84, 15, 12, `rgba(255,170,40,${a * 0.55})`);
  crescent(356, 194, 84, 14, 8, `rgba(255,216,77,${a})`);
  crescent(356, 194, 84, 13, 3, `rgba(255,255,255,${a})`);
  figure(ctx, 372, 214, { who: 'hero', pose: 'kick', scale: 4, facing: -1 });

  text(ctx, '카프킥', 36, 92, { size: 44, bold: true, color: '#f4f4fa' });
  text(ctx, '마스터', 36, 140, { size: 44, bold: true, color: '#ffd84d' });
  text(ctx, '주머니에서 손은 빼지 않는다. 발 하나로 일짱까지.', 38, 162, { size: 11, color: '#b8b8c8' });
  if (blink(t)) rich(ctx, '[Enter] 스토리 시작', 38, 188, { size: 12, color: '#ffffff' });
  rich(ctx, '[B] 점수 모드 (끝없이 버티기)', 38, 203, { size: 11, color: '#ffe0a0' });
  rich(ctx, '[V] 2인 대전 (한 키보드로 둘이)', 38, 218, { size: 11, color: '#c8d4ff' });
  // 캐릭터 고르기: 고른 쪽이 오른쪽 그림으로 나온다
  const red = character === 'red';
  rich(ctx, '[C] 캐릭터', 38, 233, { size: 11, color: '#e8e8f0' });
  text(ctx, '파란 바지', 108, 233, { size: 11, bold: !red, color: !red ? '#7ab0ff' : '#5a5a70' });
  text(ctx, '/', 158, 233, { size: 11, color: '#5a5a70' });
  text(ctx, '빨간 바지 (카포에라)', 168, 233, { size: 11, bold: red, color: red ? '#ff7a7a' : '#5a5a70' });
  if (charFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, charFlash)})`;
    ctx.fillRect(300, 60, 150, 156);
  }
  rich(ctx, '[A][D] 이동  [W] 점프  [J] 견제  [K] 킥  [Esc] 일시정지', W / 2, 254, { size: 10, align: 'center', color: '#9a9ab0' });
}

// 점수 모드에서 쓰러졌을 때: 점수와 최고 기록
export function drawScoreOver(ctx, t, s) {
  const a = fadeIn(t, 0.4);
  ctx.fillStyle = `rgba(10,6,14,${0.8 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  text(ctx, '무한 골목', W / 2, 62, { size: 12, align: 'center', color: '#b8b8c8' });
  text(ctx, String(s.score), W / 2, 104, { size: 36, bold: true, align: 'center', color: '#ffd84d' });
  text(ctx, `웨이브 ${s.wave} · 쓰러뜨린 적 ${s.kills}`, W / 2, 126, { size: 11, align: 'center', color: '#eeeef4' });
  if (s.newBest) text(ctx, '최고 기록 갱신!', W / 2, 148, { size: 14, bold: true, align: 'center', color: blink(t, 4) ? '#ffffff' : '#ff8a5a' });
  else text(ctx, `최고 기록 ${s.best} (웨이브 ${s.bestWave})`, W / 2, 147, { size: 10, align: 'center', color: '#a8a8b8' });
  rich(ctx, '[Enter] 다시 도전', W / 2, 178, { size: 12, align: 'center' });
  rich(ctx, '[Esc] 타이틀로', W / 2, 198, { size: 10, align: 'center', color: '#a8a8b8' });
  ctx.globalAlpha = 1;
}

const PAUSE_ITEMS =['계속하기', '처음부터 다시', '타이틀로'];
export const PAUSE_COUNT = PAUSE_ITEMS.length;

export function drawPause(ctx, sel) {
  ctx.fillStyle = 'rgba(4,4,10,0.72)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, '일시정지', W / 2, 108, { size: 22, bold: true, align: 'center' });
  const iw = 96, gap = 8;
  const x0 = Math.round(W / 2 - (PAUSE_ITEMS.length * iw + (PAUSE_ITEMS.length - 1) * gap) / 2);
  PAUSE_ITEMS.forEach((label, i) => {
    const x = x0 + i * (iw + gap);
    const on = i === sel;
    panel(ctx, x, 130, iw, 24, on ? '#ffd84d' : '#44445a');
    if (on) {
      ctx.fillStyle = 'rgba(255,216,77,0.16)';
      ctx.fillRect(x + 1, 131, iw - 2, 22);
    }
    text(ctx, label, x + iw / 2, 146, { size: 11, bold: on, align: 'center', color: on ? '#ffd84d' : '#b0b0c0' });
  });
  rich(ctx, '[A][D] 선택  [Enter] 결정  [Esc] 계속하기', W / 2, 180, { size: 10, align: 'center', color: '#c8c8d8' });
}

// restartWave: 0이면 스테이지 처음부터, 아니면 그 웨이브(0부터)에서 재도전
export function drawGameOver(ctx, t, restartWave) {
  const a = fadeIn(t, 0.4);
  ctx.fillStyle = `rgba(14,2,6,${0.74 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  text(ctx, '패배', W / 2, 108, { size: 32, bold: true, align: 'center', color: '#e8444c' });
  text(ctx, '아직 발이 무르다.', W / 2, 130, { size: 11, align: 'center', color: '#c8b8bc' });
  const where = restartWave > 0 ? `체크포인트(웨이브 ${restartWave + 1})부터 재도전` : '스테이지 처음부터 재도전';
  rich(ctx, `[Enter] ${where}`, W / 2, 164, { size: 12, align: 'center' });
  rich(ctx, '[Esc] 타이틀로', W / 2, 184, { size: 10, align: 'center', color: '#a8a8b8' });
  ctx.globalAlpha = 1;
}

// info = { stageName, index, stats: { time, hits, parries, retries }, kickLevel, nextName }
export function drawStageClear(ctx, t, info) {
  const a = fadeIn(t, 0.35);
  ctx.fillStyle = `rgba(4,4,10,${0.62 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a;
  const x = W / 2 - 140, y = 52, w = 280, h = 150;
  panel(ctx, x, y, w, h, '#ffd84d');
  text(ctx, '스테이지 클리어', W / 2, y + 30, { size: 22, bold: true, align: 'center', color: '#ffd84d' });
  text(ctx, `STAGE ${info.index + 1} · ${info.stageName}`, W / 2, y + 48, { size: 11, align: 'center', color: '#d8d8e4' });
  ctx.fillStyle = '#3a3a50';
  ctx.fillRect(x + 20, y + 57, w - 40, 1);

  const s = info.stats;
  const cols = [['시간', mmss(s.time)], ['맞은 횟수', String(s.hits)], ['패링', String(s.parries)], ['재도전', String(s.retries)]];
  cols.forEach(([label, value], i) => {
    const cx = x + 35 + i * 70;
    text(ctx, label, cx, y + 74, { size: 10, align: 'center', color: '#9a9ab0' });
    text(ctx, value, cx, y + 90, { size: 13, bold: true, align: 'center' });
  });
  const lv = KICK_LEVELS[Math.max(1, Math.min(5, info.kickLevel)) - 1];
  text(ctx, `카프킥 ${info.kickLevel}단계 · ${lv.name}`, W / 2, y + 110, { size: 11, align: 'center', color: lv.color });

  if (t > 0.5 && blink(t)) {
    const label = info.nextName ? `[Enter] 다음 스테이지 · ${info.nextName}` : '[Enter] 계속';
    rich(ctx, label, W / 2, y + 134, { size: 12, align: 'center' });
  }
  ctx.globalAlpha = 1;
}

export function drawEnding(ctx, t) {
  ctx.fillStyle = '#08080d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,200,90,0.07)';
  ctx.beginPath();
  ctx.moveTo(88, 0);
  ctx.lineTo(112, 0);
  ctx.lineTo(180, 214);
  ctx.lineTo(20, 214);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#12131e';
  ctx.fillRect(0, 214, W, H - 214);
  ctx.fillStyle = '#2a2c40';
  ctx.fillRect(0, 214, W, 1);
  // 브라질리언 킥을 찬 채 선 1세대 발 마스터
  figure(ctx, 92, 214, { who: 'senior', pose: 'kick', move: 'brazil', scale: 3, facing: 1, t });

  const lines = [
    { s: '어둠의 나는 넘었다.', y: 46, o: { size: 11, color: '#eeeef4' } },
    { s: '그러나 그 발은 끝내 닿지 않았다.', y: 62, o: { size: 11, color: '#eeeef4' } },
    { s: '"이게 브라질리언 킥이다. 다음엔 막아 봐라."', y: 86, o: { size: 12, bold: true, color: '#ffd84d' } },
    { s: '— 1세대 발 마스터', y: 102, o: { size: 10, color: '#b8b8c8' } },
    { s: '시즌 2 예정', y: 148, o: { size: 26, bold: true, color: '#ffd84d' } },
  ];
  lines.forEach((l, i) => {
    const a = fadeIn(t - i * 0.5, 0.5);
    if (a <= 0) return;
    ctx.globalAlpha = a;
    text(ctx, l.s, 200, l.y, l.o);
  });
  ctx.globalAlpha = 1;
  text(ctx, '여기까지 해 줘서 고맙다.', 200, 176, { size: 10, color: '#8a8aa0' });
  if (t > 1 && blink(t)) rich(ctx, '[Enter] 타이틀로', 200, 204, { size: 12 });
}
