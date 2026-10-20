// Lidah Pantas (Quick Tongue) — a timing game. Peetako sits at the bottom of the screen; bugs fly across. Tap
// anywhere (or press Space) to flick the tongue straight up: it catches the lowest bug crossing the middle.
// A flick that catches nothing is a miss; 3 misses or 60 seconds end the run. Catches in a row build a combo
// (×2 from 5, ×3 from 15); golden beetles are worth 5. Every 5 bugs = 1 coin (shared daily cap, server-checked).
//
//   playLidah({ setup, petSvg, sound, onEnd }) → onEnd({ score, count }) or onEnd(null) when stopped early.
import { openGame, svgImage } from './minigame.js';

export function playLidah({ setup = {}, petSvg = '', sound = { play() {} }, onEnd }) {
  const runMs = setup.runMs || 60_000;
  const maxMisses = setup.misses || 3;
  const goldValue = setup.goldValue || 5;
  const combo = setup.combo || [[15, 3], [5, 2]];
  const multOf = (streak) => (combo.find(([at]) => streak >= at) || [0, 1])[1];
  const secs = Math.round(runMs / 1000);
  const g = openGame({
    id: 'lidah', title: 'Lidah Pantas', sound,
    hud: `<span class="px kelip-score">0</span><span class="px kelip-combo" aria-hidden="true"></span>
      <span class="px kelip-lives" aria-label="Misses left">${'●'.repeat(maxMisses)}</span><span class="px kelip-time">${secs}</span>`,
    rules: [
      'Bugs fly across the sky. Tap anywhere (or press Space) to flick Peetako’s tongue straight up when a bug is over the dotted line.',
      `${maxMisses} misses and the run ends (or after ${secs} seconds). Golden beetles are worth ${goldValue}.`,
      `Catch in a row for a combo up to ×${combo[0][1]}. Every 5 bugs = 1 coin.`,
    ],
  });
  const { ctx } = g;
  const pet = svgImage(petSvg);
  const scoreEl = g.q('.kelip-score'), comboEl = g.q('.kelip-combo'), livesEl = g.q('.kelip-lives'), timeEl = g.q('.kelip-time');

  let bugs = [], pops = [], score = 0, caught = 0, streak = 0, missed = 0, flash = 0;
  let start = 0, last = 0, spawnAt = 0, raf = 0, running = false;
  let tongue = null; // { t, reachY, bug }
  const TONGUE_MS = 240;

  const petSize = () => Math.min(g.W * 0.3, g.H * 0.22);
  const mouth = () => ({ x: g.W / 2, y: g.H - petSize() * 0.72 });
  const bugR = () => Math.max(14, Math.min(g.W, g.H) * 0.035);
  const heat = (now) => Math.min(1, (now - start) / runMs);

  function spawn(now) {
    const h = heat(now);
    const fromLeft = Math.random() < 0.5;
    const gold = Math.random() < 1 / 10;
    const r = bugR() * (gold ? 0.9 : 1);
    const speed = (0.12 + 0.16 * h + Math.random() * 0.06) * (gold ? 1.35 : 1) * Math.max(0.8, g.W / 700); // px per ms
    const top = g.H * 0.12, bottom = mouth().y - r * 3;
    bugs.push({ x: fromLeft ? -r : g.W + r, y: top + Math.random() * Math.max(10, bottom - top), r, gold,
      vx: fromLeft ? speed : -speed, phase: Math.random() * 7 });
  }

  function background(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, g.H);
    sky.addColorStop(0, '#38BDF8'); sky.addColorStop(0.7, '#BAE6FD'); sky.addColorStop(1, '#BBF7D0');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, g.W, g.H);
    // distant hills and a leafy floor
    ctx.fillStyle = '#4ADE80';
    ctx.beginPath(); ctx.moveTo(0, g.H * 0.86);
    for (let i = 0; i <= 8; i++) ctx.quadraticCurveTo((i - 0.5) / 8 * g.W, g.H * (0.8 + 0.03 * Math.sin(i * 1.7)), i / 8 * g.W, g.H * 0.86);
    ctx.lineTo(g.W, g.H); ctx.lineTo(0, g.H); ctx.fill();
    ctx.fillStyle = '#16A34A'; ctx.fillRect(0, g.H * 0.93, g.W, g.H * 0.07);
    // the catch line
    const m = mouth();
    ctx.strokeStyle = 'rgba(27,26,46,0.28)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(m.x, 0); ctx.lineTo(m.x, m.y - 10); ctx.stroke(); ctx.setLineDash([]);
    void t;
  }

  function drawBug(b, now) {
    const wing = Math.sin(now / 40 + b.phase) * 0.5 + 0.5;
    ctx.save(); ctx.translate(b.x, b.y + Math.sin(now / 200 + b.phase) * 3);
    if (b.vx < 0) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.ellipse(-b.r * 0.1, -b.r * 0.55, b.r * 0.55, b.r * (0.2 + 0.25 * wing), -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = b.gold ? '#F5B700' : '#7C3AED';
    ctx.strokeStyle = '#1B1A2E'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.8, b.r * 0.55, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1B1A2E'; ctx.beginPath(); ctx.arc(b.r * 0.75, 0, b.r * 0.3, 0, 7); ctx.fill();
    if (b.gold) { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, b.r * 1.05, 0, 7); ctx.stroke(); } // ring: readable without colour
    ctx.restore();
  }

  function frame(now) {
    if (g.done) return;
    const dt = Math.min(50, now - (last || now)); last = now;
    background(now);
    if (running) {
      const left = Math.max(0, runMs - (now - start));
      timeEl.textContent = String(Math.ceil(left / 1000));
      const gap = 1100 - 450 * heat(now);
      if (now >= spawnAt && bugs.length < 4) { spawn(now); spawnAt = now + gap * (0.7 + Math.random() * 0.6); }
      if (left <= 0 && !tongue) { finish({ score, count: caught }); return; }
    }
    for (const b of bugs) b.x += b.vx * dt;
    bugs = bugs.filter((b) => b.x > -b.r * 2 && b.x < g.W + b.r * 2);
    for (const b of bugs) drawBug(b, now);

    // Peetako and the tongue
    const m = mouth();
    const ps = petSize();
    if (tongue) {
      const k = (now - tongue.t) / TONGUE_MS;
      const reach = k < 0.5 ? k * 2 : (1 - k) * 2;
      const tipY = m.y - (m.y - tongue.reachY) * Math.max(0, reach);
      ctx.strokeStyle = '#F472B6'; ctx.lineWidth = Math.max(6, ps * 0.06); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x, tipY); ctx.stroke();
      ctx.fillStyle = '#EC4899'; ctx.beginPath(); ctx.arc(m.x, tipY, ctx.lineWidth * 0.9, 0, 7); ctx.fill();
      if (tongue.bug && k < 1) { tongue.bug.x = m.x; tongue.bug.y = tipY; drawBug(tongue.bug, now); }
      if (k >= 1) tongue = null;
    }
    if (pet.complete && pet.naturalWidth) ctx.drawImage(pet, m.x - ps / 2, g.H - ps * 1.02, ps, ps);

    pops = pops.filter((p) => now - p.t < 600);
    for (const p of pops) {
      const k = (now - p.t) / 600;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.miss ? '#E11D48' : '#1B1A2E';
      ctx.font = `${Math.round(bugR() * 0.9)}px "Press Start 2P", monospace`; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - k * 30); ctx.globalAlpha = 1;
    }
    if (flash && now - flash < 250) { ctx.fillStyle = `rgba(225,29,72,${0.2 * (1 - (now - flash) / 250)})`; ctx.fillRect(0, 0, g.W, g.H); }
    raf = requestAnimationFrame(frame);
  }

  function flick() {
    if (!running || tongue) return;
    const now = performance.now();
    const m = mouth();
    // The tongue is a column a little wider than a bug; the lowest bug in it is caught.
    let hit = -1, lowest = -Infinity;
    bugs.forEach((b, i) => { if (Math.abs(b.x - m.x) < b.r * 1.35 && b.y < m.y && b.y > lowest) { lowest = b.y; hit = i; } });
    if (hit < 0) {
      tongue = { t: now, reachY: g.H * 0.1, bug: null };
      missed += 1; streak = 0; flash = now;
      pops.push({ x: m.x, y: m.y - 40, t: now, text: '✕', miss: true });
      livesEl.textContent = '●'.repeat(Math.max(0, maxMisses - missed)) + '○'.repeat(Math.min(maxMisses, missed));
      comboEl.textContent = '';
      sound.play('error');
      g.live(`Miss. ${Math.max(0, maxMisses - missed)} left.`);
      if (missed >= maxMisses) { running = false; g.after(TONGUE_MS + 200, () => finish({ score, count: caught })); }
      return;
    }
    const [b] = bugs.splice(hit, 1);
    tongue = { t: now, reachY: b.y, bug: b };
    caught += 1; streak += 1;
    const mult = multOf(streak);
    const pts = (b.gold ? goldValue : 1) * mult;
    score += pts;
    scoreEl.textContent = String(score);
    comboEl.textContent = mult > 1 ? `×${mult}` : '';
    pops.push({ x: m.x + 30, y: b.y, t: now, text: `+${pts}` });
    sound.play(b.gold ? 'gift' : caught % 5 === 0 ? 'coin' : 'tap');
    if (mult > 1 && multOf(streak - 1) < mult) g.live(`Combo ×${mult}!`);
  }
  g.root.addEventListener('pointerdown', (e) => { if (e.target.closest('.kelip-quit')) return; e.preventDefault(); flick(); });
  g.root.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); flick(); } });

  function finish(result) {
    if (g.done) return;
    cancelAnimationFrame(raf);
    g.close();
    onEnd(result);
  }
  g.onQuit(() => finish(null));
  raf = requestAnimationFrame(frame);
  g.countdown(() => { running = true; start = performance.now(); spawnAt = start; });
  return { quit: () => finish(null) };
}
