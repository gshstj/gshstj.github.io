// [D 담당] 스테이지 데이터.
//
// stage = { id, name, width, bg, checkpoint, waves }
//   width      스테이지 가로 길이(px). 화면(480)보다 넓어야 적이 화면 밖에서 걸어 들어올 수 있다.
//   bg         배경 키. 그림은 fx 담당이 이 키를 보고 그린다.
//   checkpoint 이 번호(0부터)의 웨이브에 도달한 뒤 죽으면 그 웨이브부터 다시 시작한다.
//   waves[n] = { hint, spawns }
//     hint    그 웨이브 동안 화면 아래에 띄울 안내. '[K]'처럼 대괄호로 싼 글자는 키 모양으로 그린다.
//     spawns  적 목록. 다 쓰러뜨리면 다음 웨이브로 넘어간다.
//       { type, x }            스테이지 좌표 x에 세운다 (스테이지 첫 웨이브용. 시작부터 화면에 보인다)
//       { type, side, gap }    화면 밖 'left' | 'right'에서 걸어 들어온다. gap은 화면 끝에서 떨어진 거리
//       delay                  웨이브가 시작되고 이만큼 지난 뒤에 나오는 증원 (초)
//
// 적 타입 id: brawler(격투형), shooter(사격형), speedster(스피드형), shadow / shadow2(보스: 어둠의 주인공)

export const STAGES = [
  {
    // 조작과 패링을 익히는 스테이지. 격투형만 나온다.
    id: 'alley', name: '뒷골목', width: 720, bg: 'alley',
    checkpoint: [2, 4], // 배열로 여러 개를 줄 수 있다. 마지막은 보스 웨이브
    waves: [
      {
        hint: '[A][D] 이동  [W] 점프  [J] 견제  [K] 킥 · 이어 누르면 4타 콤보',
        spawns: [{ type: 'brawler', x: 300 }],
      },
      {
        hint: '적이 공격하기 직전에 [K] → 패링!  패링 직후의 킥은 강타로 들어간다',
        spawns: [{ type: 'brawler', side: 'right' }],
      },
      {
        hint: '[K] 연타로 콤보 · 마지막 내려찍기는 강타지만 빈틈이 크다',
        spawns: [
          { type: 'brawler', side: 'right' },
          { type: 'brawler', side: 'right', gap: 60, delay: 2.5 },
        ],
      },
      {
        hint: '앞뒤로 온다. 공격 직전 [K] 패링으로 흐름을 끊어라',
        spawns: [
          { type: 'brawler', side: 'right' },
          { type: 'brawler', side: 'left' },
          { type: 'brawler', side: 'right', gap: 50, delay: 4 },
        ],
      },
      {
        // 보스전: 어둠의 주인공 (미러전). 발차기만 쓴다.
        boss: true,
        hint: '나와 똑같이 찬다. 발차기 직전 [K] 패링 → 카운터, 4타가 끝난 빈틈을 노려라',
        spawns: [{ type: 'shadow', side: 'right', gap: 30 }],
      },
    ],
  },
  {
    // 격투형과 사격형이 섞여 나오고, 마지막 웨이브에 스피드형이 맛보기로 나온다.
    id: 'classroom', name: '교실', width: 960, bg: 'classroom',
    checkpoint: [2, 5],
    waves: [
      {
        hint: '날아오는 물건도 [K]로 쳐낼 수 있다. 쳐낸 물건은 적에게 돌아간다',
        spawns: [
          { type: 'brawler', x: 330 },
          { type: 'shooter', x: 450 },
        ],
      },
      {
        spawns: [
          { type: 'shooter', side: 'right' },
          { type: 'shooter', side: 'left' },
          { type: 'brawler', side: 'right', gap: 50, delay: 2 },
        ],
      },
      {
        spawns: [
          { type: 'brawler', side: 'right' },
          { type: 'brawler', side: 'left' },
          { type: 'shooter', side: 'right', gap: 60, delay: 3 },
        ],
      },
      {
        spawns: [
          { type: 'shooter', side: 'left' },
          { type: 'shooter', side: 'right' },
          { type: 'brawler', side: 'right', gap: 50, delay: 1.5 },
          { type: 'brawler', side: 'left', gap: 50, delay: 5 },
        ],
      },
      {
        hint: '빠른 놈이 온다. 돌진 직전의 짧은 예고를 놓치지 마라',
        spawns: [
          { type: 'speedster', side: 'right' },
          { type: 'shooter', side: 'left', delay: 3 },
          { type: 'speedster', side: 'left', gap: 50, delay: 6 },
        ],
      },
      {
        // 보스전: 더 빠르고 단단해진 어둠의 주인공
        boss: true,
        hint: '더 빨라졌다. 연타는 버티고 받아친다. 패링과 빈틈만 노려라',
        spawns: [{ type: 'shadow2', side: 'right', gap: 30 }],
      },
    ],
  },
  {
    // 친선전: 1세대 발 마스터. 절대 이길 수 없고, 브라질리언 킥을 맞으면 엔딩으로 넘어간다.
    id: 'friendly', name: '골목 끝 · 친선전', width: 560, bg: 'alley',
    friendly: true,
    checkpoint: 0,
    waves: [
      {
        boss: true,
        title: '친선전 · 1세대 발 마스터',
        sub: '프롤로그의 그 선배. 이길 수 없다',
        hint: '어떤 발차기도 통하지 않는다. 버틸 수 있는 만큼 버텨 봐라',
        spawns: [{ type: 'master', x: 330 }],
      },
    ],
  },
];
