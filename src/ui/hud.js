// [D 담당] 전투 중 HUD.
// 위쪽 띠: 체력, 카프킥 단계 (왼쪽) / 스테이지, 웨이브, 남은 적 (오른쪽)
// 아래쪽 띠(바닥 아래): 킥 콤보 진행, 카운터 찬스, 조작 안내
// 가운데 위: 스테이지, 웨이브, 단계 상승 알림. 싸우는 높이(화면 중간부터 바닥)는 가리지 않는다.
import { W, GROUND_Y } from '../core/config.js';
import { EV, on } from '../core/events.js';
import { stageProgress } from '../stages/index.js';
import { SEV } from '../stages/events.js';
import { text, rich } from './text.js';
import { T } from './tuning.js';

// 카프킥 성장 단계 (기획서 5장)
export const KICK_LEVELS = [
  { name: '풋내기의 발', color: '#c8c8d4' },
  { name: '날 선 발', color: '#ffffff' },
  { name: '바람 가르는 발', color: '#7cc8ff' },
  { name: '번개 발', color: '#ffe45c' },
  { name: '마스터의 발', color: '#ffb52e' },
];

const MOVE_LABEL = { calf: '카프', high: '하이', mid: '미들', axe: '찍기' };
const DEFAULT_ORDER = ['calf', 'high', 'mid', 'axe'];

const hud = {
  t: 0,
  banners: [],          // { title, sub, color, dur, t, big }
  hpFlash: 0,
  levelFlash: 0,
  stepPop: 0,
  lastStep: -1,
  lastPhase: 'idle',
  moves: [],            // 콤보 순서별로 실제로 본 기술 이름
  counterMax: 0,
  firstWave: false,     // 스테이지 시작 직후의 첫 WAVE_START는 알림을 따로 띄우지 않는다
  checkpointNow: false, // 방금 체크포인트에 도달했다 (다음 웨이브 알림에 함께 적는다)
};

const levelInfo = (level) => KICK_LEVELS[Math.max(1, Math.min(KICK_LEVELS.length, level)) - 1];

function pushBanner(b, front = false) {
  const banner = { color: '#ffffff', sub: '', dur: T.bannerTime, t: 0, big: false, ...b };
  if (front && hud.banners.length) {
    // 지금 떠 있는 알림은 빨리 닫고 바로 다음에 띄운다
    const cur = hud.banners[0];
    cur.t = Math.max(cur.t, cur.dur - 0.2);
    hud.banners.splice(1, 0, banner);
  } else {
    hud.banners.push(banner);
  }
}

export function initHud(game) {
  on(EV.STAGE_START, ({ index, stage, wave = 0 }) => {
    hud.banners.length = 0;
    hud.firstWave = true;
    hud.checkpointNow = false;
    hud.moves.length = 0;
    pushBanner({
      title: stage.name,
      sub: wave > 0 ? `체크포인트 · 웨이브 ${wave + 1}부터` : `STAGE ${index + 1}`,
      big: true,
      dur: T.stageIntroTime,
    });
  });
  on(SEV.CHECKPOINT, () => { hud.checkpointNow = true; });
  on(EV.WAVE_START, ({ wave }) => {
    const checkpoint = hud.checkpointNow;
    hud.checkpointNow = false;
    if (hud.firstWave) { hud.firstWave = false; return; }
    const count = game.stage.waves.length;
    const w = game.stage.waves[wave];
    if (w.boss) {
      pushBanner({ title: w.title || 'BOSS · 어둠의 나', sub: w.sub || (checkpoint ? '체크포인트! 쓰러져도 여기부터 다시' : '발차기만 쓰는 또 다른 나'), color: '#c08cff', dur: T.bannerTime + 1 });
      return;
    }
    pushBanner({
      title: `웨이브 ${wave + 1} / ${count}`,
      sub: checkpoint ? '체크포인트! 쓰러져도 여기부터 다시' : wave === count - 1 ? '마지막 웨이브' : '',
      color: checkpoint ? '#7ce0d0' : '#ffffff',
      dur: checkpoint ? T.bannerTime + 0.8 : T.bannerTime,
    });
  });
  on(EV.KICK_LEVEL_UP, ({ level }) => {
    const lv = levelInfo(level);
    hud.levelFlash = T.levelUpTime;
    pushBanner({ title: `카프킥 ${level}단계!`, sub: lv.name, color: lv.color, dur: T.levelUpTime }, true);
  });
  on(EV.PLAYER_HIT, () => { hud.hpFlash = 0.35; });
  // 친선전 피날레: 마스터가 새 기술의 이름을 댄다
  on('friendly:finale', ({ step }) => {
    if (step === 'call') pushBanner({ title: '"새 기술을 보여 주지."', sub: '1세대 발 마스터 · 브라질리언 킥', color: '#ffd84d', dur: 1.8 }, true);
  });
}

export function updateHud(game, dt) {
  hud.t += dt;
  hud.hpFlash = Math.max(0, hud.hpFlash - dt);
  hud.levelFlash = Math.max(0, hud.levelFlash - dt);
  hud.stepPop = Math.max(0, hud.stepPop - dt);
  if (hud.banners.length) {
    const b = hud.banners[0];
    b.t += dt;
    if (b.t >= b.dur) hud.banners.shift();
  }
  const p = game.player;
  const k = p.kick;
  if (k.phase === 'strike' && (hud.lastPhase !== 'strike' || hud.lastStep !== k.step)) hud.stepPop = 0.12;
  if (k.phase !== 'idle' && k.move) hud.moves[k.step] = k.move;
  hud.lastPhase = k.phase;
  hud.lastStep = k.step;
  hud.counterMax = p.counterTime > 0 ? Math.max(hud.counterMax, p.counterTime) : 0;
}

// ---- 그리기 ----

function drawHp(ctx, p) {
  const max = Math.max(1, Math.ceil(p.maxHp));
  const hp = Math.max(0, Math.min(max, p.hp));
  const low = hp > 0 && hp <= Math.max(1, max * 0.2);
  let color = '#e8444c';
  if (low && Math.floor(hud.t * 5) % 2) color = '#ff8a5c';
  if (hud.hpFlash > 0 && Math.floor(hud.hpFlash * 20) % 2 === 0) color = '#ffffff';
  if (max <= 12) {
    for (let i = 0; i < max; i++) {
      const x = 8 + i * 12, y = 7;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - 1, y - 1, 12, 11);
      ctx.fillStyle = '#3a2832';
      ctx.fillRect(x, y, 10, 9);
      const f = Math.max(0, Math.min(1, hp - i));
      if (f > 0) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, Math.max(1, Math.round(10 * f)), 9);
        if (f === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fillRect(x + 1, y + 1, 3, 2);
        }
      }
    }
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(7, 6, 122, 11);
    ctx.fillStyle = '#3a2832';
    ctx.fillRect(8, 7, 120, 9);
    ctx.fillStyle = color;
    ctx.fillRect(8, 7, Math.round(120 * hp / max), 9);
  }
}

function drawKickLevel(ctx, k) {
  const lv = levelInfo(k.level);
  const flash = hud.levelFlash > 0 && Math.floor(hud.levelFlash * 8) % 2 === 0;
  for (let i = 0; i < KICK_LEVELS.length; i++) {
    const x = 8 + i * 8, y = 22;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, y - 1, 8, 8);
    ctx.fillStyle = i < k.level ? (flash ? '#ffffff' : lv.color) : '#33333f';
    ctx.fillRect(x, y, 6, 6);
  }
  text(ctx, `카프킥 ${k.level}단계 · ${lv.name}`, 52, 29, { size: 10, bold: flash, color: flash ? '#ffffff' : lv.color });
  // 다음 단계까지의 경험치 (A 담당의 kick.xp, kick.xpNext가 있을 때만. 최고 단계면 xpNext가 0)
  if (k.xpNext > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(7, 30, 40, 4);
    ctx.fillStyle = '#33333f';
    ctx.fillRect(8, 31, 38, 2);
    ctx.fillStyle = lv.color;
    ctx.fillRect(8, 31, Math.round(38 * Math.max(0, Math.min(1, (k.xp || 0) / k.xpNext))), 2);
  }
}

function drawStageInfo(ctx, game) {
  const pr = stageProgress(game);
  text(ctx, `STAGE ${game.stageIndex + 1} · ${game.stage.name}`, W - 8, 15, { size: 10, bold: true, align: 'right', color: '#eeeef4' });
  // 웨이브 칸: 지난 웨이브는 초록, 지금은 금색, 체크포인트 웨이브는 아래에 청록 줄
  const n = pr.waveCount, pw = 10, gap = 2;
  const x0 = W - 8 - (n * pw + (n - 1) * gap);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (pw + gap), y = 20;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, y - 1, pw + 2, 6);
    const done = i < pr.wave || (i === pr.wave && (pr.resting || pr.cleared));
    ctx.fillStyle = done ? '#7fd08a' : i === pr.wave ? (Math.floor(hud.t * 3) % 2 ? '#ffd84d' : '#fff0a8') : '#33333f';
    ctx.fillRect(x, y, pw, 4);
    if ([].concat(pr.checkpoint).includes(i)) {
      ctx.fillStyle = pr.restartWave === i ? '#7ce0d0' : '#6a7896';
      ctx.fillRect(x, y + 6, pw, 2);
    }
  }
  const info = pr.cleared ? '클리어!' : pr.resting ? '다음 웨이브가 온다' : `남은 적 ${pr.remaining}`;
  text(ctx, `웨이브 ${pr.wave + 1}/${n} · ${info}`, W - 8, 41, { size: 10, align: 'right', color: '#c8c8d8' });
}

// 킥 콤보: 칸 수 = comboLength. 지난 타는 밝게, 지금 타는 하얗게, 마무리 타는 금색으로 강조한다.
function drawCombo(ctx, p) {
  const k = p.kick;
  const n = Math.max(1, k.comboLength);
  const sw = 38, sh = 15, gap = 3;
  const total = n * sw + (n - 1) * gap;
  const x0 = Math.round(W / 2 - total / 2), y0 = GROUND_Y + 8;
  // A 담당의 kick.comboTime: 킥이 끝난 뒤에도 콤보가 이어질 수 있는 남은 시간 (없으면 0으로 본다)
  const linger = k.phase === 'idle' && k.comboTime > 0;
  const active = k.phase !== 'idle' || linger;
  rich(ctx, '[K]', x0 - 19, y0 + 11, { size: 10 });

  for (let i = 0; i < n; i++) {
    const fin = i === n - 1;
    const cur = active && !linger && i === k.step;
    const done = active && (i < k.step || (linger && i === k.step));
    const next = active && (k.phase === 'recover' || linger) && i === k.step + 1; // 지금 K를 누르면 이어지는 칸
    const grow = cur && hud.stepPop > 0 ? 2 : 0;
    const x = x0 + i * (sw + gap) - grow, y = y0 - grow, w = sw + grow * 2, h = sh + grow * 2;

    ctx.fillStyle = fin ? '#ffd84d' : cur || done ? '#ffffff' : next && Math.floor(hud.t * 10) % 2 ? '#ffffff' : '#5a5a70';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = cur ? (fin ? '#ffd84d' : '#ffffff') : done ? '#8a8a9c' : '#14141e';
    ctx.fillRect(x, y, w, h);

    const label = MOVE_LABEL[hud.moves[i] || DEFAULT_ORDER[i]] || String(i + 1);
    text(ctx, label, x + w / 2, y0 + 11, {
      size: 10, bold: true, align: 'center', outline: false,
      color: cur ? '#14141e' : done ? '#14141e' : fin ? '#ffd84d' : '#9a9ab0',
    });
  }

  // 카운터 찬스: 패링 직후 킥이 강타로 들어가는 시간
  if (p.counterTime > 0) {
    const x = x0 + total + 9;
    const color = Math.floor(hud.t * 10) % 2 ? '#ffd84d' : '#ff5a4d';
    text(ctx, '카운터 찬스!', x, y0 + 10, { size: 11, bold: true, color });
    const r = hud.counterMax > 0 ? Math.min(1, p.counterTime / hud.counterMax) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, y0 + 12, 68, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y0 + 13, Math.round(66 * r), 2);
  }
}

function drawHint(ctx, game) {
  const wave = game.stage.waves[game.waveIndex];
  if (!wave || !wave.hint || !game.player.alive) return;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 251, W, 19);
  rich(ctx, wave.hint, W / 2, 264, { size: 10, align: 'center', color: '#f0f0f8' });
}

function drawBanner(ctx) {
  const b = hud.banners[0];
  if (!b) return;
  const a = Math.max(0, Math.min(1, b.t / 0.18, (b.dur - b.t) / 0.25));
  const y = 74;
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(W / 2 - 120, y - (b.big ? 24 : 17), 240, b.big ? 46 : 36);
  ctx.fillStyle = b.color;
  ctx.fillRect(W / 2 - 120, y - (b.big ? 24 : 17), 240, 1);
  text(ctx, b.title, W / 2, y, { size: b.big ? 20 : 14, bold: true, align: 'center', color: b.color });
  if (b.sub) text(ctx, b.sub, W / 2, y + 14, { size: 10, align: 'center', color: '#d8d8e4' });
  ctx.globalAlpha = 1;
}

// 보스 체력바: 화면 위 가운데
function drawBoss(ctx, game) {
  const b = game.enemies.find((e) => e.boss && e.alive);
  if (!b) return;
  const w = 180, x = W / 2 - w / 2, y = 30;
  const r = Math.max(0, Math.min(1, b.hp / b.maxHp));
  text(ctx, b.bossName || 'BOSS', W / 2, y - 3, { size: 10, bold: true, align: 'center', color: '#d8b8ff' });
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - 1, y - 1, w + 2, 7);
  ctx.fillStyle = '#2a1840';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = b.armor ? '#a9c4e8' : '#9a3cff';
  ctx.fillRect(x, y, Math.round(w * r), 5);
  ctx.fillStyle = '#e0b8ff';
  ctx.fillRect(x, y, Math.round(w * r), 1);
}

export function drawHud(ctx, game) {
  const p = game.player;
  if (!p || !game.stage) return;
  drawHp(ctx, p);
  drawBoss(ctx, game);
  drawKickLevel(ctx, p.kick);
  drawStageInfo(ctx, game);
  drawCombo(ctx, p);
  drawHint(ctx, game);
  drawBanner(ctx);
}
