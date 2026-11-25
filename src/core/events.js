// 이벤트 버스. 모듈끼리는 서로 직접 부르지 않고 이벤트로 알린다.
// 리드만 수정한다. 새 이벤트가 필요하면 자기 폴더에 문자열 상수로 만들어 쓰고 보고한다.

export const EV = {
  // 플레이어 (발행: player)
  // move: 'calf'|'high'|'mid'|'axe', foot: 'right'|'left', step: 콤보 순서(0부터)
  // crit(강타): 콤보 마무리(finisher)이거나 패링 후 카운터(counter)일 때 true
  KICK_START: 'kick:start',              // { move, foot, step, level }  킥이 나간 순간
  KICK_HIT: 'kick:hit',                  // { target, move, foot, step, finisher, crit, damage, level, x, y, counter }
  KICK_LEVEL_UP: 'kick:levelUp',         // { level }  카프킥 단계(1..5)가 올랐다
  KICK_MISS: 'kick:miss',                // { move, x, y }
  PUNCH_HIT: 'punch:hit',                // { target, x, y }
  PARRY_SUCCESS: 'parry:success',        // { enemy, projectile, x, y }
  PARRY_FAIL: 'parry:fail',              // { x, y }
  PLAYER_HIT: 'player:hit',              // { damage, source, x, y }
  PLAYER_DEAD: 'player:dead',            // {}

  // 적 (발행: enemies)
  ENEMY_SPAWN: 'enemy:spawn',            // { enemy }
  ENEMY_TELEGRAPH: 'enemy:telegraph',    // { enemy, kind, timeToHit }
  ENEMY_ATTACK: 'enemy:attack',          // { enemy, kind }
  ENEMY_HIT: 'enemy:hit',                // { enemy, damage, crit, x, y }
  ENEMY_DOWN: 'enemy:down',              // { enemy, crit, x, y }
  PROJECTILE_SPAWN: 'projectile:spawn',  // { projectile }

  // 진행 (발행: stages / ui)
  STAGE_START: 'stage:start',            // { index, stage }
  WAVE_START: 'stage:wave',              // { index, wave }
  STAGE_CLEAR: 'stage:clear',            // { index, stage }
  SCENE_CHANGE: 'scene:change',          // { from, to }
};

const handlers = new Map();

export function on(name, fn) {
  if (!handlers.has(name)) handlers.set(name, []);
  handlers.get(name).push(fn);
  return () => {
    const list = handlers.get(name);
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  };
}

export function emit(name, data = {}) {
  const list = handlers.get(name);
  if (list) for (const fn of [...list]) fn(data);
}
