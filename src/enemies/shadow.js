// [B 담당] 보스: 어둠의 주인공. 주인공의 킥 콤보를 그대로 쓰는 미러전 상대. 발차기만 한다.
// 흐름은 격투형과 같다 (예고 → 타격 → 빈틈). 차이는 콤보가 4타 킥이고 전부 패링할 수 있다는 점이다.
import { EV, emit } from '../core/events.js';
import { setState } from '../core/entity.js';
import { GROUND_Y } from '../core/config.js';
import { SHADOW, SHADOW2, MASTER } from './tuning.js';

// 친선전 피날레를 알리는 이벤트. { enemy, step: 'call' | 'hit', x, y }
const FINALE_EV = 'friendly:finale';
import { beginAttack, forceState, meleeHit, rand } from './common.js';
import { requestSlot, releaseSlot } from './director.js';

function make(T) {
  function init(e) {
    e.boss = true;
    e.bossName = T.name;
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

  function startStep(game, e, i) {
    const s = T.combo[i];
    e.ai.step = i;
    e.ai.counter = false;
    e.ai.hitDone = false;
    const dist = facePlayer(game, e);
    const lunge = Math.max(0, Math.min(s.lunge, dist - T.attackRange));
    e.ai.lungeSpeed = lunge / T.lungeTime;
    e.armor = true;
    beginAttack(e, s, s.windup);
  }

  // 연타를 버티고 내려찍기로 받아친다. common의 takeHit이 부른다.
  function brace(game, e) {
    releaseSlot(game, e);
    e.ai.counter = true;
    e.ai.hitDone = false;
    e.ai.lungeSpeed = 0;
    facePlayer(game, e);
    e.armor = true;
    e.vx = 0;
    beginAttack(e, T.counter, T.counter.windup);
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
        // 타격이 끝나면 버티기가 풀린다. 다음 킥까지가 빈틈이다.
        a.phase = 'recover';
        e.armor = false;
        const p = game.player;
        const last = e.ai.counter || e.ai.step >= T.combo.length - 1;
        const inReach = p.alive && Math.abs(p.x - e.x) <= T.chaseRange;
        e.ai.next = !last && inReach ? e.ai.step + 1 : -1;
        e.ai.recoverTime = e.ai.next >= 0 ? s.gap : e.ai.counter ? T.counterRecover : last ? T.recover : T.abortRecover;
        e.vulnerable = e.ai.recoverTime;
        if (e.ai.next < 0) releaseSlot(game, e);
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

  function master(game, e, dt) {
    const p = game.player;
    const ai = e.ai;
    if (!ai.patched) {
      ai.patched = true;
      ai.clock = 0;
      // 어떤 공격도 가볍게 받아 흘린다
      e.takeHit = () => {
        e.flash = 0.1;
        emit(EV.ENEMY_HIT, { enemy: e, damage: 0, crit: false, x: e.x, y: e.y - e.h / 2, armored: true });
        return true;
      };
      // 패링당해도 한 발 물러날 뿐이다
      e.onParried = () => {
        if (ai.finale) return;
        e.attack = null; e.action = null; e.armor = false;
        reset(e);
        releaseSlot(game, e);
        e.cooldown = 0.45;
        e.vx = -e.facing * 90;
        setState(e, 'idle');
      };
    }
    // 띄워 올리는 기술에도 땅에서 떨어지지 않는다
    if (e.vy < 0) { e.vy = 0; e.y = GROUND_Y; }
    ai.clock += dt;

    if (!ai.finale) {
      if (!p.alive || (p.hp > 1 && ai.clock < T.finaleAfter)) return false;
      // 피날레 시작: 하던 공격을 멈추고 자세를 잡는다
      ai.finale = { phase: 'call', t: 0 };
      e.attack = null; e.armor = true;
      reset(e);
      releaseSlot(game, e);
      e.action = 'brazil';
      e.vx = 0;
      facePlayer(game, e);
      forceState(e, 'idle');
      emit(FINALE_EV, { enemy: e, step: 'call', x: e.x, y: e.y - e.h });
    }

    const f = ai.finale;
    f.t += dt;
    if (f.phase === 'call') {
      e.vx = 0;
      facePlayer(game, e);
      if (f.t >= T.finaleCall) {
        f.phase = 'windup';
        beginAttack(e, { kind: 'high', parryable: false, action: 'brazil' }, T.finaleWindup);
      }
    } else if (f.phase === 'windup') {
      // 예고하는 동안 한 걸음에 거리를 좁힌다
      const dist = facePlayer(game, e);
      e.vx = dist > 24 ? e.facing * Math.min(520, (dist - 22) / Math.max(dt, e.attack.timeToHit)) : 0;
      e.attack.timeToHit = Math.max(0, e.attack.timeToHit - dt);
      if (e.attack.timeToHit <= 0) {
        f.phase = 'strike';
        f.t = 0;
        e.vx = 0;
        e.attack.phase = 'active';
        forceState(e, 'attack');
        emit(EV.ENEMY_ATTACK, { enemy: e, kind: 'high' });
        // 피할 수도 막을 수도 없다
        p.invuln = 0;
        if (p.ctl) { p.ctl.rise = null; p.ctl.fly = null; }
        emit(FINALE_EV, { enemy: e, step: 'hit', x: p.x, y: p.y - 24 });
        p.takeHit({ damage: p.hp + 99, knockback: T.finaleKnockback, source: e });
      }
    } else if (f.phase === 'strike') {
      e.vx = 0;
      if (f.t >= 0.5) {
        f.phase = 'done';
        e.attack = null; e.action = null; e.armor = false;
        setState(e, 'idle');
      }
    } else {
      e.vx = 0;
      setState(e, 'idle');
    }
    return true;
  }

  function update(game, e, dt) {
    if (T.untouchable && master(game, e, dt)) return;
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
    const engaged = e.cooldown <= 0 && requestSlot(game, e, 'melee');
    if (engaged && dist <= T.attackRange + 2) { startStep(game, e, 0); return; }
    if (engaged) e.vx = e.facing * T.speed;
    else if (dist > T.standoff + 3) e.vx = e.facing * T.speed;
    else if (dist < T.standoff - 8) e.vx = -e.facing * T.speed * 0.7;
    else e.vx = 0;
    setState(e, e.vx ? 'walk' : 'idle');
  }

  return { T, brain: { init, reset, update, brace } };
}

export const shadow = make(SHADOW);
export const shadow2 = make(SHADOW2);
export const master = make(MASTER);
