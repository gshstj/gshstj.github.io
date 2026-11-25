// [B 담당] 격투형. 다가와서 상단 2연타 후 하단 발차기를 낸다.
// - 공격 중(예고와 타격)에는 버티기(armor)라 약한 타격으로 끊기지 않는다.
// - 주먹은 패링할 수 없다. 뒤로 물러나 피한다. 하단 발차기는 패링하거나 점프로 피한다.
// - 2타와 발차기 사이, 그리고 콤보가 끝난 뒤에 빈틈이 있다. 이때 맞으면 콤보가 끝까지 들어간다.
// - 빈틈이 아닐 때 약한 타격을 3번 연달아 맞으면 막고 하단 반격을 낸다 (연타만으로는 못 이긴다).
import { EV, emit } from '../core/events.js';
import { setState } from '../core/entity.js';
import { BRAWLER as T } from './tuning.js';
import { beginAttack, forceState, meleeHit, rand } from './common.js';
import { requestSlot, releaseSlot } from './director.js';

function init(e) {
  e.ai = { step: 0, counter: false, hitDone: false, lungeSpeed: 0, next: -1, recoverTime: 0 };
}

function reset(e) {
  e.ai.step = 0;
  e.ai.counter = false;
  e.ai.next = -1;
}

const spec = (e) => (e.ai.counter ? T.counter : T.combo[e.ai.step]);

function facePlayer(game, e) {
  const dx = game.player.x - e.x;
  if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
  return Math.abs(dx);
}

// 콤보의 i번째 공격 예고를 시작한다
function startStep(game, e, i) {
  const s = T.combo[i];
  e.ai.step = i;
  e.ai.counter = false;
  e.ai.hitDone = false;
  const dist = facePlayer(game, e);
  // 플레이어가 물러났으면 예고 시작에 조금 파고든다
  const lunge = Math.max(0, Math.min(s.lunge, dist - T.attackRange));
  e.ai.lungeSpeed = lunge / T.lungeTime;
  e.armor = true;
  beginAttack(e, s, s.windup);
}

// 연타를 막고 반격한다. common의 takeHit이 부른다.
function brace(game, e) {
  const s = T.counter;
  releaseSlot(game, e);
  e.ai.counter = true;
  e.ai.hitDone = false;
  e.ai.lungeSpeed = 0;
  facePlayer(game, e);
  e.armor = true;
  e.vx = 0;
  beginAttack(e, s, s.windup);
}

function endAttack(game, e) {
  e.attack = null;
  e.action = null;
  e.armor = false;
  reset(e);
  e.cooldown = rand(T.cooldown);
  releaseSlot(game, e);
  setState(e, 'idle');
}

function updateAttack(game, e, dt) {
  const a = e.attack;
  const s = spec(e);
  if (a.phase === 'windup') {
    e.vx = e.stateTime < T.lungeTime ? e.facing * e.ai.lungeSpeed : 0;
    a.timeToHit = Math.max(0, a.timeToHit - dt);
    if (a.timeToHit <= 0) {
      a.phase = 'active';
      e.vx = 0;
      forceState(e, 'attack');
      emit(EV.ENEMY_ATTACK, { enemy: e, kind: a.kind });
      e.ai.hitDone = meleeHit(game, e, s);
    }
  } else if (a.phase === 'active') {
    e.vx = 0;
    if (!e.ai.hitDone) e.ai.hitDone = meleeHit(game, e, s);
    if (e.stateTime >= s.active) {
      // 타격이 끝나면 버티기가 풀린다. 다음 공격까지가 빈틈이다.
      a.phase = 'recover';
      e.armor = false;
      const p = game.player;
      const last = e.ai.counter || e.ai.step >= T.combo.length - 1;
      const inReach = p.alive && Math.abs(p.x - e.x) <= T.chaseRange;
      e.ai.next = !last && inReach ? e.ai.step + 1 : -1;
      e.ai.recoverTime = e.ai.next >= 0 ? s.gap : e.ai.counter ? T.counterRecover : last ? T.recover : T.abortRecover;
      e.vulnerable = e.ai.recoverTime;
      if (e.ai.next < 0) releaseSlot(game, e); // 마지막 빈틈 동안 다음 적이 차례를 받아 다가온다
      forceState(e, 'recover');
    }
  } else {
    e.vx = 0;
    if (e.stateTime >= e.ai.recoverTime) {
      if (e.ai.next >= 0) startStep(game, e, e.ai.next);
      else endAttack(game, e);
    }
  }
}

function update(game, e, dt) {
  if (e.attack) { updateAttack(game, e, dt); return; }
  const p = game.player;
  const dist = facePlayer(game, e);
  e.cooldown -= dt;
  e.action = null;
  e.armor = false;
  if (!p.alive) {
    e.vx = 0;
    releaseSlot(game, e);
    setState(e, 'idle');
    return;
  }

  // 공격 차례를 받으면 붙고, 아니면 킥 사거리 바로 밖에서 기다린다
  const engaged = e.cooldown <= 0 && requestSlot(game, e, 'melee');
  if (engaged && dist <= T.attackRange + 2) { startStep(game, e, 0); return; }
  if (engaged) e.vx = e.facing * T.speed; // 위에서 걸리지 않았으면 아직 멀다
  else if (dist > T.standoff + 3) e.vx = e.facing * T.speed;
  else if (dist < T.standoff - 8) e.vx = -e.facing * T.speed * 0.7;
  else e.vx = 0;
  setState(e, e.vx ? 'walk' : 'idle');
}

export const brawler = { T, brain: { init, reset, update, brace } };
