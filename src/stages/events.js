// [D 담당] 진행 쪽에서 추가로 쓰는 이벤트. 공용 EV(src/core/events.js)에 없는 것만 둔다.
export const SEV = {
  NEW_GAME: 'game:new',            // {}  타이틀에서 새 게임을 시작했다 (프롤로그가 끝난 직후, 첫 STAGE_START 직전)
  CHECKPOINT: 'stage:checkpoint',  // { index, wave }  체크포인트 웨이브에 처음 도달했다
};
