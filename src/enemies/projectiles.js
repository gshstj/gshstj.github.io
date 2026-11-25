// [B 담당] 투척물. game.projectiles에 넣고 이동, 충돌, 제거를 처리한다.
// 형태: { x, y, vx, vy, w, h, damage, parryable, reflected, alive, type } (x, y는 중심)
// 플레이어가 쳐내면 reflected를 true로 바꾼다. 되돌아가는 속도와 방향은 여기서 정한다
// (플레이어가 vx를 이미 뒤집어 놓았으면 그 방향을 따른다). 되돌아간 투척물은 적에게 강타로 맞는다.
import { GROUND_Y } from '../core/config.js';
import { EV, emit } from '../core/events.js';
import { box, overlap } from '../core/entity.js';
import { PROJECTILE } from './tuning.js';
import { EEV } from './events.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function spawnProjectile(game, owner, type) {
  const P = PROJECTILE[type];
  const p = game.player;
  const dir = owner.facing;
  const x = owner.x + dir * 8;
  const y = owner.y - P.handY;
  let vx = dir * P.speed, vy = 0, gravity = 0;
  if (P.lob) {
    // 지금 플레이어가 서 있는 자리(가슴 높이)를 지나도록 포물선으로 던진다
    const t = clamp(Math.abs(p.x - x) / P.speed, P.minTime, P.maxTime);
    gravity = P.gravity;
    vx = (p.x - x) / t;
    vy = (p.y - 14 - y) / t - 0.5 * gravity * t;
  }
  const pr = {
    x, y, vx, vy, w: P.w, h: P.h,
    damage: P.damage, parryable: true, reflected: false, alive: true, type,
    // 아래는 내부 값
    owner, knockback: P.knockback, gravity, age: 0, dir0: dir, reflectDone: false,
  };
  game.projectiles.push(pr);
  emit(EV.PROJECTILE_SPAWN, { projectile: pr });
  return pr;
}

function end(pr, reason) {
  pr.alive = false;
  emit(EEV.PROJECTILE_END, { projectile: pr, reason, x: pr.x, y: pr.y });
}

// 쳐낸 직후 한 번: 던진 적(살아 있고 그 방향에 있으면)을 향해 곧게 되돌려 보낸다
function redirect(pr) {
  pr.reflectDone = true;
  const dir0 = pr.dir0 || Math.sign(pr.vx) || 1;
  const flipped = Math.sign(pr.vx) === -dir0; // 플레이어가 이미 뒤집었다
  const dir = flipped ? Math.sign(pr.vx) : -dir0;
  const speed = Math.max(Math.abs(pr.vx), PROJECTILE.reflectSpeed);
  pr.gravity = 0;
  pr.vx = dir * speed;
  pr.vy = 0;
  const o = pr.owner;
  if (o && o.alive && (o.x - pr.x) * dir > 4) {
    const t = Math.abs(o.x - pr.x) / speed;
    pr.vy = clamp((o.y - o.h / 2 - pr.y) / t, -speed, speed);
  }
  pr.age = 0;
}

export function updateProjectiles(game, dt) {
  const list = game.projectiles;
  // 지난 스텝에 사라진 것을 치운다 (한 스텝은 alive=false로 남겨 다른 담당이 볼 수 있게 한다)
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].alive) list.splice(i, 1);

  const p = game.player;
  const width = game.stage ? game.stage.width : 480;
  for (const pr of list) {
    if (pr.reflected && !pr.reflectDone) redirect(pr);
    pr.age = (pr.age || 0) + dt;
    pr.vy += (pr.gravity || 0) * dt;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;

    const b = { x: pr.x - pr.w / 2, y: pr.y - pr.h / 2, w: pr.w, h: pr.h };
    if (pr.reflected) {
      for (const e of game.enemies) {
        if (!e.alive || e.state === 'down' || !overlap(b, box(e))) continue;
        e.takeHit({
          damage: pr.damage * PROJECTILE.reflectMult, knockback: PROJECTILE.reflectKnockback,
          crit: true, source: pr, dir: Math.sign(pr.vx) || 1,
        });
        end(pr, 'enemy');
        break;
      }
    } else if (p && p.alive && overlap(b, box(p))) {
      // 무적 중이면 takeHit이 false를 돌려주고 투척물은 그대로 지나간다
      if (p.takeHit({ damage: pr.damage, knockback: pr.knockback || 100, source: pr }) !== false) end(pr, 'player');
    }
    if (!pr.alive) continue;

    if (pr.y + pr.h / 2 >= GROUND_Y) end(pr, 'ground');
    else if (pr.x < -PROJECTILE.outMargin || pr.x > width + PROJECTILE.outMargin || pr.y < -200 || pr.age > PROJECTILE.life) end(pr, 'out');
  }
}
