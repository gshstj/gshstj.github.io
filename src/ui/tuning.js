// [D 담당] UI와 장면 흐름의 시간 수치 (초).
export const T = {
  fade: 0.28,          // 장면 전환 페이드 (어두워지는 시간 = 밝아지는 시간)
  deathDelay: 1.2,     // 쓰러진 뒤 게임오버 화면이 뜨기까지
  clearDelay: 1.0,     // 마지막 적을 쓰러뜨린 뒤 클리어 화면이 뜨기까지
  inputLock: 0.5,      // 결과 화면이 뜬 직후 Enter를 받지 않는 시간 (연타로 넘겨 버리지 않게)
  endingLock: 1.0,
  holdSkip: 0.8,       // 프롤로그에서 Enter를 이만큼 누르고 있으면 건너뛴다
  typeSpeed: 32,       // 프롤로그 글자 수 / 초
  cutDip: 0.22,        // 프롤로그 컷이 바뀔 때 어두워졌다 밝아지는 시간
  bannerTime: 1.6,     // 웨이브 알림
  stageIntroTime: 2.2, // 스테이지 이름 알림
  levelUpTime: 2.6,    // 카프킥 단계 상승 알림
};
