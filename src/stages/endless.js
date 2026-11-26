// [D 담당] 점수 모드("무한 골목")의 웨이브를 만들어 낸다. 끝이 없고, 웨이브가 오를수록 세진다.
//
// 난이도 곡선의 생각:
// - 처음 여섯 웨이브는 손으로 짰다. 적 종류를 하나씩 소개하고 첫 보스까지 간다.
// - 그 뒤로는 "예산"으로 뽑는다. 예산은 천천히 오르고, 센 적일수록 예산을 많이 쓴다.
// - 다섯 웨이브마다 보스(어둠의 나). 보스 다음 웨이브는 숨 돌릴 틈으로 가볍게 낸다.
// - 한꺼번에 덮치지 않게 둘까지만 같이 나오고 나머지는 시간차로 들어온다. 그 간격이 조금씩 줄어든다.
// - 적의 체력과 빠르기도 조금씩 오르지만 상한이 있다. 끝없이 불공평해지지는 않고, 수와 조합이 어려워진다.

export const ENDLESS = {
  width: 720,
  bossEvery: 5,
  hpPerWave: 0.045, hpMax: 2.2,       // 웨이브마다 체력 +4.5%, 최대 2.2배
  tempoPerWave: 0.012, tempoMax: 1.3, // 웨이브마다 빠르기 +1.2%, 최대 1.3배
  budgetStart: 3, budgetPerWave: 0.55, budgetMax: 9,
  gapStart: 2.8, gapMin: 1.7,         // 증원이 들어오는 간격(초)
  cost: { brawler: 1, shooter: 1, speedster: 1.5, heavy: 2 },
  healOnBoss: 2,                      // 보스를 쓰러뜨리면 회복하는 체력
};

// 손으로 짠 초반 (웨이브 번호는 0부터)
const INTRO = [
  { hint: '끝이 없다. 맞지 않고 쓰러뜨릴수록 점수 배율이 오른다', spawns: [{ type: 'brawler', x: 300 }] },
  { spawns: [{ type: 'brawler', side: 'right' }, { type: 'brawler', side: 'left', delay: 2.5 }] },
  { spawns: [{ type: 'brawler', side: 'right' }, { type: 'shooter', side: 'left', delay: 1.5 }] },
  { hint: '큰 놈은 연타가 안 통한다. 패링 뒤 카운터, 마무리 찍기, 날아차기로 무너뜨려라',
    spawns: [{ type: 'heavy', side: 'right' }, { type: 'brawler', side: 'left', delay: 5 }] },
  null, // 4: 보스
  { spawns: [{ type: 'speedster', side: 'right' }, { type: 'shooter', side: 'left', delay: 3 }] },
];

// 웨이브 번호로 정해지는 난수 (같은 웨이브는 늘 같은 조합이 나온다)
function rng(seed) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function genWave(n) {
  const E = ENDLESS;
  const hpMult = Math.min(E.hpMax, 1 + E.hpPerWave * n);
  const tempo = Math.min(E.tempoMax, 1 + E.tempoPerWave * n);
  const scale = (s) => Object.assign({ hpMult, tempo }, s);

  // 보스 웨이브
  if (n % E.bossEvery === E.bossEvery - 1) {
    const tier = Math.floor(n / E.bossEvery); // 0, 1, 2, ...
    const spawns = [{ type: tier === 0 ? 'shadow' : 'shadow2', side: 'right', gap: 30, hpMult: 1 + 0.2 * Math.max(0, tier - 1), tempo: Math.min(1.35, 1 + 0.05 * Math.max(0, tier - 1)) }];
    if (tier >= 2) spawns.push(scale({ type: 'brawler', side: 'left', delay: 6 })); // 세 번째 보스부터는 졸개가 끼어든다
    return { boss: true, title: `BOSS · 어둠의 나 ${tier + 1}`, sub: `쓰러뜨리면 체력 +${E.healOnBoss}`, spawns };
  }
  if (INTRO[n]) return { hint: INTRO[n].hint, spawns: INTRO[n].spawns.map(scale) };

  const r = rng(n + 7);
  const afterBoss = n % E.bossEvery === 0; // 보스 다음은 숨 돌릴 틈
  let budget = Math.min(E.budgetMax, E.budgetStart + E.budgetPerWave * (n - INTRO.length)) - (afterBoss ? 1.5 : 0);
  const pool = ['brawler', 'shooter', 'speedster', 'heavy'];
  const picks = [];
  let heavies = 0;
  while (budget >= 1 && picks.length < 7) {
    let type = pool[Math.floor(r() * pool.length)];
    if (type === 'heavy' && (heavies >= 2 || budget < E.cost.heavy)) type = 'brawler';
    if (type === 'speedster' && budget < E.cost.speedster) type = 'brawler';
    if (type === 'heavy') heavies++;
    budget -= E.cost[type];
    picks.push(type);
  }
  if (!picks.length) picks.push('brawler');
  const gap = Math.max(E.gapMin, E.gapStart - 0.05 * n);
  const spawns = picks.map((type, i) => scale({
    type,
    side: i % 2 === 0 ? 'right' : 'left',
    gap: 20 + (i % 3) * 20,
    delay: i < 2 ? i * 0.8 : (i - 1) * gap, // 처음 둘은 거의 같이, 나머지는 시간차로
  }));
  return { spawns };
}

export function makeEndlessStage() {
  return { id: 'endless', name: '무한 골목', width: ENDLESS.width, bg: 'alley', endless: true, checkpoint: -1, waves: [genWave(0)] };
}
