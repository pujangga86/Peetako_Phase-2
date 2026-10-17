// Peetako cute moves ("antics"). Browser only, no network, no images.
//
// Eight short moves play at random when the pet is tapped (touch) or when the mouse pointer passes
// over it (desktop), plus a hidden "giggle" for five quick taps. While left alone, the pet also plays
// a gentle move every 10–25 seconds. Each move is a CSS animation on parts of the SVG that art.js
// already draws (pk, pk-head, pk-tail, pk-foot-l/r and the hidden pk-x overlays), so nothing is
// redrawn: JS only sets data-act on the pet's container for the length of the move.
//
// Rules: active and ascended pets only; a hungry, sleepy or sad pet plays only the gentle moves;
// a dormant or fallen pet does not move; the egg (Tier 0) only wobbles. With "reduce motion" on,
// only the wink plays.

export const MOVES = {
  wink:   { ms: 650,  gentle: true },
  hop:    { ms: 750 },
  wiggle: { ms: 1000 },
  tongue: { ms: 1000 },  // Robot: antenna spark (same slot, see style.css)
  tilt:   { ms: 1400, gentle: true },
  wag:    { ms: 1000, gentle: true },
  stomp:  { ms: 1000 },
  spin:   { ms: 900 },
  giggle: { ms: 1100, hidden: true },
  wobble: { ms: 900,  hidden: true }, // egg only
};

const COOLDOWN_MS = 1100;
const TICKLE_TAPS = 5;
const TICKLE_WINDOW_MS = 2000;
const IDLE_MIN_MS = 10_000;
const IDLE_MAX_MS = 25_000;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Which moves this pet may play right now. info() returns { tier, status, face }.
export function allowedMoves({ tier, status, face }, { idle = false } = {}) {
  if (status !== 'active' && status !== 'ascended') return [];
  if (tier === 0) return ['wobble'];
  if (reducedMotion()) return ['wink'];
  const all = Object.keys(MOVES).filter((k) => !MOVES[k].hidden);
  const gentleOnly = idle || ['hungry', 'sleepy', 'sad'].includes(face);
  return gentleOnly ? all.filter((k) => MOVES[k].gentle) : all;
}

// Attach to a container whose innerHTML is a drawPet() SVG. info() is read at the moment of each move,
// so the container can be redrawn freely (mood changes, polling) without re-attaching.
export function attachAntics(el, info, { onTap = () => {}, idle = true } = {}) {
  let busy = false;
  let last = '';
  let lastAt = 0;
  let taps = [];
  let idleTimer = null;
  let clearTimer = null;

  function play(name) {
    clearTimeout(clearTimer);
    el.removeAttribute('data-act');
    void el.offsetWidth; // restart the CSS animation even if the same move is set again
    el.setAttribute('data-act', name);
    busy = true;
    last = name;
    lastAt = Date.now();
    clearTimer = setTimeout(() => { el.removeAttribute('data-act'); busy = false; }, MOVES[name].ms);
  }

  function pickFrom(list) {
    const pool = list.length > 1 ? list.filter((k) => k !== last) : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function poke(kind) {
    const i = info();
    if (!i) return;
    const now = Date.now();
    if (kind === 'tap') {
      taps = taps.filter((t) => now - t < TICKLE_WINDOW_MS).concat(now);
      const canGiggle = allowedMoves(i).length > 3 && !reducedMotion(); // happy or excited only
      if (canGiggle && taps.length >= TICKLE_TAPS) {
        taps = [];
        play('giggle');
        onTap('giggle');
        return;
      }
    }
    if (busy || now - lastAt < COOLDOWN_MS) return;
    const list = allowedMoves(i);
    if (!list.length) return;
    const name = pickFrom(list);
    play(name);
    if (kind === 'tap') onTap(name);
  }

  // Touch and pen: a tap on the pet. Mouse: the pointer moving onto the pet (a click also counts).
  // Only the drawn pet counts, not the empty space around it.
  const onPet = (n) => n instanceof Element && n.closest('.pk') && el.contains(n);
  el.addEventListener('pointerdown', (e) => { if (onPet(e.target)) poke(e.pointerType === 'mouse' ? 'hover' : 'tap'); });
  el.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse' && onPet(e.target) && !onPet(e.relatedTarget)) poke('hover');
  });
  // Keyboard players can focus the pet and press Enter or Space.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke('tap'); }
  });

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const i = info();
      const visible = !document.hidden && el.offsetParent !== null;
      if (i && visible && !busy && Date.now() - lastAt > IDLE_MIN_MS / 2) {
        const list = allowedMoves(i, { idle: true });
        if (list.length) play(pickFrom(list));
      }
      scheduleIdle();
    }, IDLE_MIN_MS + Math.random() * (IDLE_MAX_MS - IDLE_MIN_MS));
  }
  if (idle) scheduleIdle();

  return { play, stop: () => clearTimeout(idleTimer) };
}
