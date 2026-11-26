// 2인 대전용 파이터. 스토리 모드의 주인공과 같은 킥(4타 콤보, 날아차기, 패링)에 가드와 궁극기를 더했다.
// 한 명이라는 전제 없이 "입력을 받는 쪽"과 "상대"를 따로 받는다. 입력만 바꾸면 온라인 대전에도 쓸 수 있다.
// 입력 inp = { dir: -1|0|1, kick: 이번에 눌림, jump: 이번에 눌림, jumpHeld, guard: 누르는 중 }
import { GROUND_Y } from '../core/config.js';
import { EV, emit } from '../core/events.js';
import { makeEntity, applyPhysics } from '../core/entity.js';
import { T } from '../player/tuning.js';
import { PV } from './tuning.js';

const EPS = 1e-6;
export const CLASH_EV = 'pvp:clash'; // { move, x, y }  같은 기술이 맞부딪혔다
export const BLOCK_EV = 'pvp:block'; // { x, y }        가드로 막았다
export const ULT_EV = 'pvp:ult';     // { fighter, step: 'start' | 'hit', x, y }  궁극기

const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));
const LV = PV.level - 1;
const DMG = 1 + T.level.damageBonus * LV;
const KB = 1 + T.level.knockbackBonus * LV;

export function createFighter(index, x, facing) {
  return makeEntity({
    kind: 'fighter', type: index === 0 ? 'pvp1' : 'pvp2', index,
    x, y: GROUND_Y, facing, hp: PV.hp, maxHp: PV.hp,
    kick: {
      level: PV.level, phase: 'idle', step: 0, comboLength: T.combo.length, move: null, foot: null,
      time: 0, hitAt: 0, strikeTime: 0, recoverTime: 0, connected: false, parry: false, comboTime: 0, hitDone: false,
      ult: false,     // 지금 차는 킥이 궁극기다
    },
    counterTime: 0,   // 패링 뒤 카운터 찬스
    noAttack: 0,      // 공격 불능 남은 시간
    hurtTime: 0,
    flash: 0,         // 맞은 직후 번쩍임
    guarding: false,  // 가드 중
    meter: 0,         // 궁극기 게이지. 준 데미지만큼 차고, PV.ult.cost가 되면 쓸 수 있다
    kickBuf: 0, jumpBuf: 0, jumpHeld: false,
    fly: null,        // { hit, landed }
    airKicked: false,
  });
}

function setState(f, s) {
  if (f.state !== s) { f.state = s; f.stateTime = 0; }
}

function endCombo(f) {
  Object.assign(f.kick, { phase: 'idle', step: 0, move: null, foot: null, time: 0, connected: false, parry: false, comboTime: 0, hitDone: false, ult: false });
}

// 지금 차는 킥의 수치: 콤보의 한 타, 또는 궁극기
const specOf = (k) => (k.ult ? PV.ult : T.combo[k.step]);
// 기술의 단계. 서로 다른 기술이 동시에 닿으면 단계가 높은 쪽이 이긴다 (궁극기 > 찍기 = 날아차기 > 미들킥 > 하이킥 > 카프킥)
const rankOf = (k) => (k.ult ? 9 : k.step);

const frontDist = (f, o) => (o.x - f.x) * f.facing;
const inReach = (f, o, range) => {
  const d = frontDist(f, o);
  return d >= -T.kick.backReach && d <= range + o.w / 2 && Math.abs(o.y - f.y) <= T.kick.vertReach;
};

// 패링: 상대의 발이 닿기 직전에 낸 킥은 그 킥을 쳐낸다
function tryParry(f, o) {
  const k = f.kick, ok = o.kick;
  if (!o.alive || ok.phase !== 'strike' || ok.hitDone || o.fly) return;
  const tth = ok.hitAt - ok.time;
  // 상대가 먼저 찬 킥이어야 한다. 둘이 같은 순간에 차면 패링이 아니다.
  if (ok.time < PV.parryLead - EPS || tth < 0 || tth > PV.parryWindow || frontDist(o, f) <= 0 || Math.abs(o.x - f.x) > PV.parryRange) return;
  k.parry = true;
  k.connected = true;
  k.hitDone = true;
  k.strikeTime = T.parry.strike;
  k.recoverTime = T.parry.recover;
  f.counterTime = PV.counterTime;
  endCombo(o);
  o.hurtTime = PV.parryStun;
  o.noAttack = Math.max(o.noAttack, PV.parryStun);
  o.vx = -o.facing * 40;
  o.state = 'hurt';
  o.stateTime = 0;
  emit(EV.PARRY_SUCCESS, { enemy: o, projectile: null, x: (f.x + o.x) / 2, y: f.y - 14 });
}

function startKick(f, o, step, fresh, dir) {
  const k = f.kick;
  const m = T.combo[step];
  if (dir) f.facing = dir;
  Object.assign(k, {
    phase: 'strike', step, move: m.move, foot: m.foot, time: 0, hitAt: m.startup,
    strikeTime: m.startup + m.active, recoverTime: m.recover, connected: false, parry: false, comboTime: 0, hitDone: false, ult: false,
  });
  f.kickBuf = 0;
  f.guarding = false;
  f.state = 'kick';
  f.stateTime = 0;
  f.vx = 0;
  emit(EV.KICK_START, { move: m.move, foot: m.foot, step, level: k.level });
  if (fresh) tryParry(f, o);
}

// 궁극기: 회전 채찍차기. 몸을 지면과 수평으로 눕혀 옆으로 돌면서 한쪽 다리로 채찍처럼 후려친다.
// 게이지를 다 쓰고, 예고가 길지만 가드로 막을 수 없다 (패링과 점프로만 대응한다).
function startUlt(f) {
  const k = f.kick, U = PV.ult;
  endCombo(f);
  Object.assign(k, {
    phase: 'strike', step: k.comboLength - 1, move: U.move, foot: U.foot, time: 0, hitAt: U.startup,
    strikeTime: U.startup + U.active, recoverTime: U.recover, connected: false, hitDone: false, ult: true,
  });
  f.meter = 0;
  f.kickBuf = 0;
  f.guarding = false;
  f.state = 'kick';
  f.stateTime = 0;
  f.vx = 0;
  emit(EV.KICK_START, { move: U.move, foot: U.foot, step: k.step, level: 5 });
  emit(ULT_EV, { fighter: f, step: 'start', x: f.x, y: f.y - 20 });
}

function startFly(f, dir) {
  const k = f.kick, F = T.fly;
  if (dir) f.facing = dir;
  endCombo(f);
  Object.assign(k, { phase: 'strike', step: k.comboLength - 1, move: 'fly', foot: 'right', time: 0, hitAt: F.startup, strikeTime: F.startup, recoverTime: F.land, connected: false });
  f.kickBuf = 0;
  f.airKicked = true;
  f.fly = { hit: false, landed: -1 };
  f.state = 'kick';
  f.stateTime = 0;
  f.vx = f.facing * F.boost;
  emit(EV.KICK_START, { move: 'fly', foot: 'right', step: k.step, level: k.level });
}

// 한 스텝. 이번 스텝에 닿은 타격은 바로 적용하지 않고 hits에 모은다 (둘이 동시에 차면 함께 따져 보도록).
export function stepFighter(game, f, o, inp, dt, hits) {
  const k = f.kick, M = T.move;
  f.stateTime += dt;
  f.counterTime = Math.max(0, f.counterTime - dt);
  f.noAttack = Math.max(0, f.noAttack - dt);
  f.flash = Math.max(0, f.flash - dt);
  if (inp.kick) f.kickBuf = T.input.kickBuffer;
  if (inp.jump) f.jumpBuf = T.input.jumpBuffer; else f.jumpBuf = Math.max(0, f.jumpBuf - dt);
  const wasGuarding = f.guarding;
  f.guarding = false;

  if (!f.alive) {
    f.vx = approach(f.vx, 0, T.hurt.decel * dt);
  } else if (f.state === 'hurt') {
    f.vx = approach(f.vx, 0, T.hurt.decel * dt);
    f.kickBuf = Math.max(0, f.kickBuf - dt);
    if (f.stateTime >= f.hurtTime) setState(f, f.onGround ? 'idle' : 'jump');
  } else if (f.fly) {
    // 날아차기
    const F = T.fly;
    k.time += dt;
    if (f.fly.landed < 0) {
      if (!f.fly.hit && k.time >= F.startup - EPS && o.alive) {
        const d = frontDist(f, o);
        if (d >= -10 && d <= F.range + o.w / 2 && f.y >= o.y - o.h - 10 && f.y <= o.y + 20) {
          f.fly.hit = true;
          k.connected = true;
          hits.push({ a: f, o, move: 'fly', foot: 'right', step: k.step, rank: rankOf(k), damage: F.damage, knockback: F.knockback, big: true, height: 14 });
          f.vx = -f.facing * 50;
          f.vy = Math.min(f.vy, -F.bounce);
        }
      }
      if (f.onGround) {
        f.fly.landed = 0;
        f.vx = 0;
        k.phase = 'recover';
        k.recoverTime = F.land + (f.fly.hit ? 0 : F.whiff);
        setState(f, 'recover');
        if (!f.fly.hit) emit(EV.KICK_MISS, { move: 'fly', x: f.x + f.facing * F.range, y: f.y - 6 });
      }
    } else {
      f.fly.landed += dt;
      if (f.fly.landed >= k.recoverTime - EPS) { f.fly = null; endCombo(f); setState(f, 'idle'); }
    }
  } else if (k.phase === 'strike') {
    const m = specOf(k);
    k.time += dt;
    const gap = frontDist(f, o);
    f.vx = !k.parry && k.time < m.startup && (gap <= 0 || gap > T.kick.minGap) ? f.facing * m.advance / m.startup : 0;
    if (!k.hitDone && k.time >= m.startup - EPS) {
      if (o.alive && inReach(f, o, m.range)) {
        k.hitDone = true;
        k.connected = true;
        hits.push({ a: f, o, move: m.move, foot: m.foot, step: k.step, rank: rankOf(k), damage: m.damage, knockback: m.knockback, big: !!m.finisher, height: m.height, ult: k.ult });
      }
    }
    if (k.time >= k.strikeTime - EPS) {
      if (!k.connected) {
        k.recoverTime = m.recover + m.whiff; // 헛발질
        f.kickBuf = 0;
        emit(EV.KICK_MISS, { move: m.move, x: f.x + f.facing * m.range, y: f.y - m.height });
      }
      k.phase = 'recover';
      setState(f, 'recover');
    }
  } else if (k.phase === 'recover') {
    const m = specOf(k);
    k.time += dt;
    f.vx = approach(f.vx, 0, M.decel * dt);
    const canChain = k.connected && !k.ult && (!m.finisher || k.parry);
    if (canChain && f.kickBuf > 0 && f.noAttack <= 0 && k.time >= (k.parry ? k.strikeTime : k.strikeTime + m.chain) - EPS) {
      startKick(f, o, (k.step + 1) % T.combo.length, inp.kick, inp.dir);
    } else {
      if (!canChain) f.kickBuf = Math.max(0, f.kickBuf - dt);
      if (k.time >= k.strikeTime + k.recoverTime - EPS) {
        if (canChain && !m.finisher) { k.phase = 'idle'; k.comboTime = T.kick.comboKeep; } else endCombo(f);
        setState(f, 'idle');
      }
    }
  } else {
    // 자유 상태: 이동, 점프, 가드, 킥 시작
    if (k.comboTime > 0) { k.comboTime -= dt; if (k.comboTime <= 0) endCombo(f); }
    const dir = inp.dir;
    // 가드는 멈춰 있거나 거의 멈췄을 때만 잡힌다. 잡은 동안에는 움직이지 못한다.
    const canGuard = inp.guard && f.onGround && (wasGuarding || Math.abs(f.vx) <= PV.guard.maxSpeed);
    let started = false;
    if (f.kickBuf > 0 && f.noAttack <= 0) {
      if (f.onGround && inp.guard && f.meter >= PV.ult.cost) { startUlt(f); started = true; } // 가드 + 킥 = 궁극기
      else if (f.onGround) { startKick(f, o, k.comboTime > 0 ? k.step + 1 : 0, inp.kick, dir); started = true; }
      else if (!f.airKicked) { startFly(f, dir); started = true; }
    }
    if (!started) {
      f.kickBuf = Math.max(0, f.kickBuf - dt);
      if (f.onGround) {
        f.airKicked = false;
        // 땅에서는 항상 상대를 마주 본다
        if (Math.abs(o.x - f.x) > T.move.faceDeadzone) f.facing = o.x > f.x ? 1 : -1;
        if (canGuard) {
          f.guarding = true;
          f.vx = approach(f.vx, 0, M.decel * dt);
          f.jumpBuf = 0;
        } else {
          const max = dir === f.facing ? M.fwdSpeed : M.backSpeed;
          f.vx = approach(f.vx, dir * max, (dir ? M.accel : M.decel) * dt);
          if (f.jumpBuf > 0) { f.vy = T.jump.v; f.onGround = false; f.jumpBuf = 0; f.jumpHeld = true; }
        }
      } else if (dir) {
        f.vx = approach(f.vx, dir * M.airSpeed, M.airAccel * dt);
      }
      if (f.jumpHeld && (!inp.jumpHeld || f.vy >= 0)) {
        f.jumpHeld = false;
        if (f.vy < T.jump.cutV) f.vy = T.jump.cutV;
      }
      setState(f, !f.onGround ? 'jump' : f.guarding ? 'guard' : dir ? 'walk' : 'idle');
    }
  }

  if (!f.onGround && f.vy > 0) f.vy += T.jump.fallExtra * dt;
  applyPhysics(f, dt, game);
}

// 킥을 끝내고 빈틈으로 넘긴다 (맞부딪혔거나, 더 높은 단계에 밀렸거나, 가드에 막혔을 때)
function cutKick(f, recover, pushDir, push) {
  const k = f.kick;
  k.hitDone = true;
  k.connected = false;
  k.phase = 'recover';
  k.strikeTime = k.time;
  k.recoverTime = recover;
  f.kickBuf = 0;
  f.vx = pushDir * push;
  if (f.fly) { f.fly.hit = true; f.vy = Math.min(f.vy, -120); }
  else { f.state = 'recover'; f.stateTime = 0; }
}

// 맞부딪힘: 같은 기술이 동시에(또는 거의 동시에) 맞닿으면 둘 다 데미지 없이 튕겨 나간다
function clash(a, o, h) {
  const d = o.x >= a.x ? 1 : -1;
  cutKick(a, PV.clashRecover, -d, PV.clashPush);
  cutKick(o, PV.clashRecover, d, PV.clashPush);
  a.flash = o.flash = 0.06;
  emit(CLASH_EV, { move: h.move, x: (a.x + o.x) / 2, y: Math.min(a.y, o.y) - h.height });
}

// 상대도 킥을 뻗는 중이고 그 발이 곧 닿을 참인가 (같은 스텝에 서로 맞혔으면 mutual)
function meeting(h) {
  const ok = h.o.kick;
  return h.o.alive && ok.phase === 'strike' && !ok.parry && (!ok.hitDone || h.mutual) && ok.hitAt - ok.time <= PV.clashWindow;
}

// 모아 둔 타격을 한꺼번에 적용한다. mult: 60초 뒤의 데미지 배율
export function applyHits(hits, mult) {
  // 둘이 같은 스텝에 서로를 맞혔는지 표시
  for (const h of hits) h.mutual = hits.some((g) => g !== h && g.a === h.o && g.o === h.a);
  const done = new Set();
  for (const h of hits) {
    const { a, o } = h;
    if (done.has(a)) continue; // 이미 맞부딪혔거나 밀려서 무효가 된 킥
    if (meeting(h)) {
      const theirs = rankOf(o.kick);
      if (o.kick.move === h.move) { done.add(a); done.add(o); clash(a, o, h); continue; } // 같은 기술: 서로 막힌다
      if (theirs > h.rank) { a.kick.connected = false; continue; } // 상대 기술의 단계가 더 높다: 내 킥은 밀리고 상대 킥만 맞는다
      if (theirs < h.rank) done.add(o);    // 내 단계가 더 높다: 상대 킥은 무효 (같은 스텝에 닿았더라도)
      // 단계가 같은 다른 기술(찍기와 날아차기)은 둘 다 맞는다
    }
    if (!o.alive) continue;

    const counter = a.counterTime > 0;
    const full = h.damage * DMG * (counter ? PV.counterDamage : 1) * mult;
    const dir = o.x >= a.x ? 1 : -1;

    // 가드: 정면에서 오는 콤보 1~3타를 막는다. 찍기, 날아차기, 궁극기는 못 막는다.
    if (o.guarding && !h.big && !h.ult && frontDist(o, a) > 0) {
      const chip = full * PV.guard.chip;
      o.hp = Math.max(0.01, o.hp - chip); // 가드 데미지로는 쓰러지지 않는다
      o.vx = dir * PV.guard.push;
      o.flash = 0.05;
      a.meter = Math.min(PV.ult.cost, a.meter + chip);
      cutKick(a, specOf(a.kick).recover + PV.guard.blockedExtra, -dir, 30); // 막힌 쪽은 빈틈이 길어진다
      emit(BLOCK_EV, { x: o.x - dir * 8, y: o.y - h.height });
      continue;
    }

    const crit = h.big || counter;
    o.hp = Math.max(0, o.hp - full);
    a.meter = Math.min(PV.ult.cost, a.meter + (h.ult ? 0 : full)); // 준 데미지만큼 궁극기 게이지가 찬다
    o.flash = 0.12;
    endCombo(o);
    o.fly = null;
    o.kickBuf = 0;
    o.guarding = false;
    o.state = 'hurt';
    o.stateTime = 0;
    if (h.big) {
      // 찍기, 날아차기, 궁극기: 쓰러지지 않고 크게 밀려나며 잠깐 공격을 못 한다
      o.hurtTime = PV.bigFlinch;
      o.vx = dir * h.knockback * KB * PV.bigKnockback;
      o.noAttack = Math.max(o.noAttack, h.ult ? PV.ult.noAttack : PV.noAttack);
    } else {
      o.hurtTime = PV.flinch;
      o.vx = dir * h.knockback * KB * PV.flinchKnockback;
    }
    if (o.hp <= 0) {
      o.alive = false;
      o.state = 'dead';
      o.stateTime = 0;
      o.vx = dir * 160;
      o.vy = -220;
      o.onGround = false;
    }
    emit(EV.KICK_HIT, {
      target: o, attacker: a, move: h.move, foot: h.foot, step: h.step, finisher: h.big, crit, damage: full,
      level: h.ult ? 5 : PV.level, x: o.x, y: o.y - h.height, counter, dir,
    });
    if (h.ult) emit(ULT_EV, { fighter: a, step: 'hit', x: o.x, y: o.y - h.height });
  }
}
