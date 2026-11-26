// 게임 루프와 모듈 연결. 리드만 수정한다.
import { W, H, DT, RENDER_SCALE } from './core/config.js';
import { createGame } from './core/game.js';
import * as input from './core/input.js';
import { createPlayer, updatePlayer } from './player/index.js';
import { updateEnemies } from './enemies/index.js';
import { updateStage } from './stages/index.js';
import * as fx from './fx/index.js';
import * as ui from './ui/index.js';
import * as pvp from './pvp/index.js';
import { initTouch } from './core/touch.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
// 캔버스는 항상 고해상도(논리 x RENDER_SCALE)로 그리고, 창 크기에는 CSS로 맞춘다
const scale = RENDER_SCALE;
canvas.width = W * scale;
canvas.height = H * scale;

function resize() {
  const fit = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = Math.floor(W * fit) + 'px';
  canvas.style.height = Math.floor(H * fit) + 'px';
}
addEventListener('resize', resize);
resize();

const game = createGame();
window.game = game; // 디버깅용
game.player = createPlayer(game);
input.init();
initTouch(game); // 모바일 터치 조작 (스토리 모드 전용)
fx.init(game);
ui.init(game); // 첫 장면을 정하고 스테이지를 시작한다

function step(dt) {
  ui.update(game, dt); // 장면 전환, 메뉴 (실제 시간)
  const story = game.scene === 'playing', versus = game.scene === 'pvp';
  if ((story || versus) && !game.paused) {
    if (game.hitstop > 0) {
      game.hitstop -= dt;
    } else {
      const sdt = dt * game.timeScale;
      game.time += sdt;
      if (versus) {
        pvp.update(game, sdt); // 2인 대전
      } else {
        updatePlayer(game, sdt);
        updateEnemies(game, sdt);
        updateStage(game, sdt);
      }
    }
  }
  fx.update(game, dt); // 카메라, 파티클 (실제 시간)
  input.endStep();
}

function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  fx.drawWorld(ctx, game); // 배경, 캐릭터, 이펙트
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ui.draw(ctx, game);      // HUD, 타이밍 바, 메뉴
}

let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  while (acc >= DT) {
    step(DT);
    acc -= DT;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
