// 게임 전체가 공유하는 상태 객체. 리드만 수정한다.
export function createGame() {
  return {
    scene: 'boot',       // 'prologue' | 'title' | 'playing' | 'stageClear' | 'gameOver' | 'ending' (ui 담당이 관리)
    paused: false,
    character: 'blue',   // 고른 주인공: 'blue'(파란 바지, 남) | 'red'(빨간 바지, 여). ui가 바꾸고 fx가 읽는다
    time: 0,             // 플레이 중 흐른 게임 시간(초)

    // 연출용 시간 제어 (fx 담당이 값을 넣고, main 루프가 따른다)
    hitstop: 0,          // 남은 정지 시간(초). 0보다 크면 전투 갱신을 멈춘다.
    timeScale: 1,        // 1 = 보통, 0.3 = 슬로우

    camera: { x: 0, y: 0, zoom: 1 }, // fx 담당이 갱신

    player: null,        // player 담당
    enemies: [],         // enemies 담당. 쓰러진 적도 alive=false로 남아 있다.
    projectiles: [],     // enemies 담당. { x, y, vx, vy, w, h, damage, parryable, reflected, alive, type }

    stageIndex: 0,       // stages 담당
    stage: null,         // 현재 스테이지 데이터 { id, name, width, bg, waves, ... }
    waveIndex: 0,
  };
}
