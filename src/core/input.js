// 키보드 입력. 리드만 수정한다.
// down(action): 누르고 있는 중 / pressed(action): 이번 스텝에 눌림 / released(action): 이번 스텝에 뗌

const KEYMAP = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['KeyW', 'Space', 'ArrowUp'],
  punch: ['KeyJ'],
  kick: ['KeyK'],
  confirm: ['Enter'],
  pause: ['Escape'],
  aux: ['Backquote'],
};

const codeToAction = {};
for (const [action, codes] of Object.entries(KEYMAP)) for (const c of codes) codeToAction[c] = action;

const held = new Set();
const justPressed = new Set();
const justReleased = new Set();

export function init() {
  addEventListener('keydown', (e) => {
    const a = codeToAction[e.code];
    if (!a) return;
    e.preventDefault();
    if (e.repeat) return;
    if (!held.has(a)) justPressed.add(a);
    held.add(a);
  });
  addEventListener('keyup', (e) => {
    const a = codeToAction[e.code];
    if (!a) return;
    e.preventDefault();
    if (held.has(a)) justReleased.add(a);
    held.delete(a);
  });
  addEventListener('blur', () => {
    for (const a of held) justReleased.add(a);
    held.clear();
  });
}

export const down = (a) => held.has(a);
export const pressed = (a) => justPressed.has(a);
export const released = (a) => justReleased.has(a);

// main.js가 매 스텝 끝에 부른다.
export function endStep() {
  justPressed.clear();
  justReleased.clear();
}
