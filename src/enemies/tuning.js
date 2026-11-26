// [B 담당] 적 밸런스 수치. 시간은 초, 거리는 픽셀, 속도는 px/s.
// 난이도 기준은 "어려움"이다: 예고는 짧고 공격은 아프다. 대신 패턴은 항상 같아서 읽으면 대응할 수 있다.

// 모든 타입 공통
export const COMMON = {
  friction: 12,          // 바닥에서 넉백이 줄어드는 빠르기 (1/s). 밀려나는 거리 = 넉백 속도 / friction
  launchKnockback: 180,  // 강타이면서 넉백이 이 값 이상이면 날아가 쓰러진다 (콤보 마무리, 반사된 투척물)
  deathPop: 140,         // 약한 타격으로 쓰러질 때 살짝 뜨는 속도
  flashTime: 0.1,        // 버티기 중 맞았을 때 enemy.flash가 켜지는 시간
  parryPush: 24,         // 패링당했을 때 뒤로 밀리는 속도
  lowClear: 8,           // 하단 공격: 플레이어 발이 이만큼 떠 있으면 안 맞는다
  midClear: 24,          // 중단 공격(돌진): 플레이어 발이 이만큼 떠 있으면 안 맞는다
  streakReset: 0.9,      // 이 시간 동안 안 맞으면 연타 횟수를 잊는다
  comboGrace: 0.35,      // 빈틈에 맞기 시작한 콤보는 이 시간만큼 빈틈이 이어진다
  separation: 16,        // 적끼리 이보다 가까우면 서로 밀어낸다
  separationSpeed: 30,
};

// 격투형: 다가와서 상단 2연타 후 하단 발차기. 체력이 많고 넉백에 강하다.
// 공격 중(예고와 타격)에는 버티기 상태라 약한 타격으로 끊을 수 없다. 물러나거나, 하단 발차기를 패링하거나 점프한다.
export const BRAWLER = {
  w: 16, h: 32, hp: 16,
  speed: 46,
  standoff: 50,          // 공격 차례가 아닐 때 유지하는 거리 (플레이어 킥 사거리 바로 밖)
  attackRange: 20,       // 이 거리 안에 들어오면 콤보를 시작한다
  chaseRange: 64,        // 콤보 도중 플레이어가 이보다 멀어지면 콤보를 그만둔다
  lungeTime: 0.12,       // 예고 시작에 파고드는 시간

  // 근접 콤보. gap: 타격 뒤 다음 예고까지의 빈틈 (버티기가 풀려서 이때 맞으면 콤보가 끊긴다)
  combo: [
    { action: 'punch1',  kind: 'high', height: 'high', windup: 0.40, active: 0.10, reach: 26, damage: 1,   knockback: 90,  parryable: false, lunge: 0,  gap: 0.08 },
    { action: 'punch2',  kind: 'high', height: 'high', windup: 0.24, active: 0.10, reach: 28, damage: 1,   knockback: 120, parryable: false, lunge: 12, gap: 0.32 },
    { action: 'lowkick', kind: 'low',  height: 'low',  windup: 0.36, active: 0.12, reach: 32, damage: 1.5, knockback: 160, parryable: true,  lunge: 16, gap: 0 },
  ],
  recover: 0.75,         // 콤보를 끝까지 낸 뒤의 큰 빈틈
  abortRecover: 0.4,     // 콤보를 도중에 그만뒀을 때의 빈틈
  cooldown: [0.9, 1.4],  // 다음 공격까지 쉬는 시간
  firstCooldown: [0.3, 0.7],
  afterHurtDelay: 0.35,  // 맞은 뒤 다시 공격을 시작하기까지 최소 시간

  // 연타 대응: 빈틈이 아닐 때 약한 타격을 braceHits번 연달아 맞으면 그 타격을 막고 하단 반격을 낸다.
  // 반격은 패링할 수 있다 (3타 뒤 한 박자 쉬고 K).
  braceHits: 3,
  counter: { action: 'brace', kind: 'low', height: 'low', windup: 0.42, active: 0.12, reach: 34, damage: 1.5, knockback: 180, parryable: true, lunge: 0, gap: 0 },
  counterRecover: 0.65,
  armorDamageMult: 0.5,  // 버티기 중 받는 데미지 배율

  flinch: 0.16,          // 약한 타격에 멈칫하는 시간
  critFlinch: 0.4,       // 강타(날아가지 않는 것)에 휘청이는 시간
  kbMult: 0.15,          // 넉백 배율 (넉백에 강하다)
  kbMultOpen: 0.05,      // 빈틈(스턴, 헛친 뒤)에 맞을 때의 넉백 배율. 작아야 콤보가 끝까지 들어간다
  launchMult: 0.75, launchVy: 230,
  knockdown: 0.55,       // 날아가 쓰러진 뒤 누워 있는 시간
  stun: 1.0,             // 패링당했을 때 스턴 시간
};

// 사격형: 거리를 벌리며 투척물을 던진다. 느리고 약해서 붙으면 콤보가 다 들어간다.
export const SHOOTER = {
  w: 12, h: 30, hp: 7,
  speed: 44, retreatSpeed: 40,
  keepMin: 100, keepMax: 190,          // 유지하려는 거리
  throwMinDist: 40, throwMaxDist: 250, // 이 거리 안에서만 던진다
  cornerMargin: 20,                    // 스테이지 끝에서 이 안쪽이면 더 물러나지 못한다

  throwWindup: 0.45,     // 첫 투척 예고
  burstWindup: 0.3,      // 연속 투척의 다음 예고
  throwActive: 0.12,
  burstGap: 0.18,
  throwRecover: 0.5,
  burst: 2,              // 한 번에 던지는 개수
  bottleEvery: 3,        // n번째 투척마다 포물선 병을 던진다
  cooldown: [1.3, 1.9],
  firstCooldown: [0.6, 1.0],
  afterHurtDelay: 0.6,

  // 붙었을 때 밀쳐내기. 느리고 약하며 패링할 수 있다.
  shoveRange: 34, shoveCooldown: 2.6,
  shove: { action: 'shove', kind: 'high', height: 'high', windup: 0.45, active: 0.1, reach: 30, damage: 0.5, knockback: 260, parryable: true },
  shoveRecover: 0.7,

  flinch: 0.32, critFlinch: 0.5,
  kbMult: 0.3, kbMultOpen: 0.1,
  launchMult: 1.1, launchVy: 300,
  knockdown: 0.9, stun: 1.3,
};

// 스피드형: 멀리서 맴돌다가 짧은 예고 뒤 돌진한다. 가끔 반대편으로 넘어간 뒤 돌진한다. 체력이 낮다.
// 돌진은 코앞(stopDist)에서 멈추고 strikeDelay 뒤에 때린다. 킥이 닿는 시간이 그만큼뿐이라 패링이 가장 빡빡하다.
export const SPEEDSTER = {
  w: 12, h: 28, hp: 5,
  speed: 125,
  hoverDist: 100, hoverWobble: 18,     // 공격 차례가 아닐 때 맴도는 거리
  dashMin: 70, dashMax: 125,           // 이 거리에서 돌진을 시작한다
  swapChance: 0.4,       // 돌진 전에 반대편으로 넘어갈 확률
  swapSpeed: 420, swapDist: 85, swapTimeout: 0.7,

  crouch: 0.30,          // 돌진 예고
  swapCrouch: 0.22,      // 반대편으로 넘어간 직후의 예고 (더 짧다)
  dashSpeed: 400, dashMaxDist: 200,
  stopDist: 26,          // 플레이어 앞 이 거리에서 멈춘다
  strikeDelay: 0.07,     // 멈춘 뒤 타격까지
  dashActive: 0.08,
  dash: { kind: 'dash', height: 'mid', reach: 36, back: 8, damage: 1.5, knockback: 220, parryable: true },
  recoverHit: 0.3,       // 맞혔을 때의 빈틈
  recoverWhiff: 0.65,    // 헛쳤을 때의 빈틈 (크다)
  cooldown: [0.8, 1.3],
  firstCooldown: [0.5, 0.9],
  afterHurtDelay: 0.2,

  // 연타 대응: 빈틈이 아닐 때 약한 타격을 맞으면 뒤로 튕겨 나가 사거리를 벗어나고, 곧바로 되받아친다.
  evadeSpeed: 380, evadeTime: 0.14, retaliateDelay: 0.2,

  flinch: 0.2, critFlinch: 0.4,
  kbMult: 1, kbMultOpen: 0.1,
  launchMult: 1.3, launchVy: 320,
  knockdown: 0.6, stun: 1.1,
};

// 투척물. x, y는 중심 좌표다.
export const PROJECTILE = {
  ball:   { w: 5, h: 5, speed: 210, handY: 18, damage: 1, knockback: 110 },                 // 가슴 높이로 곧게 날아온다
  bottle: { w: 4, h: 7, lob: true, speed: 150, minTime: 0.6, maxTime: 1.1, gravity: 620, handY: 26, damage: 1, knockback: 110 }, // 플레이어 자리로 떨어진다
  reflectSpeed: 300,     // 쳐낸 투척물이 되돌아가는 최소 속도
  reflectMult: 3,        // 쳐낸 투척물이 적에게 주는 데미지 배율
  reflectKnockback: 220, // launchKnockback 이상이라 맞은 적이 날아간다
  life: 4,
  outMargin: 24,
};

// 보스: 어둠의 주인공 (미러전). 주인공과 똑같이 주머니에 손을 넣고 발차기만 쓴다.
// 주인공의 4타 킥 콤보(카프킥 → 하이킥 → 미들킥 → 내려찍기)를 그대로 쓰고, 모든 킥은 패링할 수 있다.
// 공격 중에는 버티기라 약한 타격으로 끊기지 않는다. 패링하거나, 물러났다가 빈틈에 콤보를 넣는다.
export const SHADOW = {
  boss: true, name: '어둠의 나',
  w: 14, h: 30, hp: 42,
  speed: 72,
  standoff: 46, attackRange: 24, chaseRange: 72, lungeTime: 0.1,
  combo: [
    { action: 'calf', kind: 'low',  height: 'low',  windup: 0.36, active: 0.10, reach: 30, damage: 1, knockback: 90,  parryable: true, lunge: 10, gap: 0.10 },
    { action: 'high', kind: 'high', height: 'high', windup: 0.24, active: 0.10, reach: 30, damage: 1, knockback: 110, parryable: true, lunge: 10, gap: 0.10 },
    { action: 'mid',  kind: 'high', height: 'mid',  windup: 0.24, active: 0.10, reach: 32, damage: 1, knockback: 150, parryable: true, lunge: 12, gap: 0.30 },
    { action: 'axe',  kind: 'high', height: 'high', windup: 0.42, active: 0.12, reach: 32, damage: 2, knockback: 220, parryable: true, lunge: 14, gap: 0 },
  ],
  recover: 0.7, abortRecover: 0.35,
  cooldown: [0.5, 0.9], firstCooldown: [1.2, 1.5], afterHurtDelay: 0.3,
  // 연타 대응: 약한 타격을 3번 연달아 맞으면 버티고 내려찍기로 받아친다 (패링 가능)
  braceHits: 3,
  counter: { action: 'brace', kind: 'high', height: 'high', windup: 0.36, active: 0.12, reach: 34, damage: 2, knockback: 220, parryable: true, lunge: 0, gap: 0 },
  counterRecover: 0.6,
  armorDamageMult: 0.4,
  flinch: 0.14, critFlinch: 0.35, kbMult: 0.2, kbMultOpen: 0.05,
  launchMult: 0.8, launchVy: 240, knockdown: 0.5, stun: 0.9,
};

// 두 번째 스테이지의 보스: 더 빠르고 더 단단하다
const faster = (s) => Object.assign({}, s, { windup: +(s.windup * 0.82).toFixed(3) });
export const SHADOW2 = Object.assign({}, SHADOW, {
  hp: 64, speed: 88,
  combo: SHADOW.combo.map(faster),
  counter: faster(SHADOW.counter),
  cooldown: [0.35, 0.65], recover: 0.6, stun: 0.8,
});

// 친선전 상대: 1세대 발 마스터. 절대 이길 수 없다.
// 어떤 공격도 데미지가 들어가지 않고(가볍게 받아 흘린다), 패링해도 한 발 물러날 뿐이다.
// finaleAfter초가 지나거나 주인공 체력이 1 이하가 되면 새 기술 "브라질리언 킥"으로 끝낸다.
const quick = (s) => Object.assign({}, s, { windup: +(s.windup * 0.72).toFixed(3), damage: 1 });
export const MASTER = Object.assign({}, SHADOW, {
  name: '1세대 발 마스터',
  untouchable: true,
  hp: 999, speed: 100,
  combo: SHADOW.combo.map(quick),
  counter: quick(SHADOW.counter),
  cooldown: [0.3, 0.55], firstCooldown: [1.6, 1.9], recover: 0.5,
  finaleAfter: 24,       // 이 시간이 지나면 피날레 (초)
  finaleCall: 1.3,       // 피날레 직전에 자세를 잡는 시간
  finaleWindup: 0.6,     // 브라질리언 킥 예고
  finaleKnockback: 330,
});

// 공격 차례 조율
export const DIRECTOR = {
  gap: 0.3,              // 한 적이 공격 차례를 받거나 끝낸 뒤, 다음 적이 차례를 받기까지의 간격
  holdTimeout: 3.5,      // 차례를 받고도 이 시간 동안 공격을 못 하면 차례를 넘긴다
  timeoutCooldown: 0.8,
};
