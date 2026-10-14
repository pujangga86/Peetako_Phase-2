// Peetako Worker — serves the API under /api/*; static pages come from ./public.
import { WORDS } from './wordlist.js';
import { advance, applyCare, ascend, ascensionBlock, view, tierAt, START_STATS, DAY, HOUR } from './game.js';
import { pushRun, validSubscription, validTimeZone } from './push.js';
import {
  isUniqueViolation, rateLimitHit, createPet, petByKeyHash, savePet, petBySession, createSession, deleteSession,
  saveAscension, saveSubscription, deleteSubscription, petsNotCaredSince, recordDeathsAndPurge, purgeFallenAlerts,
} from './store.js';

const COOKIE = 'ptk_session';
const REMEMBER_DAYS = 30;
const SHORT_SESSION_HOURS = 12;             // "don't remember this device"
const CALL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 31 symbols, no 0/O, 1/I/L
const CALL_CODE_LENGTH = 6;                           // 31^6 ≈ 887 million codes
const LIMITS = {
  login:    { max: 10,  windowMs: 15 * 60 * 1000 }, // key attempts per IP
  register: { max: 5,   windowMs: DAY },            // new pets per IP per day
  care:     { max: 300, windowMs: HOUR },           // care actions per IP per hour
  push:     { max: 30,  windowMs: HOUR },           // alert on/off changes per IP per hour
};
const MAX_DEVICES_PER_PET = 5;                       // alert subscriptions kept per pet (newest win)

// ---------- helpers ----------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.KEY_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
const sha256 = async (msg) => hex(await crypto.subtle.digest('SHA-256', enc.encode(msg)));

function randInt(n) { // unbiased 0..n-1
  const limit = Math.floor(0x100000000 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= limit);
  return a[0] % n;
}
const newKey = () => Array.from({ length: 4 }, () => WORDS[randInt(WORDS.length)]).join('-');
const newCallCode = (env) => `${env.CALL_CODE_PREFIX || 'PTK'}-` + Array.from({ length: CALL_CODE_LENGTH }, () => CALL_ALPHABET[randInt(CALL_ALPHABET.length)]).join('');
function newToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return hex(a); }

const WORDSET = new Set(WORDS);
function normaliseKey(raw) {
  const words = String(raw || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  if (words.length !== 4 || !words.every((w) => WORDSET.has(w))) return null;
  return words.join('-');
}

function cleanName(raw) {
  const n = String(raw || '').replace(/\s+/g, ' ').trim();
  return /^[A-Za-z0-9][A-Za-z0-9 '\-]{0,14}[A-Za-z0-9]$/.test(n) ? n : null;
}

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const fail = (status, code, message) => json({ error: code, message }, status);

function cookieHeader(token, remember) {
  const base = `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax`;
  return remember ? `${base}; Max-Age=${REMEMBER_DAYS * 86400}` : base; // session cookie otherwise
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

async function rateLimit(env, req, action) {
  const { max, windowMs } = LIMITS[action];
  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const bucket = `${action}:${(await hmac(env, 'ip:' + ip)).slice(0, 24)}:${start}`;
  return (await rateLimitHit(env, bucket, start + windowMs)) <= max;
}

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

async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

// ---------- sessions ----------
// All database access lives in store.js; nothing in this file writes SQL.
async function petFromSession(env, req) {
  const token = readCookie(req);
  if (!token) return null;
  return petBySession(env, await sha256(token), Date.now());
}

async function startSession(env, petId, remember) {
  const token = newToken();
  const now = Date.now();
  const ttl = remember ? REMEMBER_DAYS * DAY : SHORT_SESSION_HOURS * HOUR;
  await createSession(env, { tokenHash: await sha256(token), petId, createdAt: now, expiresAt: now + ttl });
  return cookieHeader(token, remember);
}

// ---------- routes ----------
async function register(env, req) {
  const b = await readBody(req);
  const name = cleanName(b.name);
  if (!name) return fail(400, 'bad_name', 'Name must be 2–16 letters, numbers, spaces, hyphens or apostrophes.');
  if (!['organic', 'robot'].includes(b.type)) return fail(400, 'bad_type', 'Choose Organic or Robot.');
  if (!(await rateLimit(env, req, 'register'))) return fail(429, 'rate_limited', 'Too many new pets from this network today. Try again tomorrow.');
  if (!(await verifyTurnstile(env, b.turnstileToken, req))) return fail(403, 'turnstile', 'Human check failed. Please try again.');

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt++) {
    const key = newKey();
    const callCode = newCallCode(env);
    try {
      const row = await createPet(env, {
        callCode, keyHash: await hmac(env, 'key:' + key), name, type: b.type, now, stats: START_STATS,
      });
      const cookie = await startSession(env, row.id, !!b.remember);
      return json({ key, pet: view(row, now) }, 201, { 'set-cookie': cookie });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // retry only on code collision
    }
  }
  return fail(500, 'collision', 'Could not create a unique pet. Please try again.');
}

async function login(env, req) {
  const b = await readBody(req);
  if (!(await rateLimit(env, req, 'login'))) return fail(429, 'rate_limited', 'Too many key attempts. Wait 15 minutes and try again.');
  const key = normaliseKey(b.key);
  if (!key) return fail(400, 'bad_key', 'A Secret Key is four words, like river-candle-tiger-mango.');
  const row = await petByKeyHash(env, await hmac(env, 'key:' + key));
  if (!row) return fail(404, 'not_found', 'No Peetako has that key. Check the spelling of each word.');
  const now = Date.now();
  const p = advance(row, now);
  await savePet(env, p);
  const cookie = await startSession(env, p.id, !!b.remember);
  return json({ pet: view(p, now) }, 200, { 'set-cookie': cookie });
}

async function getPet(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return fail(401, 'no_session', 'Enter your Secret Key to continue.');
  const now = Date.now();
  const p = advance(row, now);
  await savePet(env, p);
  return json({ pet: view(p, now) });
}

async function care(env, req) {
  const row = await petFromSession(env, req);
  if (!row) return fail(401, 'no_session', 'Enter your Secret Key to continue.');
  if (!(await rateLimit(env, req, 'care'))) return fail(429, 'rate_limited', 'Slow down a little — your Peetako needs rest too.');
  const b = await readBody(req);
  const now = Date.now();
  let p = advance(row, now);
  if (p.ascended_at) return json({ pet: view(p, now) });
  if (p.died_at) { await savePet(env, p); return json({ pet: view(p, now) }); }
  const cared = applyCare(p, b.action, now);
  if (!cared) return fail(400, 'bad_action', 'Unknown action.');
  await savePet(env, cared);
  return json({ pet: view(cared, now) });
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
  if (!row) return fail(401, 'no_session', 'Enter your Secret Key to continue.');
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
  return json({ pet: view(done, now) });
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
  if (!row) return fail(401, 'no_session', 'Enter your Secret Key to continue.');
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
  if (!row) return fail(401, 'no_session', 'Enter your Secret Key to continue.');
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
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, vapidPublicKey: pushReady(env) ? env.VAPID_PUBLIC_KEY : null });
  }
  if (!env.KEY_PEPPER) return fail(500, 'not_configured', 'Server secret KEY_PEPPER is not set.');

  // Basic CSRF guard: state-changing requests must come from our own origin.
  if (m === 'POST') {
    const origin = req.headers.get('origin');
    if (origin && origin !== url.origin) return fail(403, 'bad_origin', 'Cross-site request blocked.');
  }

  if (path === '/api/register' && m === 'POST') return register(env, req);
  if (path === '/api/login' && m === 'POST') return login(env, req);
  if (path === '/api/pet' && m === 'GET') return getPet(env, req);
  if (path === '/api/care' && m === 'POST') return care(env, req);
  if (path === '/api/ascend' && m === 'POST') return ascendPet(env, req);
  if (path === '/api/logout' && m === 'POST') return logout(env, req);
  if (path === '/api/push/subscribe' && m === 'POST') return pushSubscribe(env, req);
  if (path === '/api/push/unsubscribe' && m === 'POST') return pushUnsubscribe(env, req);
  return fail(404, 'not_found', 'Unknown endpoint.');
}

// Daily cron: mark deaths, clear expired sessions and rate-limit rows.
async function daily(env) {
  const now = Date.now();
  const candidates = await petsNotCaredSince(env, now - 48 * HOUR); // 48 h is the shortest survival window
  const fallen = candidates.map((row) => advance(row, now)).filter((p) => p.died_at);
  await recordDeathsAndPurge(env, { fallen, now });
  // Fallen pets get no more alerts; a device re-attaches when it opens a new pet.
  // Separate step, so the core cleanup above still runs if migration 0002 is not applied yet.
  try {
    await purgeFallenAlerts(env);
  } catch (e) { console.warn('alert cleanup skipped:', e.message); }
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
