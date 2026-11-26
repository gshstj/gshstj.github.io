// [C 담당] 화면에 보이는 월드 전부: 배경, 캐릭터 스프라이트, 이펙트, 카메라, 히트스톱.
// 계약: init, update, drawWorld 내보내기.
// 게임 로직은 건드리지 않고, game 상태를 읽고 이벤트를 들어서 그리기만 한다.
// 예외: game.hitstop, game.timeScale, game.camera는 fx가 값을 넣는다.
//
// 파일 구성
//   tuning.js       연출 수치와 단계별 색
//   pix.js          픽셀 그리기 도우미
//   rig.js          사람 모양 픽셀 리그 (주인공과 적 공용)
//   hero.js         주인공 자세, 킥 4종 모션, 다리 궤적과 잔상
//   enemySprites.js 적 3종, 공격 예고 표시, 투척물
//   particles.js    파티클
//   effects.js      이벤트별 연출, 화면 전체 연출, 카메라와 시간
//   backgrounds.js  배경 (alley, classroom, 기본)
import { W, H, GROUND_Y } from '../core/config.js';
import { EV, on } from '../core/events.js';
import { makeCanvas, blit, q, D, clamp } from './pix.js';
import * as particles from './particles.js';
import * as hero from './hero.js';
import * as fxs from './effects.js';
import * as backgrounds from './backgrounds.js';
import { drawEnemy, drawTelegraph, drawProjectile, mem } from './enemySprites.js';
import * as col from './col.js';
import * as shadowBoss from './shadowBoss.js';
import * as duel from './duel.js';

import { sfx, init as initSfx } from './sfx.js';

// 보스는 주인공과 같은 그림 방식으로 따로 그린다.
// 맞은 직후(번쩍이는 동안)에는 몸이 좌우로 떨려서 맞았다는 느낌이 난다.
function drawFoe(g, e, t) {
  const hit = e.alive !== false && mem(e).flash > 0;
  if (hit) { g.save(); g.translate(Math.sin(t * 190) > 0 ? 1.5 : -1.5, 0); }
  if (shadowBoss.isShadow(e)) shadowBoss.draw(g, e, t); else drawEnemy(g, e, t);
  if (hit) g.restore();
}

const M = backgrounds.M;
// 장면 버퍼: 논리 해상도 그대로(사방 여백 M) 그린 뒤 화면에 한 번에 찍는다.
// 이렇게 하면 줌인을 해도 픽셀이 뭉개지지 않고, 흔들려도 가장자리가 비지 않는다.
const [scene, sg] = makeCanvas(W + M * 2, H + M * 2);

let time = 0; // 연출용 실제 시간(초)

// 다른 담당이 자기 폴더에 만든 이벤트 이름 (가져오지 않고 문자열만 맞춘다)
const XEV = { ENEMY_BRACE: 'enemy:brace', ENEMY_SWAP: 'enemy:swap', PROJECTILE_END: 'projectile:end' };

export function init(game) {
  on(EV.KICK_START, (d) => fxs.kickStart(game, d || {}));
  on(EV.KICK_HIT, (d) => {
    d = d || {};
    // 다리가 닿는 순간에 이펙트가 터지도록 맞춘다. 내려찍기는 든 다리가 떨어질 때까지 잠깐 기다린다.
    const wait = hero.syncImpact(game);
    if (wait > 0.005) {
      game.hitstop = Math.max(game.hitstop || 0, wait + 0.017);
      fxs.later(wait, () => fxs.kickHit(game, d));
    } else fxs.kickHit(game, d);
  });
  on(EV.KICK_MISS, (d) => fxs.kickMiss(game, d || {}));
  on(EV.KICK_LEVEL_UP, (d) => { fxs.levelUp(game, d || {}); hero.aura((d && d.level) || (game.player && game.player.kick.level) || 1); });
  on(EV.PUNCH_HIT, (d) => fxs.punchHit(game, d || {}));
  on(EV.PARRY_SUCCESS, (d) => { hero.syncImpact(game); fxs.parrySuccess(game, d || {}); });
  on(EV.PARRY_FAIL, (d) => fxs.parryFail(game, d || {}));
  on(EV.PLAYER_HIT, (d) => { hero.flash(); fxs.playerHit(game, d || {}); });
  on(EV.PLAYER_DEAD, () => fxs.playerDead());
  on(EV.ENEMY_TELEGRAPH, (d) => fxs.telegraph(game, d || {}));
  on(EV.ENEMY_ATTACK, (d) => fxs.enemyAttack(game, d || {}));
  on(EV.ENEMY_HIT, (d) => {
    if (d && d.enemy) { const m = mem(d.enemy); m.flash = 0.1; m.armored = !!d.armored; }
    fxs.enemyHit(game, d || {});
  });
  on(EV.ENEMY_DOWN, (d) => fxs.enemyDown(game, d || {}));
  on(EV.STAGE_START, () => fxs.reset());
  // enemies 담당이 자기 폴더에 만든 이벤트 (공용 EV에 없어서 문자열 이름으로 듣는다)
  on(XEV.ENEMY_BRACE, (d) => fxs.brace(game, d || {}));
  on(XEV.ENEMY_SWAP, (d) => fxs.swap(game, d || {}));
  on(XEV.PROJECTILE_END, (d) => fxs.projectileEnd(game, d || {}));
  // 타격음
  initSfx();
  on(EV.KICK_START, () => sfx.whoosh());
  on(EV.KICK_HIT, (d) => sfx.hit(!!(d && d.crit), (d && d.level) || 1));
  on(EV.PUNCH_HIT, () => sfx.punch());
  on(EV.PARRY_SUCCESS, () => sfx.parry());
  on(EV.PLAYER_HIT, () => sfx.hurt());
  on(EV.ENEMY_HIT, (d) => { if (d && d.armored) sfx.block(); });
  on(EV.ENEMY_DOWN, () => sfx.down());
  on(EV.KICK_LEVEL_UP, () => sfx.levelUp());
  on('fx:col', () => sfx.surge());

  // 2인 대전: 같은 기술이 맞부딪히면 불꽃이 튀고 둥근 충격파가 터진다
  on('pvp:clash', (d) => {
    if (!d) return;
    const { x, y } = d;
    const HOT = ['#ffffff', '#fff6c8', '#ffd84d', '#ff8a2a', '#c8401a'];
    particles.spawn({ type: 'star', x, y, size: 12, colors: HOT, life: 0.22, keep: true });
    particles.spawn({ type: 'ring', x, y, r0: 3, r1: 30, colors: HOT, life: 0.28, thick: 3, keep: true });
    particles.spawn({ type: 'ring', x, y, r0: 2, r1: 46, colors: ['#ffffff', '#ffd84d', '#ff8a2a'], life: 0.4, delay: 0.06, keep: true });
    for (let i = 0; i < 26; i++) {
      // 사방으로 튀는 불꽃. 위쪽으로 더 많이 튀고 바닥에서 튕긴다
      const a = (i / 26) * 6.283 + Math.random() * 0.3;
      const s = 120 + Math.random() * 260;
      particles.spawn({ type: i % 3 ? 'px' : 'streak', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 520, drag: 1.5,
        life: 0.25 + Math.random() * 0.4, size: i % 5 === 0 ? 2 : 1, len: 0.05, colors: HOT, bounce: true, keep: i < 8 });
    }
    game.hitstop = Math.max(game.hitstop || 0, 0.12);
    fxs.addShake(6);
    fxs.punchZoom(0.1, x, y, 0.14);
    fxs.screen.flash = Math.max(fxs.screen.flash, 0.5);
    fxs.screen.flashColor = '#fff6c8';
    sfx.parry();
    sfx.block();
  });

  // 2인 대전: 가드로 막으면 쇳빛 불똥
  on('pvp:block', (d) => {
    if (!d) return;
    const STEEL = ['#ffffff', '#a9c4e8', '#5a6e90'];
    particles.spawn({ type: 'star', x: d.x, y: d.y, size: 6, colors: STEEL, life: 0.16, keep: true });
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * 6.283;
      particles.spawn({ type: 'px', x: d.x, y: d.y, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110 - 30, g: 400, life: 0.2 + Math.random() * 0.15, size: 1, colors: STEEL });
    }
    game.hitstop = Math.max(game.hitstop || 0, 0.05);
    fxs.addShake(2);
    sfx.block();
  });
  // 2인 대전 궁극기: 쓰는 순간 화면이 어두워지고, 꽂히면 크게 터진다
  on('pvp:ult', (d) => {
    if (!d) return;
    if (d.step === 'start') {
      fxs.screen.dim = 0.7;
      fxs.screen.dimHold = 0.45;
      sfx.surge();
      return;
    }
    fxs.slow(0.5, 0.3);
    fxs.screen.flash = 1;
    fxs.screen.flashColor = '#fff6c8';
    fxs.addShake(99);
    fxs.punchZoom(0.22, d.x, d.y, 0.4);
    game.hitstop = Math.max(game.hitstop || 0, 0.22);
  });

  // 친선전 피날레: 브라질리언 킥이 꽂히는 순간 화면이 멈추듯 느려진다
  on('friendly:finale', (d) => {
    if (!d) return;
    if (d.step === 'call') { fxs.screen.dim = 0.6; fxs.screen.dimHold = 1.2; sfx.boss(); return; }
    fxs.slow(1.6, 0.18);
    fxs.screen.flash = 1;
    fxs.screen.flashColor = '#fff6c8';
    fxs.screen.dim = 0.9;
    fxs.screen.dimHold = 1.4;
    fxs.addShake(99);
    fxs.punchZoom(0.3, d.x, d.y, 1.2);
    game.hitstop = Math.max(game.hitstop || 0, 0.28);
    sfx.hit(true, 5);
  });

  // 보스 등장: 화면이 어두워지며 보랏빛으로 번쩍인다
  on(EV.ENEMY_SPAWN, (d) => {
    if (!d || !d.enemy || !shadowBoss.isShadow(d.enemy)) return;
    sfx.boss();
    if (d.enemy.type === 'master') return; // 친선전 상대는 조용히 서 있다
    fxs.screen.flash = 0.8;
    fxs.screen.flashColor = '#7a3cff';
    fxs.screen.dim = 0.65;
    fxs.screen.dimHold = 1.2;
    fxs.addShake(5);
  });
  on('fx:col', (d) => {
    col.start(d || {});
    fxs.addShake(99);
    fxs.screen.flash = 1;
    fxs.screen.flashColor = '#c8f4ff';
    fxs.screen.dim = 0.7;
    fxs.screen.dimHold = (d && d.duration) || 0.75;
  });
}

export function update(game, dt) {
  time += dt;
  if (!game.player) return;
  fxs.update(game, dt);
  hero.update(game, dt, time);
  col.update(dt);
  if (col.active()) fxs.addShake(3); // 솟아 있는 동안 계속 울린다
  for (const e of game.enemies) {
    const m = mem(e);
    if (m.flash > 0) m.flash -= dt;
  }
}

function shadow(g, e) {
  // 발밑 그림자. 높이 뜰수록 작아진다.
  const lift = clamp((GROUND_Y - e.y) / 60);
  const w = Math.round(((e.w || 14) / 2 + 3) * (1 - lift * 0.5));
  const x = q(e.x);
  g.fillStyle = 'rgba(6,4,14,0.4)';
  g.fillRect(x - w, GROUND_Y, w * 2, 2);
  g.fillRect(x - w + 2, GROUND_Y - 1, w * 2 - 4, 1);
  g.fillRect(x - w + 2, GROUND_Y + 2, w * 2 - 4, 1);
}

export function drawWorld(ctx, game) {
  const g = sg;
  const camX = q(game.camera.x || 0);
  const stage = game.stage;

  g.setTransform(D, 0, 0, D, 0, 0);
  g.globalAlpha = 1;
  backgrounds.draw(g, stage ? stage.bg : null, stage ? stage.width : W, camX, time);
  fxs.drawBgDim(g);

  // 월드 (카메라 적용)
  g.save();
  g.translate(M - camX, M);
  fxs.drawDecals(g);
  fxs.drawPillar(g);
  col.draw(g, false);
  // 2인 대전: 스토리의 주인공과 적 대신 두 파이터만 그린다
  if (game.scene === 'pvp' && game.pvp) {
    const fs = game.pvp.fighters;
    for (const f of fs) shadow(g, f);
    particles.draw(g, true);
    for (const f of fs) if (!f.alive) duel.draw(g, f, time);
    for (const f of fs) if (f.alive) duel.draw(g, f, time);
    particles.draw(g, false);
    g.restore();
    finishWorld(ctx, g, game, camX);
    return;
  }
  const p = game.player;
  for (const e of game.enemies) if (e.alive !== false) shadow(g, e);
  if (p && p.alive !== false) shadow(g, p);
  particles.draw(g, true);
  // 쓰러진 적을 먼저, 서 있는 적을 그 위에
  for (const e of game.enemies) if (e.alive === false) drawFoe(g, e, time);
  for (const e of game.enemies) if (e.alive !== false) drawFoe(g, e, time);
  for (const pr of game.projectiles) if (pr.alive !== false) drawProjectile(g, pr, time);
  if (p) hero.draw(g, game, time);
  col.draw(g, true);
  particles.draw(g, false);
  for (const e of game.enemies) drawTelegraph(g, e, time);
  g.restore();
  finishWorld(ctx, g, game, camX);
}

// 화면 전체 연출을 덮고 장면 버퍼를 화면에 찍는다
function finishWorld(ctx, g, game, camX) {
  fxs.drawOverlays(g, game, time);

  // 장면 버퍼를 화면에 찍는다 (줌인은 타격 지점을 중심으로)
  const z = game.camera.zoom || 1;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (z !== 1) {
    const fx = clamp(fxs.cam.focusX - camX, 70, W - 70), fy = clamp(fxs.cam.focusY, 60, H - 60);
    ctx.translate(fx, fy);
    ctx.scale(z, z);
    ctx.translate(-fx, -fy);
  }
  blit(ctx, scene, q(-M + fxs.cam.sx), q(-M + fxs.cam.sy));
  ctx.restore();
}
