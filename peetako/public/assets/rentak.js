// Ikut Rentak (Follow the Beat) — a memory game with four Borneo sounds: sompoton (reed pipes), sape (lute),
// agung (gong) and chik-chak (the house gecko's call). The game plays a pattern; the player repeats it. Each
// round adds a note. Two slips are allowed (the pattern is replayed after the first); the second ends the run.
// Every pad lights up as well as sounding, so the game also works with sound off. Keys 1–4 work too.
// 1 coin per round cleared (shared daily cap, checked by the server). Score = 10 points per note repeated.
//
//   playRentak({ setup, sound, onEnd }) → onEnd({ count }) with rounds cleared, or onEnd(null) when stopped early.
import { openGame } from './minigame.js';
import { ICONS } from './icons.js';

const PADS = [
  { ...ICONS.sompoton, color: '#16A34A' },
  { ...ICONS.sape, color: '#F5B700' },
  { ...ICONS.agung, color: '#E11D48' },
  { ...ICONS.chikchak, color: '#67E8F9' },
];

export function playRentak({ setup = {}, sound = { play() {} }, onEnd }) {
  const startLen = setup.startLen || 3;
  const maxRounds = setup.maxRounds || 40;
  const per = setup.pointsPerNote || 10;
  const g = openGame({
    id: 'rentak', title: 'Ikut Rentak', sound, canvas: false,
    hud: `<span class="px kelip-score">0</span><span class="px mg-round">R1</span><span class="px kelip-lives" aria-label="Slips left">●●</span>`,
    rules: [
      'Watch and listen: the pads play a pattern. Then tap the same pads in the same order.',
      'Each round adds one note. Two slips and the run ends.',
      'Best with sound on. Every round cleared = 1 coin.',
    ],
  });
  g.stage.innerHTML = `<p class="mg-status px" aria-hidden="true"></p>
    <div class="rentak-pads">${PADS.map((p, i) => `
      <button type="button" class="rentak-pad" data-i="${i}" style="--c:${p.color}" disabled>
        <span class="rentak-icon">${p.svg}</span><span class="px">${i + 1}. ${p.name}</span>
      </button>`).join('')}</div>`;
  const pads = [...g.stage.querySelectorAll('.rentak-pad')];
  const status = g.q('.mg-status');
  const scoreEl = g.q('.kelip-score');
  const roundEl = g.q('.mg-round');
  const livesEl = g.q('.kelip-lives');

  const seq = [];
  let round = 1, pos = 0, cleared = 0, notes = 0, slips = 0, listening = false;
  const randPad = () => Math.floor(Math.random() * PADS.length);
  for (let i = 0; i < startLen; i++) seq.push(randPad());

  function light(i, ms) {
    const el = pads[i];
    el.classList.add('on');
    sound.play('pad' + i);
    g.after(ms, () => el.classList.remove('on'));
  }
  function setInput(on) {
    listening = on;
    for (const p of pads) p.disabled = !on;
    status.textContent = on ? 'Your turn' : 'Listen…';
    if (on) g.live(`Your turn: ${seq.length} notes.`);
  }
  // Playback never goes faster than 500 ms a note (the server checks the run against that).
  function playPattern() {
    setInput(false);
    g.live(`Round ${round}. Listen: ${seq.length} notes.`);
    const step = round > 8 ? 520 : 650;
    const on = Math.round(step * 0.7);
    seq.forEach((p, k) => g.after(500 + k * step, () => light(p, on)));
    g.after(500 + seq.length * step, () => { pos = 0; setInput(true); });
  }
  function press(i) {
    if (!listening) return;
    light(i, 220);
    if (i !== seq[pos]) {
      slips += 1;
      livesEl.textContent = '●'.repeat(Math.max(0, 2 - slips)) + '○'.repeat(Math.min(2, slips));
      setInput(false);
      sound.play('error');
      if (slips >= 2) { status.textContent = 'Out of tune!'; g.after(900, () => finish({ count: cleared })); return; }
      status.textContent = 'Oops! Once more…';
      g.after(900, playPattern);
      return;
    }
    pos += 1;
    if (pos < seq.length) return;
    // round cleared
    cleared += 1;
    notes += seq.length;
    scoreEl.textContent = String(notes * per);
    setInput(false);
    status.textContent = `Round ${round} cleared!`;
    g.live(`Round ${round} cleared. ${notes * per} points.`);
    g.after(300, () => sound.play('coin'));
    if (cleared >= maxRounds) { g.after(900, () => finish({ count: cleared })); return; }
    round += 1;
    roundEl.textContent = 'R' + round;
    seq.push(randPad());
    g.after(1000, playPattern);
  }
  g.stage.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.rentak-pad');
    if (b && !b.disabled) { e.preventDefault(); press(Number(b.dataset.i)); }
  });
  g.stage.addEventListener('keydown', (e) => { // Enter/Space on a focused pad
    const b = e.target.closest('.rentak-pad');
    if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); press(Number(b.dataset.i)); }
  });
  g.root.addEventListener('keydown', (e) => { if (/^[1-4]$/.test(e.key)) press(Number(e.key) - 1); });

  function finish(result) {
    if (g.done) return;
    g.close();
    onEnd(result);
  }
  g.onQuit(() => finish(cleared > 0 ? { count: cleared } : null));
  g.countdown(playPattern);
  return { quit: () => finish(null) };
}
