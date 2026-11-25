// [D 담당] 화면 위 UI와 장면 흐름.
// 계약: init, update, draw 내보내기. game.scene은 여기서만 바꾸고, 바꿀 때 SCENE_CHANGE를 발행한다.
//
// 장면: title → prologue → playing → stageClear → (다음 스테이지 playing) → ending → title
//       playing 중 쓰러지면 gameOver → 재도전(playing). Esc로 일시정지(game.paused).
import { W, H } from '../core/config.js';
import { EV, on, emit } from '../core/events.js';
import { pressed } from '../core/input.js';
import { STAGES, startStage, stageProgress } from '../stages/index.js';
import { SEV } from '../stages/events.js';
import { T } from './tuning.js';
import { initHud, updateHud, drawHud } from './hud.js';
import { enterPrologue, updatePrologue, drawPrologue } from './prologue.js';
import { drawTitle, drawPause, drawGameOver, drawStageClear, drawEnding, PAUSE_COUNT } from './screens.js';

const newStats = () => ({ time: 0, hits: 0, parries: 0, retries: 0 });

const S = {
  sceneTime: 0,     // 지금 장면에 머문 시간 (실제 시간)
  fade: null,       // { t, fn, done }  어두워졌다가 fn을 부르고 다시 밝아진다
  deathTimer: 0,    // 쓰러진 뒤 게임오버 화면까지 남은 시간
  clearTimer: 0,    // 클리어 뒤 결과 화면까지 남은 시간
  pauseSel: 0,
  stats: newStats(),
};

function setScene(game, to) {
  const from = game.scene;
  if (from === to) return;
  game.scene = to;
  S.sceneTime = 0;
  emit(EV.SCENE_CHANGE, { from, to });
}

// 화면을 어둡게 한 뒤 fn을 부른다. 전환 중에는 입력을 받지 않는다.
function transition(fn) {
  if (!S.fade) S.fade = { t: 0, fn, done: false };
}

// retry: 같은 스테이지 재도전 (체크포인트를 넘겼으면 거기서부터)
function beginStage(game, index, retry = false) {
  if (retry) S.stats.retries++;
  else S.stats = newStats();
  S.deathTimer = 0;
  S.clearTimer = 0;
  game.paused = false;
  startStage(game, index, { fromCheckpoint: retry });
  setScene(game, 'playing');
}

function toTitle(game) {
  game.paused = false;
  S.deathTimer = 0;
  S.clearTimer = 0;
  setScene(game, 'title');
}

export function init(game) {
  initHud(game);
  on(EV.PLAYER_DEAD, () => {
    // 클리어가 먼저 났으면 클리어가 이긴다
    if (game.scene === 'playing' && S.clearTimer <= 0) S.deathTimer = T.deathDelay;
  });
  on(EV.STAGE_CLEAR, () => {
    S.clearTimer = T.clearDelay;
    S.deathTimer = 0;
  });
  on(EV.PLAYER_HIT, () => { S.stats.hits++; });
  on(EV.PARRY_SUCCESS, () => { S.stats.parries++; });

  // 타이틀에서도 다른 모듈이 game.stage를 읽을 수 있게 첫 스테이지 데이터를 걸어 둔다 (시작은 하지 않는다)
  game.stageIndex = 0;
  game.stage = STAGES[0];
  setScene(game, 'title');
}

function updatePause(game) {
  if (pressed('pause')) { game.paused = false; return; }
  if (pressed('left') || pressed('jump')) S.pauseSel = (S.pauseSel + PAUSE_COUNT - 1) % PAUSE_COUNT;
  if (pressed('right')) S.pauseSel = (S.pauseSel + 1) % PAUSE_COUNT;
  if (pressed('confirm')) {
    if (S.pauseSel === 0) game.paused = false;
    else if (S.pauseSel === 1) transition(() => beginStage(game, game.stageIndex));
    else transition(() => toTitle(game));
  }
}

export function update(game, dt) {
  S.sceneTime += dt;
  let canInput = true;
  if (S.fade) {
    const f = S.fade;
    canInput = false;
    f.t += dt;
    if (!f.done && f.t >= T.fade) { f.done = true; f.fn(); }
    if (f.t >= T.fade * 2) S.fade = null;
  }

  switch (game.scene) {
    case 'title':
      if (canInput && pressed('confirm')) transition(() => { enterPrologue(); setScene(game, 'prologue'); });
      break;

    case 'prologue':
      if (updatePrologue(dt, canInput)) {
        transition(() => { emit(SEV.NEW_GAME, {}); beginStage(game, 0); });
      }
      break;

    case 'playing': {
      const busy = S.deathTimer > 0 || S.clearTimer > 0;
      if (S.deathTimer > 0) {
        S.deathTimer -= dt;
        if (S.deathTimer <= 0) setScene(game, 'gameOver');
      } else if (S.clearTimer > 0) {
        S.clearTimer -= dt;
        if (S.clearTimer <= 0) setScene(game, 'stageClear');
      } else if (canInput) {
        if (game.paused) updatePause(game);
        else if (pressed('pause')) { game.paused = true; S.pauseSel = 0; }
      }
      if (!game.paused) {
        if (!busy) S.stats.time += dt;
        updateHud(game, dt);
      }
      break;
    }

    case 'gameOver':
      if (canInput && S.sceneTime > T.inputLock) {
        if (pressed('confirm')) transition(() => beginStage(game, game.stageIndex, true));
        else if (pressed('pause')) transition(() => toTitle(game));
      }
      break;

    case 'stageClear':
      if (canInput && S.sceneTime > T.inputLock && pressed('confirm')) {
        const next = game.stageIndex + 1;
        if (next < STAGES.length) transition(() => beginStage(game, next));
        else transition(() => setScene(game, 'ending'));
      }
      break;

    case 'ending':
      if (canInput && S.sceneTime > T.endingLock && pressed('confirm')) transition(() => toTitle(game));
      break;
  }
}

export function draw(ctx, game) {
  switch (game.scene) {
    case 'title':
      drawTitle(ctx, S.sceneTime);
      break;
    case 'prologue':
      drawPrologue(ctx);
      break;
    case 'playing':
      drawHud(ctx, game);
      if (game.paused) drawPause(ctx, S.pauseSel);
      break;
    case 'gameOver':
      drawGameOver(ctx, S.sceneTime, stageProgress(game).restartWave);
      break;
    case 'stageClear': {
      const next = STAGES[game.stageIndex + 1];
      drawStageClear(ctx, S.sceneTime, {
        index: game.stageIndex,
        stageName: game.stage.name,
        stats: S.stats,
        kickLevel: game.player.kick.level,
        nextName: next ? next.name : '',
      });
      break;
    }
    case 'ending':
      drawEnding(ctx, S.sceneTime);
      break;
  }

  if (S.fade) {
    const f = S.fade;
    const a = f.t < T.fade ? f.t / T.fade : 1 - (f.t - T.fade) / T.fade;
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, a))})`;
    ctx.fillRect(0, 0, W, H);
  }
}
