// Peetako behaviour regression test.
//
// Runs the real Worker (src/index.js) against a local D1 with a fixed clock, fixed randomness and a
// mocked push service, walks through a scripted scenario, and compares the full transcript with
// test/golden.json: every API response, every outbound push request, and snapshots of every table.
//
//   npm test                  compare against the golden transcript (exit 1 on any difference)
//   npm run test:update       rewrite the golden after an INTENDED behaviour change (review the diff!)
//   node test/regression.mjs --src <dir>   run the same scenario against another copy of src/
//
// Phase 2A rewrote the golden (6-character Call Codes, compressed tiers, care days, Ascension); 2B added palettes.
// Nothing here touches the real database; it needs no secrets and no network.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPlatformProxy } from 'wrangler';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GOLDEN = path.join(ROOT, 'test', 'golden.json');
const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const srcFlag = args.indexOf('--src');
const SRC = path.resolve(srcFlag >= 0 ? args[srcFlag + 1] : path.join(ROOT, 'src'));

// ---- throwaway keys (generated per run, never committed; masked in the transcript) ----
const b64u = (u8) => Buffer.from(u8).toString('base64url');
async function makeKeyPair() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return {
    pub: b64u(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))),
    d: (await crypto.subtle.exportKey('jwk', kp.privateKey)).d,
  };
}
const vapid = await makeKeyPair();
const devices = [];
for (let i = 0; i < 8; i++) devices.push({ ...(await makeKeyPair()), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) });

// ---- fresh local D1 built from the real migrations ----
const work = mkdtempSync(path.join(tmpdir(), 'peetako-regression-'));
execFileSync(path.join(ROOT, 'node_modules', '.bin', 'wrangler'), ['d1', 'migrations', 'apply', 'peetako-p2', '--local', '--persist-to', work], { cwd: ROOT, stdio: 'ignore' });
const { env: platformEnv, dispose } = await getPlatformProxy({ configPath: path.join(ROOT, 'wrangler.jsonc'), persist: { path: path.join(work, 'v3') } });
const env = {
  DB: platformEnv.DB,
  KEY_PEPPER: 'regression-pepper',
  CALL_CODE_PREFIX: 'PTK',
  VAPID_PUBLIC_KEY: vapid.pub,
  VAPID_PRIVATE_KEY: vapid.d,
  VAPID_SUBJECT: 'mailto:test@example.com',
  PUSH_MAX_PER_RUN: '20',
};

// ---- fixed clock, fixed randomness, mocked push service ----
let T = Date.UTC(2026, 9, 10, 0, 0, 0);
Date.now = () => T;
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = rnd() & (a.BYTES_PER_ELEMENT === 4 ? 0xffffffff : 0xff); return a; };

const pushLog = [];
const PUSH_STATUS = new Map(); // endpoint -> HTTP status to answer with (default 201)
globalThis.fetch = async (url, init = {}) => {
  const headers = { ...(init.headers || {}) };
  delete headers.authorization; // VAPID signature differs on every run
  const status = PUSH_STATUS.get(String(url)) ?? 201;
  pushLog.push({ t: T, url: String(url), status, headers, bytes: init.body?.length ?? 0 });
  return new Response(null, { status });
};

const worker = (await import(pathToFileURL(path.join(SRC, 'index.js')).href)).default;

// ---- helpers ----
const H = 3600 * 1000;
const log = [];
const jar = new Map(); // who -> session cookie

async function call(label, method, p, { body, ip = '1.1.1.1', who, origin } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (who && jar.get(who)) headers.cookie = jar.get(who);
  if (origin) headers.origin = origin;
  const res = await worker.fetch(new Request('https://peetako.test' + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const sc = res.headers.get('set-cookie');
  if (sc) {
    const m = sc.match(/ptk_session=([a-f0-9]*)/);
    if (m && m[1]) jar.set(who || label, 'ptk_session=' + m[1]); else jar.delete(who || label);
  }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  log.push({ label, t: T, status: res.status, setCookie: sc ? sc.replace(/ptk_session=[a-f0-9]+/, 'ptk_session=<tok>') : null, data });
  return data;
}

async function snap(label) {
  const out = {};
  for (const [t, order] of [['pet', 'id'], ['sessions', 'token_hash'], ['push_subscriptions', 'endpoint'], ['notify_state', 'pet_id']]) {
    out[t] = (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).all()).results;
  }
  log.push({ label: 'SNAP ' + label, t: T, snap: out });
}

async function cron(label, expr) {
  const waits = [];
  await worker.scheduled({ cron: expr }, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  log.push({ label, t: T, cron: expr });
  await snap(label);
}

const sub = (i, host = 'fcm.googleapis.com') => ({ endpoint: `https://${host}/send/device-${i}`, keys: { p256dh: devices[i].pub, auth: devices[i].auth } });

// ---- scenario ----
async function scenario() {
  await call('config', 'GET', '/api/config');
  await call('no-session pet', 'GET', '/api/pet');
  await call('bad name', 'POST', '/api/register', { body: { name: '!', type: 'organic' } });
  await call('bad type', 'POST', '/api/register', { body: { name: 'Valid', type: 'x' } });
  await call('bad origin', 'POST', '/api/register', { body: { name: 'Valid', type: 'robot' }, origin: 'https://evil.test' });

  const a = await call('register A', 'POST', '/api/register', { body: { name: 'Gecko One', type: 'organic', remember: true }, who: 'A', ip: '2.2.2.2' });
  await call('register B', 'POST', '/api/register', { body: { name: 'Robo Two', type: 'robot', remember: false }, who: 'B', ip: '3.3.3.3' });
  await call('register C', 'POST', '/api/register', { body: { name: 'Cee', type: 'organic', remember: true }, who: 'C', ip: '4.4.4.4' });
  await call('register D', 'POST', '/api/register', { body: { name: 'Dee', type: 'robot', remember: true }, who: 'D', ip: '5.5.5.5' });
  for (let i = 0; i < 6; i++) await call('register burst ' + i, 'POST', '/api/register', { body: { name: 'Burst' + i, type: 'organic' }, who: 'burst' + i, ip: '9.9.9.9' }); // 6th is rate limited

  T += 1 * H;
  await call('get pet A', 'GET', '/api/pet', { who: 'A' });
  await call('care A feed', 'POST', '/api/care', { who: 'A', body: { action: 'feed' }, ip: '2.2.2.2' });
  await call('care A bad', 'POST', '/api/care', { who: 'A', body: { action: 'nope' }, ip: '2.2.2.2' });
  // Phase 2B: palette switch (cosmetic)
  await call('palette A bad', 'POST', '/api/palette', { who: 'A', body: { palette: 'neon' }, ip: '2.2.2.2' });
  await call('palette A tokay', 'POST', '/api/palette', { who: 'A', body: { palette: 'tokay' }, ip: '2.2.2.2' });
  await call('palette no session', 'POST', '/api/palette', { body: { palette: 'laut' }, ip: '2.2.2.2' });
  await call('care B charge', 'POST', '/api/care', { who: 'B', body: { action: 'charge' }, ip: '3.3.3.3' });

  await call('logout A', 'POST', '/api/logout', { who: 'A' });
  await call('pet after logout', 'GET', '/api/pet', { who: 'A' });
  await call('login A', 'POST', '/api/login', { body: { key: a.key.toUpperCase().replaceAll('-', ' '), remember: false }, who: 'A2', ip: '2.2.2.2' });
  await call('login bad key words', 'POST', '/api/login', { body: { key: 'not four words' }, ip: '6.6.6.6' });
  await call('login unknown key', 'POST', '/api/login', { body: { key: 'river-candle-tiger-mango' }, ip: '6.6.6.6' });
  for (let i = 0; i < 11; i++) await call('login flood ' + i, 'POST', '/api/login', { body: { key: 'river-candle-tiger-mango' }, ip: '7.7.7.7' }); // 11th is rate limited

  // care alerts: subscribe, replace, per-pet device cap, unsubscribe
  await call('push sub A d0', 'POST', '/api/push/subscribe', { who: 'A2', body: { subscription: sub(0), tz: 'Asia/Kuching' }, ip: '2.2.2.2' });
  await call('push sub bad host', 'POST', '/api/push/subscribe', { who: 'A2', body: { subscription: sub(1, 'evil.example.com') }, ip: '2.2.2.2' });
  for (let i = 1; i <= 6; i++) { T += 1000; await call('push sub A d' + i, 'POST', '/api/push/subscribe', { who: 'A2', body: { subscription: sub(i), tz: 'bogus/zone' }, ip: '2.2.2.2' }); }
  await call('push resub d6 -> pet B', 'POST', '/api/push/subscribe', { who: 'B', body: { subscription: sub(6), tz: 'UTC' }, ip: '3.3.3.3' });
  await call('push sub C d7', 'POST', '/api/push/subscribe', { who: 'C', body: { subscription: sub(7), tz: 'Asia/Kuching' }, ip: '4.4.4.4' });
  await call('push sub D d0', 'POST', '/api/push/subscribe', { who: 'D', body: { subscription: sub(0), tz: 'Asia/Kuching' }, ip: '5.5.5.5' });
  await call('push unsub bad', 'POST', '/api/push/unsubscribe', { who: 'A2', body: { endpoint: 5 }, ip: '2.2.2.2' });
  await snap('after subscribes');
  await call('push unsub d5', 'POST', '/api/push/unsubscribe', { who: 'A2', body: { endpoint: sub(5).endpoint }, ip: '2.2.2.2' });
  await snap('after unsub');

  // hourly alert runs: delivered (201), expired subscription (410), failed (500), quiet hours, tier news
  PUSH_STATUS.set(sub(7).endpoint, 410);
  PUSH_STATUS.set(sub(0).endpoint, 500);
  for (const hrs of [20, 6, 12, 8, 2, 30]) { T += hrs * H; await cron('hourly +' + hrs + 'h', '5 * * * *'); }
  await call('get pet B mid', 'GET', '/api/pet', { who: 'B' });
  T += 12 * H; await cron('hourly again', '5 * * * *');

  // daily cron: deaths, session and rate-limit cleanup, alert cleanup
  T += 60 * H; await cron('daily', '0 18 * * *');
  await call('get pet after daily A', 'GET', '/api/pet', { who: 'A2' });
  await call('get pet after daily B', 'GET', '/api/pet', { who: 'B' });
  await call('care after death B', 'POST', '/api/care', { who: 'B', body: { action: 'charge' }, ip: '3.3.3.3' });
  T += 400 * H; await cron('daily late', '0 18 * * *');
  await call('get pet C late', 'GET', '/api/pet', { who: 'C' });

  // Phase 2A: compressed tiers, care days and Ascension (Tier 8, Day 90 soft cap)
  const e = await call('register E', 'POST', '/api/register', { body: { name: 'Elder', type: 'organic', remember: true }, who: 'E', ip: '8.8.8.8' });
  await call('ascend E unconfirmed', 'POST', '/api/ascend', { who: 'E', body: {}, ip: '8.8.8.8' });
  await call('ascend E too young', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  for (let d = 1; d <= 93; d++) {
    T += (d % 7 === 0 ? 20 : 24) * H; // daily care, with a few short gaps that land on the same UTC day
    if (d % 25 === 0) await call('login E day ' + d, 'POST', '/api/login', { body: { key: e.key, remember: true }, who: 'E', ip: '8.8.8.8' }); // 30-day session
    const r = await call('care E day ' + d, 'POST', '/api/care', { who: 'E', body: { action: ['feed', 'shed', 'bask', 'play'][d % 4] }, ip: '8.8.8.8' });
    if (d % 15 === 0) log.push({ label: 'tier E day ' + d, t: T, tier: r.pet.tier, tierName: r.pet.tierName, careDays: r.pet.careDays });
  }
  T += 25 * H; // dormant again
  await call('ascend E dormant', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('care E wake', 'POST', '/api/care', { who: 'E', body: { action: 'play' }, ip: '8.8.8.8' });
  await call('ascend E ok', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('ascend E again', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('care E after ascension', 'POST', '/api/care', { who: 'E', body: { action: 'feed' }, ip: '8.8.8.8' });
  await call('palette E after ascension', 'POST', '/api/palette', { who: 'E', body: { palette: 'kenyalang' }, ip: '8.8.8.8' });
  T += 400 * H; await cron('daily after ascension', '0 18 * * *'); // 400 h > Tier 8 survival window: an ascended pet must not fall
  await call('login E after ascension', 'POST', '/api/login', { body: { key: e.key, remember: false }, who: 'E', ip: '8.8.8.8' });
}

// ---- run, mask throwaway keys, compare ----
let failed = false;
try {
  await scenario();
  const dump = {};
  for (const [t, order] of [['pet', 'id'], ['sessions', 'token_hash'], ['rate_limits', 'bucket'], ['push_subscriptions', 'endpoint'], ['notify_state', 'pet_id']]) {
    dump[t] = (await env.DB.prepare(`SELECT * FROM ${t} ORDER BY ${order}`).all()).results;
  }
  let text = JSON.stringify({ log, pushLog, dump }, null, 1);
  text = text.replaceAll(vapid.pub, '<vapid-public>'); // /api/config returns it
  devices.forEach((d, i) => { text = text.replaceAll(d.pub, `<p256dh-${i}>`).replaceAll(d.auth, `<auth-${i}>`); });
  const actual = JSON.parse(text);
  const summary = `${log.length} steps, ${pushLog.length} push requests, rows ${Object.entries(dump).map(([k, v]) => `${k}=${v.length}`).join(' ')}`;

  if (UPDATE) {
    writeFileSync(GOLDEN, text + '\n');
    console.log(`golden updated (${summary}). Review the diff before committing.`);
  } else if (!existsSync(GOLDEN)) {
    console.error('test/golden.json is missing. Create it with: npm run test:update');
    failed = true;
  } else {
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    const diffs = [];
    const walk = (g, a, p) => {
      if (diffs.length >= 12) return;
      if (g && a && typeof g === 'object' && typeof a === 'object') {
        for (const k of new Set([...Object.keys(g), ...Object.keys(a)])) walk(g[k], a[k], `${p}.${k}`);
      } else if (g !== a) {
        diffs.push(`  ${p}\n    golden: ${JSON.stringify(g)}\n    actual: ${JSON.stringify(a)}`);
      }
    };
    walk(golden, actual, '$');
    if (diffs.length) {
      failed = true;
      console.error(`FAIL: behaviour differs from test/golden.json (first ${diffs.length} differences)\n${diffs.join('\n')}`);
      console.error('\nIf the change is intended: npm run test:update, then review the golden diff.');
    } else {
      console.log(`PASS: behaviour matches test/golden.json (${summary})`);
    }
  }
} catch (e) {
  failed = true;
  console.error('FAIL: scenario crashed\n', e);
} finally {
  await dispose();
  rmSync(work, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
