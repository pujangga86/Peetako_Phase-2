// Public pet page /p/<Call Code> (Phase 2C share links). Anyone can look; a visitor whose own Peetako
// is signed in on this device can Pamper, battle, send a gift or report a name from here.
import { drawPet, drawScene } from './art.js';
import { applyPalette } from './theme.js';
import { skyAt, localMinute } from './sky.js';
import { moodOf, MOOD_LABEL } from './mood.js';
import { showArena } from './arena.js';
import { itemName, PRICES, shownName, wearOf } from './social.js';

const $ = (s) => document.querySelector(s);
const root = $('#public');
const code = root.dataset.code;
const Sound = window.PeetakoSound || { play() {} };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}
async function api(path, body) {
  const res = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({ message: 'Unexpected server response.' }));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed.'), { status: res.status, code: data.error });
  return data;
}

const STATUS = { active: 'Active', dormant: 'Dormant', dead: 'Fallen', ascended: 'Ascended' };
let visit = null;

async function load() {
  if (!code) { root.innerHTML = '<div class="frame"><h1 class="px">Not found</h1><p>No Peetako has that Call Code.</p><a class="rbtn" href="/">Hatch your own</a></div>'; return; }
  let pub;
  try { pub = await api(`/api/public?code=${encodeURIComponent(code)}`); } catch (e) {
    root.innerHTML = `<div class="frame"><p class="error">${esc(e.message)}</p><a class="rbtn" href="/">Go to Peetako</a></div>`; return;
  }
  try { visit = await api(`/api/visit?code=${encodeURIComponent(code)}`); } catch { visit = null; } // no pet signed in here
  render(pub.pet, pub.best);
}

function render(p, best) {
  applyPalette(root, p.palette);
  const m = moodOf(p);
  const sky = skyAt(localMinute());
  const can = visit?.can || {};
  const self = visit?.self;
  const giftable = visit ? Object.keys(PRICES).filter((id) => !visit.owns.includes(id)) : [];
  root.innerHTML = `
    <div class="frame pub">
      <div class="pub-screen">
        <div class="scene-layer">${drawScene(p.tier, sky, p.palette, { backdrop: p.equipped?.backdrop, label: p.backdrop })}</div>
        <div class="pet-layer">${drawPet({ type: p.type, tier: p.tier, status: p.status, pal: p.palette, mood: m.face, wear: wearOf(p) })}</div>
        <div class="scan" aria-hidden="true"></div>
        <div class="pv-badges"><span class="chip ${p.status}">${STATUS[p.status] || ''}</span>${p.status === 'dead' ? '' : `<span class="chip mood">${MOOD_LABEL[m.face] || ''}</span>`}</div>
      </div>
      <div>
        <h1 class="pub-name">${esc(shownName(p))}</h1>
        ${p.title ? `<p class="pub-title">“${esc(p.title)}”</p>` : ''}
        <p class="px" style="font-size:9px">${esc(p.callCode)} · T${p.tier} ${esc(p.tierName)}</p>
      </div>
      <div class="pub-facts">
        <div class="fact"><b>Age</b><span>${Math.floor(p.ageHours / 24)} days</span></div>
        <div class="fact"><b>Battles</b><span>${p.battles.wins}W ${p.battles.losses}L</span></div>
        <div class="fact"><b>Fireflies</b><span>${best || 0}</span></div>
      </div>
      ${visit && !self ? `
        <div class="btn-row">
          <button class="rbtn small" style="--b:var(--b4)" data-act="pamper" ${can.pamper ? '' : 'disabled'}>Pamper ♥</button>
          <button class="rbtn small" style="--b:var(--b1)" data-act="battle" ${can.battle ? '' : 'disabled'}>Battle ⚔</button>
          <button class="rbtn small light" data-act="giftmenu" ${can.gift ? '' : 'disabled'}>Gift 🎁</button>
        </div>
        <div id="gift-pick" class="gift-pick" hidden>${giftable.length ? `<div class="gift-grid">${giftable.map((id) => `<button type="button" class="gift-opt" data-gift="${id}"><span>${esc(itemName(id, p.type))}</span><b>${PRICES[id]}</b></button>`).join('')}</div>` : '<p>They already have every item!</p>'}</div>
        <p class="visit-links">
          ${p.canReport.name ? '<button type="button" class="linkbtn dark" data-report="name">Report name</button>' : ''}
          ${p.canReport.title ? '<button type="button" class="linkbtn dark" data-report="title">Report title</button>' : ''}
          <a href="/">Open my Peetako</a></p>`
      : self ? '<p>This is your Peetako. Share this page so friends can visit!</p><a class="rbtn" href="/">Open my Peetako</a>'
      : `<p>Want to Pamper ${esc(shownName(p))}, send a gift or battle? Hatch your own Peetako — free, no account.</p>
         <div class="btn-row"><a class="rbtn" style="--b:var(--b1)" href="/">Hatch a Peetako</a><a class="rbtn light" href="/">I have a Peetako</a></div>`}
    </div>`;
}

root.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b || !visit) return;
  if (b.dataset.act === 'giftmenu') { $('#gift-pick').hidden = !$('#gift-pick').hidden; return; }
  if (b.dataset.report) {
    if (!confirm(`Report this ${b.dataset.report} as unkind or unsafe? It will be hidden until we review it.`)) return;
    try { const r = await api('/api/report', { target: code, field: b.dataset.report }); toast(r.message, 4000); load(); } catch (err) { toast(err.message); }
    return;
  }
  b.disabled = true;
  try {
    if (b.dataset.gift) {
      const d = await api('/api/gift', { to: code, item: b.dataset.gift });
      Sound.play('gift'); toast(`Gift sent: ${itemName(d.item, d.to.type)}!`, 4000);
    } else if (b.dataset.act === 'pamper') {
      const d = await api('/api/pamper', { to: code });
      await showArena({ mode: 'pamper', mine: d.mine, them: d.to, sound: Sound });
    } else if (b.dataset.act === 'battle') {
      const d = await api('/api/battle', { to: code });
      await showArena({ mode: 'battle', mine: d.mine, them: d.them, result: d, sound: Sound });
    }
  } catch (err) { Sound.play('error'); toast(err.message); }
  load();
});

load();
