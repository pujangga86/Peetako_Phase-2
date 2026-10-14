// Peetako game client (Phase 2A). Talks to the Worker API under /api/*.
import { drawPet, drawMoodSymbols, drawLand } from './pet.js';
import { moodOf, MOOD_LABEL, EXCITED_AFTER_CARE_MS } from './mood.js';
import { skyAt, skyLayer, localMinute } from './sky.js';

const $ = (sel) => document.querySelector(sel);
const screens = ['welcome', 'hatch', 'reveal', 'login', 'pet'];
const NAMES = ['Pitak', 'Tako', 'Bujang', 'Dayang', 'Awang', 'Sago', 'Rajang', 'Bako', 'Mulu', 'Danum', 'Lundu', 'Ranau',
  'Kapit', 'Kudat', 'Sape', 'Pandan', 'Durian', 'Langsat', 'Midin', 'Tuhau', 'Kelkatu', 'Chikchak', 'Bintang', 'Gelam'];
const STAT_META = {
  energy:      { organic: 'Hunger',      robot: 'Battery',     color: '#16A34A' },
  health:      { organic: 'Hygiene',     robot: 'Maintenance', color: '#0EA5E9' },
  temperature: { organic: 'Warmth',      robot: 'Cooling',     color: '#FB923C' },
  mood:        { organic: 'Mood',        robot: 'Mood',        color: '#E11D48' },
};

let state = { caredAt: 0, moodTimer: null, skyTimer: null, pet: null, turnstileSiteKey: null, turnstileId: null, pendingPet: null, poll: null, vapidKey: null, alertsOn: false };

// iPadOS Safari reports itself as a Mac, so also check for a touch screen.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
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

// ---------- scene: sky by device clock, land by tier ----------
function renderScene() {
  const pet = state.pet;
  if (!pet) return;
  const sky = skyAt(localMinute());
  $('#sky').innerHTML = skyLayer(sky);
  $('#land').innerHTML = drawLand(pet.tier);
  $('#shade').style.opacity = String(sky.shade);
  $('#stage').dataset.phase = sky.phase;
}
function startSky() {
  clearInterval(state.skyTimer);
  state.skyTimer = setInterval(() => { if (!document.hidden) renderScene(); }, 60_000);
}

// ---------- pet screen ----------
const STATUS_LABEL = { active: 'Active', dormant: 'Dormant', dead: 'Fallen', ascended: 'Ascended' };

function renderMood(pet) {
  const m = moodOf(pet, { caredAt: state.caredAt });
  const ended = pet.status === 'dead';
  $('#pet-art').innerHTML = drawPet({ type: pet.type, tier: pet.tier, status: pet.status, mood: m.face });
  $('#mood-fx').innerHTML = ended ? '' : drawMoodSymbols(m.symbols, pet.type, m.symbols.map((k) => MOOD_LABEL[k]).join(' and '));
  const chip = $('#pet-mood');
  chip.hidden = ended || pet.status === 'ascended';
  chip.textContent = MOOD_LABEL[m.face];
  chip.dataset.mood = m.face;
}

function renderPet(pet) {
  state.pet = pet;
  const stage = $('#stage');
  stage.className = `stage ${pet.status}`;
  renderScene();
  renderMood(pet);
  $('#pet-name').textContent = pet.name;
  $('#pet-tier').textContent = `Tier ${pet.tier} · ${pet.tierName}`;
  $('#pet-backdrop').textContent = pet.backdrop;
  const badge = $('#pet-status');
  badge.className = `badge ${pet.status}`;
  badge.textContent = STATUS_LABEL[pet.status];

  const alive = pet.status === 'active' || pet.status === 'dormant';
  if (!alive) $('#alerts-btn').hidden = true;
  $('#pet-alive').hidden = !alive;
  $('#pet-dead').hidden = pet.status !== 'dead';
  $('#pet-ascended').hidden = pet.status !== 'ascended';
  $('#care-hint').hidden = !alive;

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

  // Stats
  $('#stats').innerHTML = Object.entries(pet.stats).map(([k, v]) => {
    const m = STAT_META[k];
    return `<div><div class="stat-label"><span>${m[pet.type]}</span><span>${v}</span></div>
      <div class="bar${v < 25 ? ' low' : ''}" role="progressbar" aria-label="${m[pet.type]}" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><i style="width:${v}%;background:${m.color}"></i></div></div>`;
  }).join('');

  // Actions
  $('#actions').innerHTML = pet.actions.map((a) =>
    `<button class="btn ${a.stat === 'mood' ? 'red' : a.stat === 'energy' ? 'green' : ''}" data-action="${a.id}">${a.label}</button>`).join('');

  // Facts
  const left = pet.hoursLeftUnattended;
  const urgent = left < 12;
  let nextLine = 'Highest tier reached';
  if (pet.nextTier) nextLine = `${pet.nextTier.name} in ${fmtAge(Math.max(0, pet.nextTier.atHours - pet.ageHours))}`;
  else if (pet.ascension && !pet.ascension.available && pet.ascension.reason === 'too_young') {
    nextLine = `Ascension in ${fmtAge(Math.max(0, pet.ascension.atHours - pet.ageHours))}`;
  } else if (pet.ascension) nextLine = 'Ascension available';
  $('#facts').innerHTML = `
    <div class="fact"><b>Age</b><span>${fmtAge(pet.ageHours)}</span></div>
    <div class="fact"><b>Call Code</b><span>${pet.callCode}</span></div>
    <div class="fact${urgent ? ' urgent' : ''}"><b>Survives without care</b><span>${fmtHours(left)} more</span></div>
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
  renderPet(pet);
  show('pet');
  startSky();
  if (pet.status === 'active' || pet.status === 'dormant') startPolling();
  refreshAlerts({ bind: true });
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
    renderPet(data.pet);
    toast(`${data.pet.name} has ascended. Legacy Score ${data.pet.legacyScore}.`, 5000);
  } catch (e) {
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

// ---------- hatch ----------
function updateTypePreviews() {
  $('#preview-organic').innerHTML = drawPet({ type: 'organic', tier: 1 });
  $('#preview-robot').innerHTML = drawPet({ type: 'robot', tier: 1 });
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
    show('reveal');
  } catch (e) {
    err.textContent = e.message;
    if (window.turnstile && state.turnstileId) window.turnstile.reset(state.turnstileId);
  } finally {
    btn.disabled = false;
  }
}

// ---------- login ----------
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
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ---------- wiring ----------
function wire() {
  $('#go-hatch').addEventListener('click', () => { updateTypePreviews(); loadTurnstile(); show('hatch'); });
  $('#go-login').addEventListener('click', () => show('login'));
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
    for (const x of document.querySelectorAll('#actions button')) x.disabled = true;
    try {
      const data = await api('/api/care', { action: b.dataset.action });
      state.caredAt = Date.now(); // excited for a few seconds, then back to its stat-based mood
      clearTimeout(state.moodTimer);
      state.moodTimer = setTimeout(() => state.pet && renderMood(state.pet), EXCITED_AFTER_CARE_MS + 50);
      renderPet(data.pet);
      toast(`${b.textContent} — ${data.pet.name} feels better!`);
    } catch (err) {
      toast(err.message);
      if (err.status === 401) show('welcome');
    } finally {
      for (const x of document.querySelectorAll('#actions button')) x.disabled = false;
    }
  });

  for (const b of document.querySelectorAll('[data-logout]')) b.addEventListener('click', async () => {
    await detachAlerts();
    try { await api('/api/logout', {}); } catch { /* ignore */ }
    stopPolling();
    clearInterval(state.skyTimer);
    state.pet = null;
    show('welcome');
  });
  for (const b of document.querySelectorAll('[data-new-pet]')) b.addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch { /* ignore */ }
    clearInterval(state.skyTimer);
    updateTypePreviews(); loadTurnstile(); show('hatch');
  });
  $('#ascend-open').addEventListener('click', openAscend);
  $('#ascend-check').addEventListener('change', (e) => { $('#ascend-confirm').disabled = !e.target.checked; });
  $('#ascend-confirm').addEventListener('click', confirmAscend);
  $('#alerts-btn').addEventListener('click', toggleAlerts);

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
  const isIOS = IS_IOS;
  let deferred = null;

  // Android / desktop Chrome and Edge: the browser offers a real install prompt.
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; toast('Peetako installed. Open it from your home screen.'); });
  // iPhone / iPad: no prompt exists, so the button explains Add to Home Screen instead.
  if (isIOS) btn.hidden = false;

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      btn.hidden = true;
    } else if (isIOS) {
      toast('Tap Share, then "Add to Home Screen". Inside the app, enter your Secret Key once and tick "Remember this device".', 8000);
    }
  });
}

async function init() {
  $('#hero-pet').innerHTML = drawPet({ type: 'organic', tier: 3 });
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
