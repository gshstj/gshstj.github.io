// [C 담당] 사람 모양 픽셀 리그.
// 관절 위치(자세)를 받아 팔다리를 픽셀 선으로 그린다. 프레임을 손으로 찍지 않고
// 자세 값을 시간에 따라 바꿔서 애니메이션을 만든다. 주인공과 적이 같이 쓴다.
//
// 좌표: 발 중앙이 (0, 0), 위쪽이 -y, 캐릭터는 항상 오른쪽(+x)을 본다 (왼쪽은 그릴 때 뒤집는다).
// "near" = 화면에 가까운 쪽(오른발, 오른팔), "far" = 먼 쪽(왼발, 왼팔. 더 어둡게 그린다).
import { makeCanvas, blit, q, D, line, disc, sprite, clamp, lerp } from './pix.js';

export const OUTLINE = '#0d0b16';
const OUTLINE_W = 0.75; // 외곽선 굵기(논리 px)

// 캐릭터 한 명을 그리는 작업용 버퍼 (외곽선과 번쩍임을 입히기 위해)
const BW = 144, BH = 112, OX = 72, OY = 88;
const [buf, bg] = makeCanvas(BW, BH);
const [sil, sg] = makeCanvas(BW, BH);
const [out, og] = makeCanvas(BW, BH);

// 두 마디 관절 풀이. (ax, ay)에서 (tx, ty)로 뻗는 팔다리의 중간 관절 위치를 구한다.
// bend: -1이면 다리(무릎이 앞으로), +1이면 팔(팔꿈치가 뒤로). stretch: 닿지 않으면 늘려서 닿게 한다.
export function ik(ax, ay, tx, ty, l1, l2, bend, stretch) {
  let dx = tx - ax, dy = ty - ay;
  let d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2;
  if (d > max) {
    if (stretch) {
      const k = l1 / max;
      return [ax + dx * k, ay + dy * k, tx, ty];
    }
    dx *= max / d; dy *= max / d; d = max;
    tx = ax + dx; ty = ay + dy;
  }
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const ang = Math.atan2(dy, dx) + bend * Math.acos(cosA);
  return [ax + Math.cos(ang) * l1, ay + Math.sin(ang) * l1, tx, ty];
}

// 다리 관절. foot = 발바닥이 닿는 점. 발목은 그보다 2px 위.
export function legJoints(S, hx, hy, foot, stretch, toe) {
  const [kx, ky, ax, ay] = ik(hx, hy, foot[0], foot[1] - 2, S.thigh, S.shin, -1, stretch);
  // 발끝 방향: 땅에 있으면 앞, 떠 있으면 정강이 방향 쪽으로 꺾인다
  let tx = 1, ty = 0;
  if (toe) { tx = toe[0]; ty = toe[1]; }
  else if (foot[1] < -1) {
    const dx = ax - kx, dy = ay - ky, d = Math.hypot(dx, dy) || 1;
    const k = clamp((-foot[1] - 1) / 4);
    tx = lerp(1, dx / d + 1, k); ty = lerp(0, dy / d, k);
    const n = Math.hypot(tx, ty) || 1;
    tx /= n; ty /= n;
  }
  return { hx, hy, kx, ky, ax, ay, tx, ty };
}

export function drawLeg(g, S, J, pants, stripe, shoe, sole) {
  line(g, J.hx, J.hy, J.kx, J.ky, S.legW, pants);
  line(g, J.kx, J.ky, J.ax, J.ay, S.legW, pants);
  if (stripe) {
    line(g, J.hx, J.hy, J.kx, J.ky, 1, stripe);
    line(g, J.kx, J.ky, J.ax, J.ay, 1, stripe);
  }
  const L = S.shoeLen || 3;
  const bx = J.ax + J.tx * L, by = J.ay + J.ty * L;
  line(g, J.ax, J.ay, bx, by, 3, shoe);
  if (sole) line(g, J.ax - J.ty, J.ay + J.tx, bx - J.ty, by + J.tx, 1, sole); // 밑창
}

export function drawLegFlat(g, S, J, color) {
  drawLeg(g, S, J, color, null, color, null);
}

function drawArm(g, S, sx, sy, hand, color, skin, stretch) {
  const [ex, ey, hx, hy] = ik(sx, sy, hand[0], hand[1], S.upperArm, S.foreArm, 1, stretch);
  line(g, sx, sy, ex, ey, S.armW, color);
  line(g, ex, ey, hx, hy, S.armW, color);
  const f = S.fist || 3;
  disc(g, hx - 0.5, hy - 0.5, f / 2 - 0.15, skin); // 주먹
  return [hx, hy];
}

// 주머니에 넣은 팔: 어깨 → 등 뒤로 튀어나온 팔꿈치 → 허리춤 주머니. 손은 절대 보이지 않는다.
function drawPocketArm(g, S, sx, sy, hx, hy, color, dx, dy, shadow) {
  const ex = Math.min(sx, hx) - S.bw - 3 + dx;
  const ey = q((sy + hy) / 2) + 1 + dy;
  if (shadow) {
    // 팔 아래 그늘: 팔이 몸통과 떨어져 보이게 한다
    line(g, sx + dx, sy + 3 + dy, ex + 1, ey + 1, 3, shadow);
    line(g, ex + 1, ey + 1, hx + 1 + dx, hy + 1 + dy, 2, shadow);
  }
  line(g, sx - 1 + dx, sy + 2 + dy, ex, ey, 3, color);
  line(g, ex, ey, hx + 1 + dx, hy + dy, 2, color);
}

// 자세 P: { hip:[x,y], lean, sh, head:[dx,dy], near:[x,y], far:[x,y],
//           stretchNear, stretchFar, nearToe, farToe, nearHand:[x,y], farHand:[x,y], stretchArm,
//           shoeNear, shoeFar (색 덮어쓰기) }
export function drawHumanoid(g, S, P) {
  // 손 버릇이 정해진 캐릭터(팔짱 등)는 자세에 손 위치가 없으면 그 버릇대로 둔다
  if (S.handPose && !P.nearHand) P = Object.assign({}, P, S.handPose(P, S));
  const C = S.colors;
  const hx = P.hip[0], hy = P.hip[1];
  const sx = hx + (P.lean || 0), sy = hy - S.torsoH + (P.sh || 0);
  const rsx = q(sx), rsy = q(sy), rhx = q(hx), rhy = q(hy);
  const near = legJoints(S, hx, hy + 1, P.near, P.stretchNear, P.nearToe);
  const far = legJoints(S, hx + 1, hy + 1, P.far, P.stretchFar, P.farToe);
  const joints = { near, far, sx: rsx, sy: rsy, hx: rhx, hy: rhy };

  // 먼 쪽 팔
  if (S.arms === 'pocket') drawPocketArm(g, S, sx, sy, hx, hy, C.armFar, -1, 1);
  else joints.farHand = drawArm(g, S, sx + 1, sy + 2, P.farHand || [hx + 2, hy + 2], C.armFar, C.skinD, P.stretchArm);

  // 먼 쪽 다리
  drawLeg(g, S, far, C.pantsFar, null, P.shoeFar || C.shoeFar, C.soleFar);

  // 몸통 (어깨에서 엉덩이까지 한 줄씩. lean만큼 기운다)
  const wid = S.bw + S.fw + 1;
  const u = 1 / D;
  const span = Math.max(u, rhy - rsy);
  for (let y = rsy; y < rhy + 1 - 1e-6; y += u) {
    const k = clamp((y - rsy) / span);
    const cx = q(lerp(sx, hx, k));
    // 어깨는 둥글게 깎고, 허리는 살짝 들어간다
    const round = y - rsy < 1 ? (1 - (y - rsy)) * (1 - (y - rsy)) * 1.2 : 0;
    const waist = Math.sin(k * Math.PI) * 0.45;
    const x0 = q(cx - S.bw + round + waist), x1 = q(cx + S.fw + 1 - round * 0.8);
    g.fillStyle = C.top;
    g.fillRect(x0, y, x1 - x0, u);
    g.fillStyle = C.topD;
    g.fillRect(x0, y, q(1.5 + k * 0.75), u); // 등 쪽 그늘 (아래로 갈수록 넓게)
    if (C.topL) { g.fillStyle = C.topL; g.fillRect(x1 - 0.75, y, 0.75, u); }
  }
  g.fillStyle = C.topD;
  g.fillRect(rhx - S.bw, rhy, wid, 1); // 밑단
  if (S.torsoExtra) S.torsoExtra(g, joints, P, S);

  // 머리
  const H = S.head;
  const hdx = P.head ? P.head[0] : 0, hdy = P.head ? P.head[1] : 0;
  const hu = H.unit || 1;
  joints.headX = q(rsx + H.ox + hdx);
  joints.headY = q(rsy - H.rows.length * hu + H.oy + hdy);
  if (S.headBack) S.headBack(g, joints, P, S);
  sprite(g, H.rows, H.pal, joints.headX, joints.headY, hu);

  // 가까운 쪽 다리
  drawLeg(g, S, near, C.pants, C.stripe, P.shoeNear || C.shoe, C.sole);

  // 가까운 쪽 팔
  if (S.arms === 'pocket') {
    drawPocketArm(g, S, sx, sy, hx, hy, C.arm, 0, 0, C.armShadow);
    // 주머니: 팔 끝이 바지 속으로 들어간다
    g.fillStyle = C.pants;
    g.fillRect(rhx, rhy + 1, 3, 2);
    g.fillStyle = C.topD;
    g.fillRect(rhx, rhy, 3, 1);
  } else {
    joints.nearHand = drawArm(g, S, sx, sy + 2, P.nearHand || [hx + 1, hy + 2], C.arm, C.skin, P.stretchArm);
  }
  if (S.extra) S.extra(g, joints, P, S);
  return joints;
}

// 캐릭터를 버퍼에 그리고, 외곽선을 두른 뒤 화면에 찍는다.
// o: { flash(0..1), flashColor, alpha, rot(라디안), pivotY, outline, extra(g, joints), ghost(색) }
export function drawChar(g, S, P, x, y, facing, o = {}) {
  bg.clearRect(0, 0, BW, BH);
  bg.save();
  bg.translate(OX, OY);
  const joints = drawHumanoid(bg, S, P);
  if (o.extra) o.extra(bg, joints);
  bg.restore();

  sg.globalCompositeOperation = 'source-over';
  sg.clearRect(0, 0, BW, BH);
  blit(sg, buf, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = o.ghost || o.outline || OUTLINE;
  sg.fillRect(0, 0, BW, BH);

  og.globalCompositeOperation = 'source-over';
  og.globalAlpha = 1;
  og.clearRect(0, 0, BW, BH);
  if (o.ghost) {
    blit(og, sil, 0, 0); // 잔상: 한 색 실루엣만
  } else {
    // 외곽선: 실루엣을 여덟 방향으로 조금씩 밀어 찍는다
    const t = OUTLINE_W, u = t * 0.7;
    for (const [ox, oy] of [[t, 0], [-t, 0], [0, t], [0, -t], [u, u], [-u, u], [u, -u], [-u, -u]]) blit(og, sil, q(ox), q(oy));
    blit(og, buf, 0, 0);
    if (o.flash > 0) {
      og.globalCompositeOperation = 'source-atop';
      og.globalAlpha = clamp(o.flash);
      og.fillStyle = o.flashColor || '#ffffff';
      og.fillRect(0, 0, BW, BH);
      og.globalAlpha = 1;
      og.globalCompositeOperation = 'source-over';
    }
  }

  g.save();
  g.translate(q(x), q(y));
  g.scale(facing < 0 ? -1 : 1, 1);
  if (o.rot) {
    g.translate(0, o.pivotY || 0);
    g.rotate(o.rot);
  }
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  blit(g, out, -OX, -OY);
  g.restore();
  return joints;
}

// 자세 섞기 (숫자와 [x,y] 배열만 섞고 나머지는 b를 따른다)
export function mixPose(a, b, t) {
  const r = Object.assign({}, a, b);
  for (const k of Object.keys(r)) {
    const va = a[k], vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') r[k] = lerp(va, vb, t);
    else if (Array.isArray(va) && Array.isArray(vb)) r[k] = [lerp(va[0], vb[0], t), lerp(va[1], vb[1], t)];
  }
  return r;
}
