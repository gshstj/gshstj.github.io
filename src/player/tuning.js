// [A 담당] 플레이어 밸런스 수치. 전부 여기에 모은다.
// 단위: 시간은 초, 거리는 px, 속도는 px/s. 60fps 고정 스텝이라 시간은 프레임(F) 배수로 잡는다.
const F = 1 / 60;

export const T = {
  hp: 5,
  spawnX: 80,

  // 이동. 가까운 적이 있으면 그쪽을 바라보고, 등지는 방향으로 걸으면 뒷걸음(느림)이 된다.
  move: {
    fwdSpeed: 100,      // 앞으로 걷는 속도
    backSpeed: 76,      // 뒷걸음 속도
    accel: 1300,        // 지상 가속
    decel: 1700,        // 지상 감속 (입력을 떼면 거의 바로 선다)
    airSpeed: 96,       // 공중 최대 수평 속도
    airAccel: 520,      // 공중 제어 (지상보다 둔하다)
    faceRange: 150,     // 이 거리 안에 적이 있으면 자동으로 마주 본다
    faceDeadzone: 3,    // 적과 거의 겹쳤을 때 방향이 떨리지 않게 하는 여유
  },

  // 점프. 하단 공격을 피하는 용도. 공중에서는 찰 수 없다.
  jump: {
    v: -390,            // 최고 높이 약 54px
    cutV: -150,         // 점프 키를 일찍 떼면 이 속도로 잘라 낮게 뛴다
    fallExtra: 500,     // 떨어질 때 추가 중력 (체공을 짧게)
  },

  // 입력 버퍼. 행동할 수 없는 순간에 누른 키를 이 시간만큼 기억한다.
  input: {
    kickBuffer: 0.15,
    punchBuffer: 0.1,
    jumpBuffer: 0.1,
    latchMs: 250,       // 히트스톱 중 눌린 키를 살려 두는 실제 시간(ms)
  },

  hurt: {
    time: 0.3,          // 경직
    invuln: 0.6,        // 맞은 뒤 무적
    decel: 420,         // 넉백 감속
  },

  // 타격(J): 손을 쓰지 않는 어깨치기. 약하지만 빠르고, 맞히면 킥으로 바로 이어진다.
  punch: {
    startup: 3 * F,     // 닿는 시점
    total: 0.22,        // 전체 길이 (헛치면 이만큼 묶인다)
    cancelAt: 0.1,      // 맞혔을 때 이 시점부터 K로 캔슬 가능
    range: 16,
    damage: 0.5,
    knockback: 20,
    advance: 4,         // 어깨를 들이밀며 전진하는 거리
    height: 20,         // 이펙트 높이
  },

  kick: {
    minGap: 20,         // 전진으로 적에게 이보다 가까이 붙지 않는다
    backReach: 4,       // 몸에 겹친 적도 맞도록 뒤쪽으로 주는 여유
    vertReach: 26,      // 맞는 높이 차이 한계
    comboKeep: 0.3,     // 킥이 끝난 뒤에도 이 시간 안에 K를 누르면 콤보가 이어진다
  },

  // 킥 콤보. K를 이어 누르면 위에서 아래로 진행한다.
  // startup: K를 누른 뒤 발이 닿기까지 / active: 판정이 살아 있는 시간
  // recover: 판정이 끝난 뒤 발을 거두는 시간 / chain: 맞혔을 때 판정이 끝나고 다음 킥으로 넘어갈 수 있기까지
  // whiff: 헛발질했을 때 recover에 더해지는 빈틈 / advance: 발을 내딛는 거리
  // range: 발끝이 닿는 거리 (적의 몸 가장자리 기준) / height: 타격 높이 (이펙트 위치)
  // targets: 한 번에 맞는 적의 수 (가까운 순서)
  combo: [
    { move: 'calf', foot: 'right', height: 6,  range: 30, damage: 1.25, knockback: 40,  targets: 1,
      startup: 4 * F,  active: 3 * F, recover: 0.20, chain: 0.05, whiff: 0.10, advance: 4 },   // 오른발 빗겨차기 카프킥. 빠르고 빈틈이 작다
    { move: 'high', foot: 'left',  height: 26, range: 27, damage: 1.5,  knockback: 60,  targets: 1,
      startup: 6 * F,  active: 3 * F, recover: 0.26, chain: 0.06, whiff: 0.14, advance: 7 },   // 왼발 하이킥. 짧지만 아프다
    { move: 'mid',  foot: 'right', height: 16, range: 34, damage: 2,    knockback: 120, targets: 2,
      startup: 7 * F,  active: 3 * F, recover: 0.28, chain: 0.07, whiff: 0.14, advance: 8 },   // 오른발 미들킥. 길고, 둘까지 밀어낸다
    { move: 'axe',  foot: 'left',  height: 20, range: 30, damage: 3.5,  knockback: 260, targets: 1,
      startup: 11 * F, active: 4 * F, recover: 0.42, chain: 0,    whiff: 0.16, advance: 10, finisher: true }, // 왼발 내려찍기. 느리고 빈틈이 크지만 강타
  ],

  parry: {
    window: 0.15,           // 적 공격이 닿기 직전 이 시간 안에 K를 눌러야 한다
    range: 48,              // 쳐낼 수 있는 적까지의 거리 (적의 몸 가장자리 기준)
    counterTime: 0.7,       // 패링 후 카운터 찬스
    counterDamage: 1.5,     // 카운터 킥 데미지 배율
    counterKnockback: 1.4,  // 카운터 킥 넉백 배율
    strike: 0.1,            // 패링한 킥의 strike 길이. 어느 킥이든 같고, 끝나면 바로 다음 킥(카운터)으로 넘어갈 수 있다
    recover: 0.14,          // 패링한 킥의 짧아진 빈틈
    projectileRange: 26,    // 투척물을 쳐낼 수 있는 발 앞 거리
  },

  // 카프킥 성장 단계. 적을 쓰러뜨리면 경험치가 쌓인다.
  // MVP 두 스테이지(적 15명 안팎)에서 3단계쯤 닿도록 잡았다.
  level: {
    max: 5,
    xpNeed: [0, 5, 9, 14, 20], // xpNeed[n] = n단계에서 다음 단계로 가는 데 필요한 경험치
    xpNormal: 1,               // 보통으로 쓰러뜨림
    xpCrit: 2,                 // 강타로 쓰러뜨림
    damageBonus: 0.15,         // 단계마다 데미지 +15%
    knockbackBonus: 0.06,      // 단계마다 넉백 +6%
  },
};
