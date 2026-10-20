// Peetako game client (Phase 2C; hibernation, Mentor Boost, Legacy Egg and badges added 20 Oct 2026). The colour palette is chosen once, at hatch; the player picks a
// Call Code and a 6-digit PIN (no Secret Key). Coins, shop, friends, the mini-game and sharing live in social.js.
// Talks to the Worker API under /api/*.
// One set of pet-screen parts, laid out as Classic (retro frame, default) or Immersive (full screen, CRT)
// by CSS; the choice is saved on this device only (Peetako has no login).
import { drawPet, drawMoodSymbols, drawScene } from './art.js';
import { PALETTES, PALETTE_IDS, palette } from './palettes.js';
import { moodOf, MOOD_LABEL, EXCITED_AFTER_CARE_MS, NEED_BELOW } from './mood.js';
import { skyAt, localMinute } from './sky.js';
import { attachAntics } from './antics.js';
import { initSocial, badgeHtml } from './social.js';
import { mountCountryPicker, countryHtml } from './flags.js';

const $ = (sel) => document.querySelector(sel);
const screens = ['welcome', 'hatch', 'reveal', 'login', 'pet'];
const NAMES = ['Pitak', 'Tako', 'Bujang', 'Dayang', 'Awang', 'Sago', 'Rajang', 'Bako', 'Mulu', 'Danum', 'Lundu', 'Ranau',
  'Kapit', 'Kudat', 'Sape', 'Pandan', 'Durian', 'Langsat', 'Midin', 'Tuhau', 'Kelkatu', 'Chikchak', 'Bintang', 'Gelam'];
// v2 key: only an explicit choice from the menu is ever saved under it, so a saved value is always the player's own.
// Without one, the default follows the device: Classic on a desktop window, Immersive on a phone.
const VIEW_KEY = 'peetako_view_v2';
const DESKTOP_MQ = '(min-width: 900px) and (orientation: landscape)'; // same breakpoint the CSS uses for desktop layouts
const isDesktop = () => matchMedia(DESKTOP_MQ).matches;
const REF_KEY = 'peetako_ref'; // Call Code from an invite link, kept until this device hatches a pet
const BACKDROP_NAMES = { 'bg-kinabalu': 'Kinabalu from Kundasang', 'bg-rajang': 'Rajang River' };
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
  feed: ['FEED', 'feed', 'eat'], shed: ['CLEAN', 'wash', 'bathe'], bask: ['WARM', 'sun', 'warm'], play: ['PLAY', 'ball', 'play'],
  charge: ['CHARGE', 'bolt', 'eat'], oil: ['OIL', 'drop', 'bathe'], cool: ['COOL', 'snow', 'warm'], update: ['UPDATE', 'cycle', 'play'],
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
  caredAt: 0, moodTimer: null, skyTimer: null, lastTier: null, view: isDesktop() ? 'classic' : 'immersive', viewChosen: false, me: null, social: null,
  codePrefix: 'PTK-', countries: null, suggestedCountry: null, hatchPicker: null,
};

// iPadOS Safari reports itself as a Mac, so also check for a touch screen.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function show(name) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== name;
  applyView();
  if (name === 'pet') renderScene(); // the scene's fit depends on the view, which applyView just set
  if (name !== 'pet' && $('#game').getBoundingClientRect().top < 0) $('#game').scrollIntoView({ block: 'start' });
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
  for (const el of [$('#game'), ...document.querySelectorAll('dialog.sheet')]) for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', p.page);
}

// ---------- view: classic (default) or immersive ----------
function loadView() {
  state.viewChosen = false;
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'classic' || v === 'immersive') { state.view = v; state.viewChosen = true; }
  } catch { /* storage blocked */ }
  if (!state.viewChosen) state.view = isDesktop() ? 'classic' : 'immersive';
}
function setView(v) {
  state.view = v;
  state.viewChosen = true;
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ }
  applyView();
  renderScene();
}
// A player who never chose a view follows the device default when the window changes (rotate, resize, drag to another screen).
matchMedia(DESKTOP_MQ).addEventListener('change', () => {
  if (state.viewChosen) return;
  state.view = isDesktop() ? 'classic' : 'immersive';
  applyView();
  renderScene();
});
function applyView() {
  const onPet = !$('#screen-pet').hidden;
  document.body.classList.toggle('on-pet', onPet);
  document.body.classList.toggle('immersive', onPet && state.view === 'immersive');
  $('#game').dataset.view = state.view;
  for (const r of document.querySelectorAll('input[name="view"]')) r.checked = r.value === state.view;
}

// ---------- scene: sky by device clock, scenery by tier ----------
function renderScene() {
  const pet = state.pet;
  if (!pet) return;
  const sky = skyAt(localMinute());
  // Portrait stage (a tall phone, or the phone-sized frame on desktop): show the whole scene (sky and ground extend
  // beyond it) rather than crop its sides. The stage's own shape decides, not the window's.
  const box = $('#scene').getBoundingClientRect();
  const portrait = box.width && box.height ? box.width < box.height : innerWidth < innerHeight;
  const fit = document.body.classList.contains('immersive') && portrait ? 'meet' : 'slice';
  const bought = pet.equipped?.backdrop;
  $('#scene').innerHTML = drawScene(pet.tier, sky, pet.palette, { label: `${BACKDROP_NAMES[bought] || pet.backdrop}, ${sky.phase}`, fit, backdrop: bought });
  $('#stage').dataset.phase = sky.phase;
}
addEventListener('resize', () => { clearTimeout(renderScene.t); renderScene.t = setTimeout(renderScene, 150); });
function startSky() {
  clearInterval(state.skyTimer);
  state.skyTimer = setInterval(() => { if (!document.hidden) renderScene(); }, 60_000);
}

// ---------- pet screen ----------
const STATUS_LABEL = { active: 'Active', dormant: 'Dormant', hibernating: 'Hibernating', dead: 'Fallen', ascended: 'Ascended' };

function renderMood(pet) {
  const m = moodOf(pet, { caredAt: state.caredAt });
  state.face = m.face;
  const e = pet.equipped || {};
  $('#pet-art').innerHTML = drawPet({ type: pet.type, tier: pet.tier, status: pet.status, mood: m.face, pal: pet.palette, wear: { head: e.head, neck: e.neck, back: e.back } });
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
  renderStreak();
  updateAppBadge();
  applyTheme(pet.palette);
  $('#stage').className = `pv-screen ${pet.status}`;
  renderScene();
  renderMood(pet);
  $('#pet-name').textContent = pet.name;
  $('#pet-tier').textContent = `T${pet.tier} ${shortTier(pet.tierName).toUpperCase()}`;
  $('#pet-backdrop').textContent = BACKDROP_NAMES[pet.equipped?.backdrop] || pet.backdrop;
  $('#call-code').textContent = pet.callCode;
  const cEl = $('#pet-country');
  cEl.hidden = !pet.country;
  cEl.innerHTML = pet.country ? countryHtml(pet.country) : '';
  const hiddenNote = $('#name-hidden-note');
  hiddenNote.hidden = pet.nameStatus !== 'hidden';
  hiddenNote.textContent = `Another player reported the name “${pet.name}”. Others see “Name under review” until it is checked.`;
  const hib = pet.hibernation?.active;
  const badge = $('#pet-status');
  badge.className = `chip ${pet.status}`;
  badge.textContent = STATUS_LABEL[hib ? 'hibernating' : pet.status];
  const mentored = $('#pet-mentor');
  mentored.hidden = !pet.mentorUntil;
  if (pet.mentorUntil) mentored.title = `Mentor Boost: needs drop 10% slower until ${new Date(pet.mentorUntil).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (prevTier !== null && pet.tier > prevTier) { Sound.play('levelUp'); toast(`${pet.name} reached Tier ${pet.tier}: ${pet.tierName}!`, 4000); }

  const alive = pet.status === 'active' || pet.status === 'dormant';
  if (!alive) $('#alerts-btn').hidden = true;
  $('#pet-alive').hidden = !alive;
  $('#pet-dead').hidden = pet.status !== 'dead';
  $('#pet-ascended').hidden = pet.status !== 'ascended';

  // Legacy Egg: a pet that fell at Day 30 or later, or ascended, can pass on one egg.
  const egg = pet.legacyEgg;
  for (const b of document.querySelectorAll('[data-legacy]')) b.hidden = !egg?.available;
  for (const el of document.querySelectorAll('[data-legacy-note]')) {
    el.textContent = !egg ? '' : egg.available
      ? `You can claim one Legacy Egg: it hatches straight to Tier 1 with half of ${pet.name}'s coins plus 200, and every cosmetic.`
      : egg.reason === 'claimed' ? `${pet.name}'s Legacy Egg has been claimed.` : 'A Legacy Egg needs a Peetako that lived at least 30 days.';
  }
  if (pet.status === 'dead') {
    $('#dead-text').textContent = `${pet.name} reached Tier ${pet.tier} (${pet.tierName}) and lived for ${fmtAge(pet.ageHours)}. Without care, its survival window and its hibernation days ran out.`;
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
  // Survives alone = the tier's window; while hibernating, the time left before it falls.
  const hibernating = pet.hibernation?.active;
  const left = hibernating || pet.hoursLeftInWindow === undefined ? pet.hoursLeftUnattended : pet.hoursLeftInWindow;
  const urgent = left < 12;
  let nextLine = 'Highest tier';
  if (pet.nextTier) nextLine = `${shortTier(pet.nextTier.name)} in ${fmtShort(Math.max(0, pet.nextTier.atHours - pet.ageHours))}`;
  else if (pet.ascension && !pet.ascension.available && pet.ascension.reason === 'too_young') {
    nextLine = `Ascend in ${fmtShort(Math.max(0, pet.ascension.atHours - pet.ageHours))}`;
  } else if (pet.ascension) nextLine = 'Can ascend';
  $('#facts').innerHTML = `
    <div class="fact"><b>Age</b><span>${fmtShort(pet.ageHours)}</span></div>
    <div class="fact${urgent ? ' urgent' : ''}" title="${fmtHours(left)}${!hibernating && pet.hibernation?.daysLeft ? `, then up to ${pet.hibernation.daysLeft} day${pet.hibernation.daysLeft === 1 ? '' : 's'} of hibernation` : ''}"><b>${hibernating ? 'Wake it within' : 'Survives alone'}</b><span>${fmtShort(left)}</span></div>
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

  const note = $('#dormant-note');
  note.hidden = pet.status !== 'dormant';
  note.textContent = hib
    ? `${pet.name} ran out of its survival window and is hibernating instead of falling. Stats are paused. Care for it within ${fmtHours(pet.hoursLeftUnattended)} to wake it (hibernation days left this month: ${pet.hibernation.daysLeft}).`
    : `${pet.name} has gone dormant after a day without care. Look after it to wake it up.${pet.hibernation?.daysLeft ? ` If its window runs out, it hibernates (${pet.hibernation.daysLeft} day${pet.hibernation.daysLeft === 1 ? '' : 's'} left this month).` : ''}`;
}

// ---------- coins and news (Phase 2C) ----------
function renderMe(me) {
  if (!me) return;
  state.me = me;
  state.meAt = Date.now(); // resetsInMs counts from this moment
  $('#coin-count').textContent = String(me.coins);
  $('#coins-btn').setAttribute('aria-label', `${me.coins} coins. Open the shop`);
  $('#checkin-btn').hidden = !me.canCheckIn;
  $('#pet-medals').innerHTML = badgeHtml(me.badges);
  state.social?.showNews(me);
  renderStreak();
  updateAppBadge();
}

// ---------- daily reminders (decided 20 Oct 2026) ----------
// Streak line under the facts. From STREAK_RISK_HOURS before the midnight reset (Malaysia time) an unchecked
// streak turns red with a countdown, the same moment the server sends its "streak at risk" alert (20:00 MYT).
const STREAK_RISK_HOURS = 4;
const STREAK_BONUS_EVERY = 7; // economy.js COIN.streakEvery
const fmtCountdown = (ms) => { const m = Math.max(1, Math.ceil(ms / 60_000)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };
function renderStreak() {
  const el = $('#streak-line');
  const { me, pet } = state;
  if (!me || !pet || !['active', 'dormant'].includes(pet.status)) { el.hidden = true; return; }
  const msLeft = Math.max(0, (state.meAt || Date.now()) + me.resetsInMs - Date.now());
  const n = me.streak || 0;
  const days = (k) => `${k} day${k === 1 ? '' : 's'}`;
  let text;
  let risk = false;
  if (me.checkedIn) {
    const toBonus = STREAK_BONUS_EVERY - (n % STREAK_BONUS_EVERY);
    text = `🔥 Streak ${n} · checked in today ✓${toBonus < STREAK_BONUS_EVERY ? ` · bonus in ${days(toBonus)}` : ''}`;
  } else if (!n) {
    text = '🔥 Check in today to start a streak';
  } else {
    risk = msLeft <= STREAK_RISK_HOURS * 3600_000;
    const bonus = (n + 1) % STREAK_BONUS_EVERY === 0 ? ' and win the streak bonus' : '';
    text = risk
      ? `🔥 Streak ${n} at risk! Check in within ${fmtCountdown(msLeft)}${bonus}`
      : `🔥 Streak ${n} · check in today to make it ${n + 1}${bonus}`;
  }
  el.textContent = text;
  el.classList.toggle('risk', risk);
  el.classList.toggle('done', !!me.checkedIn);
  el.disabled = !!me.checkedIn;
  el.setAttribute('aria-label', me.checkedIn ? text.replace('🔥 ', '') : `${text.replace('🔥 ', '')}. Tap to check in.`);
  el.hidden = false;
}

// App icon badge (App Badging API; works for the installed app where the browser supports it): one mark for each
// thing waiting, i.e. today's check-in and every stat that shows a need. Cleared when nothing is waiting.
function updateAppBadge() {
  if (!('setAppBadge' in navigator)) return;
  const { me, pet } = state;
  let n = 0;
  if (pet && ['active', 'dormant'].includes(pet.status)) {
    if (me && !me.checkedIn) n++;
    n += Object.values(pet.stats || {}).filter((v) => v < NEED_BELOW).length;
    if (pet.status === 'dormant' || pet.hibernation?.active) n = Math.max(n, 1);
  }
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}
function clearAppBadge() { if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {}); }
function earnedText(earned) {
  if (!earned) return '';
  const parts = [];
  if (earned.care) parts.push(`+${earned.care} coins`);
  if (earned.tier) parts.push(`+${earned.tier} tier coins`);
  if (earned.referral) parts.push(`+${earned.referral} invite coins`);
  return parts.join(', ');
}

function startPolling() {
  stopPolling();
  state.poll = setInterval(async () => {
    if (document.hidden) return;
    try { const d = await api('/api/pet'); renderPet(d.pet); renderMe(d.me); } catch (e) { if (e.status === 401) { stopPolling(); show('welcome'); } }
  }, 60_000);
}
function stopPolling() { clearInterval(state.poll); state.poll = null; }

function openPet(pet, me, earned) {
  state.lastTier = null;
  renderPet(pet);
  renderMe(me);
  if (earned?.tier) setTimeout(() => toast(`New tier reward: +${earned.tier} coins!`, 4000), 400);
  show('pet');
  startSky();
  if (pet.status === 'active' || pet.status === 'dormant') startPolling();
  refreshAlerts({ bind: true });
  state.social.askCountry(pet); // only pets that hatched before countries existed
}

// ---------- menu ----------
function openMenu() {
  Sound.play('tap');
  applyView();
  setSoundLabel();
  setChallengeLabel();
  $('#fullscreen-btn').hidden = !document.fullscreenEnabled;
  $('#menu').showModal();
}
function setSoundLabel() {
  const on = Sound.isEnabled();
  const b = $('#sound-btn');
  b.textContent = `Sound: ${on ? 'on' : 'off'}`;
  b.setAttribute('aria-pressed', String(on));
  const music = Sound.isMusicOn ? Sound.isMusicOn() : false;
  const mb = $('#music-btn');
  mb.hidden = !Sound.toggleMusic;
  mb.textContent = `Sape music: ${music ? 'on' : 'off'}`;
  mb.setAttribute('aria-pressed', String(music));
}
// "Open to challenges" (on by default): a closed Peetako cannot be challenged to a battle.
function setChallengeLabel() {
  const b = $('#challenge-btn');
  const pet = state.pet;
  const alive = pet && (pet.status === 'active' || pet.status === 'dormant');
  b.hidden = !alive;
  if (!alive) return;
  b.textContent = `Battles: ${pet.openToChallenge ? 'open' : 'closed'}`;
  b.setAttribute('aria-pressed', String(!!pet.openToChallenge));
  b.title = pet.openToChallenge ? 'Others can challenge your Peetako. Tap to close.' : 'Nobody can challenge your Peetako. Tap to open.';
}
async function toggleChallenges() {
  const pet = state.pet;
  if (!pet) return;
  try {
    const d = await api('/api/challenges', { open: !pet.openToChallenge });
    Sound.play('tap');
    renderPet(d.pet);
    setChallengeLabel();
    toast(d.pet.openToChallenge ? 'Open to challenges.' : 'Closed to challenges: nobody can battle your Peetako.');
  } catch (e) { Sound.play('error'); toast(e.message); }
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
  clearAppBadge();
  const sub = state.alertsOn ? await currentSubscription().catch(() => null) : null;
  if (sub) { try { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }); } catch { /* ignore */ } }
  setBell(false);
}

// ---------- welcome / hatch ----------
function renderHero() {
  $('#hero-scene').innerHTML = drawScene(3, skyAt(localMinute()), 'hijau');
  $('#hero-pet').innerHTML = drawPet({ type: 'organic', tier: 3, pal: 'hijau', mood: 'happy' });
}
// The colour is chosen once, here. Nothing is pre-selected so the choice is deliberate.
const chosenPalette = () => document.querySelector('input[name="palette"]:checked')?.value || null;
function renderHatchPalettes() {
  $('#hatch-palette').innerHTML = PALETTE_IDS.map((id) => {
    const p = PALETTES[id];
    return `<label class="pal" style="--sw:${p.body};--sh:${p.spot};--sb:${p.belly}">
      <input type="radio" name="palette" value="${id}" aria-label="${p.name}: ${p.sub}"><span class="sw" aria-hidden="true"></span><span>${p.name}</span></label>`;
  }).join('');
}
function updateTypePreviews() {
  const pal = chosenPalette() || 'hijau';
  $('#preview-organic').innerHTML = drawPet({ type: 'organic', tier: 1, pal });
  $('#preview-robot').innerHTML = drawPet({ type: 'robot', tier: 1, pal });
  for (const l of document.querySelectorAll('#hatch-palette label.pal')) l.classList.toggle('on', l.querySelector('input').checked);
}
// ---------- Call Code: chosen at hatch, checked as you type, locked afterwards ----------
const cleanCode = (v) => v.toUpperCase().replace(/^PTK-?/, '').replace(/[^A-Z0-9]/g, '').slice(0, 8);
let codeTimer = null;
function checkCodeSoon() {
  const input = $('#code-input');
  const v = cleanCode(input.value);
  if (input.value !== v) input.value = v;
  clearTimeout(codeTimer);
  const st = $('#code-status');
  st.className = 'hint';
  if (v.length < 6) { st.textContent = '6–8 letters or numbers. Friends find your Peetako with it. It cannot be changed.'; return; }
  st.textContent = 'Checking…';
  codeTimer = setTimeout(async () => {
    try {
      const r = await api(`/api/code/check?code=${encodeURIComponent(v)}`);
      if (cleanCode(input.value) !== v) return;
      st.textContent = r.available ? `${r.code} is available!` : r.message;
      st.className = `hint ${r.available ? 'ok-hint' : 'warn-hint'}`;
    } catch { st.textContent = ''; }
  }, 350);
}
async function suggestCodes() {
  Sound.play('tap');
  try {
    const r = await api('/api/code/suggest');
    $('#code-ideas').innerHTML = r.codes.map((c) => `<button type="button" class="chip-btn" data-code="${c}">${r.prefix}${c}</button>`).join('');
  } catch (e) { toast(e.message); }
}

// The country list comes from the server (ISO 3166-1). Fetched again here if the first request failed.
async function ensureCountries() {
  if (state.countries) return true;
  try {
    const cfg = await api('/api/config');
    state.countries = cfg.countries || null;
    state.suggestedCountry = cfg.suggestedCountry || null;
  } catch { /* offline */ }
  return !!state.countries;
}
async function mountHatchCountry() {
  if (state.hatchPicker || !(await ensureCountries())) return;
  state.hatchPicker = mountCountryPicker($('#hatch-country'), { codes: state.countries, suggested: state.suggestedCountry, label: 'Your country' });
}

function openHatch() {
  mountHatchCountry();
  renderHatchPalettes();
  updateTypePreviews();
  loadTurnstile();
  show('hatch');
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
  const palette = chosenPalette();
  if (!palette) { err.textContent = 'Choose a colour for your Peetako. You can only choose it once.'; return; }
  const country = state.hatchPicker?.value();
  if (!country) { err.textContent = 'Choose your country, or “Prefer not to say”. You can only choose it once.'; return; }
  const code = cleanCode($('#code-input').value);
  if (code.length < 6) { err.textContent = 'Choose a Call Code: 6 to 8 letters or numbers.'; return; }
  const pin = $('#pin-input').value;
  if (!/^\d{6}$/.test(pin)) { err.textContent = 'Your PIN is 6 digits.'; return; }
  if (pin !== $('#pin-input2').value) { err.textContent = 'The two PINs do not match.'; return; }
  let ref = null;
  try { ref = localStorage.getItem(REF_KEY); } catch { /* storage blocked */ }
  let turnstileToken = null;
  if (state.turnstileSiteKey) {
    turnstileToken = window.turnstile?.getResponse(state.turnstileId);
    if (!turnstileToken) { err.textContent = 'Please complete the human check first.'; return; }
  }
  const btn = $('#hatch-btn');
  btn.disabled = true;
  try {
    const data = await api('/api/register', { name, type, palette, country, code, pin, ref, turnstileToken, remember: $('#hatch-remember').checked });
    try { localStorage.removeItem(REF_KEY); } catch { /* ignore */ }
    $('#pin-input').value = ''; $('#pin-input2').value = '';
    state.pendingPet = data.pet;
    state.pendingMe = data.me;
    $('#key-box').textContent = data.pet.callCode;
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
    const data = await api('/api/login', { code: $('#key-input').value, pin: $('#login-pin').value, remember: $('#login-remember').checked });
    $('#key-input').value = '';
    $('#login-pin').value = '';
    openPet(data.pet, data.me, data.earned);
  } catch (e) {
    Sound.play('error');
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ---------- Legacy Egg (fallen at Day 30+ or ascended) ----------
function openLegacy() {
  const pet = state.pet;
  if (!pet?.legacyEgg?.available) return;
  Sound.play('tap');
  for (const el of document.querySelectorAll('[data-pet-name]')) el.textContent = pet.name;
  $('#legacy-palette').innerHTML = paletteChoices('legacy-pal');
  $('#legacy-error').textContent = '';
  $('#legacy-pin').value = '';
  updateLegacyPreview();
  $('#legacy-dialog').showModal();
}
const paletteChoices = (name) => PALETTE_IDS.map((id) => {
  const p = PALETTES[id];
  return `<label class="pal" style="--sw:${p.body};--sh:${p.spot};--sb:${p.belly}">
    <input type="radio" name="${name}" value="${id}" aria-label="${p.name}: ${p.sub}"><span class="sw" aria-hidden="true"></span><span>${p.name}</span></label>`;
}).join('');
function updateLegacyPreview() {
  const pal = document.querySelector('input[name="legacy-pal"]:checked')?.value || 'hijau';
  for (const l of document.querySelectorAll('#legacy-palette label.pal')) l.classList.toggle('on', l.querySelector('input').checked);
  $('#legacy-preview').innerHTML = drawPet({ type: document.querySelector('input[name="legacy-type"]:checked')?.value || 'organic', tier: 1, pal });
}
async function claimLegacy(ev) {
  ev.preventDefault();
  const err = $('#legacy-error');
  err.textContent = '';
  const palette = document.querySelector('input[name="legacy-pal"]:checked')?.value;
  if (!palette) { err.textContent = 'Choose a colour for the new Peetako. You can only choose it once.'; return; }
  const code = cleanCode($('#legacy-code').value);
  if (code.length < 6) { err.textContent = 'Choose a new Call Code: 6 to 8 letters or numbers.'; return; }
  const btn = $('#legacy-btn');
  btn.disabled = true;
  try {
    const data = await api('/api/legacy', {
      pin: $('#legacy-pin').value, code, name: $('#legacy-name').value,
      type: document.querySelector('input[name="legacy-type"]:checked')?.value, palette, remember: true,
    });
    $('#legacy-dialog').close();
    $('#legacy-pin').value = '';
    Sound.play('levelUp');
    openPet(data.pet, data.me);
    toast(`${data.pet.name} hatched from ${data.legacy.from}'s Legacy Egg! New Call Code ${data.pet.callCode}, same PIN.`, 6000);
  } catch (e) {
    Sound.play('error');
    err.textContent = e.message;
  } finally {
    btn.disabled = false;
  }
}

// ---------- wiring ----------
function wire() {
  $('#go-hatch').addEventListener('click', () => { Sound.play('tap'); openHatch(); });
  $('#hatch-palette').addEventListener('change', () => { Sound.play('tap'); updateTypePreviews(); });
  $('#go-login').addEventListener('click', () => { Sound.play('tap'); show('login'); });
  for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => show('welcome'));

  $('#random-name').addEventListener('click', () => {
    $('#pet-name-input').value = NAMES[Math.floor(Math.random() * NAMES.length)];
  });
  $('#screen-hatch').addEventListener('submit', hatch);
  $('#code-input').addEventListener('input', checkCodeSoon);
  $('#suggest-code').addEventListener('click', suggestCodes);
  $('#code-ideas').addEventListener('click', (e) => {
    const b = e.target.closest('[data-code]');
    if (b) { $('#code-input').value = b.dataset.code; checkCodeSoon(); }
  });
  $('#screen-login').addEventListener('submit', login);

  $('#copy-key').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#key-box').textContent); toast('Call Code copied.'); }
    catch { toast('Copy failed — select the Call Code and copy it by hand.'); }
  });
  $('#saved-check').addEventListener('change', (e) => { $('#reveal-continue').disabled = !e.target.checked; });
  $('#reveal-continue').addEventListener('click', () => {
    $('#key-box').textContent = '';
    openPet(state.pendingPet, state.pendingMe);
    state.pendingPet = null;
    state.pendingMe = null;
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
      renderMe(data.me);
      const act = data.pet.actions.find((a) => a.id === id);
      const coins = earnedText(data.earned);
      if (coins) Sound.play('coin');
      toast(`${act ? act.label : 'Done'} — ${data.pet.name} feels better!${coins ? ` ${coins}.` : ''}`);
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
    state.me = null;
    applyTheme('hijau');
    show('welcome');
  });
  for (const b of document.querySelectorAll('[data-new-pet]')) b.addEventListener('click', async () => {
    try { await api('/api/logout', {}); } catch { /* ignore */ }
    clearInterval(state.skyTimer);
    applyTheme('hijau');
    openHatch();
  });
  $('#alerts-btn').addEventListener('click', toggleAlerts);
  // The streak line checks in when today's check-in is still open (same handler as the CHECK-IN button).
  $('#streak-line').addEventListener('click', () => { if (state.me?.canCheckIn) $('#checkin-btn').click(); });
  $('#ascend-open').addEventListener('click', openAscend);
  $('#ascend-check').addEventListener('change', (e) => { $('#ascend-confirm').disabled = !e.target.checked; });
  $('#ascend-confirm').addEventListener('click', confirmAscend);

  // menu
  $('#menu-btn').addEventListener('click', openMenu);
  for (const r of document.querySelectorAll('input[name="view"]')) r.addEventListener('change', (e) => { Sound.play('tap'); setView(e.target.value); });
  $('#sound-btn').addEventListener('click', () => { Sound.toggle(); setSoundLabel(); });
  $('#music-btn').addEventListener('click', () => { Sound.toggleMusic?.(); setSoundLabel(); });
  $('#challenge-btn').addEventListener('click', toggleChallenges);
  for (const b of document.querySelectorAll('[data-legacy]')) b.addEventListener('click', openLegacy);
  $('#legacy-form').addEventListener('submit', claimLegacy);
  $('#legacy-palette').addEventListener('change', () => { Sound.play('tap'); updateLegacyPreview(); });
  for (const r of document.querySelectorAll('input[name="legacy-type"]')) r.addEventListener('change', updateLegacyPreview);
  $('#legacy-code').addEventListener('input', (e) => { const v = cleanCode(e.target.value); if (e.target.value !== v) e.target.value = v; });
  $('#legacy-random').addEventListener('click', () => { $('#legacy-name').value = NAMES[Math.floor(Math.random() * NAMES.length)]; });
  $('#fullscreen-btn').addEventListener('click', async () => {
    try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch { toast('Full screen is not available here.'); }
    $('#menu').close();
  });
  // Close a dialog by tapping the dimmed area around it.
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && state.pet && ['active', 'dormant'].includes(state.pet.status)) {
      try { const d = await api('/api/pet'); renderPet(d.pet); renderMe(d.me); } catch { /* ignore */ }
    }
  });
}

// ---------- cute moves on tap / mouse-over (antics.js) ----------
function setupAntics() {
  attachAntics($('#pet-art'), () => (state.pet ? { tier: state.pet.tier, status: state.pet.status, face: state.face } : null),
    { onTap: () => Sound.play('tap') });
  attachAntics($('#hero-pet'), () => ({ tier: 3, status: 'active', face: 'happy' }), { idle: false });
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
      toast('Tap Share, then "Add to Home Screen". Inside the app, enter your Call Code and PIN once and tick "Remember this device".', 8000);
    }
  });
}

// Invite links (/?ref=PTK-XXXXXX): remember the inviter until this device hatches a pet.
function readInvite() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref && /^[A-Za-z0-9-]{6,12}$/.test(ref)) {
    try { localStorage.setItem(REF_KEY, ref.toUpperCase()); } catch { /* storage blocked */ }
    history.replaceState(null, '', location.pathname);
  }
  let saved = null;
  try { saved = localStorage.getItem(REF_KEY); } catch { /* ignore */ }
  if (saved) {
    const note = $('#invite-note');
    note.hidden = false;
    note.textContent = `Invited by ${saved.startsWith('PTK-') ? saved : `PTK-${saved}`}! Hatch your Peetako and care for it after its first day: you get 50 bonus coins.`;
  }
}

async function init() {
  readInvite();
  state.social = initSocial({
    $, api, toast, Sound,
    getPet: () => state.pet, getMe: () => state.me,
    getCountries: async () => ((await ensureCountries()) ? state.countries : null),
    onPet: (p) => renderPet(p), onMe: (m) => renderMe(m),
  });
  loadView();
  applyTheme('hijau');
  renderHero();
  wire();
  setupAntics();
  setupInstall();
  try {
    const cfg = await api('/api/config');
    state.turnstileSiteKey = cfg.turnstileSiteKey;
    state.vapidKey = cfg.vapidPublicKey || null;
    state.countries = cfg.countries || null;
    state.suggestedCountry = cfg.suggestedCountry || null;
  } catch { /* ignore */ }
  try {
    const data = await api('/api/pet');
    openPet(data.pet, data.me, data.earned);
  } catch (e) {
    show('welcome');
    // No HTTP status means the request never reached the server (offline or network down).
    if (e.status === undefined) toast('You appear to be offline. Reconnect to care for your Peetako.', 6000);
  }
}

init();
