// 2인 대전 수치. 킥 자체의 수치(발동, 사거리, 데미지)는 스토리 모드의 src/player/tuning.js를 그대로 쓴다.
export const PV = {
  hp: 30,               // 스토리 모드(5)의 6배. 4타 콤보 한 번이 약 10이라 풀 콤보 3번쯤에 끝난다
  level: 3,             // 고정 성장 단계 (바람 가르는 발). 싸우는 동안 오르지 않는다
  roundsToWin: 2,       // 3판 2선승
  startGap: 150,        // 화면 가운데에서 각자 떨어져 서는 거리 (양쪽에서 시작)

  overtimeAt: 60,       // 이 시간이 지나면 데미지가 overtimeMult배 (라운드는 끝나지 않는다)
  overtimeMult: 2,

  parryWindow: 0.08,    // 상대 발이 닿기 직전 이 시간 안에 킥을 내면 쳐낸다 (킥이 빨라서 스토리 모드보다 좁다)
  parryLead: 2 / 60,    // 상대 킥이 이만큼은 먼저 나와 있어야 패링이다. 그보다 가까운 동시 입력은 상타
  parryRange: 48,
  parryStun: 0.45,      // 패링당한 쪽이 굳는 시간
  counterTime: 0.7,     // 패링한 쪽의 카운터 찬스
  counterDamage: 1.5,

  // 맞부딪힘: 같은 기술이 동시에 닿으면 서로 막힌다
  clashWindow: 3 / 60,  // 상대의 같은 기술이 이 시간 안에 닿을 참이면 맞부딪힘으로 친다
  clashPush: 270,       // 서로 튕겨 나가는 속도 (금방 멈추므로 실제로는 각자 20px쯤 밀린다)
  clashRecover: 0.22,   // 튕겨 난 뒤의 빈틈 (둘이 같다)

  // 가드: 멈춰 있을 때만 잡힌다. 정면의 콤보 1~3타를 막고, 찍기와 날아차기와 궁극기는 못 막는다.
  guard: {
    maxSpeed: 30,       // 이 속도 이하로 멈췄을 때만 가드가 잡힌다 (정지와 정지 부근)
    chip: 0.2,          // 막아도 들어오는 데미지 비율
    push: 45,           // 막고 밀리는 속도
    blockedExtra: 0.14, // 막힌 쪽의 빈틈이 이만큼 길어진다
  },

  // 궁극기: 회전 채찍차기. 몸을 지면과 수평으로 눕혀 옆으로 돌면서 한쪽 다리로 채찍처럼 후려친다.
  // 준 데미지가 cost만큼 쌓이면 가드 + 킥으로 쓴다.
  // 예고(몸을 눕혀 도는 동안)가 길어 보고 대응할 수 있지만 가드로는 못 막는다. 패링하거나 점프로 피한다.
  ult: {
    cost: 14,           // 게이지를 채우는 데 필요한 누적 데미지
    move: 'whip', foot: 'right', finisher: true,
    startup: 0.4, active: 0.1, recover: 0.5, whiff: 0.25, advance: 16, chain: 0,
    range: 38, height: 16,
    damage: 7, knockback: 300,
    noAttack: 0.9,      // 맞은 쪽의 공격 불능 시간
  },

  flinch: 0.26,       // 콤보 1~3타에 맞았을 때 멈칫하는 시간 (다음 타가 이어 맞을 만큼)
  flinchKnockback: 0.35,// 1~3타 넉백 배율 (작아야 콤보가 이어진다)

  // 찍기와 날아차기: 쓰러지지 않고 크게 밀려나며 잠깐 공격을 못 한다
  bigFlinch: 0.22,
  bigKnockback: 1.5,    // 넉백 배율
  noAttack: 0.6,        // 공격 불능 시간 (이동과 점프는 된다)

  bodyGap: 14,          // 서로 이보다 가까이 겹치지 않는다
  introTime: 1.5,       // 라운드 시작 신호
  koTime: 2.0,          // KO 뒤 다음 라운드까지
  latchMs: 220,         // 히트스톱 중에 누른 키를 살려 두는 시간

  keys: [
    { left: 'KeyA', right: 'KeyD', jump: 'KeyW', guard: 'KeyS', kick: 'KeyF' },                     // 1P 파란 바지
    { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', guard: 'ArrowDown', kick: 'KeyK' },  // 2P 빨간 바지
  ],
  names: ['파란 바지', '빨간 치마'],
  colors: ['#5a8cff', '#ff5a5a'],
};
