// [D 담당] 글자 그리기 도우미.
// 캔버스가 정수배로 확대되어 있어 fillText 글자는 선명하다. 한글은 10px 아래로 쓰지 않는다.
export const FONT = '"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function setFont(ctx, size, bold) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
}

export function measure(ctx, str, size = 10, bold = false) {
  setFont(ctx, size, bold);
  return ctx.measureText(str).width;
}

// 테두리가 있는 글자. o = { size, color, align, bold, outline(false면 테두리 없음) }
export function text(ctx, str, x, y, o = {}) {
  setFont(ctx, o.size || 10, o.bold);
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = 'alphabetic';
  if (o.outline !== false) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = o.outline || 'rgba(0,0,0,0.85)';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
}

// '[A][D] 이동' 같은 문자열을 키 모양과 글자로 나눈다
function parse(str) {
  const parts = [];
  const re = /\[([^\]]+)\]|([^[]+)/g;
  let m;
  while ((m = re.exec(str))) parts.push(m[1] ? { key: m[1] } : { text: m[2] });
  return parts;
}

function keyWidth(ctx, label, size) {
  return Math.max(size + 2, Math.ceil(measure(ctx, label, size - 1, true)) + 6);
}

function keycap(ctx, label, x, y, size) {
  const w = keyWidth(ctx, label, size);
  const top = y - size + 1;
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(x - 1, top - 1, w + 2, size + 4);
  ctx.fillStyle = '#74748a';
  ctx.fillRect(x, top, w, size + 2);
  ctx.fillStyle = '#ececf4';
  ctx.fillRect(x, top, w, size);
  text(ctx, label, x + w / 2, y - 1, { size: size - 1, bold: true, color: '#14141e', align: 'center', outline: false });
}

// 키 모양이 섞인 한 줄. 그린 폭을 돌려준다.
export function rich(ctx, str, x, y, o = {}) {
  const size = o.size || 10;
  const parts = parse(str);
  let total = 0;
  for (const p of parts) {
    p.w = p.key ? keyWidth(ctx, p.key, size) + 2 : measure(ctx, p.text, size, o.bold);
    total += p.w;
  }
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  cx = Math.round(cx);
  for (const p of parts) {
    if (p.key) keycap(ctx, p.key, Math.round(cx), y, size);
    else text(ctx, p.text, Math.round(cx), y, { ...o, align: 'left' });
    cx += p.w;
  }
  return total;
}

// 어두운 반투명 판
export function panel(ctx, x, y, w, h, border = '#5a5a78') {
  ctx.fillStyle = 'rgba(10,10,18,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

export function mmss(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
