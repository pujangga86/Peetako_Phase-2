// Peetako care alerts over Web Push.
// Delivery: RFC 8030. Message encryption: RFC 8291 (aes128gcm). Server identity: RFC 8292 (VAPID).
// Uses only WebCrypto, so it runs on Workers without npm packages.
import { deathTime, tierAt, TIERS, HOUR, DORMANT_AFTER_HOURS } from './game.js';
import { petsWithAlerts, subscriptionsForPets, savePushOutcome } from './store.js';

const te = new TextEncoder();

// ---------- alert rules (tunable) ----------
export const URGENT_HOURS_LEFT = 12;   // "needs you" when this many hours of survival window remain
export const LAST_HOURS_LEFT = 3;      // "last chance" — always sent, even in quiet hours
export const QUIET_FROM = 22;          // local time, 22:00 ...
export const QUIET_UNTIL = 8;          // ... to 08:00: only "last chance" alerts go out
const PRIORITY = { last: 0, urgent: 1, dormant: 2, tier: 3 };
const DELIVERY = {                     // TTL = how long the push service may hold an undelivered alert
  last:    { ttl: 3 * 3600,  urgency: 'high',   topic: 'care' },
  urgent:  { ttl: 6 * 3600,  urgency: 'high',   topic: 'care' },
  dormant: { ttl: 12 * 3600, urgency: 'normal', topic: 'care' },
  tier:    { ttl: 24 * 3600, urgency: 'low',    topic: 'tier' },
};

// Push services we will deliver to. Anything else is refused at subscribe time,
// so the Worker can never be made to POST to arbitrary URLs.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

// ---------- base64url ----------
export function b64uEncode(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

// ---------- subscription validation ----------
export function validSubscription(s) {
  if (!s || typeof s.endpoint !== 'string' || s.endpoint.length > 1024) return false;
  let u;
  try { u = new URL(s.endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))) return false;
  try {
    const p = b64uDecode(s.keys?.p256dh || '');
    const a = b64uDecode(s.keys?.auth || '');
    return p.length === 65 && p[0] === 4 && a.length === 16;
  } catch { return false; }
}

export function validTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}

export function isQuietHour(tz, now) {
  let h = 12;
  try { h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(now)); } catch { /* keep midday */ }
  return h >= QUIET_FROM || h < QUIET_UNTIL;
}

// ---------- RFC 8291 encryption ----------
async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export async function encryptPayload(plaintext, p256dh, auth) {
  const uaPublic = b64uDecode(p256dh);
  const authSecret = b64uDecode(auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdh, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(te.encode(plaintext), new Uint8Array([2])); // 0x02 = last (only) record, no padding
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));

  const header = new Uint8Array(16 + 4 + 1 + 65);            // salt | record size | key id length | key id
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = 65;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

// ---------- RFC 8292 VAPID ----------
export async function vapidSigner(env) {
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  const jwk = { kty: 'EC', crv: 'P-256', d: env.VAPID_PRIVATE_KEY, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)) };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const cache = new Map(); // one signed token per push service per run
  return async (endpoint) => {
    const aud = new URL(endpoint).origin;
    if (!cache.has(aud)) {
      const head = b64uEncode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
      const claims = b64uEncode(te.encode(JSON.stringify({
        aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:hello@peetako.com',
      })));
      const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${head}.${claims}`));
      cache.set(aud, `vapid t=${head}.${claims}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`);
    }
    return cache.get(aud);
  };
}

export async function sendPush(sub, message, kind, sign) {
  const d = DELIVERY[kind];
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await sign(sub.endpoint),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(d.ttl),
      urgency: d.urgency,
      topic: d.topic,
    },
    body: await encryptPayload(JSON.stringify(message), sub.p256dh, sub.auth),
  });
  return res.status;
}

// ---------- what to send ----------
// row = pet joined with its notify_state columns (null if none yet).
export function pickAlert(row, now) {
  const deadline = deathTime(row);
  if (row.died_at || row.ascended_at || now >= deadline) return null;
  const fresh = row.cycle_at == null || row.cycle_at !== row.last_cared_at; // cared for since the last alert
  const sent = fresh ? { dormant: 0, urgent: 0, last: 0 } : { dormant: row.dormant_sent, urgent: row.urgent_sent, last: row.last_sent };
  const hoursLeft = (deadline - now) / HOUR;
  const sinceCare = (now - row.last_cared_at) / HOUR;
  const tier = tierAt(now - row.born_at);
  const tierSent = row.tier_sent ?? tier; // no state yet: treat the current tier as already announced

  if (hoursLeft <= LAST_HOURS_LEFT && !sent.last) return 'last';
  if (hoursLeft <= URGENT_HOURS_LEFT && !sent.urgent) return 'urgent';
  if (sinceCare >= DORMANT_AFTER_HOURS && !sent.dormant) return 'dormant';
  if (tier > tierSent) return 'tier';
  return null;
}

export function alertMessage(kind, pet, now) {
  const name = pet.name;
  const robot = pet.type === 'robot';
  const left = (deathTime(pet) - now) / HOUR;
  const base = { url: '/', tag: kind === 'tier' ? 'peetako-tier' : 'peetako-care' };
  if (kind === 'dormant') {
    return robot
      ? { ...base, title: `${name} switched to standby`, body: `No care for a day. Tap to power ${name} back up.` }
      : { ...base, title: `${name} has gone dormant`, body: `A whole day without care. Tap to wake ${name} up.` };
  }
  if (kind === 'urgent') {
    const h = Math.round(left);
    return { ...base, title: `${name} needs you`, body: `About ${h} hours left before ${name}'s survival window runs out.` };
  }
  if (kind === 'last') {
    const h = Math.max(1, Math.ceil(left));
    return { ...base, title: `Last chance for ${name}!`, body: `Under ${h} hour${h === 1 ? '' : 's'} left. Care for ${name} now or it will fall.` };
  }
  const t = tierAt(now - pet.born_at);
  return { ...base, title: `${name} is now a ${TIERS[t][pet.type]}!`, body: `Tier ${t} reached. New backdrop: ${TIERS[t].backdrop}.` };
}

// Flags after sending `kind`: a stronger alert implies the weaker care alerts are done too.
function nextState(row, kind, now) {
  const fresh = row.cycle_at == null || row.cycle_at !== row.last_cared_at;
  const s = {
    dormant: fresh ? 0 : row.dormant_sent, urgent: fresh ? 0 : row.urgent_sent, last: fresh ? 0 : row.last_sent,
    tier: row.tier_sent ?? tierAt(now - row.born_at),
  };
  if (kind === 'last') s.last = s.urgent = s.dormant = 1;
  if (kind === 'urgent') s.urgent = s.dormant = 1;
  if (kind === 'dormant') s.dormant = 1;
  if (kind === 'tier') s.tier = tierAt(now - row.born_at);
  return s;
}

// ---------- hourly run ----------
export async function pushRun(env, now = Date.now()) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { skipped: 'VAPID keys not set' };
  // Workers Free: 50 outgoing requests and 10 ms CPU per run, so keep each run small.
  let budget = Math.max(1, Number(env.PUSH_MAX_PER_RUN) || 20);

  const pets = await petsWithAlerts(env);
  const due = pets.map((row) => ({ row, kind: pickAlert(row, now) })).filter((x) => x.kind)
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  if (!due.length) return { due: 0, sent: 0 };

  const subs = await subscriptionsForPets(env, due.map((x) => x.row.id));
  const byPet = new Map();
  for (const s of subs) byPet.set(s.pet_id, [...(byPet.get(s.pet_id) || []), s]);

  const sign = await vapidSigner(env);
  let sent = 0, gone = 0, quiet = 0, failed = 0, deferred = 0;
  for (const { row, kind } of due) {
    const list = byPet.get(row.id) || [];
    if (!list.length) continue;
    if (kind !== 'last' && list.every((s) => isQuietHour(s.tz, now))) { quiet++; continue; }
    if (list.length > budget) { deferred++; continue; }
    budget -= list.length;

    const msg = alertMessage(kind, row, now);
    const deliveries = [];
    let delivered = false;
    for (const s of list) {
      let status = 0;
      try { status = await sendPush(s, msg, kind, sign); } catch (e) { console.error('push failed', e); }
      if (status >= 200 && status < 300) {
        delivered = true; sent++;
        deliveries.push({ endpoint: s.endpoint, ok: true });
      } else if (status === 404 || status === 410) {
        gone++; // the browser unsubscribed or the subscription expired
        deliveries.push({ endpoint: s.endpoint, gone: true });
      } else {
        failed++;
        console.warn(`push ${kind} to ${new URL(s.endpoint).hostname}: HTTP ${status}`);
      }
    }
    let notify = null;
    if (delivered) {
      const st = nextState(row, kind, now);
      notify = { petId: row.id, cycleAt: row.last_cared_at, dormant: st.dormant, urgent: st.urgent, last: st.last, tier: st.tier };
    }
    // Save after every pet: if the run is cut short (e.g. CPU limit), nobody gets the same alert twice.
    await savePushOutcome(env, { now, deliveries, notify });
    if (budget <= 0) break;
  }
  return { due: due.length, sent, gone, failed, quiet, deferred };
}
