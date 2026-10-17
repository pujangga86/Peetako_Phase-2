// Peetako Worker — serves the API under /api/* and the public pet pages under /p/*;
// static pages come from ./public.
//
// Phase 2C: players choose their own Call Code and a 6-digit PIN (the four-word Secret Key is gone),
// plus coins, cosmetics, gifts, Tangkap Kelip-kelip, leaderboards, Report, share/invite, Pamper and
// friendly battles (social.js).
import { advance, applyCare, ascend, ascensionBlock, view, tierAt, START_STATS, PALETTES, DAY, HOUR } from './game.js';
import { COIN, REFERRAL_AFTER, mytDay } from './economy.js';
import { isBlocked } from './filter.js';
import { pushRun, validSubscription, validTimeZone } from './push.js';
import {
  isUniqueViolation, createPet, petByCodeKey, petById, savePet, createSession, deleteSession, deleteOtherSessions,
  saveAscension, saveSubscription, deleteSubscription, petsNotCaredSince, recordDeathsAndPurge, purgeFallenAlerts,
  savePinFailure, savePinSuccess, savePinHash, codeKeysTaken, payTierReward, earnCapped, settleReferral, countDaily,
  addEvent, purgeSocial, setCountryOnce,
} from './store.js';
import { COUNTRIES, UNDISCLOSED, countryChoice, suggestedCountry } from './countries.js';
import {
  hmac, sha256, newToken, json, fail, readBody, readCookie, rateLimit, petFromSession, ipHash, COOKIE,
  NO_SESSION, SLOW_DOWN,
} from './http.js';
import { buildMe, socialRoute, publicPage } from './social.js';
import { CODE_MIN, CODE_MAX, prefix, codeSuffix, codeKeyOf, suggestion } from './codes.js';

const REMEMBER_DAYS = 30;
const SHORT_SESSION_HOURS = 12;             // "don't remember this device"
const MAX_DEVICES_PER_PET = 5;              // alert subscriptions kept per pet (newest win)

// ---------- PIN (replaces the Secret Key, 16 Oct 2026) ----------
const PIN_LOCK = { streak: 5, streakLockMs: 15 * 60 * 1000, perDay: 20, dayLockMs: DAY }; // decided 17 Oct 2026
const WEAK_PINS = new Set(['012345', '123456', '234567', '345678', '456789', '987654', '876543', '765432', '654321', '543210', '123123', '121212']);
function pinProblem(pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) return 'Your PIN is 6 digits.';
  if (/^(\d)\1{5}$/.test(pin) || WEAK_PINS.has(pin)) return 'That PIN is too easy to guess. Choose 6 digits that are not all the same or in a row.';
  return null;
}
const pinHash = (env, codeKey, pin) => hmac(env, `pin:${codeKey}:${pin}`);

function cleanName(raw) {
  const n = String(raw || '').replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9][A-Za-z0-9 '\-]{0,14}[A-Za-z0-9]$/.test(n) ? n : null;
}

function cookieHeader(token, remember) {
  const base = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return remember ? `${base}; Max-Age=${REMEMBER_DAYS * 86400}` : base; // session cookie otherwise
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

async function verifyTurnstile(env, token, req) {
  if (!env.TURNSTILE_SECRET) return true; // not configured (local dev / early prototype)
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  const ip = req.headers.get('cf-connecting-ip');
  if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const out = await r.json().catch(() => ({}));
  return out.success === true;
}

async function startSession(env, petId, remember) {
  const token = newToken();
  const now = Date.now();
  const ttl = remember ? REMEMBER_DAYS * DAY : SHORT_SESSION_HOURS * HOUR;
  await createSession(env, { tokenHash: await sha256(token), petId, createdAt: now, expiresAt: now + ttl });
  return cookieHeader(token, remember);
}

// ---------- coin rewards that follow the pet's own life ----------
// Tier-up: +50 × tier, once per tier (also catches up tiers reached while nobody looked).
async function payTiers(env, p) {
  if (p.died_at || p.ascended_at || p.tier <= (p.tier_paid || 0)) return 0;
  let coins = 0;
  for (let t = (p.tier_paid || 0) + 1; t <= p.tier; t++) coins += COIN.tierUp * t;
  return (await payTierReward(env, p.id, p.tier, coins)) ? coins : 0;
}

// Invite reward, settled at the first care action after the new pet's first day.
// Inviter +100 (at most 3 paid referrals per day; otherwise it waits for a later care action),
// new player +50. Void when the inviter has fallen or ascended.
async function payReferral(env, p, now) {
  if (!p.referred_by || p.referral_state !== 0 || now - p.born_at < REFERRAL_AFTER) return null;
  const inviter = await petById(env, p.referred_by);
  if (!inviter || inviter.died_at || inviter.ascended_at) {
    return (await settleReferral(env, { petId: p.id, state: 2, newPlayerCoins: COIN.referralNewPlayer })) ? { me: COIN.referralNewPlayer, inviter: 0 } : null;
  }
  const day = mytDay(now);
  const paid = await earnCapped(env, inviter.id, day, 'ref_coins', COIN.referral, COIN.referral * COIN.referralMaxPerDay);
  if (paid < COIN.referral) return null; // inviter at today's cap: try again at a later care action
  if (!(await settleReferral(env, { petId: p.id, state: 1, newPlayerCoins: COIN.referralNewPlayer }))) return null;
  await addEvent(env, { petId: inviter.id, kind: 'referral', fromPet: p.id, data: { coins: COIN.referral }, at: now });
  return { me: COIN.referralNewPlayer, inviter: COIN.referral };
}

// ---------- routes ----------
async function register(env, req) {
  const b = await readBody(req);
  const name = cleanName(b.name);
  if (!name) return fail(400, 'bad_name', 'Name must be 2–16 letters, numbers, spaces, hyphens or apostrophes.');
  if (isBlocked(name)) return fail(400, 'name_blocked', 'Please choose a kinder name.');
  if (!['organic', 'robot'].includes(b.type)) return fail(400, 'bad_type', 'Choose Organic or Robot.');
  if (!PALETTES.includes(b.palette)) return fail(400, 'bad_palette', 'Choose a colour for your Peetako.');
  const country = countryChoice(b.country);
  if (!country) return fail(400, 'bad_country', 'Choose your country, or “Prefer not to say”. You can only choose it once.');
  const suffix = codeSuffix(env, b.code);
  if (!suffix) return fail(400, 'bad_code', `A Call Code is ${CODE_MIN} to ${CODE_MAX} letters or digits after ${prefix(env)}-.`);
  if (isBlocked(suffix)) return fail(400, 'code_blocked', 'Please choose a different Call Code.');
  const pinErr = pinProblem(b.pin);
  if (pinErr) return fail(400, 'bad_pin', pinErr);
  if (!(await rateLimit(env, req, 'register'))) return fail(429, 'rate_limited', 'Too many new pets from this network today. Try again tomorrow.');
  if (!(await verifyTurnstile(env, b.turnstileToken, req))) return fail(403, 'turnstile', 'Human check failed. Please try again.');

  const now = Date.now();
  const regIp = await ipHash(env, req);
  // Invite link: only a living pet from another network can invite.
  let referredBy = null;
  const refSuffix = b.ref ? codeSuffix(env, b.ref) : null;
  if (refSuffix) {
    const inviter = await petByCodeKey(env, codeKeyOf(env, refSuffix));
    if (inviter && !inviter.died_at && !inviter.ascended_at && inviter.reg_ip !== regIp) referredBy = inviter.id;
  }
  const codeKey = codeKeyOf(env, suffix);
  let row;
  try {
    row = await createPet(env, {
      callCode: `${prefix(env)}-${suffix}`, codeKey, pinHash: await pinHash(env, codeKey, b.pin), regIp,
      name, type: b.type, palette: b.palette, country, now, stats: START_STATS, referredBy,
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail(409, 'code_taken', 'That Call Code is taken (or looks too much like one that is). Try another.');
    throw e;
  }
  const cookie = await startSession(env, row.id, !!b.remember);
  return json({ pet: view(row, now), me: await buildMe(env, row, now), invited: !!referredBy }, 201, { 'set-cookie': cookie });
}

// Is this Call Code free? Look-alikes (0/O, 1/I/L) count as taken.
async function checkCode(env, req, url) {
  if (!(await rateLimit(env, req, 'check'))) return SLOW_DOWN();
  const suffix = codeSuffix(env, url.searchParams.get('code'));
  if (!suffix) return json({ available: false, reason: 'shape', message: `${CODE_MIN} to ${CODE_MAX} letters or digits.` });
  if (isBlocked(suffix)) return json({ available: false, reason: 'blocked', message: 'Please choose a different Call Code.' });
  const taken = await codeKeysTaken(env, [codeKeyOf(env, suffix)]);
  return json({ available: !taken.size, code: `${prefix(env)}-${suffix}`, reason: taken.size ? 'taken' : null,
    message: taken.size ? 'Taken (or too close to one that is).' : 'Available!' });
}

async function suggestCodes(env, req) {
  if (!(await rateLimit(env, req, 'check'))) return SLOW_DOWN();
  const pool = new Map();
  for (let i = 0; i < 24 && pool.size < 12; i++) {
    const s = suggestion();
    if (s.length >= CODE_MIN && s.length <= CODE_MAX && !isBlocked(s)) pool.set(codeKeyOf(env, s), s);
  }
  const taken = await codeKeysTaken(env, [...pool.keys()]);
  const free = [...pool].filter(([k]) => !taken.has(k)).map(([, s]) => s).slice(0, 4);
  return json({ prefix: `${prefix(env)}-`, codes: free });
}

async function login(env, req) {
  const b = await readBody(req);
  if (!(await rateLimit(env, req, 'login'))) return fail(429, 'rate_limited', 'Too many PIN attempts from this network. Wait 15 minutes and try again.');
  const suffix = codeSuffix(env, b.code);
  if (!suffix) return fail(400, 'bad_code', `Enter your Call Code, like ${prefix(env)}-TOKAY88.`);
  if (!/^\d{6}$/.test(String(b.pin || ''))) return fail(400, 'bad_pin', 'Your PIN is 6 digits.');
  const codeKey = codeKeyOf(env, suffix);
  const row = await petByCodeKey(env, codeKey);
  if (!row) return fail(404, 'not_found', 'No Peetako has that Call Code. Check each letter.');
  const now = Date.now();
  if (row.pin_locked_until > now) {
    const mins = Math.ceil((row.pin_locked_until - now) / 60000);
    return fail(429, 'pin_locked', `Too many wrong PINs. This Peetako is locked for ${mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`}.`, { retryAfterMin: mins });
  }
  if ((await pinHash(env, codeKey, b.pin)) !== row.pin_hash) {
    const day = mytDay(now);
    const count = (row.pin_fail_day === day ? row.pin_fail_count : 0) + 1;
    let streak = row.pin_fail_streak + 1;
    let lockedUntil = 0;
    if (count >= PIN_LOCK.perDay) { lockedUntil = now + PIN_LOCK.dayLockMs; streak = 0; }
    else if (streak >= PIN_LOCK.streak) { lockedUntil = now + PIN_LOCK.streakLockMs; streak = 0; }
    await savePinFailure(env, row.id, { streak, day, count, lockedUntil });
    if (lockedUntil) return fail(429, 'pin_locked', `Wrong PIN. Too many tries: this Peetako is locked for ${lockedUntil - now >= DAY ? '24 hours' : '15 minutes'}.`);
    return fail(401, 'wrong_pin', `Wrong PIN. ${PIN_LOCK.streak - streak} ${PIN_LOCK.streak - streak === 1 ? 'try' : 'tries'} left before a 15-minute lock.`);
  }
  if (row.pin_fail_streak) await savePinSuccess(env, row.id);
  const p = advance(row, now);
  if (!p.ascended_at) await savePet(env, p);
  const tierCoins = await payTiers(env, p);
  const cookie = await startSession(env, p.id, !!b.remember);
  return json({ pet: view(p, now), me: await buildMe(env, await petById(env, p.id), now), earned: tierCoins ? { tier: tierCoins } : null },
    200, { 'set-cookie': cookie });
}

// Change the PIN (no recovery exists; a signed-in device can change it with the old PIN).
async function changePin(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  if (!(await rateLimit(env, req, 'login'))) return fail(429, 'rate_limited', 'Too many PIN attempts. Wait 15 minutes and try again.');
  const b = await readBody(req);
  const now = Date.now();
  if (row.pin_locked_until > now) return fail(429, 'pin_locked', 'Too many wrong PINs. Try again later.');
  if ((await pinHash(env, row.code_key, String(b.oldPin || ''))) !== row.pin_hash) {
    const day = mytDay(now);
    const count = (row.pin_fail_day === day ? row.pin_fail_count : 0) + 1;
    let streak = row.pin_fail_streak + 1;
    let lockedUntil = 0;
    if (count >= PIN_LOCK.perDay) { lockedUntil = now + PIN_LOCK.dayLockMs; streak = 0; }
    else if (streak >= PIN_LOCK.streak) { lockedUntil = now + PIN_LOCK.streakLockMs; streak = 0; }
    await savePinFailure(env, row.id, { streak, day, count, lockedUntil });
    return fail(401, 'wrong_pin', 'Your current PIN is not right.');
  }
  const err = pinProblem(String(b.newPin || ''));
  if (err) return fail(400, 'bad_pin', err);
  await savePinHash(env, row.id, await pinHash(env, row.code_key, b.newPin));
  await deleteOtherSessions(env, row.id, await sha256(readCookie(req)));
  return json({ ok: true });
}

async function getPet(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  const now = Date.now();
  const p = advance(row, now);
  if (!p.ascended_at) await savePet(env, p);
  const tierCoins = await payTiers(env, p);
  const fresh = tierCoins ? await petById(env, p.id) : p;
  return json({ pet: view(p, now), me: await buildMe(env, fresh, now), earned: tierCoins ? { tier: tierCoins } : null });
}

async function care(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  if (!(await rateLimit(env, req, 'care'))) return fail(429, 'rate_limited', 'Slow down a little — your Peetako needs rest too.');
  const b = await readBody(req);
  const now = Date.now();
  let p = advance(row, now);
  if (p.ascended_at) return json({ pet: view(p, now), me: await buildMe(env, p, now) });
  if (p.died_at) { await savePet(env, p); return json({ pet: view(p, now), me: await buildMe(env, p, now) }); }
  const cared = applyCare(p, b.action, now);
  if (!cared) return fail(400, 'bad_action', 'Unknown action.');
  await savePet(env, cared);
  const day = mytDay(now);
  const earned = {
    care: await earnCapped(env, cared.id, day, 'care_coins', COIN.care, COIN.careMaxPerDay),
    tier: await payTiers(env, cared),
  };
  const ref = await payReferral(env, cared, now);
  if (ref) earned.referral = ref.me;
  await countDaily(env, cared.id, day, 'care');
  return json({ pet: view(cared, now), me: await buildMe(env, await petById(env, cared.id), now), earned });
}

// Ascension: optional and permanent. The browser must send { confirm: true } after the owner agreed.
const ASCEND_REFUSALS = {
  already_ascended: [409, 'This Peetako has already ascended.'],
  fallen: [409, 'A fallen Peetako cannot ascend.'],
  too_young: [403, 'Ascension opens after 30 days as Ageless (Day 90).'],
  dormant: [403, 'Care for your Peetako first: only an active Peetako can ascend.'],
};
async function ascendPet(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  if (!(await rateLimit(env, req, 'care'))) return fail(429, 'rate_limited', 'Slow down a little — your Peetako needs rest too.');
  const b = await readBody(req);
  if (b.confirm !== true) return fail(400, 'not_confirmed', 'Ascension needs your confirmation.');
  const now = Date.now();
  const p = advance(row, now);
  if (!p.ascended_at && !p.died_at) await savePet(env, p);
  const block = ascensionBlock(p, now);
  if (block) { const [st, msg] = ASCEND_REFUSALS[block]; return fail(st, block, msg); }
  const done = ascend(p, now);
  if (!(await saveAscension(env, done))) return fail(409, 'already_ascended', 'This Peetako has already ascended.');
  try { await purgeFallenAlerts(env); } catch { /* alerts for this pet are skipped anyway */ }
  return json({ pet: view(done, now), me: await buildMe(env, done, now) });
}

// The colour is chosen once, at hatch. The old 2B switch route always refuses.
function setPalette() {
  return fail(403, 'palette_locked', 'Your Peetako’s colour is chosen once, when it hatches, and cannot be changed.');
}

// The country is chosen once, at hatch. This route exists for pets that hatched before countries did
// (country not set yet): they get one chance. After that, and for every new pet, it always refuses.
async function setCountry(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
  const locked = () => fail(403, 'country_locked', 'Your Peetako’s country is chosen once and cannot be changed.');
  if (row.country) return locked();
  const b = await readBody(req);
  const country = countryChoice(b.country);
  if (!country) return fail(400, 'bad_country', 'Choose your country, or “Prefer not to say”. You can only choose it once.');
  if (!(await setCountryOnce(env, row.id, country))) return locked();
  const fresh = await petById(env, row.id);
  const now = Date.now();
  return json({ pet: view(advance(fresh, now), now), me: await buildMe(env, fresh, now) });
}

async function logout(env, req) {
  const token = readCookie(req);
  if (token) await deleteSession(env, await sha256(token));
  return json({ ok: true }, 200, { 'set-cookie': clearCookie });
}

// ---------- care alerts (Web Push) ----------
const pushReady = (env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

async function pushSubscribe(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  if (!pushReady(env)) return fail(503, 'push_off', 'Care alerts are not available yet.');
  if (!(await rateLimit(env, req, 'push'))) return fail(429, 'rate_limited', 'Too many changes. Try again in a while.');
  if (row.died_at || row.ascended_at) return fail(409, 'pet_ended', 'Alerts are only for a living Peetako.');
  const b = await readBody(req);
  const s = b.subscription;
  if (!validSubscription(s)) return fail(400, 'bad_subscription', 'This browser sent an alert subscription we cannot use.');
  const tz = validTimeZone(b.tz) ? b.tz : 'Asia/Kuala_Lumpur';
  const now = Date.now();
  await saveSubscription(env, {
    petId: row.id, sub: s, tz, now,
    cycleAt: row.last_cared_at, tierSent: tierAt(now - row.born_at), // bookkeeping starts without announcing the current tier
    maxDevices: MAX_DEVICES_PER_PET,
  });
  return json({ ok: true });
}

async function pushUnsubscribe(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return NO_SESSION();
  const b = await readBody(req);
  if (typeof b.endpoint !== 'string' || b.endpoint.length > 1024) return fail(400, 'bad_endpoint', 'Missing subscription.');
  await deleteSubscription(env, { endpoint: b.endpoint, petId: row.id });
  return json({ ok: true });
}

async function route(req, env) {
  const url = new URL(req.url);
  const { pathname: path } = url;
  const m = req.method;

  if (path === '/api/config' && m === 'GET') {
    return json({
      turnstileSiteKey: env.TURNSTILE_SITE_KEY || null,
      vapidPublicKey: pushReady(env) ? env.VAPID_PUBLIC_KEY : null,
      codePrefix: `${prefix(env)}-`, codeMin: CODE_MIN, codeMax: CODE_MAX,
      // ISO 3166-1 list for the hatch picker; the network's guess is only a suggestion the player confirms.
      countries: COUNTRIES, undisclosed: UNDISCLOSED, suggestedCountry: suggestedCountry(req),
    });
  }
  if (!env.KEY_PEPPER) return fail(500, 'not_configured', 'Server secret KEY_PEPPER is not set.');

  // Basic CSRF guard: state-changing requests must come from our own origin.
  if (m === 'POST') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'bad_origin', 'Cross-site request blocked.');
  }

  if (path.startsWith('/p/') && m === 'GET') return publicPage(env, req, url);

  if (path === '/api/register' && m === 'POST') return register(env, req);
  if (path === '/api/code/check' && m === 'GET') return checkCode(env, req, url);
  if (path === '/api/code/suggest' && m === 'GET') return suggestCodes(env, req);
  if (path === '/api/login' && m === 'POST') return login(env, req);
  if (path === '/api/pin' && m === 'POST') return changePin(env, req);
  if (path === '/api/pet' && m === 'GET') return getPet(env, req);
  if (path === '/api/care' && m === 'POST') return care(env, req);
  if (path === '/api/ascend' && m === 'POST') return ascendPet(env, req);
  if (path === '/api/palette' && m === 'POST') return setPalette();
  if (path === '/api/country' && m === 'POST') return setCountry(env, req);
  if (path === '/api/logout' && m === 'POST') return logout(env, req);
  if (path === '/api/push/subscribe' && m === 'POST') return pushSubscribe(env, req);
  if (path === '/api/push/unsubscribe' && m === 'POST') return pushUnsubscribe(env, req);
  const social = await socialRoute(env, req, url);
  if (social) return social;
  return fail(404, 'not_found', 'Unknown endpoint.');
}

// Daily cron: mark deaths, clear expired sessions and rate-limit rows, tidy 2C tables.
async function daily(env) {
  const now = Date.now();
  const candidates = await petsNotCaredSince(env, now - 48 * HOUR); // 48 h is the shortest survival window
  const fallen = candidates.map((row) => advance(row, now)).filter((p) => p.died_at);
  await recordDeathsAndPurge(env, { fallen, now });
  try {
    await purgeFallenAlerts(env);
  } catch (e) { console.warn('alert cleanup skipped:', e.message); }
  try {
    await purgeSocial(env, { dayCutoff: mytDay(now - 8 * DAY), runCutoff: now - DAY, eventCutoff: now - 30 * DAY });
  } catch (e) { console.warn('2C cleanup skipped:', e.message); }
  return fallen.length;
}

const DAILY_CRON = '0 18 * * *'; // 02:00 Malaysia time; must match wrangler.jsonc

export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (e) {
      console.error(e);
      return fail(500, 'server_error', 'Something went wrong. Please try again.');
    }
  },
  async scheduled(event, env, ctx) {
    if (event.cron === DAILY_CRON) {
      ctx.waitUntil(daily(env).then((n) => console.log(`daily: ${n} pets marked as fallen`)));
    } else {
      ctx.waitUntil(pushRun(env).then((r) => console.log('care alerts:', JSON.stringify(r))));
    }
  },
};
