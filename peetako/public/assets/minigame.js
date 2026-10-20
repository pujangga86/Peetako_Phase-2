// Shared full-screen frame for the mini-games added on 20 Oct 2026 (Ikut Rentak, Lidah Pantas, Padan Motif,
// Panjat Pokok). Same look as Tangkap Kelip-kelip: the whole window is the game, a HUD across the top, an intro
// card with a 3-2-1 count, an ✕ to stop. Each game draws on the canvas, or puts its own buttons in the stage.
//
//   const g = openGame({ id, title, rules: ['…'], hud: '<span class="px">…</span>', sound });
//   g.q(selector) · g.ctx / g.W / g.H (canvas, kept sized to the window) · g.onResize(fn) · g.countdown(fn)
//   g.onQuit(fn) · g.live(text) for screen readers · g.close() · g.done

export function openGame({ id, title, rules = [], hud = '', sound = { play() {} }, canvas = true }) {
  const root = document.createElement('div');
  root.className = `kelip mg mg-${id}`;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', title);
  root.innerHTML = `
    ${canvas ? '<canvas class="kelip-canvas" aria-hidden="true"></canvas>' : ''}
    <div class="mg-stage"></div>
    <div class="kelip-hud">${hud}<button type="button" class="icon-btn kelip-quit" aria-label="Stop playing">✕</button></div>
    <div class="kelip-intro">
      <h2 class="px">${title}</h2>
      ${rules.map((r) => `<p>${r}</p>`).join('')}
      <p class="px kelip-count" aria-live="assertive"></p>
    </div>
    <p class="sr-only kelip-live" aria-live="polite"></p>`;
  document.body.appendChild(root);
  document.body.classList.add('kelip-open');

  const q = (s) => root.querySelector(s);
  const cv = q('canvas');
  const g = {
    root, q, done: false, W: 0, H: 0, dpr: 1, canvas: cv, ctx: cv ? cv.getContext('2d') : null, stage: q('.mg-stage'),
    live: (t) => { q('.kelip-live').textContent = t; },
  };
  const resizers = [];
  function size() {
    g.dpr = Math.min(2, window.devicePixelRatio || 1);
    g.W = root.clientWidth; g.H = root.clientHeight;
    if (cv) {
      cv.width = Math.round(g.W * g.dpr); cv.height = Math.round(g.H * g.dpr);
      cv.style.width = g.W + 'px'; cv.style.height = g.H + 'px';
      g.ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    }
    for (const f of resizers) f();
  }
  size();
  addEventListener('resize', size);
  g.onResize = (f) => { resizers.push(f); };

  let quit = () => g.close();
  g.onQuit = (f) => { quit = f; };
  q('.kelip-quit').addEventListener('click', () => quit());
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') quit(); });

  const timers = new Set();
  g.after = (ms, f) => { const t = setTimeout(() => { timers.delete(t); if (!g.done) f(); }, ms); timers.add(t); return t; };

  g.close = () => {
    if (g.done) return;
    g.done = true;
    for (const t of timers) clearTimeout(t);
    removeEventListener('resize', size);
    root.remove();
    document.body.classList.remove('kelip-open');
  };

  // 3-2-1, then go.
  g.countdown = (go) => {
    const intro = q('.kelip-intro');
    const countEl = q('.kelip-count');
    let n = 3;
    countEl.textContent = String(n);
    const tick = setInterval(() => {
      if (g.done) return clearInterval(tick);
      n -= 1;
      if (n > 0) { countEl.textContent = String(n); sound.play('tap'); return; }
      clearInterval(tick);
      intro.hidden = true;
      sound.play('play');
      go();
    }, 800);
  };
  q('.kelip-quit').focus();
  return g;
}

// A Peetako SVG as an image that a canvas can draw (for Lidah Pantas and Panjat Pokok).
export function svgImage(svg) {
  const img = new Image();
  if (svg) img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img;
}
