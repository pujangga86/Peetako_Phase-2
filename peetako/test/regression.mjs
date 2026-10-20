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
// Phase 2A rewrote the golden (6-character Call Codes, compressed tiers, care days, Ascension); 2B added palettes; the palette is now chosen once at hatch and locked.
// Phase 2C rewrote it again: chosen Call Codes and 6-digit PINs (no Secret Key), coins, shop, gifts, Pamper, battles,
// Tangkap Kelip-kelip and leaderboards, Report and admin review, invites, the public pet page.
// Alignment (20 Oct 2026): care coins once per type a day, religion and royalty in the filter, Bond, Friends
// (contacts, block), Open to challenges, Mentor Boost, automatic hibernation, Legacy Egg, game score with golden
// fireflies and combo, and the daily top-3 badges.
// Country (17 Oct 2026): chosen once at hatch from the ISO 3166-1 list, locked, country filters and sorting on the
// leaderboard, and a country-to-country board using the median (at least 3 players per country).
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
  ADMIN_TOKEN: 'regression-admin-token',
};

// ---- fixed clock, fixed randomness, mocked push service ----
let T = Date.UTC(2026, 9, 10, 0, 0, 0);
Date.now = () => T;
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
// Bytes come from the high bits: the low bits of this generator repeat every 256 steps, which made session tokens collide.
crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = a.BYTES_PER_ELEMENT === 4 ? rnd() : rnd() >>> 24; return a; };

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
const TABLES = [['pet', 'id'], ['sessions', 'token_hash'], ['push_subscriptions', 'endpoint'], ['notify_state', 'pet_id'],
  ['daily', 'pet_id, day, kind'], ['inventory', 'pet_id, item'], ['events', 'id'], ['game_runs', 'started_at, token_hash'],
  ['game_scores', 'pet_id, day'], ['reports', 'id'], ['battles', 'id'], ['bonds', 'a, b'], ['contacts', 'pet_id, contact_id'],
  ['blocks', 'blocker_id, blocked_id'], ['game_badges', 'day, rank']];
const H = 3600 * 1000;
const log = [];
const jar = new Map(); // who -> session cookie

async function call(label, method, p, { body, ip = '1.1.1.1', who, origin, auth } = {}) {
  const headers = { 'cf-connecting-ip': ip };
  if (auth) headers.authorization = auth;
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
  let data; try { data = JSON.parse(text); } catch { data = text.length > 600 ? text.slice(0, 600) + '…' : text; }
  log.push({ label, t: T, status: res.status, setCookie: sc ? sc.replace(/ptk_session=[a-f0-9]+/, 'ptk_session=<tok>') : null, data });
  return data;
}

async function snap(label) {
  const out = {};
  for (const [t, order] of TABLES) {
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
const reg = (name, type, palette, code, pin = '482916', extra = {}) => ({ name, type, palette, code, pin, country: 'MY', ...extra });
const expect = (label, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expectation failed: ${label}\n  expected ${JSON.stringify(expected)}\n  actual   ${JSON.stringify(actual)}`);
};

async function scenario() {
  await call('config', 'GET', '/api/config');
  await call('no-session pet', 'GET', '/api/pet');
  await call('bad name', 'POST', '/api/register', { body: { name: '!', type: 'organic' } });
  await call('bad type', 'POST', '/api/register', { body: { name: 'Valid', type: 'x' } });
  await call('bad origin', 'POST', '/api/register', { body: { name: 'Valid', type: 'robot' }, origin: 'https://evil.test' });

  // Phase 2C: chosen Call Code and PIN
  await call('code check free', 'GET', '/api/code/check?code=tokay88', { ip: '2.2.2.2' });
  await call('code check short', 'GET', '/api/code/check?code=TOK', { ip: '2.2.2.2' });
  await call('code check blocked', 'GET', '/api/code/check?code=BODOH1', { ip: '2.2.2.2' });
  await call('code suggest', 'GET', '/api/code/suggest', { ip: '2.2.2.2' });
  await call('register no palette', 'POST', '/api/register', { body: reg('NoColour', 'organic', undefined, 'NOCOLOUR'), ip: '2.2.2.2' });
  await call('register bad palette', 'POST', '/api/register', { body: reg('BadColour', 'robot', 'neon', 'BADCOLOR'), ip: '2.2.2.2' });
  await call('register blocked name', 'POST', '/api/register', { body: reg('B0d0h', 'robot', 'laut', 'NICEONE'), ip: '2.2.2.2' });
  await call('register no code', 'POST', '/api/register', { body: reg('Coder', 'robot', 'laut', ''), ip: '2.2.2.2' });
  await call('register code too long', 'POST', '/api/register', { body: reg('Coder', 'robot', 'laut', 'ABCDEFGHI'), ip: '2.2.2.2' });
  await call('register blocked code', 'POST', '/api/register', { body: reg('Coder', 'robot', 'laut', 'SEX123'), ip: '2.2.2.2' });
  await call('code check royalty blocked', 'GET', '/api/code/check?code=RAJA88', { ip: '2.2.2.2' });
  await call('code check Rajang allowed', 'GET', '/api/code/check?code=RAJANG1', { ip: '2.2.2.2' });
  await call('register religious name blocked', 'POST', '/api/register', { body: reg('Nabi', 'robot', 'laut', 'CODER1'), ip: '2.2.2.2' });
  await call('register weak pin', 'POST', '/api/register', { body: reg('Coder', 'robot', 'laut', 'CODER1', '123456'), ip: '2.2.2.2' });
  await call('register short pin', 'POST', '/api/register', { body: reg('Coder', 'robot', 'laut', 'CODER1', '4821'), ip: '2.2.2.2' });
  await call('register no country', 'POST', '/api/register', { body: { ...reg('NoLand', 'organic', 'laut', 'NOLAND1'), country: undefined }, ip: '2.2.2.2' });
  await call('register country XK not ISO', 'POST', '/api/register', { body: reg('NoLand', 'organic', 'laut', 'NOLAND1', '482916', { country: 'XK' }), ip: '2.2.2.2' });
  await call('register country XX unknown', 'POST', '/api/register', { body: reg('NoLand', 'organic', 'laut', 'NOLAND1', '482916', { country: 'XX' }), ip: '2.2.2.2' });
  await call('register country too long', 'POST', '/api/register', { body: reg('NoLand', 'organic', 'laut', 'NOLAND1', '482916', { country: 'MYS' }), ip: '2.2.2.2' });
  await call('register A', 'POST', '/api/register', { body: reg('Gecko One', 'organic', 'puakumbu', 'PTK-TOKAY88', '482916', { remember: true }), who: 'A', ip: '2.2.2.2' });
  await call('register look-alike taken', 'POST', '/api/register', { body: reg('Copycat', 'organic', 'hijau', 't0kay88'), ip: '2.2.2.2' });
  await call('code check taken', 'GET', '/api/code/check?code=PTK-TOKAY88', { ip: '2.2.2.2' });
  await call('register B', 'POST', '/api/register', { body: reg('Robo Two', 'robot', 'laut', 'rimba21', '730154', { remember: false }), who: 'B', ip: '3.3.3.3' });
  await call('register C', 'POST', '/api/register', { body: reg('Cee', 'organic', 'hijau', 'ptk bukitku', '664201', { remember: true, country: 'id' }), who: 'C', ip: '4.4.4.4' });
  await call('register D', 'POST', '/api/register', { body: reg('Dee', 'robot', 'tokay', 'DEEROBOT', '901347', { remember: true, country: 'SG' }), who: 'D', ip: '5.5.5.5' });
  for (let i = 0; i < 6; i++) await call('register burst ' + i, 'POST', '/api/register', { body: reg('Burst' + i, 'organic', 'laut', 'BURST00' + i), who: 'burst' + i, ip: '9.9.9.9' }); // 6th is rate limited

  T += 1 * H;
  await call('get pet A', 'GET', '/api/pet', { who: 'A' });
  for (let i = 0; i < 2; i++) await call('care A feed ' + i, 'POST', '/api/care', { who: 'A', body: { action: 'feed' }, ip: '2.2.2.2' }); // only the first feed of the day pays
  for (const a of ['shed', 'bask', 'play']) await call('care A ' + a, 'POST', '/api/care', { who: 'A', body: { action: a }, ip: '2.2.2.2' }); // 2 more pay; the 4th type pays 0 (30/day)
  await call('care A bad', 'POST', '/api/care', { who: 'A', body: { action: 'nope' }, ip: '2.2.2.2' });
  await call('palette A locked', 'POST', '/api/palette', { who: 'A', body: { palette: 'tokay' }, ip: '2.2.2.2' });
  await call('palette no session', 'POST', '/api/palette', { body: { palette: 'laut' }, ip: '2.2.2.2' });
  await call('checkin A', 'POST', '/api/checkin', { who: 'A', ip: '2.2.2.2' });
  await call('checkin A again', 'POST', '/api/checkin', { who: 'A', ip: '2.2.2.2' });
  await call('shop A', 'GET', '/api/shop', { who: 'A', ip: '2.2.2.2' });
  await call('buy A too dear', 'POST', '/api/shop/buy', { who: 'A', body: { item: 'terendak' }, ip: '2.2.2.2' });
  await call('buy A headband', 'POST', '/api/shop/buy', { who: 'A', body: { item: 'ikat-manik' }, ip: '2.2.2.2' });
  await call('buy A unknown', 'POST', '/api/shop/buy', { who: 'A', body: { item: 'crown' }, ip: '2.2.2.2' });
  await call('equip A wrong slot', 'POST', '/api/equip', { who: 'A', body: { slot: 'neck', item: 'ikat-manik' }, ip: '2.2.2.2' });
  await call('equip A not owned', 'POST', '/api/equip', { who: 'A', body: { slot: 'back', item: 'payung' }, ip: '2.2.2.2' });
  await call('unequip A head', 'POST', '/api/equip', { who: 'A', body: { slot: 'head', item: null }, ip: '2.2.2.2' });
  await call('equip A head', 'POST', '/api/equip', { who: 'A', body: { slot: 'head', item: 'ikat-manik' }, ip: '2.2.2.2' });
  await call('care B charge', 'POST', '/api/care', { who: 'B', body: { action: 'charge' }, ip: '3.3.3.3' });

  // PIN login, lock after 5 wrong PINs, change PIN
  await call('logout A', 'POST', '/api/logout', { who: 'A' });
  await call('pet after logout', 'GET', '/api/pet', { who: 'A' });
  await call('login A', 'POST', '/api/login', { body: { code: 'ptk-tokay88', pin: '482916', remember: false }, who: 'A2', ip: '2.2.2.2' });
  await call('login look-alike code', 'POST', '/api/login', { body: { code: 'T0KAY88', pin: '482916' }, who: 'A3', ip: '2.2.2.2' });
  await call('login bad code', 'POST', '/api/login', { body: { code: 'not a code', pin: '482916' }, ip: '6.6.6.6' });
  await call('login unknown code', 'POST', '/api/login', { body: { code: 'NOBODY99', pin: '482916' }, ip: '6.6.6.6' });
  await call('login bad pin shape', 'POST', '/api/login', { body: { code: 'RIMBA21', pin: '12' }, ip: '6.6.6.6' });
  for (let i = 0; i < 6; i++) await call('login B wrong ' + i, 'POST', '/api/login', { body: { code: 'RIMBA21', pin: '000001' }, ip: '6.6.6.6' }); // 5th locks, 6th is refused
  await call('login B right while locked', 'POST', '/api/login', { body: { code: 'RIMBA21', pin: '730154' }, ip: '6.6.6.6' });
  T += 16 * 60 * 1000;
  await call('login B after lock', 'POST', '/api/login', { body: { code: 'RIMBA21', pin: '730154' }, who: 'B2', ip: '6.6.6.6' });
  for (let i = 0; i < 21; i++) await call('login flood ' + i, 'POST', '/api/login', { body: { code: 'NOBODY99', pin: '111111' }, ip: '7.7.7.7' }); // 21st is rate limited
  await call('pin change wrong old', 'POST', '/api/pin', { who: 'A2', body: { oldPin: '000000', newPin: '559203' }, ip: '2.2.2.2' });
  await call('pin change weak new', 'POST', '/api/pin', { who: 'A2', body: { oldPin: '482916', newPin: '111111' }, ip: '2.2.2.2' });
  await call('pin change ok', 'POST', '/api/pin', { who: 'A2', body: { oldPin: '482916', newPin: '559203' }, ip: '2.2.2.2' });
  await call('A3 signed out by pin change', 'GET', '/api/pet', { who: 'A3' });
  await call('login A old pin', 'POST', '/api/login', { body: { code: 'TOKAY88', pin: '482916' }, ip: '2.2.2.2' });
  await call('login A new pin', 'POST', '/api/login', { body: { code: 'TOKAY88', pin: '559203' }, who: 'A3', ip: '2.2.2.2' });

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
  await call('get pet B mid', 'GET', '/api/pet', { who: 'B' }); // tier reward paid on view
  T += 12 * H; await cron('hourly again', '5 * * * *');

  // daily cron: deaths, session and rate-limit cleanup, alert cleanup
  T += 60 * H; await cron('daily', '0 18 * * *');
  await call('get pet after daily A', 'GET', '/api/pet', { who: 'A2' });
  await call('get pet after daily B', 'GET', '/api/pet', { who: 'B' });
  await call('care after death B', 'POST', '/api/care', { who: 'B', body: { action: 'charge' }, ip: '3.3.3.3' });
  await call('checkin dead B', 'POST', '/api/checkin', { who: 'B2', ip: '3.3.3.3' });
  T += 400 * H; await cron('daily late', '0 18 * * *');
  await call('get pet C late', 'GET', '/api/pet', { who: 'C' });

  // Phase 2A: compressed tiers, care days and Ascension (Tier 8, Day 90 soft cap); 2C: coins along the way
  await call('register E', 'POST', '/api/register', { body: reg('Elder', 'organic', 'kenyalang', 'KINABALU', '318275', { remember: true }), who: 'E', ip: '8.8.8.8' });
  await call('ascend E unconfirmed', 'POST', '/api/ascend', { who: 'E', body: {}, ip: '8.8.8.8' });
  await call('ascend E too young', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  for (let d = 1; d <= 93; d++) {
    T += (d % 7 === 0 ? 20 : 24) * H; // daily care, with a few short gaps that land on the same UTC day
    if (d % 25 === 0) await call('login E day ' + d, 'POST', '/api/login', { body: { code: 'KINABALU', pin: '318275', remember: true }, who: 'E', ip: '8.8.8.8' }); // 30-day session
    const r = await call('care E day ' + d, 'POST', '/api/care', { who: 'E', body: { action: ['feed', 'shed', 'bask', 'play'][d % 4] }, ip: '8.8.8.8' });
    if (d % 10 !== 3) await call('checkin E day ' + d, 'POST', '/api/checkin', { who: 'E', ip: '8.8.8.8' }); // streak breaks now and then
    if (d % 15 === 0) log.push({ label: 'tier E day ' + d, t: T, tier: r.pet.tier, tierName: r.pet.tierName, careDays: r.pet.careDays, coins: r.me.coins });
  }

  // 2C social block: E is Tier 8 and rich; F (invited by E) and G are new.
  await call('title route removed', 'POST', '/api/title', { who: 'E', body: { title: 'Pendekar Rimba' }, ip: '8.8.8.8' });
  await call('buy E wings', 'POST', '/api/shop/buy', { who: 'E', body: { item: 'sayap-kelip' }, ip: '8.8.8.8' });
  await call('buy E backdrop', 'POST', '/api/shop/buy', { who: 'E', body: { item: 'bg-rajang' }, ip: '8.8.8.8' });
  await call('buy E wings again', 'POST', '/api/shop/buy', { who: 'E', body: { item: 'sayap-kelip' }, ip: '8.8.8.8' });
  await call('register F self-invite', 'POST', '/api/register', { body: reg('Fifi', 'robot', 'tokay', 'FIFI2026', '274615', { ref: 'PTK-KINABALU', remember: true }), who: 'F0', ip: '8.8.8.8' }); // same network: no invite
  await call('register F invited', 'POST', '/api/register', { body: reg('Fafa', 'robot', 'tokay', 'FAFA2026', '274615', { ref: 'kinabalu', remember: true, country: 'ZZ' }), who: 'F', ip: '10.0.0.1' });
  await call('register G', 'POST', '/api/register', { body: reg('Gigi', 'organic', 'laut', 'GIGIPTK', '583920', { remember: true }), who: 'G', ip: '10.0.0.2' });
  await call('care F early', 'POST', '/api/care', { who: 'F', body: { action: 'charge' }, ip: '10.0.0.1' });
  await call('visit G from E', 'GET', '/api/visit?code=GIGIPTK', { who: 'E', ip: '8.8.8.8' });
  await call('visit unknown', 'GET', '/api/visit?code=ZZZZZZ', { who: 'E', ip: '8.8.8.8' });
  await call('battle E vs egg G', 'POST', '/api/battle', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('battle E self', 'POST', '/api/battle', { who: 'E', body: { to: 'KINABALU' }, ip: '8.8.8.8' });
  for (let i = 0; i < 3; i++) await call('gift E to G ' + i, 'POST', '/api/gift', { who: 'E', body: { to: 'GIGIPTK', item: ['rantai-manik', 'terendak', 'payung'][i] }, ip: '8.8.8.8' });
  await call('gift E to G owned', 'POST', '/api/gift', { who: 'E', body: { to: 'GIGIPTK', item: 'terendak' }, ip: '8.8.8.8' });
  await call('gift E to self', 'POST', '/api/gift', { who: 'E', body: { to: 'KINABALU', item: 'ikat-manik' }, ip: '8.8.8.8' });
  await call('gift G poor', 'POST', '/api/gift', { who: 'G', body: { to: 'KINABALU', item: 'payung' }, ip: '10.0.0.2' });
  await call('pamper E to G', 'POST', '/api/pamper', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('pamper E to G again', 'POST', '/api/pamper', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('pamper E to F', 'POST', '/api/pamper', { who: 'E', body: { to: 'FAFA2026' }, ip: '8.8.8.8' });
  await call('pamper G to E', 'POST', '/api/pamper', { who: 'G', body: { to: 'KINABALU' }, ip: '10.0.0.2' });
  await call('report G name of E', 'POST', '/api/report', { who: 'G', body: { target: 'KINABALU', field: 'name' }, ip: '10.0.0.2' });
  await call('report F name of E', 'POST', '/api/report', { who: 'F', body: { target: 'KINABALU', field: 'name' }, ip: '10.0.0.1' });
  await call('report title field refused', 'POST', '/api/report', { who: 'G', body: { target: 'KINABALU', field: 'title' }, ip: '10.0.0.2' });
  await call('report self', 'POST', '/api/report', { who: 'E', body: { target: 'KINABALU', field: 'name' }, ip: '8.8.8.8' });
  await call('public E hidden', 'GET', '/api/public?code=KINABALU', { ip: '11.0.0.1' });
  await call('admin no token', 'GET', '/api/admin/reports', { ip: '12.0.0.1' });
  await call('admin wrong token', 'GET', '/api/admin/reports', { ip: '12.0.0.1', auth: 'Bearer nope' });
  const reps = await call('admin reports', 'GET', '/api/admin/reports', { ip: '12.0.0.1', auth: 'Bearer regression-admin-token' });
  await call('admin approve name', 'POST', '/api/admin/resolve', { ip: '12.0.0.1', auth: 'Bearer regression-admin-token', body: { id: reps.reports[0].id, decision: 'approve' } });
  await call('admin again', 'POST', '/api/admin/resolve', { ip: '12.0.0.1', auth: 'Bearer regression-admin-token', body: { id: reps.reports[0].id, decision: 'approve' } });
  await call('report approved name again', 'POST', '/api/report', { who: 'G', body: { target: 'KINABALU', field: 'name' }, ip: '10.0.0.2' });
  await call('public E after review', 'GET', '/api/public?code=PTK-KINABALU', { ip: '11.0.0.1' });
  await call('public page E', 'GET', '/p/PTK-KINABALU', { ip: '11.0.0.1' });
  await call('public page unknown', 'GET', '/p/PTK-NOBODY99', { ip: '11.0.0.1' });

  // Tangkap Kelip-kelip
  const run1 = await call('game start E', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 1000;
  await call('game finish too fast', 'POST', '/api/game/finish', { who: 'E', body: { run: run1.run, score: 20 }, ip: '8.8.8.8' });
  await call('game finish closed', 'POST', '/api/game/finish', { who: 'E', body: { run: run1.run, score: 20 }, ip: '8.8.8.8' });
  const run2 = await call('game start E 2', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 45_000;
  await call('game finish implausible', 'POST', '/api/game/finish', { who: 'E', body: { run: run2.run, score: 999 }, ip: '8.8.8.8' });
  const run3 = await call('game start E 3', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 46_000;
  await call('game finish E 3', 'POST', '/api/game/finish', { who: 'E', body: { run: run3.run, score: 87 }, ip: '8.8.8.8' });
  // 20 Oct 2026 rules: score counts golden fireflies and combo; coins come from fireflies caught.
  const run3b = await call('game start E combo', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 12_000;
  await call('game finish E score below fireflies', 'POST', '/api/game/finish', { who: 'E', body: { run: run3b.run, score: 10, fireflies: 20 }, ip: '8.8.8.8' });
  const run3c = await call('game start E combo 2', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 12_000;
  await call('game finish E score over golden x combo', 'POST', '/api/game/finish', { who: 'E', body: { run: run3c.run, score: 900, fireflies: 40 }, ip: '8.8.8.8' });
  const run3d = await call('game start E combo 3', 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
  T += 12_000;
  await call('game finish E combo ok', 'POST', '/api/game/finish', { who: 'E', body: { run: run3d.run, score: 112, fireflies: 31 }, ip: '8.8.8.8' });
  const run4 = await call('game start G', 'POST', '/api/game/start', { who: 'G', ip: '10.0.0.2' });
  T += 45_000;
  await call('game finish G wrong owner', 'POST', '/api/game/finish', { who: 'E', body: { run: run4.run, score: 10 }, ip: '8.8.8.8' });
  await call('game finish G', 'POST', '/api/game/finish', { who: 'G', body: { run: run4.run, score: 140 }, ip: '10.0.0.2' });
  for (let i = 0; i < 3; i++) { // daily cap of 50 coins from the game
    const r = await call('game start E more ' + i, 'POST', '/api/game/start', { who: 'E', ip: '8.8.8.8' });
    T += 45_000;
    await call('game finish E more ' + i, 'POST', '/api/game/finish', { who: 'E', body: { run: r.run, score: 120 }, ip: '8.8.8.8' });
  }
  await call('leaderboard day', 'GET', '/api/leaderboard', { who: 'E', ip: '8.8.8.8' });
  await call('leaderboard all', 'GET', '/api/leaderboard?period=all', { ip: '11.0.0.1' });

  // Country: one-time choice for a pet that hatched before countries (country not set), filters, sorting, median board
  await call('login B for board', 'POST', '/api/login', { body: { code: 'RIMBA21', pin: '730154', remember: true }, who: 'Bg', ip: '3.3.3.3' });
  await env.DB.prepare("UPDATE pet SET country = NULL WHERE call_code = 'PTK-RIMBA21'").run();
  await call('leaderboard mine without country', 'GET', '/api/leaderboard?scope=mine', { who: 'Bg', ip: '3.3.3.3' });
  await call('country B bad', 'POST', '/api/country', { who: 'Bg', body: { country: 'XK' }, ip: '3.3.3.3' });
  await call('country B no session', 'POST', '/api/country', { body: { country: 'MY' }, ip: '3.3.3.3' });
  await call('country B set once', 'POST', '/api/country', { who: 'Bg', body: { country: 'my' }, ip: '3.3.3.3' });
  await call('country B locked', 'POST', '/api/country', { who: 'Bg', body: { country: 'SG' }, ip: '3.3.3.3' });
  await call('country E locked', 'POST', '/api/country', { who: 'E', body: { country: 'SG' }, ip: '8.8.8.8' });
  await call('leaderboard mine undisclosed F', 'GET', '/api/leaderboard?scope=mine', { who: 'F', ip: '10.0.0.1' });
  await call('leaderboard mine no session', 'GET', '/api/leaderboard?scope=mine', { ip: '11.0.0.1' });
  await call('leaderboard bad scope', 'GET', '/api/leaderboard?scope=planet', { ip: '11.0.0.1' });
  await call('leaderboard bad country', 'GET', '/api/leaderboard?scope=country&country=XK', { ip: '11.0.0.1' });
  await call('leaderboard country missing', 'GET', '/api/leaderboard?scope=country', { ip: '11.0.0.1' });
  await call('leaderboard bad sort', 'GET', '/api/leaderboard?sort=luck', { ip: '11.0.0.1' });
  await call('leaderboard mine E', 'GET', '/api/leaderboard?scope=mine&period=all', { who: 'E', ip: '8.8.8.8' });
  await call('leaderboard country SG empty', 'GET', '/api/leaderboard?scope=country&country=sg', { ip: '11.0.0.1' });
  await call('countries board (E and G only)', 'GET', '/api/leaderboard/countries?period=all', { who: 'E', ip: '8.8.8.8' });
  for (const [who, name, code, ip, country] of [['H', 'Hana', 'HANA2026', '13.0.0.1', 'MY'], ['I', 'Ivan', 'IVAN2026', '13.0.0.2', 'MY'], ['J', 'Jaya', 'JAYA2026', '13.0.0.3', 'SG']]) {
    await call('register ' + who, 'POST', '/api/register', { body: reg(name, 'organic', 'laut', code, '604815', { remember: true, country }), who, ip });
  }
  const play = async (who, ip, score) => {
    const r = await call('game start ' + who, 'POST', '/api/game/start', { who, ip });
    T += 45_000;
    await call('game finish ' + who, 'POST', '/api/game/finish', { who, body: { run: r.run, score }, ip });
  };
  await play('H', '13.0.0.1', 60);
  const third = await call('countries board all, 3 players', 'GET', '/api/leaderboard/countries?period=all', { who: 'E', ip: '8.8.8.8' });
  expect('median of an odd count', third.rows, [{ rank: 1, country: 'MY', players: 3, median: 120 }]);
  await play('I', '13.0.0.2', 75);
  await play('J', '13.0.0.3', 200);
  const fourth = await call('countries board all, 4 players', 'GET', '/api/leaderboard/countries?period=all', { who: 'E', ip: '8.8.8.8' });
  expect('median of an even count (SG has 1 player, not listed)', fourth.rows, [{ rank: 1, country: 'MY', players: 4, median: 97.5 }]);
  await call('leaderboard mine H today', 'GET', '/api/leaderboard?scope=mine', { who: 'H', ip: '13.0.0.1' }); // rank among today's MY players
  await call('leaderboard country SG today', 'GET', '/api/leaderboard?scope=country&country=SG', { who: 'J', ip: '13.0.0.3' });
  await call('countries board day', 'GET', '/api/leaderboard/countries', { ip: '11.0.0.1' });
  await call('leaderboard country MY by score', 'GET', '/api/leaderboard?scope=country&country=MY&period=all', { who: 'Bg', ip: '3.3.3.3' });
  await call('leaderboard country MY by age', 'GET', '/api/leaderboard?scope=country&country=MY&period=all&sort=age', { ip: '11.0.0.1' });
  await call('leaderboard country MY recent', 'GET', '/api/leaderboard?scope=country&country=MY&period=all&sort=recent', { ip: '11.0.0.1' });
  await call('leaderboard global recent', 'GET', '/api/leaderboard?sort=recent', { ip: '11.0.0.1' });
  await call('public B shows country', 'GET', '/api/public?code=RIMBA21', { ip: '11.0.0.1' });

  // Invite reward after F's first day; battles once everyone has hatched
  T += 25 * H;
  await call('care E next day', 'POST', '/api/care', { who: 'E', body: { action: 'feed' }, ip: '8.8.8.8' });
  await call('care F after a day (invite paid)', 'POST', '/api/care', { who: 'F', body: { action: 'charge' }, ip: '10.0.0.1' });
  await call('care F again', 'POST', '/api/care', { who: 'F', body: { action: 'oil' }, ip: '10.0.0.1' });
  await call('care G', 'POST', '/api/care', { who: 'G', body: { action: 'play' }, ip: '10.0.0.2' });
  for (let i = 0; i < 6; i++) await call('battle E vs G ' + i, 'POST', '/api/battle', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' }); // 6th over the daily cap
  await call('battle G vs E', 'POST', '/api/battle', { who: 'G', body: { to: 'KINABALU' }, ip: '10.0.0.2' });
  await call('pet G news', 'GET', '/api/pet', { who: 'G' });
  const gnews = await call('pet G news again', 'GET', '/api/pet', { who: 'G' });
  await call('events seen G', 'POST', '/api/events/seen', { who: 'G', body: { upTo: gnews.me.events[0].id }, ip: '10.0.0.2' });
  await call('pet G after seen', 'GET', '/api/pet', { who: 'G' });
  await call('pet E news', 'GET', '/api/pet', { who: 'E' });

  // 20 Oct 2026 alignment: Bond, Friends (contacts, block), Open to challenges, Mentor Boost
  await call('visit G from E (bond)', 'GET', '/api/visit?code=GIGIPTK', { who: 'E', ip: '8.8.8.8' });
  await call('contact E save G', 'POST', '/api/contact', { who: 'E', body: { code: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('contact E save G again', 'POST', '/api/contact', { who: 'E', body: { code: 'gigiptk' }, ip: '8.8.8.8' });
  await call('contact E save F', 'POST', '/api/contact', { who: 'E', body: { code: 'FAFA2026' }, ip: '8.8.8.8' });
  await call('contact E self', 'POST', '/api/contact', { who: 'E', body: { code: 'KINABALU' }, ip: '8.8.8.8' });
  await call('friends E', 'GET', '/api/friends', { who: 'E', ip: '8.8.8.8' });
  await call('block E blocks F', 'POST', '/api/block', { who: 'E', body: { code: 'FAFA2026' }, ip: '8.8.8.8' });
  await call('friends E after block', 'GET', '/api/friends', { who: 'E', ip: '8.8.8.8' });
  await call('pamper F to E blocked (silent)', 'POST', '/api/pamper', { who: 'F', body: { to: 'KINABALU' }, ip: '10.0.0.1' });
  await call('gift E to F blocked by me', 'POST', '/api/gift', { who: 'E', body: { to: 'FAFA2026', item: 'ikat-manik' }, ip: '8.8.8.8' });
  await call('contact E save blocked F', 'POST', '/api/contact', { who: 'E', body: { code: 'FAFA2026' }, ip: '8.8.8.8' });
  await call('visit E from F (blocked)', 'GET', '/api/visit?code=KINABALU', { who: 'F', ip: '10.0.0.1' });
  await call('unblock E F', 'POST', '/api/block', { who: 'E', body: { code: 'FAFA2026', block: false }, ip: '8.8.8.8' });
  await call('challenges G bad', 'POST', '/api/challenges', { who: 'G', body: { open: 'no' }, ip: '10.0.0.2' });
  await call('challenges G closed', 'POST', '/api/challenges', { who: 'G', body: { open: false }, ip: '10.0.0.2' });
  await call('battle F vs closed G', 'POST', '/api/battle', { who: 'F', body: { to: 'GIGIPTK' }, ip: '10.0.0.1' });
  await call('challenges G open', 'POST', '/api/challenges', { who: 'G', body: { open: true }, ip: '10.0.0.2' });
  await call('mentor G to E (tier too low)', 'POST', '/api/mentor', { who: 'G', body: { to: 'KINABALU' }, ip: '10.0.0.2' });
  await call('mentor E to G', 'POST', '/api/mentor', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('mentor E to G again', 'POST', '/api/mentor', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('mentor E to self', 'POST', '/api/mentor', { who: 'E', body: { to: 'KINABALU' }, ip: '8.8.8.8' });
  T += 6 * H;
  await call('pet G mentored (slower decay)', 'GET', '/api/pet', { who: 'G' });
  await snap('after 2C social block');

  // Tangkap Kelip-kelip daily top 3: given by the daily cron after midnight Malaysia time
  await cron('daily badges', '0 18 * * *');
  await call('pet E badges', 'GET', '/api/pet', { who: 'E' });
  await call('public J badges', 'GET', '/api/public?code=JAYA2026', { ip: '11.0.0.1' });

  // Automatic hibernation: K is left alone past its 48 h window, sleeps instead of falling, wakes on care.
  await call('register K', 'POST', '/api/register', { body: reg('Kiki', 'organic', 'hijau', 'KIKI2026', '604815', { remember: true }), who: 'K', ip: '14.0.0.1' });
  T += 50 * H;
  await call('pet K hibernating', 'GET', '/api/pet', { who: 'K' });
  await call('care K wakes', 'POST', '/api/care', { who: 'K', body: { action: 'feed' }, ip: '14.0.0.1' });
  T += 60 * H + 2 * 24 * H + H; // past K's Tier 2 window (60 h) and the 2 hibernation days left this month
  await call('pet K fallen after hibernation', 'GET', '/api/pet', { who: 'K' });
  await call('legacy K too young', 'POST', '/api/legacy', { who: 'K', body: { pin: '604815', code: 'KIKIBARU', name: 'Kiki Two', type: 'organic', palette: 'laut' }, ip: '14.0.0.1' });
  await call('legacy E alive', 'POST', '/api/legacy', { who: 'E', body: { pin: '318275', code: 'ELDER2', name: 'Elder Two', type: 'robot', palette: 'tokay' }, ip: '8.8.8.8' });

  T += 25 * H; // dormant again
  await call('ascend E dormant', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('battle E dormant', 'POST', '/api/battle', { who: 'E', body: { to: 'GIGIPTK' }, ip: '8.8.8.8' });
  await call('care E wake', 'POST', '/api/care', { who: 'E', body: { action: 'play' }, ip: '8.8.8.8' });
  await call('ascend E ok', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('ascend E again', 'POST', '/api/ascend', { who: 'E', body: { confirm: true }, ip: '8.8.8.8' });
  await call('care E after ascension', 'POST', '/api/care', { who: 'E', body: { action: 'feed' }, ip: '8.8.8.8' });
  await call('palette E after ascension', 'POST', '/api/palette', { who: 'E', body: { palette: 'kenyalang' }, ip: '8.8.8.8' });
  await call('gift to ascended E', 'POST', '/api/gift', { who: 'G', body: { to: 'KINABALU', item: 'ikat-manik' }, ip: '10.0.0.2' });
  // Legacy Egg after Ascension
  await call('legacy E wrong pin', 'POST', '/api/legacy', { who: 'E', body: { pin: '111222', code: 'ELDER2', name: 'Elder Two', type: 'robot', palette: 'tokay' }, ip: '8.8.8.8' });
  await call('legacy E taken code', 'POST', '/api/legacy', { who: 'E', body: { pin: '318275', code: 'GIGIPTK', name: 'Elder Two', type: 'robot', palette: 'tokay' }, ip: '8.8.8.8' });
  await call('legacy E blocked name', 'POST', '/api/legacy', { who: 'E', body: { pin: '318275', code: 'ELDER2', name: 'Sultan', type: 'robot', palette: 'tokay' }, ip: '8.8.8.8' });
  jar.set('E2', jar.get('E')); // E2 starts on the old pet's session; the claim moves it to the new pet
  await call('legacy E ok', 'POST', '/api/legacy', { who: 'E2', body: { pin: '318275', code: 'ELDER2', name: 'Elder Two', type: 'robot', palette: 'tokay', remember: true }, ip: '8.8.8.8' });
  await call('legacy E again', 'POST', '/api/legacy', { who: 'E', body: { pin: '318275', code: 'ELDER3', name: 'Elder Three', type: 'robot', palette: 'tokay' }, ip: '8.8.8.8' });
  await call('pet E2 legacy egg', 'GET', '/api/pet', { who: 'E2' });
  T += 400 * H; await cron('daily after ascension', '0 18 * * *'); // 400 h > Tier 8 survival window: an ascended pet must not fall
  await call('login E after ascension', 'POST', '/api/login', { body: { code: 'KINABALU', pin: '318275', remember: false }, who: 'E', ip: '8.8.8.8' });
}

// ---- the country list: ISO 3166-1 only, every entry has a name and a local flag ----
async function checkCountries() {
  const c = await import(pathToFileURL(path.join(SRC, 'countries.js')).href);
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  expect('249 ISO 3166-1 alpha-2 codes', c.COUNTRIES.length, 249);
  expect('codes are unique capitals', new Set(c.COUNTRIES).size === 249 && c.COUNTRIES.every((x) => /^[A-Z]{2}$/.test(x)), true);
  const noFlag = c.COUNTRIES.filter((x) => !existsSync(path.join(ROOT, 'public', 'assets', 'flags', x.toLowerCase() + '.svg')));
  expect('every country has a local flag file', noFlag, []);
  expect('every country has a display name', c.COUNTRIES.filter((x) => !names.of(x) || names.of(x) === x), []);
  expect('XK, XX, T1 and ZZ are not countries', ['XK', 'XX', 'T1', 'ZZ'].filter((x) => c.COUNTRIES.includes(x)), []);
  expect('choice accepts ISO, ZZ and lowercase', [c.countryChoice('my'), c.countryChoice(' ZZ '), c.countryChoice('XK'), c.countryChoice('MYS'), c.countryChoice(null)], ['MY', 'ZZ', null, null, null]);
  expect('suggestion ignores non-countries', [c.suggestedCountry({ cf: { country: 'ID' } }), c.suggestedCountry({ cf: { country: 'T1' } }), c.suggestedCountry({ cf: { country: 'XX' } }), c.suggestedCountry({})], ['ID', null, null, null]);
  expect('threshold is 3 players', c.MIN_COUNTRY_PLAYERS, 3);
}

// ---- run, mask throwaway keys, compare ----
let failed = false;
try {
  await checkCountries();
  await scenario();
  const dump = {};
  for (const [t, order] of [...TABLES, ['rate_limits', 'bucket']]) {
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
