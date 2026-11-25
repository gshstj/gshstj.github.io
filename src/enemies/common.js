// [B 담당] 모든 적이 함께 쓰는 로직: 생성, 피격 반응, 패링당함, 근접 판정, 공통 상태(hurt, stun, down) 처리.
// 타입별 AI는 def.brain에 있다. def = { T: 수치, brain: { init, update, reset, brace?, onWeakHit?, afterHurt? } }
import { EV, emit } from '../core/events.js';
import { makeEntity, setState, applyPhysics } from '../core/entity.js';
import { COMMON } from './tuning.js';
import { releaseSlot } from './director.js';
import { EEV } from './events.js';

export const rand = ([a, b]) => a + Math.random() * (b - a);

// 같은 상태로 다시 들어갈 때도 stateTime을 0으로 돌린다 (연속 피격 등)
export function forceState(e, state) {
  e.state = state;
  e.stateTime = 0;
}

export function createEnemy(game, type, x, def) {
  const T = def.T;
  const p = game.player;
  const e = makeEntity({
    kind: 'enemy', type, x, w: T.w, h: T.h, hp: T.hp, maxHp: T.hp,
    facing: p && p.x > x ? 1 : -1,

    // 계약: 공격 중이 아니면 null.
    // { kind: 'high'|'low'|'dash'|'throw', phase: 'windup'|'active'|'recover', timeToHit, parryable, windup }
    // windup은 예고 전체 길이(초)다. fx가 진행도를 그릴 때 쓸 수 있다.
    attack: null,

    // 계약 밖의 선택 정보. fx와 ui가 읽어도 되고 무시해도 된다.
    action: null,     // state보다 자세한 동작 이름. 'punch1'|'punch2'|'lowkick'|'brace'|'throw'|'shove'|'crouch'|'dash'|'strike'|'swap'
    armor: false,     // 버티기 중 (약한 타격에 멈칫하지 않고 데미지가 줄어든다)
    vulnerable: 0,    // 빈틈 남은 시간. 0보다 크면 콤보가 끝까지 들어간다
    launched: false,  // 강타에 맞아 날아가는 중
    flash: 0,         // 버티기 중 맞은 직후 잠깐 0보다 크다

    // 내부 값
    cooldown: rand(T.firstCooldown),
    hurtTime: 0,
    stunLeft: 0,
    hitStreak: 0, streakTime: 0,
    ai: {},
  });
  def.brain.init(e);
  e.takeHit = (hit) => takeHit(game, e, def, hit);
  e.onParried = () => onParried(game, e, def);
  return e;
}

// 하던 공격을 그만둔다 (맞았거나 패링당했을 때)
export function cancelAttack(game, e, def) {
  e.attack = null;
  e.armor = false;
  e.action = null;
  def.brain.reset(e);
  releaseSlot(game, e);
}

// 예고를 시작한다. spec = { kind, parryable, action }
export function beginAttack(e, spec, windup, extra) {
  e.attack = Object.assign({ kind: spec.kind, phase: 'windup', timeToHit: windup, parryable: !!spec.parryable, windup }, extra);
  e.action = spec.action || null;
  forceState(e, 'windup');
  emit(EV.ENEMY_TELEGRAPH, { enemy: e, kind: spec.kind, timeToHit: windup });
}

// 근접 타격 판정. spec = { reach, back?, height: 'high'|'mid'|'low', damage, knockback }
// 맞혔으면 true. 플레이어가 무적이라 안 맞았으면 false (타격 시간 동안 다시 시도한다).
export function meleeHit(game, e, spec) {
  const p = game.player;
  if (!p || !p.alive) return false;
  const front = (p.x - e.x) * e.facing;
  if (front < -(spec.back || 6) || front > spec.reach + p.w / 2) return false;
  if (spec.height === 'low' && p.y < e.y - COMMON.lowClear) return false; // 점프로 피했다
  if (spec.height === 'mid' && p.y < e.y - COMMON.midClear) return false;
  return p.takeHit({ damage: spec.damage, knockback: spec.knockback, source: e }) !== false;
}

function die(game, e, def, dir, knockback, crit) {
  const T = def.T;
  cancelAttack(game, e, def);
  e.alive = false;
  e.hp = 0;
  e.launched = false;
  e.vulnerable = 0;
  e.stunLeft = 0;
  e.vx = dir * Math.max(knockback, 60) * (crit ? T.launchMult : 0.5);
  e.vy = -(crit ? T.launchVy : COMMON.deathPop);
  e.onGround = false;
  forceState(e, 'down');
  emit(EV.ENEMY_DOWN, { enemy: e, crit, x: e.x, y: e.y });
}

// 계약: enemy.takeHit({ damage, knockback, crit, source }). dir은 내부용(투척물이 날아가던 방향).
export function takeHit(game, e, def, { damage = 1, knockback = 80, crit = false, source = null, dir = 0 } = {}) {
  if (!e.alive) return false;
  const T = def.T;
  const d = dir || (source && source.x > e.x ? -1 : 1);
  const x = e.x, y = e.y - e.h / 2;
  const open = e.vulnerable > 0 || e.stunLeft > 0; // 빈틈: 스턴 중이거나 헛친 직후
  const weakNeutral = !crit && !open && e.state !== 'down' && !e.launched;

  // 연타 대응 1: 약한 타격을 연달아 맞으면 그 타격부터 막고 반격한다 (격투형)
  if (weakNeutral && !e.armor && T.braceHits) {
    const streak = e.streakTime > 0 ? e.hitStreak + 1 : 1;
    if (streak >= T.braceHits) {
      e.hitStreak = 0;
      e.streakTime = 0;
      def.brain.brace(game, e);
      emit(EEV.ENEMY_BRACE, { enemy: e, x, y });
    }
  }

  // 버티기: 데미지만 줄여 받고 하던 동작을 계속한다
  if (e.armor) {
    const dmg = damage * T.armorDamageMult;
    e.hp -= dmg;
    e.flash = COMMON.flashTime;
    emit(EV.ENEMY_HIT, { enemy: e, damage: dmg, crit, x, y, armored: true });
    if (e.hp <= 0) die(game, e, def, d, knockback, crit);
    return true;
  }

  e.hp -= damage;
  emit(EV.ENEMY_HIT, { enemy: e, damage, crit, x, y, armored: false });
  if (e.hp <= 0) { die(game, e, def, d, knockback, crit); return true; }

  // 날아가 누워 있는 중의 추가타: 조금 밀릴 뿐 일어나는 시간은 그대로다
  if (e.state === 'down') {
    e.vx = d * knockback * 0.2;
    return true;
  }

  cancelAttack(game, e, def);
  e.cooldown = Math.max(e.cooldown, T.afterHurtDelay);

  if (crit && knockback >= COMMON.launchKnockback) {
    // 강타(콤보 마무리, 반사된 투척물): 날아가서 쓰러진다
    e.vx = d * knockback * T.launchMult;
    e.vy = -T.launchVy;
    e.onGround = false;
    e.launched = true;
    e.stunLeft = 0;
    e.vulnerable = 0;
    e.hitStreak = 0;
  } else {
    e.hurtTime = crit ? T.critFlinch : T.flinch;
    e.vx = d * knockback * (open ? T.kbMultOpen : T.kbMult);
    if (open) e.vulnerable = Math.max(e.vulnerable, COMMON.comboGrace);
    if (weakNeutral) {
      e.hitStreak = e.streakTime > 0 ? e.hitStreak + 1 : 1;
      e.streakTime = COMMON.streakReset;
      // 연타 대응 2: 타입별 반응 (스피드형은 사거리 밖으로 튕겨 나간다)
      if (def.brain.onWeakHit) def.brain.onWeakHit(game, e, d);
    }
  }
  forceState(e, 'hurt');
  return true;
}

// 계약: enemy.onParried(). 공격이 쳐내져 스턴에 걸린다. 스턴 중에는 콤보가 끝까지 들어간다.
export function onParried(game, e, def) {
  if (!e.alive || e.state === 'down' || e.launched) return;
  const T = def.T;
  cancelAttack(game, e, def);
  e.stunLeft = T.stun;
  e.vulnerable = T.stun;
  e.hitStreak = 0;
  e.streakTime = 0;
  e.vx = -e.facing * COMMON.parryPush;
  forceState(e, 'stun');
}

function slowDown(e, dt) {
  if (e.onGround) e.vx *= Math.exp(-COMMON.friction * dt);
}

// 적 하나의 한 스텝. hurt, stun, down은 여기서 처리하고 나머지는 타입별 AI에 맡긴다.
export function stepEnemy(game, e, def, dt) {
  const T = def.T;
  e.stateTime += dt;

  if (!e.alive) {
    slowDown(e, dt);
    applyPhysics(e, dt, game);
    return;
  }

  e.flash = Math.max(0, e.flash - dt);
  e.vulnerable = Math.max(0, e.vulnerable - dt);
  e.stunLeft = Math.max(0, e.stunLeft - dt);
  if (e.streakTime > 0) {
    e.streakTime -= dt;
    if (e.streakTime <= 0) e.hitStreak = 0;
  }

  if (e.state === 'hurt') {
    if (e.launched) {
      // 날아가는 중. 땅에 닿으면 쓰러진다 (alive는 그대로 true)
      if (e.onGround) {
        e.launched = false;
        e.vx *= 0.4;
        forceState(e, 'down');
      }
    } else {
      slowDown(e, dt);
      if (e.stateTime >= e.hurtTime) {
        if (e.stunLeft > 0) {
          forceState(e, 'stun');
        } else {
          setState(e, 'idle');
          if (def.brain.afterHurt) def.brain.afterHurt(game, e);
        }
      }
    }
  } else if (e.state === 'stun') {
    slowDown(e, dt);
    if (e.stunLeft <= 0) setState(e, 'idle');
  } else if (e.state === 'down') {
    slowDown(e, dt);
    if (e.stateTime >= T.knockdown) {
      e.hitStreak = 0;
      setState(e, 'idle');
      emit(EEV.ENEMY_GETUP, { enemy: e });
    }
  } else {
    def.brain.update(game, e, dt);
  }

  applyPhysics(e, dt, game);
}
