// [B 담당] 사격형. 거리를 벌리며 투척물을 연달아 던진다.
// - 공(곧게 날아옴)과 병(플레이어 자리로 떨어짐)을 섞어 던진다. 둘 다 킥으로 쳐낼 수 있다.
// - 버티기가 없어서 붙으면 콤보가 다 들어가고, 던지려던 것도 맞으면 끊긴다.
// - 붙었을 때 가끔 밀쳐낸다. 느리고 약하며 패링할 수 있다.
import { EV, emit } from '../core/events.js';
import { setState } from '../core/entity.js';
import { SHOOTER as T } from './tuning.js';
import { beginAttack, forceState, meleeHit, rand } from './common.js';
import { requestSlot, releaseSlot } from './director.js';
import { spawnProjectile } from './projectiles.js';

const THROW = { kind: 'throw', action: 'throw', parryable: false }; // 던지는 동작은 패링 대상이 아니다. 투척물을 쳐낸다.

function init(e) {
  e.ai = { burstLeft: 0, throws: 0, shove: false, shoveCd: 0, hitDone: false, recoverTime: 0 };
}

function reset(e) {
  e.ai.burstLeft = 0;
  e.ai.shove = false;
}

function facePlayer(game, e) {
  const dx = game.player.x - e.x;
  if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
  return Math.abs(dx);
}

function startThrow(game, e, windup) {
  facePlayer(game, e);
  e.ai.throws++;
  const projectile = e.ai.throws % T.bottleEvery === 0 ? 'bottle' : 'ball';
  e.vx = 0;
  // attack.projectile: 손에 든 투척물 종류 (fx가 그릴 때 쓸 수 있다)
  beginAttack(e, THROW, windup, { projectile });
}

function startShove(game, e) {
  facePlayer(game, e);
  e.ai.shove = true;
  e.ai.hitDone = false;
  e.ai.shoveCd = T.shoveCooldown;
  e.vx = 0;
  beginAttack(e, T.shove, T.shove.windup);
}

function endAttack(game, e) {
  e.attack = null;
  e.action = null;
  reset(e);
  e.cooldown = rand(T.cooldown);
  releaseSlot(game, e);
  setState(e, 'idle');
}

function updateAttack(game, e, dt) {
  const a = e.attack;
  e.vx = 0;
  if (a.phase === 'windup') {
    a.timeToHit = Math.max(0, a.timeToHit - dt);
    if (a.timeToHit > 0) return;
    a.phase = 'active';
    forceState(e, 'attack');
    emit(EV.ENEMY_ATTACK, { enemy: e, kind: a.kind });
    if (e.ai.shove) {
      e.ai.hitDone = meleeHit(game, e, T.shove);
    } else {
      spawnProjectile(game, e, a.projectile);
      e.ai.burstLeft--;
    }
  } else if (a.phase === 'active') {
    if (e.ai.shove && !e.ai.hitDone) e.ai.hitDone = meleeHit(game, e, T.shove);
    if (e.stateTime >= (e.ai.shove ? T.shove.active : T.throwActive)) {
      a.phase = 'recover';
      e.ai.recoverTime = e.ai.shove ? T.shoveRecover : e.ai.burstLeft > 0 ? T.burstGap : T.throwRecover;
      e.vulnerable = e.ai.recoverTime;
      if (e.ai.shove || e.ai.burstLeft <= 0) releaseSlot(game, e);
      forceState(e, 'recover');
    }
  } else if (e.stateTime >= e.ai.recoverTime) {
    const p = game.player;
    if (!e.ai.shove && e.ai.burstLeft > 0 && p.alive) startThrow(game, e, T.burstWindup);
    else endAttack(game, e);
  }
}

function update(game, e, dt) {
  e.ai.shoveCd -= dt;
  if (e.attack) { updateAttack(game, e, dt); return; }
  const p = game.player;
  const dist = facePlayer(game, e);
  e.cooldown -= dt;
  e.action = null;
  if (!p.alive) {
    e.vx = 0;
    releaseSlot(game, e);
    setState(e, 'idle');
    return;
  }

  if (dist < T.shoveRange && e.ai.shoveCd <= 0) { startShove(game, e); return; }

  // 가까우면 플레이어를 본 채로 뒷걸음질하고, 멀면 다가간다. 스테이지 끝에 몰리면 더 물러나지 못한다.
  const width = game.stage ? game.stage.width : 480;
  const cornered = e.facing > 0 ? e.x < T.cornerMargin : e.x > width - T.cornerMargin;
  if (dist < T.keepMin) e.vx = cornered ? 0 : -e.facing * T.retreatSpeed;
  else if (dist > T.keepMax) e.vx = e.facing * T.speed;
  else e.vx = 0;
  setState(e, e.vx ? 'walk' : 'idle');

  if (e.cooldown <= 0 && dist >= T.throwMinDist && dist <= T.throwMaxDist && requestSlot(game, e, 'ranged')) {
    e.ai.burstLeft = T.burst;
    startThrow(game, e, T.throwWindup);
  }
}

export const shooter = { T, brain: { init, reset, update } };
