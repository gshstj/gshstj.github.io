// [D 담당] 스테이지 진행: 웨이브, 증원, 체크포인트, 클리어 판정.
// 계약: STAGES, startStage, updateStage 내보내기, EV의 진행 이벤트 발행.
// 데이터는 data.js, 수치는 tuning.js에 있다. 배경 그림은 fx 담당이 stage.bg 키를 보고 그린다.
import { W } from '../core/config.js';
import { EV, emit } from '../core/events.js';
import { resetPlayer } from '../player/index.js';
import { spawnEnemy } from '../enemies/index.js';
import { STAGES } from './data.js';
import { SEV } from './events.js';
import { T } from './tuning.js';
import { T as PT } from '../player/tuning.js';
import { makeEndlessStage, genWave } from './endless.js';

export { STAGES };

const st = {
  cleared: false,
  pending: [],      // 이번 웨이브에서 아직 안 나온 증원 (delay 오름차순)
  waveTime: 0,      // 이번 웨이브가 시작되고 흐른 시간
  rest: 0,          // 다음 웨이브까지 남은 쉬는 시간. 0이면 싸우는 중
  restartWave: 0,   // 죽었을 때 다시 시작할 웨이브 (체크포인트를 넘기면 그 번호)
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 스폰 위치. side로 준 적은 지금 화면 밖에 세운다. 그쪽에 자리가 없으면 반대편에서 나온다.
function spawnX(game, s) {
  if (s.x != null) return s.x;
  const width = game.stage.width;
  const viewL = clamp(game.player.x - W / 2, 0, Math.max(0, width - W));
  const gap = s.gap != null ? s.gap : T.spawnGap;
  const lo = T.spawnEdge, hi = width - T.spawnEdge;
  const left = viewL - gap, right = viewL + W + gap;
  const want = s.side === 'left' ? left : right;
  const other = s.side === 'left' ? right + 14 : left - 14;
  if (want >= lo && want <= hi) return want;
  if (other >= lo && other <= hi) return other;
  return clamp(want, lo, hi);
}

function spawn(game, s) {
  const e = spawnEnemy(game, s.type, Math.round(spawnX(game, s)));
  // 점수 모드: 웨이브가 오를수록 적이 단단해지고 빨라진다
  if (s.hpMult && s.hpMult !== 1) e.hp = e.maxHp = Math.round(e.maxHp * s.hpMult);
  if (s.tempo) e.tempo = s.tempo;
}

// 점수 모드(무한 골목)를 시작한다. 카프킥 단계는 1부터 다시 키운다.
export function startEndless(game) {
  game.stageIndex = 0;
  game.stage = makeEndlessStage();
  game.enemies.length = 0;
  game.projectiles.length = 0;
  st.cleared = false;
  st.restartWave = 0;
  resetPlayer(game);
  Object.assign(game.player.kick, { level: 1, xp: 0, xpNext: PT.level.xpNeed[1], meter: 0 });
  emit(EV.STAGE_START, { index: 0, stage: game.stage, wave: 0, fromCheckpoint: false });
  beginWave(game, 0);
}

function beginWave(game, wave) {
  const stage = game.stage;
  game.waveIndex = wave;
  st.rest = 0;
  st.waveTime = 0;
  st.pending = stage.waves[wave].spawns
    .map((s) => ({ ...s, delay: s.delay || 0 }))
    .sort((a, b) => a.delay - b.delay);
  // checkpoint는 번호 하나이거나 번호 배열이다 (보스 웨이브도 체크포인트)
  if ([].concat(stage.checkpoint).includes(wave) && st.restartWave !== wave) {
    st.restartWave = wave;
    emit(SEV.CHECKPOINT, { index: game.stageIndex, wave });
  }
  while (st.pending.length && st.pending[0].delay <= 0) spawn(game, st.pending.shift());
  emit(EV.WAVE_START, { index: game.stageIndex, wave });
}

// 스테이지를 시작한다. 플레이어 체력은 여기서만 회복된다 (resetPlayer).
// opts.fromCheckpoint: 같은 스테이지를 재도전할 때, 체크포인트를 넘겼으면 그 웨이브부터 시작한다.
export function startStage(game, index, opts = {}) {
  const wave = opts.fromCheckpoint && index === game.stageIndex && game.stage === STAGES[index]
    ? st.restartWave : 0;
  game.stageIndex = index;
  game.stage = STAGES[index];
  game.enemies.length = 0;
  game.projectiles.length = 0;
  st.cleared = false;
  st.restartWave = wave;
  resetPlayer(game);
  emit(EV.STAGE_START, { index, stage: game.stage, wave, fromCheckpoint: wave > 0 });
  beginWave(game, wave);
}

export function updateStage(game, dt) {
  if (st.cleared || !game.stage) return;
  if (!game.player.alive) return; // 죽은 뒤에는 웨이브도 클리어도 진행하지 않는다

  if (st.rest > 0) {
    st.rest -= dt;
    if (st.rest <= 0) beginWave(game, game.waveIndex + 1);
    return;
  }

  st.waveTime += dt;
  const fighting = game.enemies.some((e) => e.alive);
  if (st.pending.length) {
    // 화면에 적이 없으면 증원을 오래 기다리게 하지 않는다
    if (!fighting) st.waveTime = Math.max(st.waveTime, st.pending[0].delay - T.hurry);
    while (st.pending.length && st.pending[0].delay <= st.waveTime) spawn(game, st.pending.shift());
    return;
  }
  if (fighting) return;

  // 점수 모드는 끝이 없다. 마지막 웨이브를 넘기면 다음 웨이브를 만들어 붙인다.
  if (game.stage.endless && game.waveIndex >= game.stage.waves.length - 1) {
    game.stage.waves.push(genWave(game.stage.waves.length));
  }
  if (game.waveIndex < game.stage.waves.length - 1) {
    st.rest = T.waveRest;
  } else {
    st.cleared = true;
    // 클리어 뒤에 남은 투척물에 맞아 쓰러지는 일이 없게 한다
    for (const pr of game.projectiles) pr.alive = false;
    emit(EV.STAGE_CLEAR, { index: game.stageIndex, stage: game.stage });
  }
}

// HUD가 읽는 진행 상황
export function stageProgress(game) {
  const stage = game.stage;
  let alive = 0;
  for (const e of game.enemies) if (e.alive) alive++;
  return {
    wave: game.waveIndex,
    waveCount: stage ? stage.waves.length : 0,
    remaining: alive + st.pending.length,          // 이번 웨이브에 남은 적 (아직 안 나온 증원 포함)
    checkpoint: stage && stage.checkpoint != null ? stage.checkpoint : -1,
    restartWave: st.restartWave,                   // 0이면 죽었을 때 스테이지 처음부터
    resting: st.rest > 0,
    cleared: st.cleared,
  };
}
