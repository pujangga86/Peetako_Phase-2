// Tangkap Kelip-kelip (Catch the Fireflies) — Peetako's Phase 2 mini-game, rules aligned with the GDD on 20 Oct 2026.
// One tap flicks the tongue. A run ends after 3 misses (a tap that catches nothing) or after 60 seconds, and
// fills the whole screen on phone and desktop (no scrolling). Consecutive catches build a combo (×2 from 5,
// ×3 from 10, ×4 from 20); a miss resets it. Fireflies speed up and drift more over time; golden ones are worth 5.
// Every 5 fireflies caught are worth 1 coin (at most 50 coins a day, checked by the server).
//
//   playKelip({ durationMs, misses, goldValue, combo, petSvg, onEnd(result) }) → shows the game; calls onEnd once
//   with { score, fireflies }, or with null when the player quits early.


export function playKelip({ durationMs = 60_000, misses: maxMisses = 3, goldValue = 5, combo = [[20, 4], [10, 3], [5, 2]], petSvg = '', sound = { play() {} }, onEnd }) {
  const multOf = (streak) => (combo.find(([at]) => streak >= at) || [0, 1])[1];
  const secs = Math.round(durationMs / 1000);
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
      <span class="px kelip-combo" aria-hidden="true"></span>
      <span class="px kelip-lives" aria-label="Misses left">${'●'.repeat(maxMisses)}</span>
      <span class="px kelip-time">${secs}</span>
      <button type="button" class="icon-btn kelip-quit" aria-label="Stop playing">✕</button>
    </div>
    <div class="kelip-intro">
      <h2 class="px">Tangkap Kelip-kelip</h2>
      <p>Tap a firefly to catch it. ${maxMisses} misses and the run ends (or after ${secs} seconds).</p>
      <p>Catch in a row for a combo up to ×${combo[0][1]}. Golden fireflies are worth ${goldValue}. Every 5 fireflies = 1 coin.</p>
      <p class="px kelip-count" aria-live="assertive"></p>
    </div>
    <p class="sr-only kelip-live" aria-live="polite"></p>`;
  document.body.appendChild(root);
  document.body.classList.add('kelip-open');

  const canvas = root.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = root.querySelector('.kelip-score');
  const timeEl = root.querySelector('.kelip-time');
  const comboEl = root.querySelector('.kelip-combo');
  const livesEl = root.querySelector('.kelip-lives');
  const intro = root.querySelector('.kelip-intro');
  const countEl = root.querySelector('.kelip-count');
  const live = root.querySelector('.kelip-live');
  let W = 0, H = 0, dpr = 1;
  let flies = [], pops = [], score = 0, caught = 0, streak = 0, missed = 0, flash = 0;
  let start = 0, last = 0, spawnAt = 0, raf = 0, done = false, running = false;
  const result = () => ({ score, fireflies: caught });

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
  // 0 at the start of a run, 1 at its longest: fireflies speed up, live shorter and drift more.
  const heat = (now) => Math.min(1, (now - start) / durationMs);
  function spawn(now) {
    const h = heat(now);
    const gold = Math.random() < 1 / 12;
    const r = base() * (0.8 + Math.random() * 0.4) * (gold ? 0.85 : 1);
    const speed = 1 + 1.8 * h;
    flies.push({
      x: r + Math.random() * (W - 2 * r), y: H * 0.12 + Math.random() * H * 0.6,
      r, gold, born: now, life: (2200 + Math.random() * 1600) * (1 - 0.35 * h) * (gold ? 0.75 : 1), phase: Math.random() * 7,
      vx: (Math.random() - 0.5) * 0.04 * speed, vy: (Math.random() - 0.5) * 0.03 * speed, wob: 1 + 2.5 * h,
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
      if (left <= 0) return finish(result());
    }
    flies = flies.filter((f) => now - f.born < f.life);
    for (const f of flies) {
      f.x += f.vx * dt + Math.sin((now + f.phase * 300) / 400) * 0.25 * f.wob;
      f.y += f.vy * dt + Math.cos((now + f.phase * 300) / 500) * 0.2 * f.wob;
      if (f.x < f.r || f.x > W - f.r) f.vx = -f.vx; // stay on screen
      if (f.y < H * 0.08 || f.y > H * 0.78) f.vy = -f.vy;
      const age = (now - f.born) / f.life;
      const blink = 0.55 + 0.45 * Math.sin(now / 160 + f.phase);
      const fade = age > 0.75 ? (1 - age) / 0.25 : Math.min(1, age * 6);
      const glow = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 1.6);
      const c = f.gold ? '245,183,0' : '253,224,71';
      glow.addColorStop(0, `rgba(${c},${0.95 * fade * blink})`); glow.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (f.gold ? 2 : 1.6), 0, 7); ctx.fill();
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#1E1B4B'; ctx.beginPath(); ctx.ellipse(f.x - f.r * 0.35, f.y, f.r * 0.32, f.r * 0.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = f.gold ? '#F5B700' : '#FEF9C3'; ctx.beginPath(); ctx.arc(f.x + f.r * 0.15, f.y, f.r * 0.3, 0, 7); ctx.fill();
      if (f.gold) { // a ring as well as the colour, so a golden firefly reads without colour
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.9, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(224,242,254,0.7)';
      ctx.beginPath(); ctx.ellipse(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.28, f.r * 0.14, -0.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    pops = pops.filter((p) => now - p.t < 600);
    for (const p of pops) {
      const k = (now - p.t) / 600;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.miss ? '#FB7185' : '#FDE047';
      ctx.font = `${Math.round(base() * 0.7)}px "Press Start 2P", monospace`; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - k * 30); ctx.globalAlpha = 1;
    }
    if (flash && now - flash < 250) { ctx.fillStyle = `rgba(225,29,72,${0.25 * (1 - (now - flash) / 250)})`; ctx.fillRect(0, 0, W, H); }
    raf = requestAnimationFrame(frame);
  }

  function tap(ev) {
    if (!running) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
    let hit = -1, best = Infinity;
    flies.forEach((f, i) => { const d = Math.hypot(f.x - x, f.y - y); if (d < f.r * 1.5 && d < best) { best = d; hit = i; } });
    const t = performance.now();
    if (hit < 0) { // a miss: the combo resets, and the third ends the run
      missed += 1;
      streak = 0;
      flash = t;
      pops.push({ x, y, t, text: '✕', miss: true });
      livesEl.textContent = '●'.repeat(Math.max(0, maxMisses - missed)) + '○'.repeat(Math.min(maxMisses, missed));
      comboEl.textContent = '';
      sound.play('error');
      live.textContent = `Miss. ${Math.max(0, maxMisses - missed)} left.`;
      if (missed >= maxMisses) { running = false; setTimeout(() => finish(result()), 300); }
      return;
    }
    const [f] = flies.splice(hit, 1);
    caught += 1;
    streak += 1;
    const mult = multOf(streak);
    const pts = (f.gold ? goldValue : 1) * mult;
    score += pts;
    scoreEl.textContent = String(score);
    comboEl.textContent = mult > 1 ? `×${mult}` : '';
    pops.push({ x: f.x, y: f.y, t, text: `+${pts}` });
    sound.play(f.gold ? 'gift' : caught % 5 === 0 ? 'coin' : 'tap');
    if (mult > 1 && multOf(streak - 1) < mult) live.textContent = `Combo ×${mult}!`;
    else if (caught % 10 === 0) live.textContent = `${caught} fireflies, ${score} points`;
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
