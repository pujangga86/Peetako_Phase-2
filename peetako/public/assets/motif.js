// Padan Motif (Match the Motifs) — a calm memory game with no clock. Turn two cards; matching Borneo motifs stay
// face up. Three boards: 6, 8 and 10 pairs. Score: 10 per pair, −2 per wrong guess (never below 0), +50 per
// board cleared. 1 coin per 3 pairs (shared daily cap, server-checked). Stopping keeps the pairs found so far.
//
//   playMotif({ setup, sound, onEnd }) → onEnd({ count, misses }) or onEnd(null) when stopped with no pairs.
import { openGame } from './minigame.js';
import { ICONS } from './icons.js';

const DECK = ['kenyalang', 'terendak', 'sape', 'pua', 'agung', 'perahu', 'rafflesia', 'kelip', 'tempayan', 'sompoton'];
const COLS = { 6: 3, 8: 4, 10: 4 }; // 3×4, 4×4, 4×5

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function playMotif({ setup = {}, sound = { play() {} }, onEnd }) {
  const boards = setup.boards || [6, 8, 10];
  const pairPts = setup.pairPoints || 10, penalty = setup.missPenalty || 2, bonus = setup.clearBonus || 50;
  const g = openGame({
    id: 'motif', title: 'Padan Motif', sound, canvas: false,
    hud: `<span class="px kelip-score">0</span><span class="px mg-board">1/${boards.length}</span><span class="px mg-misses" aria-label="Wrong guesses">MISS 0</span>`,
    rules: [
      'Turn two cards. If the Borneo motifs match, they stay up.',
      `No clock: take your time. Three boards (${boards.join(', ')} pairs).`,
      `10 points a pair, −2 a wrong guess, +${bonus} a board. Every 3 pairs = 1 coin. Tap ✕ to stop and keep your score.`,
    ],
  });
  const scoreEl = g.q('.kelip-score'), boardEl = g.q('.mg-board'), missEl = g.q('.mg-misses');
  let board = 0, pairs = 0, misses = 0, cleared = 0, open = [], locked = false, matchedHere = 0;

  const score = () => Math.max(0, pairs * pairPts - misses * penalty) + cleared * bonus;
  const hud = () => { scoreEl.textContent = String(score()); missEl.textContent = `MISS ${misses}`; boardEl.textContent = `${board + 1}/${boards.length}`; };

  function deal() {
    const n = boards[board];
    const ids = shuffle(DECK.slice()).slice(0, n);
    const cards = shuffle([...ids, ...ids]);
    matchedHere = 0;
    g.stage.innerHTML = `<p class="mg-status px" aria-hidden="true">Board ${board + 1}</p>
      <div class="motif-grid" style="--cols:${COLS[n] || 4}">${cards.map((id, i) => `
        <button type="button" class="motif-card" data-id="${id}" data-i="${i}" aria-label="Card ${i + 1}, face down">
          <span class="motif-back" aria-hidden="true"></span>
          <span class="motif-face" aria-hidden="true">${ICONS[id].svg}<span class="motif-name">${ICONS[id].name}</span></span>
        </button>`).join('')}</div>`;
    hud();
    g.live(`Board ${board + 1}: ${n} pairs.`);
  }

  function flip(card) {
    if (locked || card.classList.contains('up') || g.done) return;
    card.classList.add('up');
    card.setAttribute('aria-label', `${ICONS[card.dataset.id].name}`);
    sound.play('tap');
    open.push(card);
    if (open.length < 2) return;
    const [a, b] = open;
    open = [];
    if (a.dataset.id === b.dataset.id) {
      a.classList.add('matched'); b.classList.add('matched');
      a.disabled = true; b.disabled = true;
      pairs += 1; matchedHere += 1;
      sound.play(pairs % 3 === 0 ? 'coin' : 'gift');
      g.live(`Match: ${ICONS[a.dataset.id].name}.`);
      hud();
      if (matchedHere === boards[board]) boardDone();
      return;
    }
    misses += 1;
    hud();
    locked = true;
    g.after(750, () => {
      for (const c of [a, b]) { c.classList.remove('up'); c.setAttribute('aria-label', `Card ${Number(c.dataset.i) + 1}, face down`); }
      locked = false;
    });
  }

  function boardDone() {
    cleared += 1;
    hud();
    sound.play('levelUp');
    const last = board + 1 >= boards.length;
    const status = g.stage.querySelector('.mg-status');
    status.textContent = last ? 'All boards cleared!' : `Board cleared! +${bonus}`;
    g.live(status.textContent);
    locked = true;
    g.after(1300, () => {
      if (last) { finish({ count: pairs, misses }); return; }
      board += 1; locked = false; deal();
    });
  }

  g.stage.addEventListener('click', (e) => { const c = e.target.closest('.motif-card'); if (c) flip(c); });

  function finish(result) {
    if (g.done) return;
    g.close();
    onEnd(result);
  }
  g.onQuit(() => finish(pairs > 0 ? { count: pairs, misses } : null));
  g.countdown(() => { deal(); g.stage.querySelector('.motif-card')?.focus(); });
  return { quit: () => finish(null) };
}
