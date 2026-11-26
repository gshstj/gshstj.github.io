// [A 담당] 플레이어 전투 코어: 이동, 점프, 타격(J), K 킥 콤보, 패링, 카프킥 성장 단계.
// 계약: createPlayer, resetPlayer, updatePlayer 내보내기, player.kick 형태, player.takeHit, EV의 플레이어 이벤트.
// 킥은 K 하나로 한다. 충전도 타이밍 바도 없다. 수치는 전부 tuning.js에 있다.
//
// 킥 한 번의 흐름 (kick.time 기준):
//   0 ............ startup ........ startup+active ............ +recover
//   |  발을 뻗는다  |  판정(발이 닿음)  |  발을 거둔다 (맞혔으면 chain 뒤 다음 킥으로 캔슬)  |
//   phase 'strike' (state 'kick')     | phase 'recover' (state 'recover')
import { GROUND_Y } from '../core/config.js';
import { EV, emit, on } from '../core/events.js';
import { down, pressed } from '../core/input.js';
import { makeEntity, applyPhysics, setState } from '../core/entity.js';
import { T } from './tuning.js';

const EPS = 1e-6;
const approach = (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step));

// ---------------------------------------------------------------------------
// 입력
// main 루프는 히트스톱 동안 updatePlayer를 부르지 않는데 pressed()는 매 스텝 지워진다.
// 그대로 두면 히트스톱 중에 누른 K가 사라져 연타가 씹히므로, 눌린 시각을 따로 잡아 둔다.
// 공용 입력의 keydown 리스너보다 늦게 등록해서 키 배치는 pressed()에게 그대로 묻는다.
const LATCHED = ['kick', 'punch', 'jump'];
const latch = { kick: 0, punch: 0, jump: 0 };
let hooked = false;

function hookInput() {
  if (hooked || typeof addEventListener !== 'function') return;
  hooked = true;
  addEventListener('keydown', () => {
    const now = performance.now();
    for (const a of LATCHED) if (pressed(a)) latch[a] = now;
  });
}

// 이번 스텝(또는 그 사이 히트스톱 중)에 눌렸는가
function took(action) {
  const fresh = pressed(action) || (latch[action] > 0 && performance.now() - latch[action] < T.input.latchMs);
  latch[action] = 0;
  return fresh;
}

// ---------------------------------------------------------------------------
// 생성과 초기화
function newCtl() {
  return {
    kickBuf: 0, punchBuf: 0, jumpBuf: 0, // 입력 버퍼 남은 시간
    jumpHeld: false,                     // 점프 키를 누른 채 올라가는 중
    hitList: [],                         // 이번 킥에 이미 맞은 적
    parryMissed: [],                     // 이번 킥을 시작할 때 예고 중이었지만 쳐내지 못한 적
    punchDone: false, punchHit: false,
    xpGain: 0,                           // 아직 반영하지 않은 경험치
    rise: null,
    fly: null,                           // 날아차기 진행 상태 { hit, landed }
    whip: null,                          // 궁극기 진행 상태 { done }
    airKicked: false,                    // 이번 점프에 이미 날아차기를 썼다
  };
}

let offEnemyDown = null;

export function createPlayer(game) {
  const p = makeEntity({
    kind: 'player', type: 'hero', x: T.spawnX, hp: T.hp, maxHp: T.hp,
    // UI와 fx가 읽는 킥 상태
    kick: {
      level: 1,            // 카프킥 성장 단계 1..5
      phase: 'idle',       // 'idle' | 'strike' | 'recover'
      step: 0,             // 지금(또는 마지막으로) 찬 콤보 순서 0..comboLength-1
      comboLength: T.combo.length,
      move: null,          // 'calf' | 'high' | 'mid' | 'axe'
      foot: null,          // 'right' | 'left'
      buffered: false,     // 다음 킥이 예약되어 있다
      // 아래는 계약에 더한 필드 (읽기 전용)
      time: 0,             // 이번 킥을 시작한 뒤 흐른 시간
      hitAt: 0,            // 이번 킥의 발이 닿는 시점 (kick.time 기준)
      strikeTime: 0,       // strike 구간 길이 (hitAt + 판정 시간)
      recoverTime: 0,      // recover 구간 길이 (헛발질이면 길어지고 패링이면 짧아진다)
      connected: false,    // 이번 킥이 맞았거나 무언가를 쳐냈다
      parry: false,        // 이번 킥이 적의 공격을 쳐냈다 (이 킥은 데미지가 없다)
      comboTime: 0,        // 킥이 끝난 뒤 콤보가 이어질 수 있는 남은 시간
      ult: false,          // 지금 궁극기(회전 채찍차기)를 쓰는 중이다. fx가 이 값으로 그림을 바꾼다
      meter: 0,            // 궁극기 게이지 (7단계부터 찬다)
      meterMax: T.whip.cost,
      xp: 0,               // 현재 단계에서 쌓은 경험치
      xpNext: T.level.xpNeed[1], // 다음 단계까지 필요한 경험치 (최고 단계면 0)
    },
    counterTime: 0,        // 패링 후 카운터 찬스 남은 시간
    invuln: 0,
    ctl: newCtl(),         // player 내부용. 다른 모듈은 읽지 않는다
  });
  p.takeHit = (hit) => takeHit(game, p, hit);
  // 적을 쓰러뜨리면 경험치. 강타로 쓰러뜨리면 더 많이 받는다.
  if (offEnemyDown) offEnemyDown();
  offEnemyDown = on(EV.ENEMY_DOWN, ({ crit }) => {
    p.ctl.xpGain += crit ? T.level.xpCrit : T.level.xpNormal;
  });
  return p;
}

function endCombo(p) {
  Object.assign(p.kick, {
    phase: 'idle', step: 0, move: null, foot: null, buffered: false,
    time: 0, connected: false, parry: false, comboTime: 0,
  });
}

// 스테이지를 (다시) 시작할 때 부른다. 카프킥 단계와 경험치는 유지한다.
export function resetPlayer(game) {
  const p = game.player;
  Object.assign(p, { x: T.spawnX, y: GROUND_Y, vx: 0, vy: 0, facing: 1, hp: p.maxHp, alive: true, onGround: true, invuln: 0, counterTime: 0 });
  const xpGain = p.ctl.xpGain;
  p.ctl = newCtl();
  p.ctl.xpGain = xpGain;
  endCombo(p);
  p.kick.ult = false;
  setState(p, 'idle');
}

// ---------------------------------------------------------------------------
// 피격
function takeHit(game, p, { damage = 1, knockback = 80, source = null } = {}) {
  if (!p.alive || p.invuln > 0 || p.ctl.rise || p.ctl.whip) return false;
  const k = p.kick, c = p.ctl;
  // 너무 일찍(또는 연타하다가) 찬 킥의 빈틈에 그 공격(또는 쳐낼 수 있던 투척물)을 맞았다
  const missedProjectile = source && source.kind !== 'enemy' && source.parryable;
  if (k.phase !== 'idle' && source && (c.parryMissed.includes(source) || missedProjectile)) {
    emit(EV.PARRY_FAIL, { x: p.x + p.facing * 10, y: p.y - 10 });
  }
  p.hp -= damage;
  p.invuln = T.hurt.invuln;
  // 투척물은 날아온 방향으로, 그 밖에는 때린 쪽의 반대로 밀린다
  let dir = -p.facing;
  if (source) dir = source.kind !== 'enemy' && source.vx ? Math.sign(source.vx) : (source.x > p.x ? -1 : 1);
  p.vx = dir * knockback;
  endCombo(p); // 맞으면 콤보가 끊긴다
  c.fly = null;
  c.kickBuf = c.punchBuf = c.jumpBuf = 0;
  c.jumpHeld = false;
  p.state = 'hurt';
  p.stateTime = 0;
  emit(EV.PLAYER_HIT, { damage, source, x: p.x, y: p.y - p.h / 2 });
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.counterTime = 0;
    setState(p, 'dead');
    emit(EV.PLAYER_DEAD, {});
  }
  return true;
}

// ---------------------------------------------------------------------------
// 거리 계산
const frontDist = (p, e) => (e.x - p.x) * p.facing;

// 앞에 있는 가장 가까운 적까지의 거리 (없으면 Infinity)
function frontGap(game, p) {
  let gap = Infinity;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const d = frontDist(p, e);
    if (d > 0 && d < gap) gap = d;
  }
  return gap;
}

function inReach(p, e, range) {
  const d = frontDist(p, e);
  return d >= -T.kick.backReach && d <= range + e.w / 2 && Math.abs(e.y - p.y) <= T.kick.vertReach;
}

// 가까운 적이 있으면 마주 보고, 없으면 걷는 방향을 본다
function autoFace(game, p, dir) {
  let best = null, bd = T.move.faceRange;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const d = Math.abs(e.x - p.x);
    if (d < bd) { bd = d; best = e; }
  }
  if (best) {
    if (bd > T.move.faceDeadzone) p.facing = best.x > p.x ? 1 : -1;
  } else if (dir) {
    p.facing = dir;
  }
}

// ---------------------------------------------------------------------------
// 킥
// fresh: 버퍼에 있던 입력이 아니라 지금 막 누른 K로 나가는 킥인가.
// 패링은 fresh일 때만 판정한다 (무작정 연타해서 예약된 킥으로는 쳐내지 못한다).
function startKick(game, p, step, fresh, dir) {
  const k = p.kick, c = p.ctl;
  const m = T.combo[step];
  if (dir) p.facing = dir; // 방향키를 누른 채 차면 그쪽으로 돌아서 찬다
  Object.assign(k, {
    phase: 'strike', step, move: m.move, foot: m.foot, buffered: false,
    time: 0, hitAt: m.startup, strikeTime: m.startup + m.active, recoverTime: m.recover,
    connected: false, parry: false, comboTime: 0,
  });
  c.kickBuf = 0;
  c.hitList = [];
  c.parryMissed = [];
  p.state = 'kick';
  p.stateTime = 0;
  p.vx = 0;
  emit(EV.KICK_START, { move: m.move, foot: m.foot, step, level: k.level });

  // 패링: 공격이 닿기 직전(윈도우 안)의 적을 쳐낸다
  for (const e of game.enemies) {
    const a = e.attack;
    if (!e.alive || !a || a.phase !== 'windup' || !a.parryable || !inReach(p, e, T.parry.range)) continue;
    if (fresh && a.timeToHit <= T.parry.window) {
      e.onParried();
      k.parry = true;
      k.connected = true;
      // 쳐낸 킥은 어느 킥이든 짧게 끝나서 곧바로 카운터로 이어진다
      k.hitAt = 0;
      k.strikeTime = T.parry.strike;
      k.recoverTime = T.parry.recover;
      p.counterTime = T.parry.counterTime;
      emit(EV.PARRY_SUCCESS, { enemy: e, projectile: null, x: (p.x + e.x) / 2, y: p.y - m.height });
    } else {
      c.parryMissed.push(e); // 이 킥의 빈틈에 맞으면 PARRY_FAIL
    }
  }
}

// 발이 닿는 구간에 사거리 안의 적을 가까운 순서로 때린다 (적마다 한 번, 킥마다 m.targets명까지).
// 한 번에 여럿을 묶어 두지 못하므로, 한 명을 차는 동안 다른 적이 끼어든다.
function resolveKickHits(game, p, m) {
  const k = p.kick, c = p.ctl;
  // 6단계부터는 등 뒤의 적도 함께 휩쓸고, 한 번에 맞는 수가 늘어난다
  const wide = k.level >= T.wide.level;
  const targets = m.targets + (wide ? T.wide.extraTargets : 0);
  if (c.hitList.length >= targets) return;
  const behind = (e) => {
    const d = -frontDist(p, e);
    return d > 0 && d <= T.wide.backRange + e.w / 2 && Math.abs(e.y - p.y) <= T.kick.vertReach;
  };
  const inRange = game.enemies
    .filter((e) => e.alive && !c.hitList.includes(e) && (inReach(p, e, m.range) || (wide && behind(e))))
    .sort((a, b) => Math.abs(frontDist(p, a)) - Math.abs(frontDist(p, b)));
  for (const e of inRange) {
    if (c.hitList.length >= targets) break;
    c.hitList.push(e);
    const counter = p.counterTime > 0;
    const finisher = !!m.finisher;
    const crit = finisher || counter; // 강타: 콤보 마무리 또는 패링 후 카운터
    const lv = k.level - 1;
    const damage = m.damage * (1 + T.level.damageBonus * lv) * (counter ? T.parry.counterDamage : 1);
    const knockback = m.knockback * (1 + T.level.knockbackBonus * lv) * (counter ? T.parry.counterKnockback : 1);
    e.takeHit({ damage, knockback, crit, source: p });
    k.connected = true;
    gainMeter(p, damage);
    emit(EV.KICK_HIT, {
      target: e, move: m.move, foot: m.foot, step: k.step, finisher, crit, damage,
      level: k.level, x: e.x, y: e.y - m.height, counter, dir: e.x >= p.x ? 1 : -1,
    });
  }
}

// 발 앞에 온 투척물을 쳐낸다. 그 뒤의 이동과 충돌은 enemies가 처리한다.
function deflectProjectiles(game, p, m) {
  const k = p.kick;
  for (const pr of game.projectiles) {
    if (!pr.alive || !pr.parryable || pr.reflected) continue;
    const d = (pr.x - p.x) * p.facing;
    if (d < -T.kick.backReach || d > T.parry.projectileRange) continue;
    if (pr.y < p.y - p.h - 8 || pr.y > p.y + 2) continue;
    if (pr.vx * p.facing > 0) continue; // 이미 멀어지는 중
    pr.reflected = true;
    pr.vx = -pr.vx;
    k.connected = true;
    p.counterTime = T.parry.counterTime;
    emit(EV.PARRY_SUCCESS, { enemy: null, projectile: pr, x: pr.x, y: pr.y });
  }
}

function updateStrike(game, p, dt) {
  const k = p.kick;
  const m = T.combo[k.step];
  k.time += dt;
  // 발을 뻗는 동안 반 걸음 내딛는다. 뛰거나 돌지 않는다.
  p.vx = !k.parry && k.time < m.startup && frontGap(game, p) > T.kick.minGap ? p.facing * m.advance / m.startup : 0;
  deflectProjectiles(game, p, m);
  if (!k.parry && k.time >= m.startup - EPS) resolveKickHits(game, p, m);
  if (k.time >= k.strikeTime - EPS) {
    if (!k.connected) {
      // 헛발질: 빈틈이 길어지고 콤보도 예약된 입력도 끊긴다
      k.recoverTime = m.recover + m.whiff;
      p.ctl.kickBuf = 0;
      emit(EV.KICK_MISS, { move: m.move, foot: m.foot, step: k.step, x: p.x + p.facing * m.range, y: p.y - m.height });
    }
    k.phase = 'recover';
    setState(p, 'recover');
  }
}

function updateRecover(game, p, dt, inp) {
  const k = p.kick, c = p.ctl;
  const m = T.combo[k.step];
  k.time += dt;
  p.vx = approach(p.vx, 0, T.move.decel * dt);
  // 맞힌 킥(마무리 제외)과 패링한 킥만 다음 킥으로 넘어갈 수 있다
  const canChain = k.connected && (!m.finisher || k.parry);
  if (canChain) {
    const chainAt = k.parry ? k.strikeTime : k.strikeTime + m.chain;
    if (c.kickBuf > 0 && k.time >= chainAt - EPS) {
      startKick(game, p, (k.step + 1) % T.combo.length, inp.kick, inp.dir);
      return;
    }
  } else {
    c.kickBuf = Math.max(0, c.kickBuf - dt);
  }
  if (k.time >= k.strikeTime + k.recoverTime - EPS) {
    if (canChain && !m.finisher) {
      k.phase = 'idle'; // 자유롭게 움직일 수 있지만 comboTime 안에 K를 누르면 이어진다
      k.comboTime = T.kick.comboKeep;
    } else {
      endCombo(p);
    }
    setState(p, 'idle');
  }
}

// ---------------------------------------------------------------------------
const COL_EV = 'fx:col';

function startCol(game, p, dir) {
  const k = p.kick, c = p.ctl, R = T.rise;
  if (dir) p.facing = dir;
  endCombo(p);
  Object.assign(k, {
    phase: 'strike', step: k.comboLength - 1, move: 'rise', foot: 'right',
    time: 0, hitAt: R.startup, strikeTime: R.startup + R.active, recoverTime: R.recover, connected: true,
  });
  c.kickBuf = c.punchBuf = c.jumpBuf = 0;
  c.rise = { hit: [], burst: false };
  p.state = 'kick';
  p.stateTime = 0;
  p.vx = 0;
  emit(EV.KICK_START, { move: 'rise', foot: 'right', step: k.step, level: k.level });
}

function updateCol(game, p, dt) {
  const k = p.kick, c = p.ctl, R = T.rise;
  k.time += dt;
  p.vx = 0;
  const cx = p.x + p.facing * R.offset;
  if (k.time >= R.startup - EPS && k.time < R.startup + R.active) {
    if (!c.rise.burst) {
      c.rise.burst = true;
      emit(COL_EV, { x: cx, y: p.y, dir: p.facing, duration: R.active });
    }
    for (const e of game.enemies) {
      if (!e.alive || c.rise.hit.includes(e) || Math.abs(e.x - cx) > R.radius) continue;
      c.rise.hit.push(e);
      e.takeHit({ damage: R.damage, knockback: R.knockback, crit: true, source: p });
      e.vy = -R.launchVy;
      e.onGround = false;
      emit(EV.KICK_HIT, {
        target: e, move: 'rise', foot: 'right', step: k.step, finisher: true, crit: true, damage: R.damage,
        level: 5, x: e.x, y: e.y - 14, counter: false,
      });
    }
    for (const pr of game.projectiles) if (pr.alive && Math.abs(pr.x - cx) <= R.radius) pr.alive = false;
  }
  if (k.phase === 'strike' && k.time >= k.strikeTime - EPS) {
    k.phase = 'recover';
    setState(p, 'recover');
  }
  if (k.time >= k.strikeTime + k.recoverTime - EPS) {
    c.rise = null;
    endCombo(p);
    setState(p, 'idle');
  }
}

// ---------------------------------------------------------------------------
// 궁극기: 회전 채찍차기 (7단계). 준 데미지로 게이지가 차면 견제 키로 쓴다.
// 몸을 지면과 수평으로 눕혀 돌다가 후려치며, 앞뒤의 적을 전부 휩쓴다. 쓰는 동안에는 맞지 않는다.
const WHIP_EV = 'kick:whip'; // { step: 'start' | 'hit', x, y }

function gainMeter(p, damage) {
  const k = p.kick;
  if (k.level >= T.whip.level) k.meter = Math.min(T.whip.cost, k.meter + damage);
}

const whipReady = (p) => p.kick.level >= T.whip.level && p.kick.meter >= T.whip.cost;

function startWhip(game, p, dir) {
  const k = p.kick, c = p.ctl, U = T.whip;
  if (dir) p.facing = dir;
  endCombo(p);
  Object.assign(k, {
    phase: 'strike', step: k.comboLength - 1, move: 'whip', foot: 'right',
    time: 0, hitAt: U.startup, strikeTime: U.startup + U.active, recoverTime: U.recover, connected: true, ult: true, meter: 0,
  });
  c.kickBuf = c.punchBuf = c.jumpBuf = 0;
  c.whip = { done: false };
  p.state = 'kick';
  p.stateTime = 0;
  p.vx = 0;
  emit(EV.KICK_START, { move: 'whip', foot: 'right', step: k.step, level: k.level });
  emit(WHIP_EV, { step: 'start', x: p.x, y: p.y - 20 });
}

function updateWhip(game, p, dt) {
  const k = p.kick, c = p.ctl, U = T.whip;
  k.time += dt;
  p.vx = 0;
  if (!c.whip.done && k.time >= U.startup - EPS) {
    c.whip.done = true;
    let any = false;
    for (const e of game.enemies) {
      if (!e.alive || Math.abs(e.x - p.x) > U.radius + e.w / 2) continue;
      any = true;
      e.takeHit({ damage: U.damage, knockback: U.knockback, crit: true, source: p });
      emit(EV.KICK_HIT, {
        target: e, move: 'whip', foot: 'right', step: k.step, finisher: true, crit: true, damage: U.damage,
        level: k.level, x: e.x, y: e.y - U.height, counter: false, dir: e.x >= p.x ? 1 : -1,
      });
    }
    for (const pr of game.projectiles) if (pr.alive && Math.abs(pr.x - p.x) <= U.radius) pr.alive = false;
    emit(WHIP_EV, { step: 'hit', x: p.x + p.facing * 24, y: p.y - U.height, any });
  }
  if (k.phase === 'strike' && k.time >= k.strikeTime - EPS) {
    k.phase = 'recover';
    setState(p, 'recover');
  }
  if (k.time >= k.strikeTime + k.recoverTime - EPS) {
    c.whip = null;
    k.ult = false;
    endCombo(p);
    setState(p, 'idle');
  }
}

// ---------------------------------------------------------------------------
// 날아차기: 점프 중 K. 발을 앞으로 뻗은 채 내려오며, 처음 닿은 적 하나를 강타로 찬다.
function startFly(game, p, dir) {
  const k = p.kick, c = p.ctl, F = T.fly;
  if (dir) p.facing = dir;
  endCombo(p);
  Object.assign(k, {
    phase: 'strike', step: k.comboLength - 1, move: 'fly', foot: 'right',
    time: 0, hitAt: F.startup, strikeTime: F.startup, recoverTime: F.land, connected: false,
  });
  c.kickBuf = 0;
  c.airKicked = true;
  c.fly = { hit: false, landed: -1 };
  p.state = 'kick';
  p.stateTime = 0;
  p.vx = p.facing * F.boost;
  emit(EV.KICK_START, { move: 'fly', foot: 'right', step: k.step, level: k.level });
}

function updateFly(game, p, dt) {
  const k = p.kick, c = p.ctl, F = T.fly;
  k.time += dt;
  if (c.fly.landed < 0) {
    if (!c.fly.hit && k.time >= F.startup - EPS) {
      // 발끝 높이에 몸이 걸치는 가장 가까운 적
      let target = null;
      for (const e of game.enemies) {
        if (!e.alive) continue;
        const d = frontDist(p, e);
        if (d < -10 || d > F.range + e.w / 2) continue;
        if (p.y < e.y - e.h - 10) continue; // 머리 위로 지나갔다
        if (!target || d < frontDist(p, target)) target = e;
      }
      if (target) {
        c.fly.hit = true;
        k.connected = true;
        const lv = k.level - 1;
        const damage = F.damage * (1 + T.level.damageBonus * lv);
        target.takeHit({ damage, knockback: F.knockback * (1 + T.level.knockbackBonus * lv), crit: true, source: p });
        emit(EV.KICK_HIT, {
          target, move: 'fly', foot: 'right', step: k.step, finisher: true, crit: true, damage,
          level: k.level, x: target.x, y: Math.min(target.y - 8, p.y - 6), counter: false,
        });
        p.vx = -p.facing * 50; // 차고 나서 살짝 튕겨 물러난다
        p.vy = Math.min(p.vy, -F.bounce);
      }
    }
    if (p.onGround) {
      c.fly.landed = 0;
      p.vx = 0;
      k.phase = 'recover';
      k.strikeTime = k.time;
      k.recoverTime = F.land + (c.fly.hit ? 0 : F.whiff);
      setState(p, 'recover');
      if (!c.fly.hit) emit(EV.KICK_MISS, { move: 'fly', foot: 'right', step: k.step, x: p.x + p.facing * F.range, y: p.y - 6 });
    }
  } else {
    c.fly.landed += dt;
    if (c.fly.landed >= k.recoverTime - EPS) {
      c.fly = null;
      endCombo(p);
      setState(p, 'idle');
    }
  }
}

// ---------------------------------------------------------------------------
// 타격(J): 어깨치기
function startPunch(p, dir) {
  const c = p.ctl;
  if (dir) p.facing = dir;
  endCombo(p);
  c.punchBuf = 0;
  c.punchDone = false;
  c.punchHit = false;
  p.state = 'punch';
  p.stateTime = 0;
}

function updatePunch(game, p, dt, inp) {
  const c = p.ctl, J = T.punch;
  p.vx = p.stateTime < J.startup && frontGap(game, p) > T.kick.minGap ? p.facing * J.advance / J.startup : 0;
  if (!c.punchDone && p.stateTime >= J.startup - EPS) {
    c.punchDone = true;
    let target = null;
    for (const e of game.enemies) {
      if (e.alive && inReach(p, e, J.range) && (!target || frontDist(p, e) < frontDist(p, target))) target = e;
    }
    if (target) {
      target.takeHit({ damage: J.damage, knockback: J.knockback, crit: false, source: p });
      c.punchHit = true;
      emit(EV.PUNCH_HIT, { target, x: target.x, y: target.y - J.height });
    }
  }
  // 맞혔으면 킥으로 캔슬
  if (c.punchHit && c.kickBuf > 0 && p.stateTime >= J.cancelAt - EPS) {
    startKick(game, p, 0, inp.kick, inp.dir);
    return;
  }
  if (p.stateTime >= J.total - EPS) setState(p, 'idle');
}

// ---------------------------------------------------------------------------
// 자유 상태: 이동, 점프, 공격 시작
function updateFree(game, p, dt, inp) {
  const k = p.kick, c = p.ctl, M = T.move;
  const dir = inp.dir;

  // 콤보 유지 시간
  if (k.comboTime > 0) {
    k.comboTime -= dt;
    if (k.comboTime <= 0) endCombo(p);
  }

  if (p.onGround) {
    if (c.kickBuf > 0) {
      startKick(game, p, k.comboTime > 0 ? k.step + 1 : 0, inp.kick, dir);
      return;
    }
    if (c.punchBuf > 0) {
      startPunch(p, dir);
      return;
    }
  } else if (c.kickBuf > 0 && !c.airKicked) {
    startFly(game, p, dir); // 점프 중 K = 날아차기
    return;
  } else {
    c.kickBuf = Math.max(0, c.kickBuf - dt);
  }
  if (p.onGround) c.airKicked = false;

  autoFace(game, p, dir);
  if (p.onGround) {
    const max = dir === p.facing ? M.fwdSpeed : M.backSpeed;
    p.vx = approach(p.vx, dir * max, (dir ? M.accel : M.decel) * dt);
    if (c.jumpBuf > 0) {
      p.vy = T.jump.v;
      p.onGround = false;
      c.jumpBuf = 0;
      c.jumpHeld = true;
    }
  } else if (dir) {
    p.vx = approach(p.vx, dir * M.airSpeed, M.airAccel * dt); // 입력이 없으면 관성 유지
  }
  // 점프 키를 일찍 떼면 낮게 뛴다
  if (c.jumpHeld && (!down('jump') || p.vy >= 0)) {
    c.jumpHeld = false;
    if (p.vy < T.jump.cutV) p.vy = T.jump.cutV;
  }
  setState(p, !p.onGround ? 'jump' : dir ? 'walk' : 'idle');
}

// ---------------------------------------------------------------------------
// 성장 단계
function applyXp(p) {
  const k = p.kick, c = p.ctl, L = T.level;
  if (!c.xpGain) return;
  k.xp += c.xpGain;
  c.xpGain = 0;
  while (k.level < L.max && k.xp >= k.xpNext) {
    k.xp -= k.xpNext;
    k.level++;
    k.xpNext = k.level < L.max ? L.xpNeed[k.level] : 0;
    emit(EV.KICK_LEVEL_UP, { level: k.level });
  }
  if (k.level >= L.max) k.xp = 0;
}

// ---------------------------------------------------------------------------
export function updatePlayer(game, dt) {
  const p = game.player;
  const k = p.kick, c = p.ctl;
  hookInput();
  const inp = {
    kick: took('kick'), punch: took('punch'), jump: took('jump'),
    dir: (down('right') ? 1 : 0) - (down('left') ? 1 : 0),
  };
  p.stateTime += dt;
  p.invuln = Math.max(0, p.invuln - dt);
  p.counterTime = Math.max(0, p.counterTime - dt);

  if (!p.alive) {
    p.vx = approach(p.vx, 0, T.hurt.decel * dt);
  } else {
    if (inp.kick) c.kickBuf = T.input.kickBuffer;
    if (inp.punch) c.punchBuf = T.input.punchBuffer; else c.punchBuf = Math.max(0, c.punchBuf - dt);
    if (inp.jump) c.jumpBuf = T.input.jumpBuffer; else c.jumpBuf = Math.max(0, c.jumpBuf - dt);

    if (c.rise) {
      updateCol(game, p, dt);
    } else if (c.whip) {
      updateWhip(game, p, dt);
    } else if (c.fly) {
      updateFly(game, p, dt);
    } else if (inp.punch && whipReady(p) && p.onGround && p.state !== 'hurt' && k.phase === 'idle') {
      startWhip(game, p, inp.dir); // 7단계에 게이지가 차면 견제 키가 궁극기가 된다
    } else if (pressed('aux') && p.onGround && p.state !== 'hurt' && !(game.stage && game.stage.endless)) {
      startCol(game, p, inp.dir);
    } else if (p.state === 'hurt') {
      p.vx = approach(p.vx, 0, T.hurt.decel * dt);
      c.kickBuf = Math.max(0, c.kickBuf - dt);
      if (p.stateTime >= T.hurt.time) setState(p, p.onGround ? 'idle' : 'jump');
    } else if (k.phase === 'strike') {
      updateStrike(game, p, dt);
    } else if (k.phase === 'recover') {
      updateRecover(game, p, dt, inp);
    } else if (p.state === 'punch') {
      updatePunch(game, p, dt, inp);
    } else {
      updateFree(game, p, dt, inp);
    }
    k.buffered = k.phase !== 'idle' && c.kickBuf > 0;
  }

  if (!p.onGround && p.vy > 0) p.vy += T.jump.fallExtra * dt;
  applyPhysics(p, dt, game);
  applyXp(p);
}
