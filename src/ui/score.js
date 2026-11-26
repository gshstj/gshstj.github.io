// [D 담당] 점수 모드의 점수, 배율, 최고 기록.
// game.score = { score, mult, chain, kills, wave, best, bestWave, newBest, gain, gainAt } (점수 모드가 아니면 null)
import { EV, on } from '../core/events.js';
import { ENDLESS } from '../stages/endless.js';

const BASE = { brawler: 100, shooter: 120, speedster: 160, heavy: 320, shadow: 1200, shadow2: 1800 };
const RULE = {
  multStep: 0.25,   // 맞지 않고 하나 쓰러뜨릴 때마다 배율 +0.25
  multMax: 5,
  wavePer: 0.08,    // 웨이브마다 기본 점수 +8%
  critBonus: 50,    // 강타로 마무리
  parry: 40,        // 패링
};
const KEY = 'kafkick.score.v1';

function loadBest() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { score: 0, wave: 0 }; } catch (e) { return { score: 0, wave: 0 }; }
}
function saveBest(b) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) { /* 저장이 막힌 브라우저에서는 그냥 넘어간다 */ }
}

export function initScore(game) {
  game.score = null;
  const add = (s, pts) => {
    const g = Math.round(pts * s.mult);
    s.score += g;
    s.gain = g;
    s.gainAt = performance.now();
  };
  on(EV.STAGE_START, ({ stage }) => {
    if (!stage || !stage.endless) { game.score = null; return; }
    const b = loadBest();
    game.score = { score: 0, mult: 1, chain: 0, kills: 0, wave: 1, best: b.score, bestWave: b.wave, newBest: false, gain: 0, gainAt: 0 };
  });
  on(EV.WAVE_START, ({ wave }) => { if (game.score) game.score.wave = wave + 1; });
  on(EV.ENEMY_DOWN, ({ enemy, crit }) => {
    const s = game.score;
    if (!s || !enemy) return;
    s.kills++;
    add(s, (BASE[enemy.type] || 100) * (1 + RULE.wavePer * (s.wave - 1)) + (crit ? RULE.critBonus : 0));
    s.chain++;
    s.mult = Math.min(RULE.multMax, 1 + s.chain * RULE.multStep);
    // 보스를 쓰러뜨리면 숨을 돌린다
    if (enemy.boss && game.player.alive) game.player.hp = Math.min(game.player.maxHp, game.player.hp + ENDLESS.healOnBoss);
  });
  on(EV.PARRY_SUCCESS, () => { if (game.score) add(game.score, RULE.parry); });
  on(EV.PLAYER_HIT, () => {
    const s = game.score;
    if (!s) return;
    s.chain = 0; // 맞으면 배율이 처음으로 돌아간다
    s.mult = 1;
  });
  on(EV.PLAYER_DEAD, () => {
    const s = game.score;
    if (!s) return;
    if (s.score > s.best) {
      s.newBest = true;
      s.best = s.score;
      s.bestWave = Math.max(s.bestWave, s.wave);
      saveBest({ score: s.best, wave: s.bestWave });
    } else if (s.wave > s.bestWave) {
      s.bestWave = s.wave;
      saveBest({ score: s.best, wave: s.bestWave });
    }
  });
}
