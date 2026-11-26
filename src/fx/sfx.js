// 타격음. 소리 파일 없이 Web Audio로 그때그때 만들어 낸다 (짧은 잡음과 낮은 음의 조합).
// 브라우저는 키나 터치 입력이 있기 전에는 소리를 막으므로, 첫 입력 때 켠다.
let ac = null, out = null, ready = false;

export function init() {
  const unlock = () => {
    ready = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ac && AC) {
      ac = new AC();
      out = ac.createGain();
      out.gain.value = 0.55;
      out.connect(ac.destination);
    }
    if (ac && ac.state === 'suspended') ac.resume();
  };
  addEventListener('keydown', unlock);
  addEventListener('pointerdown', unlock);
}

// 잡음 한 덩이: 길이, 걸러낼 주파수, 크기
function noise(dur, freq, vol, type = 'bandpass', q = 0.8) {
  if (!ready || !ac) return;
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(out);
  src.start();
}

// 음 하나: f0에서 f1으로 떨어지며 사라진다
function tone(f0, f1, dur, vol, type = 'sine') {
  if (!ready || !ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  whoosh() { noise(0.09, 2200, 0.1, 'highpass'); },
  // 타격: 둔탁한 몸통 소리 + 찰싹하는 잡음. 강타는 더 낮고 길게 울린다.
  hit(crit, level = 1) {
    tone(190, 55, 0.11, 0.55);
    noise(0.06, 1500, 0.4);
    if (crit) {
      tone(95, 28, 0.32, 0.8);
      noise(0.2, 500, 0.5, 'lowpass');
      if (level >= 4) tone(1200, 300, 0.18, 0.12, 'sawtooth');
    }
  },
  block() { tone(520, 380, 0.07, 0.25, 'square'); noise(0.04, 3000, 0.15, 'highpass'); },
  punch() { tone(240, 110, 0.07, 0.35); noise(0.04, 900, 0.2); },
  parry() { tone(1500, 1100, 0.16, 0.28, 'triangle'); tone(2300, 1900, 0.22, 0.14, 'triangle'); noise(0.05, 4000, 0.2, 'highpass'); },
  hurt() { tone(230, 70, 0.2, 0.5, 'sawtooth'); noise(0.12, 420, 0.4, 'lowpass'); },
  down() { tone(80, 32, 0.3, 0.6); noise(0.16, 260, 0.35, 'lowpass'); },
  levelUp() { tone(520, 1040, 0.18, 0.25, 'triangle'); setTimeout(() => tone(780, 1560, 0.25, 0.25, 'triangle'), 90); },
  boss() { tone(70, 40, 0.9, 0.6, 'sawtooth'); noise(0.5, 200, 0.3, 'lowpass'); },
  surge() { noise(0.8, 700, 0.5, 'bandpass', 0.5); tone(60, 200, 0.7, 0.4, 'sawtooth'); },
};
