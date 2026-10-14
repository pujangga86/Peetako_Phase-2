// Peetako data layer — the ONLY file that talks to the database.
//
// index.js (routes, cron) and push.js (care alerts) call these functions and never write SQL.
// To change where data lives (sharded D1, Durable Objects, Postgres via Hyperdrive, DynamoDB),
// replace the bodies below and keep the signatures; game logic and routes stay untouched.
//
// Everything is keyed by the pet: id, call_code, key_hash or session token hash. No function joins
// one pet's data to another's, so a pet can later move to its own Durable Object or shard.
//
// SQLite-specific syntax used here (translate if the engine changes): ON CONFLICT ... DO UPDATE,
// RETURNING, INSERT OR IGNORE, json_each.

// ---------- errors ----------
export function isUniqueViolation(e) {
  return String(e && e.message).includes('UNIQUE');
}

// ---------- rate limits ----------
// Fixed-window counter. Returns the count for this bucket after counting this hit.
export async function rateLimitHit(env, bucket, expiresAt) {
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(bucket, expiresAt).first();
  return row.count;
}

// ---------- pets ----------
// Creates a pet and returns the full row. Throws a unique violation (see isUniqueViolation)
// when the call code or key hash already exists.
export async function createPet(env, { callCode, keyHash, name, type, palette, now, stats }) {
  return env.DB.prepare(
    `INSERT INTO pet (call_code, key_hash, name, type, born_at, last_cared_at, stats_at, energy, health, temperature, mood, tier, palette)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?5, ?6, ?7, ?8, ?9, 0, ?10) RETURNING *`
  ).bind(callCode, keyHash, name, type, now, stats.energy, stats.health, stats.temperature, stats.mood, palette).first();
}

export async function petByKeyHash(env, keyHash) {
  return env.DB.prepare('SELECT * FROM pet WHERE key_hash = ?1').bind(keyHash).first();
}

// Persists the fields that change while a pet is cared for.
export async function savePet(env, p) {
  await env.DB.prepare(
    `UPDATE pet SET last_cared_at=?1, stats_at=?2, energy=?3, health=?4, temperature=?5, mood=?6, tier=?7, died_at=?8,
       care_days=?9, last_care_day=?10 WHERE id=?11`
  ).bind(p.last_cared_at, p.stats_at, p.energy, p.health, p.temperature, p.mood, p.tier, p.died_at ?? null,
    p.care_days ?? 0, p.last_care_day ?? null, p.id).run();
}

// Ascension is a one-way switch: the WHERE clause refuses a pet that has already ascended or fallen.
export async function saveAscension(env, p) {
  const r = await env.DB.prepare(
    `UPDATE pet SET ascended_at=?1, legacy_score=?2, stats_at=?3
      WHERE id=?4 AND ascended_at IS NULL AND died_at IS NULL`
  ).bind(p.ascended_at, p.legacy_score, p.stats_at, p.id).run();
  return r.meta.changes === 1;
}

// ---------- sessions ----------
// The pet behind a live session, or null when the token is unknown or expired.
export async function petBySession(env, tokenHash, now) {
  const row = await env.DB.prepare(
    `SELECT pet.* FROM sessions JOIN pet ON pet.id = sessions.pet_id
     WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2`
  ).bind(tokenHash, now).first();
  return row || null;
}

export async function createSession(env, { tokenHash, petId, createdAt, expiresAt }) {
  await env.DB.prepare('INSERT INTO sessions (token_hash, pet_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(tokenHash, petId, createdAt, expiresAt).run();
}

export async function deleteSession(env, tokenHash) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(tokenHash).run();
}

// ---------- care-alert subscriptions ----------
// A device follows whichever pet it last opened. Also starts alert bookkeeping for the pet
// (without announcing the tier it already has) and keeps only the newest `maxDevices` devices.
export async function saveSubscription(env, { petId, sub, tz, now, cycleAt, tierSent, maxDevices }) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, pet_id, p256dh, auth, tz, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(endpoint) DO UPDATE SET pet_id = excluded.pet_id, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz`
    ).bind(sub.endpoint, petId, sub.keys.p256dh, sub.keys.auth, tz, now),
    env.DB.prepare('INSERT OR IGNORE INTO notify_state (pet_id, cycle_at, tier_sent) VALUES (?1, ?2, ?3)')
      .bind(petId, cycleAt, tierSent),
    env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE pet_id = ?1 AND endpoint NOT IN
         (SELECT endpoint FROM push_subscriptions WHERE pet_id = ?1 ORDER BY created_at DESC LIMIT ?2)`
    ).bind(petId, maxDevices),
  ]);
}

export async function deleteSubscription(env, { endpoint, petId }) {
  await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND pet_id = ?2').bind(endpoint, petId).run();
}

// ---------- hourly alert run ----------
// Living pets that have at least one subscribed device, each with its alert bookkeeping columns
// (cycle_at, dormant_sent, urgent_sent, last_sent, tier_sent; null when none yet).
export async function petsWithAlerts(env) {
  const { results } = await env.DB.prepare(
    `SELECT pet.*, ns.cycle_at, ns.dormant_sent, ns.urgent_sent, ns.last_sent, ns.tier_sent
       FROM pet LEFT JOIN notify_state ns ON ns.pet_id = pet.id
      WHERE pet.died_at IS NULL AND pet.ascended_at IS NULL AND pet.id IN (SELECT pet_id FROM push_subscriptions)`
  ).all();
  return results;
}

export async function subscriptionsForPets(env, petIds) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM push_subscriptions WHERE pet_id IN (SELECT value FROM json_each(?1))`
  ).bind(JSON.stringify(petIds)).all();
  return results;
}

// Records what happened to one pet's alert in a single write:
//   deliveries: [{ endpoint, ok: true } | { endpoint, gone: true }] in send order
//   notify:     { petId, cycleAt, dormant, urgent, last, tier } or null when nothing was delivered
export async function savePushOutcome(env, { now, deliveries, notify }) {
  const writes = [];
  for (const d of deliveries) {
    if (d.ok) writes.push(env.DB.prepare('UPDATE push_subscriptions SET last_ok_at = ?1 WHERE endpoint = ?2').bind(now, d.endpoint));
    else if (d.gone) writes.push(env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(d.endpoint));
  }
  if (notify) {
    writes.push(env.DB.prepare(
      `INSERT INTO notify_state (pet_id, cycle_at, dormant_sent, urgent_sent, last_sent, tier_sent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(pet_id) DO UPDATE SET cycle_at = excluded.cycle_at, dormant_sent = excluded.dormant_sent,
         urgent_sent = excluded.urgent_sent, last_sent = excluded.last_sent, tier_sent = excluded.tier_sent`
    ).bind(notify.petId, notify.cycleAt, notify.dormant, notify.urgent, notify.last, notify.tier));
  }
  if (writes.length) await env.DB.batch(writes);
}

// ---------- daily cron ----------
// Living pets not cared for since `cutoff` (candidates for the death check).
export async function petsNotCaredSince(env, cutoff) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM pet WHERE died_at IS NULL AND ascended_at IS NULL AND last_cared_at < ?1'
  ).bind(cutoff).all();
  return results;
}

// Writes the pets that have died and clears expired sessions and rate-limit rows.
// `fallen` are advanced pet rows with died_at set. Writes go out in batches of 50.
export async function recordDeathsAndPurge(env, { fallen, now }) {
  const writes = fallen.map((p) => env.DB.prepare(
    'UPDATE pet SET stats_at=?1, energy=?2, health=?3, temperature=?4, mood=?5, tier=?6, died_at=?7 WHERE id=?8'
  ).bind(p.stats_at, p.energy, p.health, p.temperature, p.mood, p.tier, p.died_at, p.id));
  writes.push(env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now));
  writes.push(env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?1').bind(now));
  for (let i = 0; i < writes.length; i += 50) await env.DB.batch(writes.slice(i, i + 50));
}

// Fallen pets get no more alerts. Kept separate from recordDeathsAndPurge so the core cleanup
// still runs if migration 0002 (alert tables) has not been applied yet.
export async function purgeFallenAlerts(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_subscriptions WHERE pet_id IN (SELECT id FROM pet WHERE died_at IS NOT NULL OR ascended_at IS NOT NULL)'),
    env.DB.prepare('DELETE FROM notify_state WHERE pet_id IN (SELECT id FROM pet WHERE died_at IS NOT NULL OR ascended_at IS NOT NULL)'),
  ]);
}
