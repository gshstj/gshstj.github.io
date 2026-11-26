// [C 담당] 연출 수치 모음. 손맛을 바꾸고 싶으면 여기만 고친다.

export const TUNE = {
  maxParticles: 420,          // 파티클 상한 (60fps 유지용)

  // 히트스톱(초). 일반 히트는 콤보 연타가 끊기지 않게 아주 짧다.
  hitstop: { normal: 0.055, crit: 0.15, critPerLevel: 0.012, parry: 0.05, playerHit: 0.06, levelUp: 0.1 },

  // 화면 흔들림 세기(px). max는 화면 여백(8px)보다 작아야 한다.
  shake: { normal: 2.8, perLevel: 0.4, crit: 6.5, parry: 3, playerHit: 5, punch: 1, max: 7, decay: 26 },

  // 줌인. 1에 더해지는 값.
  zoom: { crit: 0.13, critPerLevel: 0.014, parry: 0.06, levelUp: 0.05, hold: 0.1 },

  // 패링 슬로우
  slow: { parryTime: 0.3, parryScale: 0.3, deadTime: 0.7, deadScale: 0.4 },

  // 적 공격 예고에서 "지금 차면 패링" 표시를 켜는 timeToHit 기준 (기획: 약 0.15초)
  parryHint: 0.22, // player의 parry.window와 같아야 번쩍이는 순간이 실제 판정과 맞는다

  camera: { lookAhead: 28, follow: 6 },

  corpseTime: 2.2,            // 쓰러진 적이 사라지기까지(초)
  crackTime: 5,               // 바닥 균열이 남아 있는 시간(초)
  maxCracks: 6,
};

// 카프킥 성장 단계별 모습. after = 다리 잔상 수, arc = 다리 궤적.
// 기획서: 1 먼지와 짧은 잔상 / 2 흰 궤적선 / 3 푸른 바람과 충격파 링 / 4 번개와 균열과 번쩍임 / 5 황금 불꽃, 이중 충격파, 암전 컷
export const LEVEL_FX = [
  null,
  { key: 'dust',  main: '#c9c1ae', after: 1, afterColor: '#b9b3a6', arc: null,
    colors: ['#f2ead6', '#c9c1ae', '#8f8676', '#5e574c'] },
  { key: 'edge',  main: '#ffffff', after: 2, afterColor: '#ffffff',
    arc: { w: 2, len: 0.10, outer: '#c8d2e6', mid: '#ffffff', core: '#ffffff' },
    colors: ['#ffffff', '#e6ecf7', '#b8c2d8', '#7f8aa6'] },
  { key: 'wind',  main: '#6cc8ff', after: 3, afterColor: '#6cc8ff',
    arc: { w: 4, len: 0.13, outer: '#2f7dff', mid: '#8fe0ff', core: '#ffffff' },
    colors: ['#ffffff', '#b5ecff', '#5cb8ff', '#2f6fe0'] },
  { key: 'bolt',  main: '#ffe45c', after: 3, afterColor: '#ffe45c',
    arc: { w: 4, len: 0.13, outer: '#e8a800', mid: '#ffe45c', core: '#ffffff' },
    colors: ['#ffffff', '#fff3a0', '#ffd21f', '#c98a00'] },
  { key: 'flame', main: '#ffb030', after: 4, afterColor: '#ffb030',
    arc: { w: 6, len: 0.17, outer: '#ff5a14', mid: '#ffb81e', core: '#fff6c8' },
    colors: ['#fff6c8', '#ffd84d', '#ff9a1e', '#e0481a', '#7a1e12'] },
];

export const GOLD = ['#fff6c8', '#ffd84d', '#ffb020', '#e0701a'];
export const FIRE = ['#fff6c8', '#ffd84d', '#ff9a1e', '#e0481a', '#6a1a12'];
export const DUST = ['#e9dfc8', '#b8ad98', '#857c6c', '#57503f'];

export const levelOf = (n) => LEVEL_FX[Math.max(1, Math.min(5, Math.round(n) || 1))];
