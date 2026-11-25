// [B 담당] 적. 잡몸 3종(격투형, 사격형, 스피드형)과 투척물, 공격 차례 조율.
// 계약: spawnEnemy, updateEnemies 내보내기, enemy.attack 형태, enemy.takeHit, enemy.onParried, EV의 적 이벤트 발행.
// 파일 구성:
//   tuning.js       밸런스 수치
//   common.js       생성, 피격 반응, 패링당함, 근접 판정, 공통 상태 처리
//   brawler.js / shooter.js / speedster.js   타입별 AI
//   projectiles.js  투척물
//   director.js     공격 차례 조율
//   events.js       enemies가 추가로 발행하는 이벤트 이름
import { EV, emit } from '../core/events.js';
import { COMMON } from './tuning.js';
import { createEnemy, stepEnemy } from './common.js';
import { updateDirector } from './director.js';
import { updateProjectiles } from './projectiles.js';
import { brawler } from './brawler.js';
import { shooter } from './shooter.js';
import { speedster } from './speedster.js';

const TYPES = { brawler, shooter, speedster };

export function spawnEnemy(game, type, x) {
  let def = TYPES[type];
  if (!def) {
    console.warn(`[enemies] 모르는 적 타입 "${type}". brawler로 대신한다.`);
    type = 'brawler';
    def = TYPES.brawler;
  }
  const e = createEnemy(game, type, x, def);
  game.enemies.push(e);
  emit(EV.ENEMY_SPAWN, { enemy: e });
  return e;
}

// 가만히 있거나 걷는 적끼리 겹치지 않게 살짝 밀어낸다
function separate(game, dt) {
  const list = game.enemies;
  const free = (e) => e.alive && !e.attack && (e.state === 'idle' || e.state === 'walk') && e.action !== 'swap';
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (!free(a)) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!free(b)) continue;
      const dx = b.x - a.x;
      if (Math.abs(dx) >= COMMON.separation) continue;
      const push = (dx >= 0 ? 1 : -1) * COMMON.separationSpeed * dt;
      a.x -= push;
      b.x += push;
    }
  }
}

export function updateEnemies(game, dt) {
  updateDirector(game, dt);
  for (const e of game.enemies) stepEnemy(game, e, TYPES[e.type] || TYPES.brawler, dt);
  separate(game, dt);
  updateProjectiles(game, dt);
}
