// 전투 밖 화면(타이틀, 프롤로그, 엔딩)에서 게임 속 캐릭터를 같은 그림으로 크게 그린다.
// ui가 가져다 쓴다. 전투 화면과 같은 리그(rig.js)를 쓰므로 주인공 그림이 바뀌면 여기도 같이 바뀐다.
import { HERO, kickDef } from './hero.js';
import { specOf } from './enemySprites.js';
import { drawChar } from './rig.js';
import { pathAt } from './pix.js';

// 선배: 주인공과 같은 체형, 어두운 점퍼에 갈색 머리. 역시 손은 주머니에.
export const SENIOR = {
  ...HERO,
  colors: {
    ...HERO.colors,
    top: '#34374c', topD: '#23253a', arm: '#40445e', armFar: '#1d1f30', armShadow: '#191a28',
    pants: '#5a5d70', pantsFar: '#3e4054', stripe: null,
    shoe: '#f0f0f4', shoeFar: '#b4b6c6',
  },
  // rows를 복사해야 한다: 머리 그림 캐시가 rows 배열을 열쇠로 쓰므로, 같은 배열이면 주인공 머리색이 그대로 나온다
  head: { ...HERO.head, rows: HERO.head.rows.slice(), pal: { ...HERO.head.pal, h: '#6b4526', H: '#a37443' } },
  torsoExtra(g, j) {
    // 세운 옷깃
    g.fillStyle = '#23253a';
    g.fillRect(j.sx - 4, j.sy - 1, 3, 3);
    g.fillStyle = '#8f93ab';
    g.fillRect(j.sx + 2, j.sy + 1, 1, 6);
  },
};

function heroPose(pose, t, move) {
  const P = { hip: [0, -15], lean: 1, sh: Math.sin(t * 2.6) > 0.2 ? 0 : 1, head: [0, 0], near: [2, 0], far: [-2, 0] };
  if (pose === 'kick') {
    // 발이 닿는 순간의 자세
    const def = kickDef(move || 'calf');
    const f = pathAt(def.keys, def.impact);
    P.hip = [def.hip[0], -15 + def.hip[1]];
    P.lean = def.lean;
    P.sh = 0;
    if (def.leg === 'near') { P.near = f; P.stretchNear = true; P.far = [-2, 0]; }
    else { P.far = f; P.stretchFar = true; P.near = [1, 0]; }
  } else if (pose === 'hunch') {
    // 움츠린 자세: 무릎을 굽히고 고개를 떨군다
    P.hip = [-1, -13];
    P.lean = 3;
    P.sh = 1;
    P.head = [1, 2];
    P.near = [3, 0];
    P.far = [-3, 0];
  } else if (pose === 'down') {
    P.lean = 0; P.sh = 0; P.near = [1, 0]; P.far = [-1, 0];
  }
  return P;
}

function brawlerPose(S, pose, t) {
  const hy = S.hipY, sy = hy - S.torsoH;
  const b = Math.sin(t * 2.2) > 0 ? 0 : 1;
  const P = Object.assign({ hip: [0, hy + b], lean: S.lean, sh: 0, head: [0, 0], near: [S.stance, 0], far: [-S.stance, 0] }, S.guard(sy, hy));
  if (pose === 'walk') {
    // 팔을 늘어뜨리고 걷는다
    const ph = t * S.walkRate;
    P.near = [S.stride * Math.cos(ph), -3 * Math.max(0, -Math.sin(ph))];
    P.far = [S.stride * Math.cos(ph + Math.PI), -3 * Math.max(0, Math.sin(ph))];
    P.hip = [0, hy + Math.abs(Math.cos(ph))];
    P.nearHand = [2 - Math.cos(ph) * 2, hy + 3];
    P.farHand = [3 + Math.cos(ph) * 2, hy + 3];
  } else if (pose === 'loom') {
    // 팔을 늘어뜨리고 내려다본다
    P.lean = S.lean + 1;
    P.head = [0, 1];
    P.nearHand = [3, hy + 3];
    P.farHand = [4, hy + 4];
  } else if (pose === 'down') {
    P.lean = 0; P.near = [2, 0]; P.far = [-1, 0];
    P.nearHand = [3, sy - 3]; P.farHand = [1, sy - 5];
  }
  return P;
}

// o = { who: 'hero'|'senior'|'brawler', pose, scale, facing, t(애니메이션 시간),
//       dark(색을 주면 그 색 실루엣만), fall(0..1, 뒤로 넘어가는 정도), move(킥 종류) }
// scale은 정수로 준다 (픽셀이 고르게 커진다). x, y는 발 중앙.
export function drawPortrait(ctx, x, y, o = {}) {
  const { who = 'hero', pose = 'stand', scale = 2, facing = 1, t = 0, dark = null, move = null } = o;
  const S = who === 'brawler' ? specOf('brawler') : who === 'senior' ? SENIOR : HERO;
  const P = who === 'brawler' ? brawlerPose(S, pose, t) : heroPose(pose, t, move);
  const opt = {};
  if (dark) opt.ghost = dark;
  // fall을 주면 그만큼만 넘어가고, 안 주면 'down' 자세는 완전히 누운 모습이다
  const fall = o.fall != null ? Math.max(0, Math.min(1, o.fall)) : pose === 'down' ? 1 : 0;
  if (fall > 0) {
    opt.rot = -fall * fall * Math.PI / 2;
    opt.pivotY = -(S.bw + 3) * fall;
  }
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  drawChar(ctx, S, P, 0, 0, facing, opt);
  ctx.restore();
}
