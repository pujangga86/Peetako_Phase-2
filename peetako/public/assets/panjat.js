// Panjat Pokok (Climb the Tree) — Peetako climbs a tall tapang tree. Tap the left or right half of the screen
// (or press ← / →) to hop to that side of the trunk and climb a metre. A branch on your side above you ends the
// climb, and so does the timer bar: it drains faster the higher you go, and every metre refills a little.
// Score = metres climbed. Every 20 m = 1 coin (shared daily cap, server-checked).
//
//   playPanjat({ setup, petSvg, sound, onEnd }) → onEnd({ count }) or onEnd(null) when stopped early.
import { openGame, svgImage } from './minigame.js';

const MIN_STEP_MS = 140; // at most about 7 metres a second (the server allows 8)

export function playPanjat({ setup = {}, petSvg = '', sound = { play() {} }, onEnd }) {
  const perCoin = setup.perCoin || 20;
  const g = openGame({
    id: 'panjat', title: 'Panjat Pokok', sound,
    hud: `<span class="px kelip-score">0m</span><span class="mg-timer" aria-hidden="true"><i></i></span>`,
    rules: [
      'Tap the left or right side of the screen (or press ← / →) to hop to that side of the trunk and climb.',
      'Don’t climb into a branch on your side! Keep climbing before the timer bar runs out.',
      `Every ${perCoin} metres = 1 coin.`,
    ],
  });
  const { ctx } = g;
  const pet = svgImage(petSvg);
  const scoreEl = g.q('.kelip-score');
  const barEl = g.q('.mg-timer i');

  // branches[k] is the branch at height k metres: -1 left, 1 right, 0 none. Never one where you start.
  // A branch on every other level at most, so the next danger is always easy to read.
  const branches = [0, 0, 0];
  function grow() {
    const prev = branches[branches.length - 1];
    branches.push(prev !== 0 || Math.random() < 0.3 ? 0 : (Math.random() < 0.5 ? -1 : 1));
  }
  for (let i = 0; i < 30; i++) grow();

  let height = 0, side = -1, timer = 1, running = false, fallen = false, lastStep = 0, raf = 0, last = 0, hop = 0, fallAt = 0;
  const level = () => Math.max(46, Math.min(g.H / 9, 90)); // pixels per metre
  const trunkW = () => Math.max(56, Math.min(g.W * 0.2, 120));
  const baseY = () => g.H * 0.78;

  function step(dir) {
    if (!running || fallen) return;
    const now = performance.now();
    if (now - lastStep < MIN_STEP_MS) return;
    lastStep = now;
    side = dir;
    const next = height + 1;
    while (branches.length < next + 30) grow();
    if (branches[next] === side) { // bonk
      fallen = true; running = false; fallAt = now;
      sound.play('error');
      g.live(`Bonk! A branch. You climbed ${height} metres.`);
      g.after(900, () => finish({ count: height }));
      return;
    }
    height = next; hop = now;
    timer = Math.min(1, timer + 0.09);
    scoreEl.textContent = `${height}m`;
    sound.play(height % perCoin === 0 ? 'coin' : 'tap');
    if (height % 25 === 0) g.live(`${height} metres!`);
  }

  function draw(now) {
    const W = g.W, H = g.H, L = level(), tw = trunkW(), cx = W / 2, by = baseY();
    const climb = Math.min(1, (now - hop) / 120); // ease the scroll between metres
    const offset = (height - 1 + climb) * L;
    // sky gets deeper as you climb
    const t = Math.min(1, height / 300);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, `hsl(${200 + 30 * t} 80% ${62 - 30 * t}%)`); sky.addColorStop(1, `hsl(${150 - 40 * t} 60% ${70 - 25 * t}%)`);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    // forest floor, only near the bottom
    const floorY = by + L * 0.6 + offset;
    if (floorY < H) { ctx.fillStyle = '#15803D'; ctx.fillRect(0, floorY, W, H - floorY); }
    // trunk with bark lines that scroll
    ctx.fillStyle = '#92400E'; ctx.fillRect(cx - tw / 2, 0, tw, Math.min(H, floorY));
    ctx.strokeStyle = 'rgba(69,26,3,0.45)'; ctx.lineWidth = 3;
    for (let y = (offset % 40) - 40; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(cx - tw * 0.25, y); ctx.lineTo(cx - tw * 0.18, y + 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + tw * 0.2, y + 14); ctx.lineTo(cx + tw * 0.28, y + 34); ctx.stroke();
    }
    ctx.strokeStyle = '#1B1A2E'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - tw / 2, 0); ctx.lineTo(cx - tw / 2, Math.min(H, floorY)); ctx.moveTo(cx + tw / 2, 0); ctx.lineTo(cx + tw / 2, Math.min(H, floorY)); ctx.stroke();
    // branches from just below Peetako up to the top of the screen
    const first = Math.max(1, height - 2), lastK = height + Math.ceil(by / L) + 2;
    while (branches.length <= lastK) grow();
    for (let k = first; k <= lastK; k++) {
      const s = branches[k];
      if (!s) continue;
      const y = by - (k * L - offset) - L * 0.5;
      const x0 = cx + s * tw / 2, len = Math.min(W * 0.36, 220);
      ctx.fillStyle = '#78350F'; ctx.strokeStyle = '#1B1A2E'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x0, y - 9); ctx.lineTo(x0 + s * len, y - 4); ctx.lineTo(x0 + s * len, y + 4); ctx.lineTo(x0, y + 9); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#22C55E';
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse(x0 + s * len * (0.45 + j * 0.25), y - 12, 18, 10, s * 0.3, 0, 7); ctx.fill(); ctx.stroke(); }
    }
    // Peetako hugging the trunk on its side
    const ps = Math.min(L * 1.5, tw * 1.3);
    const px = cx + side * (tw / 2 + ps * 0.32), py = by - ps * 0.55 - (fallen ? -Math.min(H, (now - fallAt) * 0.6) : 0);
    if (pet.complete && pet.naturalWidth) {
      ctx.save(); ctx.translate(px, py);
      if (side > 0) ctx.scale(-1, 1);
      ctx.rotate(fallen ? 0.9 : 0.12);
      ctx.drawImage(pet, -ps / 2, -ps / 2, ps, ps);
      ctx.restore();
    }
    // tap hints
    if (height < 3 && running) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '14px "Press Start 2P", monospace'; ctx.textAlign = 'center';
      ctx.fillText('◀ tap', W * 0.18, H * 0.9); ctx.fillText('tap ▶', W * 0.82, H * 0.9);
    }
  }

  function frame(now) {
    if (g.done) return;
    const dt = Math.min(50, now - (last || now)); last = now;
    if (running) {
      // drains in about 6 s at the bottom, about 2.5 s at 300 m
      const drain = (1 / 6000) * (1 + Math.min(1.4, height / 220));
      timer -= drain * dt;
      if (timer <= 0) {
        timer = 0; running = false; fallen = true; fallAt = now;
        sound.play('error');
        g.live(`Out of time! You climbed ${height} metres.`);
        g.after(900, () => finish({ count: height }));
      }
    }
    barEl.style.width = `${Math.round(timer * 100)}%`;
    barEl.classList.toggle('low', timer < 0.3);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  g.root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.kelip-quit')) return;
    e.preventDefault();
    const r = g.root.getBoundingClientRect();
    step(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });
  g.root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  });

  function finish(result) {
    if (g.done) return;
    cancelAnimationFrame(raf);
    g.close();
    onEnd(result);
  }
  g.onQuit(() => finish(null));
  raf = requestAnimationFrame(frame);
  g.countdown(() => { running = true; last = performance.now(); });
  return { quit: () => finish(null) };
}
