// [D 담당] 점수 모드의 회복 아이템. 쓰러진 적이 가끔 캔 음료를 떨어뜨리고, 밟고 지나가면 체력이 찬다.
// game.pickups = [{ type: 'heal', x, y, vy, heal, age, life }]  (그림은 fx가 그린다)
//
// 떨어지는 규칙의 생각:
// - 체력이 가득이면 떨어지지 않는다. 필요 없을 때 나와 봐야 긴장만 풀린다.
// - 체력이 낮을수록 잘 나온다. 위기일 때 숨구멍이 열린다.
// - 운이 나빠도 일정 수를 쓰러뜨리면 반드시 하나 나온다.
// - 큰 놈(중량형)은 더 큰 것을 떨어뜨린다.
import { GROUND_Y, GRAVITY } from '../core/config.js';
import { EV, on, emit } from '../core/events.js';

export const PICKUP = {
  baseChance: 0.12,      // 기본 확률
  perMissingHp: 0.09,    // 잃은 체력 1칸마다 더해지는 확률
  maxChance: 0.5,
  pity: 7,               // 이만큼 쓰러뜨리는 동안 안 나왔으면 다음은 반드시 나온다
  heal: 1, heavyHeal: 2, // 회복량
  life: 9,               // 바닥에 남아 있는 시간(초). 마지막 2.5초는 깜빡인다
  reach: 13,             // 줍는 거리
};
export const PICKUP_EV = 'pickup:heal'; // { x, y, heal }

let hooked = false;
let dry = 0; // 아이템 없이 쓰러뜨린 수

function hook(game) {
  hooked = true;
  game.pickups = game.pickups || [];
  on(EV.STAGE_START, () => { game.pickups.length = 0; dry = 0; });
  on(EV.ENEMY_DOWN, ({ enemy }) => {
    if (!game.stage || !game.stage.endless || !enemy || enemy.boss) return; // 보스는 따로 체력을 준다
    const p = game.player;
    const missing = p.maxHp - p.hp;
    if (missing < 0.5) return;
    dry++;
    const chance = Math.min(PICKUP.maxChance, PICKUP.baseChance + PICKUP.perMissingHp * missing);
    const heavy = enemy.type === 'heavy';
    if (!heavy && dry < PICKUP.pity && Math.random() >= chance) return;
    dry = 0;
    game.pickups.push({ type: 'heal', x: enemy.x, y: enemy.y - 14, vy: -190, heal: heavy ? PICKUP.heavyHeal : PICKUP.heal, age: 0, life: PICKUP.life });
  });
}

export function updatePickups(game, dt) {
  if (!hooked) hook(game);
  const p = game.player;
  const list = game.pickups;
  for (let i = list.length - 1; i >= 0; i--) {
    const it = list[i];
    it.age += dt;
    it.vy += GRAVITY * 0.6 * dt;
    it.y += it.vy * dt;
    if (it.y >= GROUND_Y) { it.y = GROUND_Y; it.vy = it.vy > 60 ? -it.vy * 0.35 : 0; } // 한두 번 튀고 멈춘다
    const width = game.stage ? game.stage.width : 480;
    it.x = Math.max(8, Math.min(width - 8, it.x));
    if (p.alive && it.age > 0.25 && Math.abs(it.x - p.x) <= PICKUP.reach && p.y >= it.y - 30) {
      p.hp = Math.min(p.maxHp, p.hp + it.heal);
      emit(PICKUP_EV, { x: it.x, y: it.y - 6, heal: it.heal });
      list.splice(i, 1);
    } else if (it.age >= it.life) {
      list.splice(i, 1);
    }
  }
}
