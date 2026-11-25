// 엔티티 공통 형태와 도우미. 리드만 수정한다.
import { GRAVITY, GROUND_Y } from './config.js';

// x, y는 "발 중앙" 좌표다. 몸통 박스는 (x - w/2, y - h) 에서 시작한다.
export function makeEntity(props) {
  return Object.assign({
    kind: 'entity',   // 'player' | 'enemy'
    type: '',         // 'hero' | 'brawler' | 'shooter' | 'speedster' | ...
    x: 0, y: GROUND_Y,
    vx: 0, vy: 0,
    w: 14, h: 30,
    facing: 1,        // 1 = 오른쪽, -1 = 왼쪽
    hp: 1, maxHp: 1,
    state: 'idle',    // 그리기 담당(fx)이 이 값과 stateTime으로 애니메이션을 고른다
    stateTime: 0,     // 현재 state에 머문 시간(초)
    alive: true,
    onGround: true,
  }, props);
}

export function setState(e, state) {
  if (e.state !== state) {
    e.state = state;
    e.stateTime = 0;
  }
}

export function box(e) {
  return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 중력, 바닥, 스테이지 좌우 경계 처리
export function applyPhysics(e, dt, game) {
  e.vy += GRAVITY * dt;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (e.y >= GROUND_Y) {
    e.y = GROUND_Y;
    e.vy = 0;
    e.onGround = true;
  } else {
    e.onGround = false;
  }
  const width = game.stage ? game.stage.width : 480;
  const half = e.w / 2;
  if (e.x < half) e.x = half;
  if (e.x > width - half) e.x = width - half;
}
