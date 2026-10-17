// Pamper and friendly-battle animations (Phase 2C): both Peetako on the same screen, on a neutral arena.
//
//   showArena({ mode: 'battle' | 'pamper', mine, them, result, sound }) → Promise that resolves when closed.
//   mine / them: public pet views ({ name, type, tier, palette, stats, equipped, status }).
//   result (battle): { won, rounds: ['a'|'d', ...] }.
import { drawPet, drawArena } from './art.js';
import { skyAt, localMinute } from './sky.js';
import { moodOf } from './mood.js';

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nameOf = (p) => p.name || 'This Peetako';
const wearOf = (p) => ({ head: p.equipped?.head, neck: p.equipped?.neck, back: p.equipped?.back });
const svgFor = (p, mood) => drawPet({ type: p.type, tier: p.tier, status: p.status === 'dormant' ? 'active' : p.status, pal: p.palette, mood: mood || moodOf(p).face, wear: wearOf(p) });

export function showArena({ mode, mine, them, result, sound = { play() {} } }) {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.className = `arena arena-${mode}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', mode === 'battle' ? 'Friendly battle' : 'Pamper');
    root.innerHTML = `
      <div class="arena-bg" aria-hidden="true">${drawArena(skyAt(localMinute()))}</div>
      <div class="arena-pet left" aria-hidden="true"><div class="arena-sprite">${svgFor(mine)}</div><div class="arena-fx"></div></div>
      <div class="arena-pet right" aria-hidden="true"><div class="arena-sprite">${svgFor(them)}</div><div class="arena-fx"></div></div>
      <div class="arena-names"><span class="px">${esc(nameOf(mine))}</span><span class="px">VS</span><span class="px">${esc(nameOf(them))}</span></div>
      <p class="arena-banner px" aria-live="assertive"></p>
      <button type="button" class="rbtn arena-close" style="--b: var(--gold, #F5B700)">Continue</button>`;
    if (mode === 'pamper') root.querySelector('.arena-names span:nth-child(2)').textContent = '♥';
    document.body.appendChild(root);
    const L = root.querySelector('.arena-pet.left');
    const R = root.querySelector('.arena-pet.right');
    const banner = root.querySelector('.arena-banner');
    const closeBtn = root.querySelector('.arena-close');
    closeBtn.hidden = true;
    let closed = false;
    const close = () => { if (closed) return; closed = true; root.remove(); resolve(); };
    closeBtn.addEventListener('click', close);
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    root.tabIndex = -1;
    root.focus();

    const fast = reduceMotion();
    const step = (el, cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); return wait(fast ? 0 : ms); };
    const fx = (el, html) => { el.querySelector('.arena-fx').innerHTML = html; };
    const spark = '<svg viewBox="0 0 100 100"><path d="M50 8 L60 40 L92 50 L60 60 L50 92 L40 60 L8 50 L40 40 Z" fill="#FDE047" stroke="#1E1B4B" stroke-width="4"/></svg>';
    const hearts = '<svg viewBox="0 0 100 100"><g class="fx fx-rise"><path transform="translate(40 60) scale(1.6)" d="M0 6 C -10 -2 -8 -12 0 -7 C 8 -12 10 -2 0 6 Z" fill="#FB7185" stroke="#1E1B4B" stroke-width="2"/></g><g class="fx fx-rise d2"><path transform="translate(62 46) scale(1.2)" d="M0 6 C -10 -2 -8 -12 0 -7 C 8 -12 10 -2 0 6 Z" fill="#FB7185" stroke="#1E1B4B" stroke-width="2"/></g><g class="fx fx-rise d3"><path transform="translate(50 30)" d="M0 6 C -10 -2 -8 -12 0 -7 C 8 -12 10 -2 0 6 Z" fill="#FB7185" stroke="#1E1B4B" stroke-width="2"/></g></svg>';

    (async () => {
      await wait(fast ? 0 : 500);
      if (mode === 'pamper') {
        await step(L, 'approach', 900);
        sound.play('play');
        fx(R, hearts);
        R.querySelector('.arena-sprite').innerHTML = svgFor(them, 'excited');
        await step(R, 'happy-hop', 900);
        banner.textContent = `+5 FUN for ${nameOf(them)}!`;
      } else {
        banner.textContent = 'Ready… fight!';
        for (const who of result.rounds) {
          const [atk, def] = who === 'a' ? [L, R] : [R, L];
          await step(atk, 'lunge', 380);
          sound.play('tap');
          fx(def, spark);
          await step(def, 'hit', 420);
          fx(def, '');
        }
        const [win, lose, winner, loser] = result.won ? [L, R, mine, them] : [R, L, them, mine];
        win.querySelector('.arena-sprite').innerHTML = svgFor(winner, 'excited');
        lose.querySelector('.arena-sprite').innerHTML = svgFor(loser, 'sad');
        sound.play(result.won ? 'levelUp' : 'error');
        await step(win, 'happy-hop', 300);
        banner.textContent = result.won ? 'You win! 🏆' : `${nameOf(them)} wins this time!`;
      }
      closeBtn.hidden = false;
      closeBtn.focus();
    })();
  });
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
