// Shared request helpers for the Worker routes (index.js and social.js).
import { petBySession, rateLimitHit } from './store.js';

export const COOKIE = 'ptk_session';
export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

// Fixed-window limits per network (hashed IP). Per-pet limits live in economy.js and the PIN lock.
export const LIMITS = {
  login:    { max: 20,  windowMs: 15 * 60 * 1000 }, // PIN attempts per network (each pet also locks itself)
  register: { max: 5,   windowMs: DAY },            // new pets per network per day
  check:    { max: 120, windowMs: HOUR },           // Call Code availability checks and suggestions
  care:     { max: 300, windowMs: HOUR },           // care actions per network per hour
  push:     { max: 30,  windowMs: HOUR },           // alert on/off changes
  social:   { max: 200, windowMs: HOUR },           // shop, gifts, battles, Pamper, game runs, leaderboards
  report:   { max: 10,  windowMs: DAY },            // reports per network per day
  admin:    { max: 30,  windowMs: 15 * 60 * 1000 }, // admin token attempts
};

const enc = new TextEncoder();
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmac(env, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.KEY_PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
export const sha256 = async (msg) => hex(await crypto.subtle.digest('SHA-256', enc.encode(msg)));

export function randInt(n) { // unbiased 0..n-1
  const limit = Math.floor(0x100000000 / n) * n;
  const a = new Uint32Array(1);
  do crypto.getRandomValues(a); while (a[0] >= limit);
  return a[0] % n;
}
export function newToken() { const a = new Uint8Array(32); crypto.getRandomValues(a); return hex(a); }

// Constant-time comparison of two strings (admin token).
export function sameSecret(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const fail = (status, code, message, extra = {}) => json({ error: code, message, ...extra }, status);

export async function readBody(req) {
  try { return await req.json(); } catch { return {}; }
}

export function readCookie(req) {
  const m = (req.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

export const ipHash = async (env, req) => (await hmac(env, 'ip:' + (req.headers.get('cf-connecting-ip') || 'local'))).slice(0, 24);

export async function rateLimit(env, req, action) {
  const { max, windowMs } = LIMITS[action];
  const now = Date.now();
  const start = Math.floor(now / windowMs) * windowMs;
  const bucket = `${action}:${await ipHash(env, req)}:${start}`;
  return (await rateLimitHit(env, bucket, start + windowMs)) <= max;
}

export async function petFromSession(env, req) {
  const token = readCookie(req);
  if (!token) return null;
  return petBySession(env, await sha256(token), Date.now());
}

export const NO_SESSION = () => fail(401, 'no_session', 'Enter your Call Code and PIN to continue.');
export const SLOW_DOWN = () => fail(429, 'rate_limited', 'Slow down a little — try again in a while.');
