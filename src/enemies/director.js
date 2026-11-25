// [B 담당] 공격 차례 조율. 적들이 한꺼번에 덮치지 않고 차례로 공격하게 한다.
// 자리(slot)는 근접('melee')과 원거리('ranged')가 하나씩이다.
// 근접 한 명과 원거리 한 명은 함께 압박할 수 있지만, 차례를 받는 시점은 gap만큼 어긋난다.
// 차례는 신청한 적 중 가장 오래 기다린 적(마지막으로 차례를 받은 지 가장 오래된 적)에게 준다.
import { DIRECTOR } from './tuning.js';

const SLOTS = ['melee', 'ranged'];
const states = new WeakMap(); // game -> 조율 상태

function get(game) {
  let d = states.get(game);
  if (!d) {
    d = { melee: null, ranged: null, held: { melee: 0, ranged: 0 }, claims: { melee: [], ranged: [] }, gap: 0, clock: 0 };
    states.set(game, d);
  }
  return d;
}

// 차례를 신청한다. 이미 가지고 있으면 true. 아니면 신청만 해 두고 false (다음 스텝에 조율이 정한다).
export function requestSlot(game, e, slot) {
  const d = get(game);
  if (d[slot] === e) return true;
  if (!d.claims[slot].includes(e)) d.claims[slot].push(e);
  return false;
}

export function releaseSlot(game, e) {
  const d = get(game);
  for (const slot of SLOTS) {
    if (d[slot] === e) {
      d[slot] = null;
      d.gap = DIRECTOR.gap;
    }
  }
}

export function updateDirector(game, dt) {
  const d = get(game);
  d.clock += dt;
  d.gap = Math.max(0, d.gap - dt);

  for (const slot of SLOTS) {
    const h = d[slot];
    if (!h) continue;
    // 스테이지가 다시 시작되어 사라졌거나, 쓰러졌거나, 맞아서 공격을 못 하게 된 적은 차례를 내놓는다
    const gone = !game.enemies.includes(h) || !h.alive || h.state === 'hurt' || h.state === 'stun' || h.state === 'down';
    if (gone) { releaseSlot(game, h); continue; }
    if (h.attack || h.action === 'swap') { d.held[slot] = 0; continue; }
    d.held[slot] += dt;
    if (d.held[slot] > DIRECTOR.holdTimeout) {
      h.cooldown = Math.max(h.cooldown, DIRECTOR.timeoutCooldown);
      releaseSlot(game, h);
    }
  }

  // 플레이어가 콤보를 넣는 중이면 근접 적은 간격을 기다리지 않고 끼어든다
  const k = game.player && game.player.kick;
  const comboing = !!k && k.phase !== 'idle';
  for (const slot of SLOTS) {
    const claims = d.claims[slot];
    if (!d[slot] && claims.length && (d.gap <= 0 || (slot === 'melee' && comboing))) {
      let best = null;
      for (const e of claims) {
        if (!e.alive || !game.enemies.includes(e)) continue;
        if (!best || (e.lastTurn ?? -1) < (best.lastTurn ?? -1)) best = e;
      }
      if (best) {
        d[slot] = best;
        d.held[slot] = 0;
        d.gap = DIRECTOR.gap;
        best.lastTurn = d.clock;
      }
    }
    claims.length = 0;
  }
}
