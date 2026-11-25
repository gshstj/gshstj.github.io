// [B 담당] enemies가 추가로 발행하는 이벤트 (core의 EV에는 없다. 듣고 싶은 담당만 듣는다).
export const EEV = {
  ENEMY_BRACE: 'enemy:brace',       // { enemy, x, y }  격투형이 연타를 막고 반격을 시작했다
  ENEMY_SWAP: 'enemy:swap',         // { enemy, fromX, toX }  스피드형이 반대편으로 넘어가기 시작했다
  ENEMY_GETUP: 'enemy:getup',       // { enemy }  날아가 쓰러졌던 적이 일어났다
  PROJECTILE_END: 'projectile:end', // { projectile, reason: 'player'|'enemy'|'ground'|'out', x, y }
};
