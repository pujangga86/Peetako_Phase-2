// Peetako game client (Phase 2B). Talks to the Worker API under /api/*.
// One set of pet-screen parts, laid out as Classic (retro frame, default) or Immersive (full screen, CRT)
// by CSS; the choice is saved on this device only (Peetako has no login).
import { drawPet, drawMoodSymbols, drawScene } from './art.js';
import { PALETTES, PALETTE_IDS, palette } from './palettes.js';
import { moodOf, MOOD_LABEL, EXCITED_AFTER_CARE_MS, NEED_BELOW } from './mood.js';
import { skyAt, localMinute } from './sky.js';

const $ = (sel) => document.querySelector(sel);
const screens = ['welcome', 'hatch', 'reveal', 'login', 'pet'];
const NAMES = ['Pitak', 'Tako', 'Bujang', 'Dayang', 'Awang', 'Sago', 'Rajang', 'Bako', 'Mulu', 'Danum', 'Lundu', 'Ranau',
  'Kapit', 'Kudat', 'Sape', 'Pandan', 'Durian', 'Langsat', 'Midin', 'Tuhau', 'Kelkatu', 'Chikchak', 'Bintang', 'Gelam'];
// v2 key: Classic became the default, so devices that saved an earlier choice get the new default once.
const VIEW_KEY = 'peetako_view_v2';
const VIEW_DEFAULT = 'classic';
const Sound = window.PeetakoSound || { play() {}, toggle() { return false; }, isEnabled() { return false; } };

// Retro labels per stat (the four stats stay; only the names on screen are short).
const STAT_META = {
  energy:      { organic: ['FOOD', 'Hunger'],   robot: ['POWER', 'Battery'] },
  health:      { organic: ['CLEAN', 'Hygiene'], robot: ['OIL', 'Maintenance'] },
  temperature: { organic: ['WARM', 'Warmth'],   robot: ['COOL', 'Cooling'] },
  mood:        { organic: ['FUN', 'Mood'],      robot: ['FUN', 'Mood'] },
};
const STAT_ORDER = ['energy', 'health', 'temperature', 'mood'];
const BTN = { // short label, pixel icon, sound
  feed: ['FEED', 'feed', 'eat'], shed: ['CLEAN', 'wash', 'bathe'], bask: ['WARM', 'sun', 'tap'], play: ['PLAY', 'ball', 'play'],
  charge: ['CHARGE', 'bolt', 'eat'], oil: ['OIL', 'drop', 'bathe'], cool: ['COOL', 'snow', 'tap'], update: ['UPDATE', 'cycle', 'play'],
};
// 8×8 pixel icons (feed, ball and wash from the retro mockup; the others drawn to match)
const ICONS = {
  feed: [[2, 0, 1, 1], [5, 0, 1, 1], [1, 1, 2, 2], [5, 1, 2, 2], [3, 2, 2, 5], [2, 7, 1, 1], [5, 7, 1, 1]],
  ball: [[2, 0, 4, 1], [1, 1, 6, 1], [0, 2, 8, 4], [1, 6, 6, 1], [2, 7, 4, 1]],
  wash: [[3, 0, 2, 2], [2, 2, 4, 1], [1, 3, 6, 3], [2, 6, 4, 1]],
  sun: [[3, 0, 2, 1], [0, 3, 1, 2], [7, 3, 1, 2], [3, 7, 2, 1], [2, 2, 4, 4], [1, 1, 1, 1], [6, 1, 1, 1], [1, 6, 1, 1], [6, 6, 1, 1]],
  bolt: [[4, 0, 2, 1], [3, 1, 2, 1], [2, 2, 2, 1], [1, 3, 5, 1], [4, 4, 2, 1], [3, 5, 2, 1], [2, 6, 2, 1], [2, 7, 1, 1]],
  drop: [[3, 0, 2, 1], [2, 1, 4, 2], [1, 3, 6, 3], [2, 6, 4, 1], [3, 7, 2, 1]],
  snow: [[3, 0, 2, 8], [0, 3, 8, 2], [1, 1, 1, 1], [6, 1, 1, 1], [1, 6, 1, 1], [6, 6, 1, 1]],
  cycle: [[2, 0, 4, 1], [1, 1, 1, 1], [6, 1, 1, 2], [0, 2, 1, 4], [7, 3, 1, 1], [5, 3, 3, 1], [1, 6, 1, 1], [2, 7, 4, 1], [6, 6, 1, 1]],
};
const pixelIcon = (name, ink) => `<svg viewBox="0 0 8 8" width="22" height="22" shape-rendering="crispEdges" aria-hidden="true">${
  (ICONS[name] || []).map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${ink}"/>`).join('')}</svg>`;

let state = {
  pet: null, turnstileSiteKey: null, turnstileId: null, pendingPet: null, poll: null, vapidKey: null, alertsOn: false,
  caredAt: 0, moodTimer: null, skyTimer: null, lastTier: null, view: VIEW_DEFAULT,
};

// iPadOS Safari reports itself as a Mac, so also check for a touch screen.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  applyView();
  if (name === 'pet') renderScene(); // the scene's fit depends on the view, which applyView just set
  const first = $(`#screen-${name}`).querySelector('h1, h2');
  if (first) { first.setAttribute('tabindex', '-1'); first.focus({ preventScroll: true }); }
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({ message: 'Unexpected server response.' }));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed.'), { status: res.status, code: data.error });
  return data;
}

function fmtAge(h) {
  const d = Math.floor(h / 24), r = h % 24;
  if (d === 0) return `${r} hour${r === 1 ? '' : 's'}`;
  return `${d} day${d === 1 ? '' : 's'}${r ? `, ${r} h` : ''}`;
}
function fmtHours(h) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  return `${Math.floor(h / 24)} days ${Math.floor(h % 24)} h`;
}
const shortTier = (name) => name.replace(/\s*\(.*\)$/, '');
const fmtShort = (h) => { // compact form for the small fact boxes: "3d 8h", "19h", "45m"
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  const d = Math.floor(h / 24), r = Math.floor(h % 24);
  return d ? `${d}d${r ? ` ${r}h` : ''}` : `${r}h`;
};

// ---------- palette theme: frame and controls follow the pet's colours ----------
function applyTheme(id) {
  const p = palette(id);
  const vars = { '--pg': p.page, '--card': p.belly, '--ink': p.line, '--gold': p.gold, '--body': p.body, '--spot': p.spot,
    '--b1': p.btn[0], '--b2': p.btn[1], '--b3': p.btn[2], '--b4': p.btn[3] };
  for (const el of [$('#game'), $('#menu'), $('#ascend-dialog')]) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.page);
}

// ---------- view: classic (default) or immersive ----------
function loadView() {
  state.view = VIEW_DEFAULT;
  try { const v = localStorage.getItem(VIEW_KEY); if (v === 'classic' || v === 'immersive') state.view = v; } catch { /* storage blocked */ }
}
function setView(v) {
  state.view = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  applyView();
  renderScene();
}
function applyView() {
  const onPet = !$('#screen-pet').hidden;
  document.body.classList.toggle('immersive', onPet && state.view === 'immersive');
  $('#game').dataset.view = state.view;
  for (const r of document.querySelectorAll('input[name="view"]')) r.checked = r.value === state.view;
}

// ---------- scene: sky by device clock, scenery by tier ----------
function renderScene() {
  const pet = state.pet;
  if (!pet) return;
  const sky = skyAt(localMinute());
  // Full screen on a tall phone: show the whole scene (sky and ground extend beyond it) rather than crop its sides.
  const fit = document.body.classList.contains('immersive') && innerWidth < innerHeight ? 'meet' : 'slice';
  $('#scene').innerHTML = drawScene(pet.tier, sky, pet.palette, { label: `${pet.backdrop}, ${sky.phase}`, fit });
  $('#stage').dataset.phase = sky.phase;
}
addEventListener('resize', () => { clearTimeout(renderScene.t); renderScene.t = setTimeout(renderScene, 150); });
function startSky() {
  clearInterval(state.skyTimer);
  state.skyTimer = setInterval(() => { if (!document.hidden) renderScene(); }, 60_000);
}

// ---------- pet screen ----------
const STATUS_LABEL = { active: 'Active', dormant: 'Dormant', dead: 'Fallen', ascended: 'Ascended' };

function renderMood(pet) {
  const m = moodOf(pet, { caredAt: state.caredAt });
  $('#pet-art').innerHTML = drawPet({ type: pet.type, tier: pet.tier, status: pet.status, mood: m.face, pal: pet.palette });
  $('#mood-fx').innerHTML = pet.status === 'dead' ? '' : drawMoodSymbols(m.symbols, pet.type, m.symbols.map((k) => MOOD_LABEL[k]).join(' and '));
  const chip = $('#pet-mood');
  chip.hidden = pet.status === 'dead' || pet.status === 'ascended';
  chip.textContent = MOOD_LABEL[m.face];
}

const segs = (v, color, low) => {
  const n = Math.round(v / 12.5);
  return Array.from({ length: 8 }, (_, i) => `<i style="background:${i < n ? (low ? '#E11D48' : color) : '#FFFFFF'}"></i>`).join('');
};

function renderPet(pet) {
  const prevTier = state.lastTier;
  state.pet = pet;
  state.lastTier = pet.tier;
  applyTheme(pet.palette);
  $('#stage').className = `pv-screen ${pet.status}`;
  renderScene();
  renderMood(pet);
  $('#pet-name').textContent = pet.name;
  $('#pet-tier').textContent = `T${pet.tier} ${shortTier(pet.tierName).toUpperCase()}`;
  $('#pet-backdrop').textContent = pet.backdrop;
  $('#call-code').textContent = pet.callCode;
  const badge = $('#pet-status');
  badge.className = `chip ${pet.status}`;
  badge.textContent = STATUS_LABEL[pet.status];
  if (prevTier !== null && pet.tier > prevTier) { Sound.play('levelUp'); toast(`${pet.name} reached Tier ${pet.tier}: ${pet.tierName}!`, 4000); }

  const alive = pet.status === 'active' || pet.status === 'dormant';
  if (!alive) $('#alerts-btn').hidden = true;
  $('#pet-alive').hidden = !alive;
  $('#pet-dead').hidden = pet.status !== 'dead';
  $('#pet-ascended').hidden = pet.status !== 'ascended';

  if (pet.status === 'dead') {
    $('#dead-text').textContent = `${pet.name} reached Tier ${pet.tier} (${pet.tierName}) and lived for ${fmtAge(pet.ageHours)}. Without care, its survival window ran out.`;
    stopPolling();
    return;
  }
  if (pet.status === 'ascended') {
    const when = new Date(pet.ascendedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    $('#ascended-text').textContent = `${pet.name} ascended on ${when} after ${fmtAge(pet.ageHours)}, with ${pet.careDays} days of care. Legacy Score: ${pet.legacyScore}.`;
    stopPolling();
    return;
  }

  // Segmented stat bars (Classic). The same values also fill a bar inside each button (Immersive).
  const p = palette(pet.palette);
  const colorOf = Object.fromEntries(pet.actions.map((a, i) => [a.stat, p.btn[i]]));
  $('#stats').innerHTML = STAT_ORDER.map((k) => {
    const v = pet.stats[k];
    const [short, long] = STAT_META[k][pet.type];
    return `<div class="stat" role="meter" aria-label="${long}" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100">
      <span class="px">${short}</span><span class="segs">${segs(v, colorOf[k], v < 25)}</span><span class="num">${v}</span></div>`;
  }).join('');

  // Control buttons, with a "!" badge when the need they serve is below 40 (GDD, Main screen layout)
  $('#actions').innerHTML = pet.actions.map((a, i) => {
    const v = pet.stats[a.stat];
    const [label, icon] = BTN[a.id] || [a.label.toUpperCase(), 'ball'];
    const need = v < NEED_BELOW;
    const [, long] = STAT_META[a.stat][pet.type];
    return `<button class="ctl${need ? ' need' : ''}" style="--b:${p.btn[i]}" data-action="${a.id}" aria-label="${a.label} (${long} ${v} of 100${need ? ', needs care' : ''})">
      ${need ? '<span class="bang" aria-hidden="true">!</span>' : ''}${pixelIcon(icon, p.line)}<span class="px">${label}</span>
      <span class="meter" aria-hidden="true"><i style="width:${v}%"></i></span></button>`;
  }).join('');

  // Facts
  const left = pet.hoursLeftUnattended;
  const urgent = left < 12;
  let nextLine = 'Highest tier';
  if (pet.nextTier) nextLine = `${shortTier(pet.nextTier.name)} in ${fmtShort(Math.max(0, pet.nextTier.atHours - pet.ageHours))}`;
  else if (pet.ascension && !pet.ascension.available && pet.ascension.reason === 'too_young') {
    nextLine = `Ascend in ${fmtShort(Math.max(0, pet.ascension.atHours - pet.ageHours))}`;
  } else if (pet.ascension) nextLine = 'Can ascend';
  $('#facts').innerHTML = `
    <div class="fact"><b>Age</b><span>${fmtShort(pet.ageHours)}</span></div>
    <div class="fact${urgent ? ' urgent' : ''}" title="${fmtHours(left)}"><b>Survives alone</b><span>${fmtShort(left)}</span></div>
    <div class="fact"><b>Next</b><span>${nextLine}</span></div>`;

  // Ascension (Tier 8, after 30 days as Ageless). Optional: the pet may simply keep living.
  const asc = pet.ascension;
  const showAsc = !!asc && asc.reason !== 'too_young';
  $('#ascension').hidden = !showAsc;
  if (showAsc) {
    $('#ascension-text').textContent = asc.available
      ? `${pet.name} may now ascend to the Hall of Legends (Legacy Score ${asc.projectedScore}). It is your choice — ${pet.name} can also keep living.`
      : `Care for ${pet.name} first: only an active Peetako can ascend.`;
    $('#ascend-open').hidden = !asc.available;
  }

  $('#dormant-note').hidden = pet.status !== 'dormant';
}

function startPolling() {
  stopPolling();
  state.poll = setInterval(async () => {
    if (document.hidden) return;
    try { renderPet((await api('/api/pet')).pet); } catch (e) { if (e.status === 401) { stopPolling(); show('welcome'); } }
  }, 60_000);
}
function stopPolling() { clearInterval(state.poll); state.poll = null; }

function openPet(pet) {
  state.lastTier = null;
  renderPet(pet);
  show('pet');
  startSky();
  if (pet.status === 'active' || pet.status === 'dormant') startPolling();
  refreshAlerts({ bind: true });
}

// ---------- menu ----------
function renderPalettePick() {
  const current = state.pet?.palette;
  $('#palette-pick').innerHTML = PALETTE_IDS.map((id) => {
    const p = PALETTES[id];
    return `<button type="button" class="pal${id === current ? ' on' : ''}" data-palette="${id}" aria-pressed="${id === current}" style="--sw:${p.body};--sh:${p.spot};--sb:${p.belly}">
      <span class="sw" aria-hidden="true"></span><span>${p.name}</span></button>`;
  }).join('');
}
function openMenu() {
  Sound.play('tap');
  renderPalettePick();
  applyView();
  setSoundLabel();
  $('#fullscreen-btn').hidden = !document.fullscreenEnabled;
  $('#menu').showModal();
}
function setSoundLabel() {
  const on = Sound.isEnabled();
  const b = $('#sound-btn');
  b.textContent = `Sound: ${on ? 'on' : 'off'}`;
  b.setAttribute('aria-pressed', String(on));
}
async function choosePalette(id) {
  if (!state.pet || id === state.pet.palette) return;
  const before = state.pet.palette;
  applyTheme(id);
  try {
    const data = await api('/api/palette', { palette: id });
    Sound.play('tap');
    renderPet(data.pet);
    renderPalettePick();
    toast(`Colour: ${PALETTES[id].name}`);
  } catch (e) {
    applyTheme(before);
    Sound.play('error');
    toast(e.message);
  }
}

// ---------- Ascension ----------
function openAscend() {
  const pet = state.pet;
  if (!pet?.ascension?.available) return;
  for (const el of document.querySelectorAll('[data-pet-name]')) el.textContent = pet.name;
  $('#ascend-score').textContent = String(pet.ascension.projectedScore);
  $('#ascend-check').checked = false;
  $('#ascend-confirm').disabled = true;
  $('#ascend-error').textContent = '';
  $('#ascend-dialog').showModal();
}

async function confirmAscend(ev) {
  ev.preventDefault();
  const btn = $('#ascend-confirm');
  btn.disabled = true;
  try {
    const data = await api('/api/ascend', { confirm: true });
    $('#ascend-dialog').close();
    await detachAlerts();
    Sound.play('levelUp');
    renderPet(data.pet);
    toast(`${data.pet.name} has ascended. Legacy Score ${data.pet.legacyScore}.`, 5000);
  } catch (e) {
    Sound.play('error');
    $('#ascend-error').textContent = e.message;
    btn.disabled = !$('#ascend-check').checked;
  }
}

// ---------- care alerts (Web Push) ----------
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64uToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

function setBell(on) {
  const btn = $('#alerts-btn');
  state.alertsOn = on;
  btn.setAttribute('aria-pressed', String(on));
  const label = on ? 'Care alerts are on. Tap to turn them off' : 'Turn on care alerts';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

// Show the bell where alerts can work, and (bind) attach this device to the pet now open.
async function refreshAlerts({ bind = false } = {}) {
  const btn = $('#alerts-btn');
  const iosTab = IS_IOS && !isStandalone(); // iPhone/iPad only allow alerts from a Home Screen app
  if (!state.vapidKey || !state.pet || !['active', 'dormant'].includes(state.pet.status) || (!pushSupported() && !iosTab)) { btn.hidden = true; return; }
  btn.hidden = false;
  if (!pushSupported()) { setBell(false); return; }
  const sub = Notification.permission === 'granted' ? await currentSubscription().catch(() => null) : null;
  setBell(!!sub);
  if (sub && bind) {
    api('/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => {});
  }
}

async function toggleAlerts() {
  Sound.play('tap');
  if (!pushSupported()) {
    toast('To get alerts on iPhone or iPad, add Peetako to your Home Screen (Share, then "Add to Home Screen") and open it from there.', 8000);
    return;
  }
  if (state.alertsOn) {
    const sub = await currentSubscription().catch(() => null);
    if (sub) {
      try { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* still unsubscribe locally */ }
      await sub.unsubscribe().catch(() => {});
    }
    setBell(false);
    toast('Care alerts off.');
    return;
  }
  if (Notification.permission === 'denied') {
    toast('Notifications are blocked for Peetako. Allow them in your browser or device settings, then tap the bell again.', 8000);
    return;
  }
  // Ask first, straight from the tap: Safari only shows the prompt during a user gesture.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') { toast('Care alerts not turned on.'); return; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(state.vapidKey) });
    await api('/api/push/subscribe', { subscription: sub.toJSON(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    setBell(true);
    toast(`Care alerts on. We'll tell you when ${state.pet.name} needs you.`, 4000);
  } catch (e) {
    setBell(false);
    toast(e.status ? e.message : 'Could not turn on alerts in this browser. Please try again later.', 6000);
  }
}

// Leaving this device: stop alerts for the pet here (the browser permission stays for next time).
async function detachAlerts() {
  const sub = state.alertsOn ? await currentSubscription().catch(() => null) : null;
  if (sub) { try { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* ignore */ } }
  setBell(false);
}

// ---------- welcome / hatch ----------
function renderHero() {
  $('#hero-scene').innerHTML = drawScene(3, skyAt(localMinute()), 'hijau');
  $('#hero-pet').innerHTML = drawPet({ type: 'organic', tier: 3, pal: 'hijau', mood: 'happy' });
}
function updateTypePreviews() {
  $('#preview-organic').innerHTML = drawPet({ type: 'organic', tier: 1, pal: 'hijau' });
  $('#preview-robot').innerHTML = drawPet({ type: 'robot', tier: 1, pal: 'tokay' });
}

function loadTurnstile() {
  if (!state.turnstileSiteKey || state.turnstileId !== null) return;
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onload = () => {
    state.turnstileId = window.turnstile.render('#turnstile', { sitekey: state.turnstileSiteKey, theme: 'light' });
  };
  document.head.appendChild(s);
  state.turnstileId = 'loading';
}

async function hatch(ev) {
  ev.preventDefault();
  const err = $('#hatch-error');
  err.textContent = '';
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const name = $('#pet-name-input').value;
  let turnstileToken = null;
  if (state.turnstileSiteKey) {
    turnstileToken = window.turnstile?.getResponse(state.turnstileId);
    if (!turnstileToken) { err.textContent = 'Please complete the human check first.'; return; }
  }
  const btn = $('#hatch-btn');
  btn.disabled = true;
  try {
    const data = await api('/api/register', { name, type, turnstileToken, remember: $('#hatch-remember').checked });
    state.pendingPet = data.pet;
    $('#key-box').textContent = data.key;
    $('#saved-check').checked = false;
    $('#reveal-continue').disabled = true;
    Sound.play('levelUp');
    show('reveal');
  } catch (e) {
    Sound.play('error');
    err.textContent = e.message;
    if (window.turnstile && state.turnstileId) window.turnstile.reset(state.turnstileId);
  } finally {
    btn.disabled = false;
  }
}

async function login(ev) {
  ev.preventDefault();
  const err = $('#login-error');
  err.textContent = '';
  const btn = $('#login-btn');
  btn.disabled = true;
  try {
    const data = await api('/api/login', { key: $('#key-input').value, remember: $('#login-remember').checked });
    $('#key-input').value = '';
    openPet(data.pet);
  } catch (e) {
    Sound.play('error');
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ---------- wiring ----------
function wire() {
  $('#go-hatch').addEventListener('click', () => { Sound.play('tap'); updateTypePreviews(); loadTurnstile(); show('hatch'); });
  $('#go-login').addEventListener('click', () => { Sound.play('tap'); show('login'); });
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show('welcome'));

  $('#random-name').addEventListener('click', () => {
    $('#pet-name-input').value = NAMES[Math.floor(Math.random() * NAMES.length)];
  });
  $('#screen-hatch').addEventListener('submit', hatch);
  $('#screen-login').addEventListener('submit', login);

  $('#copy-key').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#key-box').textContent); toast('Key copied. Paste it somewhere safe.'); }
    catch { toast('Copy failed — select the key and copy it by hand.'); }
  });
  $('#saved-check').addEventListener('change', (e) => { $('#reveal-continue').disabled = !e.target.checked; });
  $('#reveal-continue').addEventListener('click', () => {
    $('#key-box').textContent = '';
    openPet(state.pendingPet);
    state.pendingPet = null;
  });

  $('#actions').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const id = b.dataset.action;
    for (const x of document.querySelectorAll('#actions button')) x.disabled = true;
    try {
      const data = await api('/api/care', { action: id });
      Sound.play((BTN[id] || [])[2] || 'tap');
      state.caredAt = Date.now(); // excited for a few seconds, then back to its stat-based mood
      clearTimeout(state.moodTimer);
      state.moodTimer = setTimeout(() => state.pet && renderMood(state.pet), EXCITED_AFTER_CARE_MS + 50);
      renderPet(data.pet);
      const act = data.pet.actions.find((a) => a.id === id);
      toast(`${act ? act.label : 'Done'} — ${data.pet.name} feels better!`);
    } catch (err) {
      Sound.play('error');
      toast(err.message);
      if (err.status === 401) show('welcome');
    } finally {
      for (const x of document.querySelectorAll('#actions button')) x.disabled = false;
    }
  });

  for (const b of document.querySelectorAll('[data-logout]')) b.addEventListener('click', async () => {
    if ($('#menu').open) $('#menu').close();
    await detachAlerts();
    try { await api('/api/logout', {}); } catch { /* ignore */ }
    stopPolling();
    clearInterval(state.skyTimer);
    state.pet = null;
    applyTheme('hijau');
    show('welcome');
  });
  for (const b of document.querySelectorAll('[data-new-pet]')) b.addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch { /* ignore */ }
    clearInterval(state.skyTimer);
    applyTheme('hijau');
    updateTypePreviews(); loadTurnstile(); show('hatch');
  });
  $('#alerts-btn').addEventListener('click', toggleAlerts);
  $('#ascend-open').addEventListener('click', openAscend);
  $('#ascend-check').addEventListener('change', (e) => { $('#ascend-confirm').disabled = !e.target.checked; });
  $('#ascend-confirm').addEventListener('click', confirmAscend);

  // menu
  $('#menu-btn').addEventListener('click', openMenu);
  for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener('change', (e) => { Sound.play('tap'); setView(e.target.value); });
  $('#palette-pick').addEventListener('click', (e) => { const b = e.target.closest('[data-palette]'); if (b) choosePalette(b.dataset.palette); });
  $('#sound-btn').addEventListener('click', () => { Sound.toggle(); setSoundLabel(); });
  $('#fullscreen-btn').addEventListener('click', async () => {
    try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch { toast('Full screen is not available here.'); }
    $('#menu').close();
  });
  // Close a dialog by tapping the dimmed area around it.
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && state.pet && ['active', 'dormant'].includes(state.pet.status)) {
      try { renderPet((await api('/api/pet')).pet); } catch { /* ignore */ }
    }
  });
}

// ---------- install as an app (PWA) ----------
function setupInstall() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* site still works without it */ });

  const btn = $('#install-app');
  if (!btn || isStandalone()) return;
  let deferred = null;

  // Android / desktop Chrome and Edge: the browser offers a real install prompt.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; toast('Peetako installed. Open it from your home screen.'); });
  // iPhone / iPad: no prompt exists, so the button explains Add to Home Screen instead.
  if (IS_IOS) btn.hidden = false;

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      btn.hidden = true;
    } else if (IS_IOS) {
      toast('Tap Share, then "Add to Home Screen". Inside the app, enter your Secret Key once and tick "Remember this device".', 8000);
    }
  });
}

async function init() {
  loadView();
  applyTheme('hijau');
  renderHero();
  wire();
  setupInstall();
  try {
    const cfg = await api('/api/config');
    state.turnstileSiteKey = cfg.turnstileSiteKey;
    state.vapidKey = cfg.vapidPublicKey || null;
  } catch { /* ignore */ }
  try {
    const data = await api('/api/pet');
    openPet(data.pet);
  } catch (e) {
    show('welcome');
    // No HTTP status means the request never reached the server (offline or network down).
    if (e.status === undefined) toast('You appear to be offline. Reconnect to care for your Peetako.', 6000);
  }
}

init();
