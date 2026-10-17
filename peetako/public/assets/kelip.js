// Tangkap Kelip-kelip (Catch the Fireflies) — Peetako's Phase 2C mini-game.
// One tap catches a firefly. A run lasts 45 seconds and fills the whole screen on phone and desktop
// (no scrolling). Every 5 fireflies are worth 1 coin (at most 50 coins a day, checked by the server).
//
//   playKelip({ durationMs, petSvg, onEnd(score) }) → shows the game; calls onEnd once with the score,
//   or with null when the player quits early.


export function playKelip({ durationMs = 45_000, petSvg = '', sound = { play() {} }, onEnd }) {
  const root = document.createElement('div');
  root.className = 'kelip';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Tangkap Kelip-kelip');
  root.innerHTML = `
    <canvas class="kelip-canvas" aria-hidden="true"></canvas>
    <div class="kelip-pet" aria-hidden="true">${petSvg}</div>
    <div class="kelip-hud">
      <span class="px kelip-score" aria-live="off">0</span>
      <span class="px kelip-time">45</span>
      <button type="button" class="icon-btn kelip-quit" aria-label="Stop playing">✕</button>
    </div>
    <div class="kelip-intro">
      <h2 class="px">Tangkap Kelip-kelip</h2>
      <p>Tap the fireflies before they fade. 45 seconds. Every 5 fireflies = 1 coin.</p>
      <p class="px kelip-count" aria-live="assertive"></p>
    </div>
    <p class="sr-only kelip-live" aria-live="polite"></p>`;
  document.body.appendChild(root);
  document.body.classList.add('kelip-open');

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = root.querySelector('.kelip-score');
  const timeEl = root.querySelector('.kelip-time');
  const intro = root.querySelector('.kelip-intro');
  const countEl = root.querySelector('.kelip-count');
  const live = root.querySelector('.kelip-live');
  let W = 0, H = 0, dpr = 1;
  let flies = [], pops = [], score = 0, start = 0, last = 0, spawnAt = 0, raf = 0, done = false, running = false;

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = root.clientWidth; H = root.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener('resize', size);

  // Background: night sky over the river, trees as silhouettes (drawn every frame, it is cheap).
  const stars = Array.from({ length: 50 }, () => [Math.random(), Math.random() * 0.55, Math.random() * 1.4 + 0.4]);
  function background(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0B1030'); g.addColorStop(0.6, '#1E1B4B'); g.addColorStop(1, '#0F2A2A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FDE68A';
    for (const [x, y, r] of stars) { ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / 900 + x * 20); ctx.beginPath(); ctx.arc(x * W, y * H, r, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0A1A1A';
    ctx.beginPath(); ctx.moveTo(0, H * 0.72);
    for (let i = 0; i <= 12; i++) ctx.quadraticCurveTo((i - 0.5) / 12 * W, H * (0.6 + 0.06 * Math.sin(i * 2.3)), i / 12 * W, H * 0.72);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = 'rgba(56,189,248,0.10)'; ctx.fillRect(0, H * 0.8, W, H * 0.2);
  }

  const base = () => Math.max(26, Math.min(W, H) * 0.06);
  function spawn(now) {
    const r = base() * (0.8 + Math.random() * 0.4);
    flies.push({
      x: r + Math.random() * (W - 2 * r), y: H * 0.12 + Math.random() * H * 0.6,
      r, born: now, life: 2200 + Math.random() * 1600, phase: Math.random() * 7,
      vx: (Math.random() - 0.5) * 0.04, vy: (Math.random() - 0.5) * 0.03,
    });
  }

  function frame(now) {
    if (done) return;
    const dt = Math.min(50, now - (last || now)); last = now;
    background(now);
    if (running) {
      const left = Math.max(0, durationMs - (now - start));
      timeEl.textContent = String(Math.ceil(left / 1000));
      // Busier as time goes on, but never more than about 3 fireflies a second.
      const gap = 700 - 300 * Math.min(1, (now - start) / durationMs);
      if (now >= spawnAt && flies.length < 7) { spawn(now); spawnAt = now + gap * (0.7 + Math.random() * 0.6); }
      if (left <= 0) return finish(score);
    }
    flies = flies.filter((f) => now - f.born < f.life);
    for (const f of flies) {
      { f.x += f.vx * dt + Math.sin((now + f.phase * 300) / 400) * 0.25; f.y += f.vy * dt + Math.cos((now + f.phase * 300) / 500) * 0.2; }
      const age = (now - f.born) / f.life;
      const blink = 0.55 + 0.45 * Math.sin(now / 160 + f.phase);
      const fade = age > 0.75 ? (1 - age) / 0.25 : Math.min(1, age * 6);
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.6);
      glow.addColorStop(0, `rgba(253,224,71,${0.9 * fade * blink})`); glow.addColorStop(1, 'rgba(253,224,71,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 1.6, 0, 7); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#1E1B4B'; ctx.beginPath(); ctx.ellipse(f.x - f.r * 0.35, f.y, f.r * 0.32, f.r * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#FEF9C3'; ctx.beginPath(); ctx.arc(f.x + f.r * 0.15, f.y, f.r * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(224,242,254,0.7)';
      ctx.beginPath(); ctx.ellipse(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.28, f.r * 0.14, -0.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    pops = pops.filter((p) => now - p.t < 600);
    for (const p of pops) {
      const k = (now - p.t) / 600;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#FDE047';
      ctx.font = `${Math.round(base() * 0.7)}px "Press Start 2P", monospace`; ctx.textAlign = 'center';
      ctx.fillText('+1', p.x, p.y - k * 30); ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(frame);
  }

  function tap(ev) {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let hit = -1, best = Infinity;
    flies.forEach((f, i) => { const d = Math.hypot(f.x - x, f.y - y); if (d < f.r * 1.5 && d < best) { best = d; hit = i; } });
    if (hit < 0) return;
    const [f] = flies.splice(hit, 1);
    score += 1;
    scoreEl.textContent = String(score);
    pops.push({ x: f.x, y: f.y, t: performance.now() });
    sound.play(score % 5 === 0 ? 'coin' : 'tap');
    if (score % 10 === 0) live.textContent = `${score} fireflies`;
  }
  canvas.addEventListener('pointerdown', tap);

  function close() {
    done = true;
    cancelAnimationFrame(raf);
    removeEventListener('resize', size);
    root.remove();
    document.body.classList.remove('kelip-open');
  }
  function finish(result) {
    if (done) return;
    close();
    onEnd(result);
  }
  root.querySelector('.kelip-quit').addEventListener('click', () => finish(null));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(null); });

  // 3-2-1, then go.
  raf = requestAnimationFrame(frame);
  let n = 3;
  countEl.textContent = String(n);
  const tick = setInterval(() => {
    if (done) return clearInterval(tick);
    n -= 1;
    if (n > 0) { countEl.textContent = String(n); sound.play('tap'); return; }
    clearInterval(tick);
    intro.hidden = true;
    running = true;
    start = performance.now();
    spawnAt = start;
    sound.play('play');
  }, 800);
  root.querySelector('.kelip-quit').focus();
  return { quit: () => finish(null) };
}
