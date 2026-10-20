// Country names, flags and the country picker (17 Oct 2026).
//
// The list is ISO 3166-1 alpha-2 only; the server sends it in /api/config and is the single source of truth.
// Names come from the browser (Intl.DisplayNames, English). Flags are SVG files served from /assets/flags
// (flag-icons, MIT licence, see /assets/flags/LICENSE); if a flag file cannot load, the emoji flag is shown
// instead. Windows does not draw emoji flags, which is why the SVGs are the main way.
// "ZZ" means the player chose "Prefer not to say": no flag, shown as a globe.

export const UNDISCLOSED = 'ZZ';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let names = null;
try { names = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* very old browser: codes are shown */ }

export const isRealCountry = (code) => /^[A-Z]{2}$/.test(code || '') && code !== UNDISCLOSED;
export function countryName(code) {
  if (!isRealCountry(code)) return 'Not shared';
  try { return names?.of(code) || code; } catch { return code; }
}
export const flagEmoji = (code) => (isRealCountry(code)
  ? String.fromCodePoint(...[...code].map((c) => 0x1F1E6 + c.charCodeAt(0) - 65))
  : '🌐');

// A small inline flag. Decorative: the country name is always written next to it.
export function flagHtml(code) {
  if (!isRealCountry(code)) return '<span class="flag globe" aria-hidden="true">🌐</span>';
  return `<img class="flag" src="/assets/flags/${code.toLowerCase()}.svg" alt="" width="24" height="18" data-cc="${code}">`;
}
// "🇲🇾 Malaysia" as HTML: flag and name together (name is escaped).
export const countryHtml = (code) => `${flagHtml(code)} <span class="cname">${esc(countryName(code))}</span>`;

// A flag file that fails to load (offline, blocked) falls back to the emoji flag.
if (typeof document !== 'undefined') {
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement) || !t.classList.contains('flag')) return;
    const span = document.createElement('span');
    span.className = 'flag emoji';
    span.textContent = flagEmoji(t.dataset.cc);
    t.replaceWith(span);
  }, true);
}

// Country codes sorted by their English name.
export const sortedCountries = (codes) => [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b), 'en'));

// ---------- picker ----------
// A search box plus a list. Nothing is chosen until the player picks: the network's guess is only offered
// as a button ("Use Malaysia"), because the choice is locked afterwards. Returns { value(), set(code) }.
export function mountCountryPicker(root, { codes, suggested = null, withUndisclosed = true, label = 'Country' }) {
  const all = sortedCountries(codes);
  const id = `cp${Math.random().toString(36).slice(2, 7)}`;
  root.classList.add('cp');
  root.innerHTML = `
    <input id="${id}-q" type="search" class="cp-search" placeholder="Type to search countries…" autocomplete="off" spellcheck="false" aria-label="Search countries">
    <select id="${id}-s" class="cp-select" aria-label="${esc(label)}"></select>
    <div class="cp-suggest"></div>
    <p class="cp-preview" aria-live="polite"></p>`;
  const q = root.querySelector('.cp-search');
  const sel = root.querySelector('.cp-select');
  const prev = root.querySelector('.cp-preview');

  const fill = (filter) => {
    const f = filter.trim().toLowerCase();
    const list = f ? all.filter((c) => countryName(c).toLowerCase().includes(f) || c.toLowerCase() === f) : all;
    const keep = sel.value;
    sel.innerHTML = `<option value="">Choose your country…</option>${withUndisclosed ? `<option value="${UNDISCLOSED}">🌐 Prefer not to say</option>` : ''}`
      + list.map((c) => `<option value="${c}">${esc(countryName(c))}</option>`).join('');
    if (keep && (keep === UNDISCLOSED || list.includes(keep))) sel.value = keep;
    if (f && list.length === 1) sel.value = list[0]; // one match: pick it
    showPreview();
  };
  const showPreview = () => {
    const v = sel.value;
    prev.innerHTML = !v ? '' : v === UNDISCLOSED
      ? '🌐 Not shared: you appear on the global leaderboard only.'
      : `${flagHtml(v)} <b>${esc(countryName(v))}</b>`;
  };
  q.addEventListener('input', () => fill(q.value));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sel.focus(); } });
  sel.addEventListener('change', showPreview);

  if (suggested && all.includes(suggested)) {
    const box = root.querySelector('.cp-suggest');
    box.innerHTML = `<button type="button" class="chip-btn">${flagHtml(suggested)} Use ${esc(countryName(suggested))}</button><small class="hint"> guessed from your network: check it</small>`;
    box.querySelector('button').addEventListener('click', () => { q.value = ''; fill(''); sel.value = suggested; showPreview(); });
  }
  fill('');
  return {
    value: () => sel.value || '',
    set: (c) => { q.value = ''; fill(''); sel.value = c; showPreview(); },
  };
}
