// 모바일 터치 조작 (스토리 모드 전용). 화면에 조이스틱과 버튼을 띄우고, 누르면 키보드 키를 누른 것처럼 알린다.
// 키 이벤트를 그대로 흉내 내므로 입력, 타격음 잠금 해제 등 기존 코드는 손대지 않아도 된다.
// 화면을 처음 터치하면 켜지고, 실제 키보드를 누르면 꺼진다 (터치스크린 노트북에서 가리지 않도록).
// 2인 대전은 터치를 지원하지 않는다 (타이틀에 대전 버튼을 두지 않는다).

const send = (type, code) => dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
const downKeys = new Set();
function hold(code, on) {
  if (on === downKeys.has(code)) return;
  if (on) { downKeys.add(code); send('keydown', code); } else { downKeys.delete(code); send('keyup', code); }
}
function tap(code) {
  send('keydown', code);
  setTimeout(() => send('keyup', code), 60);
}

const CSS = `
#touch { position: fixed; inset: 0; z-index: 5; display: none; touch-action: none; user-select: none; -webkit-user-select: none;
  -webkit-touch-callout: none; font-family: sans-serif; }
#touch.on { display: block; }
#touch .tb { position: absolute; border-radius: 50%; display: none; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.9); font-weight: 700; background: rgba(255,255,255,0.14); border: 2px solid rgba(255,255,255,0.45);
  box-sizing: border-box; touch-action: none; }
#touch .tb.show { display: flex; }
#touch .tb.act { background: rgba(255,216,77,0.45); border-color: #ffd84d; }
#touch .tb small { display: block; font-size: 0.55em; font-weight: 400; opacity: 0.85; }
#tStick { left: 5vmin; bottom: 7vmin; width: 34vmin; height: 34vmin; }
#tKnob { position: absolute; left: 50%; top: 50%; width: 15vmin; height: 15vmin; margin: -7.5vmin 0 0 -7.5vmin; border-radius: 50%;
  background: rgba(255,255,255,0.5); pointer-events: none; }
#tKick { right: 5vmin; bottom: 9vmin; width: 26vmin; height: 26vmin; font-size: 7vmin; }
#tJump { right: 33vmin; bottom: 5vmin; width: 19vmin; height: 19vmin; font-size: 4.5vmin; }
#tJab { right: 22vmin; bottom: 36vmin; width: 17vmin; height: 17vmin; font-size: 4vmin; }
#tPause { right: 3vmin; top: 3vmin; width: 12vmin; height: 12vmin; font-size: 4vmin; }
#tOk { left: 50%; bottom: 6vmin; width: 40vmin; height: 15vmin; margin-left: -20vmin; border-radius: 8vmin; font-size: 5vmin; }
#tSkip { right: 3vmin; top: 3vmin; width: 26vmin; height: 11vmin; border-radius: 6vmin; font-size: 3.6vmin; }
#tTurn { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; text-align: center;
  background: rgba(0,0,0,0.85); color: #fff; font-size: 5vmin; line-height: 1.6; }
@media (orientation: portrait) { #touch.on #tTurn { display: flex; } }
`;

export function initTouch(game) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="tb" id="tStick"><div id="tKnob"></div></div>
    <div class="tb" id="tKick"><div>킥<small>연타로 콤보</small></div></div>
    <div class="tb" id="tJump"><div>점프</div></div>
    <div class="tb" id="tJab"><div>견제</div></div>
    <div class="tb" id="tPause"><div>Ⅱ</div></div>
    <div class="tb" id="tOk"><div>확인</div></div>
    <div class="tb" id="tSkip"><div>건너뛰기</div></div>
    <div id="tTurn">화면을 가로로 돌려 주세요</div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);

  // 처음 터치하면 켜고, 진짜 키보드를 누르면 끈다
  let on = false;
  const enable = (v) => {
    if (on === v) return;
    on = v;
    root.classList.toggle('on', v);
    if (!v) for (const c of [...downKeys]) hold(c, false);
  };
  addEventListener('touchstart', () => enable(true), { passive: true });
  addEventListener('keydown', (e) => { if (e.isTrusted) enable(false); });

  // 누르고 있는 버튼
  const holdBtn = (el, code) => {
    const set = (v) => { el.classList.toggle('act', v); hold(code, v); };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.setPointerCapture(e.pointerId); set(true); });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, () => set(false));
  };
  holdBtn($('tKick'), 'KeyK');
  holdBtn($('tJump'), 'KeyW');
  holdBtn($('tJab'), 'KeyJ');
  holdBtn($('tOk'), 'Enter');
  holdBtn($('tPause'), 'Escape');
  holdBtn($('tSkip'), 'Escape');

  // 조이스틱: 좌우로 밀면 이동, 위로 밀면 점프
  const stick = $('tStick'), knob = $('tKnob');
  let sid = null, jumped = false;
  const moveStick = (e) => {
    const r = stick.getBoundingClientRect();
    const half = r.width / 2;
    let dx = (e.clientX - (r.left + half)) / half, dy = (e.clientY - (r.top + half)) / half;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * half * 0.6}px, ${dy * half * 0.6}px)`;
    hold('KeyA', dx < -0.3);
    hold('KeyD', dx > 0.3);
    if (dy < -0.6 && !jumped) { jumped = true; tap('KeyW'); }
    if (dy > -0.35) jumped = false;
  };
  const endStick = () => {
    sid = null;
    jumped = false;
    knob.style.transform = '';
    hold('KeyA', false);
    hold('KeyD', false);
  };
  stick.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sid = e.pointerId; stick.setPointerCapture(sid); moveStick(e); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === sid) moveStick(e); });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(t, (e) => { if (e.pointerId === sid || sid === null) endStick(); });

  // 전투 밖 장면에서는 빈 곳을 눌러도 확인(Enter)이다
  root.addEventListener('pointerdown', (e) => {
    if (e.target !== root) return;
    if (game.scene !== 'playing' && game.scene !== 'pvp') tap('Enter');
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // 장면에 따라 보일 버튼을 고른다
  const show = (id, v) => $(id).classList.toggle('show', v);
  let last = '';
  setInterval(() => {
    if (!on) return;
    const playing = game.scene === 'playing';
    const key = game.scene + (game.paused ? ':p' : '');
    if (key === last) return;
    last = key;
    const fight = playing && !game.paused;
    show('tStick', playing);             // 일시정지 메뉴도 좌우로 고른다
    show('tKick', fight);
    show('tJump', fight);
    show('tJab', fight);
    show('tPause', playing);
    show('tOk', !fight && game.scene !== 'pvp');
    show('tSkip', game.scene === 'prologue');
    if (!fight) for (const c of ['KeyK', 'KeyW', 'KeyJ']) hold(c, false);
    if (!playing) endStick();
  }, 120);
}
