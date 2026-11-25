// [B 담당] 스피드형. 멀리서 맴돌다가 짧은 예고 뒤 돌진한다. 가끔 반대편으로 넘어간 뒤 돌진한다.
// 돌진의 흐름 (attack.phase / state / action):
//   windup / windup / 'crouch'  웅크린다 (예고)
//   windup / attack / 'dash'    달려든다. 아직 타격 전이라 phase는 windup이고 timeToHit가 계속 줄어든다
//   windup / attack / 'strike'  플레이어 코앞에 멈췄다. strikeDelay 뒤에 때린다 (패링은 사실상 이 구간)
//   active / attack / 'strike'  타격
//   recover / recover           빈틈. 헛쳤으면 길다
// - 걸어서 물러나는 것으로는 못 피한다. 패링하거나 점프한다.
// - 빈틈이 아닐 때 약한 타격을 맞으면 사거리 밖으로 튕겨 나가서 연타가 이어지지 않는다.
import { EV, emit } from '../core/events.js';
import { setState } from '../core/entity.js';
import { SPEEDSTER as T } from './tuning.js';
import { beginAttack, forceState, meleeHit, rand } from './common.js';
import { requestSlot, releaseSlot } from './director.js';
import { EEV } from './events.js';

function init(e) {
  e.ai = {
    mode: 'hover', swapX: 0, swapTime: 0,
    stage: '', crouchLeft: 0, traveled: 0, strikeLeft: 0, activeTime: 0, hitDone: false, recoverTime: 0,
    wobble: Math.random() * 6,
  };
}

function reset(e) {
  e.ai.mode = 'hover';
  e.ai.stage = '';
}

function facePlayer(game, e) {
  const dx = game.player.x - e.x;
  if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
  return Math.abs(dx);
}

// 플레이어 앞 stopDist까지 달리는 데 걸리는 시간
const travelTime = (front) => Math.max(0, front - T.stopDist) / T.dashSpeed;

function startDash(game, e, crouch) {
  const dist = facePlayer(game, e);
  Object.assign(e.ai, { mode: 'hover', stage: 'crouch', crouchLeft: crouch, traveled: 0, hitDone: false });
  e.vx = 0;
  beginAttack(e, { kind: 'dash', action: 'crouch', parryable: T.dash.parryable }, crouch + travelTime(dist) + T.strikeDelay);
}

// 플레이어 반대편으로 가로질러 넘어간다
function startSwap(game, e) {
  const p = game.player;
  const width = game.stage ? game.stage.width : 480;
  const side = e.x >= p.x ? -1 : 1; // 넘어갈 쪽
  e.ai.mode = 'swap';
  e.ai.swapX = Math.max(10, Math.min(width - 10, p.x + side * T.swapDist));
  e.ai.swapTime = 0;
  e.action = 'swap';
  emit(EEV.ENEMY_SWAP, { enemy: e, fromX: e.x, toX: e.ai.swapX });
}

function updateSwap(game, e, dt) {
  const ai = e.ai;
  const dx = ai.swapX - e.x;
  ai.swapTime += dt;
  e.action = 'swap';
  if (Math.abs(dx) <= T.swapSpeed * dt || ai.swapTime > T.swapTimeout) {
    startDash(game, e, T.swapCrouch); // 넘어가자마자 짧은 예고 뒤 돌진
    return;
  }
  e.facing = dx > 0 ? 1 : -1;
  e.vx = e.facing * T.swapSpeed;
  setState(e, 'walk');
}

function updateAttack(game, e, dt) {
  const a = e.attack;
  const ai = e.ai;
  const p = game.player;
  const front = (p.x - e.x) * e.facing; // 앞쪽으로 플레이어까지의 거리. 음수면 지나쳤다

  if (a.phase === 'windup') {
    if (ai.stage === 'crouch') {
      e.vx = 0;
      ai.crouchLeft -= dt;
      a.timeToHit = Math.max(0, ai.crouchLeft) + travelTime(front) + T.strikeDelay;
      if (ai.crouchLeft <= 0) {
        ai.stage = 'dash';
        e.action = 'dash';
        forceState(e, 'attack');
        emit(EV.ENEMY_ATTACK, { enemy: e, kind: a.kind }); // 돌진이 출발하는 순간
      }
    } else if (ai.stage === 'dash') {
      const width = game.stage ? game.stage.width : 480;
      const arrived = front <= T.stopDist && front > -T.stopDist;
      const atWall = e.facing > 0 ? e.x >= width - e.w / 2 - 1 : e.x <= e.w / 2 + 1;
      if (arrived || atWall || ai.traveled >= T.dashMaxDist) {
        ai.stage = 'strike';
        ai.strikeLeft = T.strikeDelay;
        e.action = 'strike';
        e.vx = 0;
        a.timeToHit = T.strikeDelay;
      } else {
        e.vx = e.facing * T.dashSpeed;
        ai.traveled += T.dashSpeed * dt;
        const left = front > 0 ? travelTime(front) : (T.dashMaxDist - ai.traveled) / T.dashSpeed;
        a.timeToHit = Math.max(0, left) + T.strikeDelay;
      }
    } else {
      e.vx = 0;
      ai.strikeLeft -= dt;
      a.timeToHit = Math.max(0, ai.strikeLeft);
      if (ai.strikeLeft <= 0) {
        a.phase = 'active';
        ai.activeTime = 0;
        ai.hitDone = meleeHit(game, e, T.dash);
      }
    }
  } else if (a.phase === 'active') {
    e.vx = 0;
    ai.activeTime += dt;
    if (!ai.hitDone) ai.hitDone = meleeHit(game, e, T.dash);
    if (ai.activeTime >= T.dashActive) {
      a.phase = 'recover';
      e.action = null;
      ai.recoverTime = ai.hitDone ? T.recoverHit : T.recoverWhiff;
      e.vulnerable = ai.recoverTime;
      releaseSlot(game, e); // 빈틈 동안 다음 적이 차례를 받는다
      forceState(e, 'recover');
    }
  } else {
    e.vx = 0;
    if (e.stateTime >= ai.recoverTime) {
      e.attack = null;
      reset(e);
      e.cooldown = rand(T.cooldown);
      releaseSlot(game, e);
      setState(e, 'idle');
    }
  }
}

function update(game, e, dt) {
  if (e.attack) { updateAttack(game, e, dt); return; }
  const p = game.player;
  if (!p.alive) {
    reset(e);
    e.action = null;
    e.vx = 0;
    releaseSlot(game, e);
    setState(e, 'idle');
    return;
  }
  if (e.ai.mode === 'swap') { updateSwap(game, e, dt); return; }

  const dist = facePlayer(game, e);
  e.cooldown -= dt;
  e.action = null;
  e.ai.wobble += dt;

  const engaged = e.cooldown <= 0 && requestSlot(game, e, 'melee');
  let want = T.hoverDist + Math.sin(e.ai.wobble * 2.3) * T.hoverWobble; // 차례가 아니면 앞뒤로 맴돈다
  if (engaged) {
    if (dist >= T.dashMin && dist <= T.dashMax) {
      if (Math.random() < T.swapChance) startSwap(game, e);
      else startDash(game, e, T.crouch);
      return;
    }
    want = (T.dashMin + T.dashMax) / 2;
  }
  if (dist > want + 6) e.vx = e.facing * T.speed;
  else if (dist < want - 6) e.vx = -e.facing * T.speed;
  else e.vx = 0;
  setState(e, e.vx ? 'walk' : 'idle');
}

// 빈틈이 아닐 때 약한 타격을 맞으면 뒤로 튕겨 나가 사거리를 벗어난다
function onWeakHit(game, e, dir) {
  e.vx = dir * T.evadeSpeed;
  e.hurtTime = T.evadeTime;
  e.ai.retaliate = true;
}

// 튕겨 나간 뒤에는 곧바로 되받아친다 (차례가 비어 있을 때)
function afterHurt(game, e) {
  if (!e.ai.retaliate) return;
  e.ai.retaliate = false;
  e.cooldown = T.retaliateDelay;
}

export const speedster = { T, brain: { init, reset, update, onWeakHit, afterHurt } };
