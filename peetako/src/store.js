// Peetako data layer — the ONLY file that talks to the database.
//
// index.js (routes, cron), social.js (2C social and economy) and push.js (care alerts) call these
// functions and never write SQL. To change where data lives, replace the bodies below and keep the
// signatures; game logic and routes stay untouched.
//
// Phase 2C adds rows that link two pets (gifts, battles, Pamper, referrals, leaderboards). Those are
// written as small, separate statements keyed by pet id, so they can later move behind an API
// between shards.
//
// SQLite-specific syntax used here (translate if the engine changes): ON CONFLICT ... DO UPDATE,
// RETURNING, INSERT OR IGNORE, json_each, changes() inside a batch (a D1 batch runs as one transaction).

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
// when the Call Code (or its look-alike form) is already taken.
export async function createPet(env, { callCode, codeKey, pinHash, regIp, name, type, palette, country, now, stats, referredBy }) {
  return env.DB.prepare(
    `INSERT INTO pet (call_code, code_key, pin_hash, reg_ip, name, type, born_at, last_cared_at, stats_at,
       energy, health, temperature, mood, tier, palette, referred_by, country)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7, ?8, ?9, ?10, ?11, 0, ?12, ?13, ?14) RETURNING *`
  ).bind(callCode, codeKey, pinHash, regIp, name, type, now, stats.energy, stats.health, stats.temperature, stats.mood,
    palette, referredBy ?? null, country).first();
}

// The one-time country choice for a pet that hatched before countries existed. Returns true when it was
// set now, false when the pet already has a country (locked) or does not exist.
export async function setCountryOnce(env, petId, country) {
  const r = await env.DB.prepare('UPDATE pet SET country = ?1 WHERE id = ?2 AND country IS NULL').bind(country, petId).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function petByCodeKey(env, codeKey) {
  return env.DB.prepare('SELECT * FROM pet WHERE code_key = ?1').bind(codeKey).first();
}

export async function petById(env, id) {
  return env.DB.prepare('SELECT * FROM pet WHERE id = ?1').bind(id).first();
}

// Which of these look-alike keys are already taken.
export async function codeKeysTaken(env, keys) {
  const { results } = await env.DB.prepare(
    'SELECT code_key FROM pet WHERE code_key IN (SELECT value FROM json_each(?1))'
  ).bind(JSON.stringify(keys)).all();
  return new Set(results.map((r) => r.code_key));
}

// Persists the fields that change while a pet is cared for (never coins: those change atomically below).
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

// ---------- PIN ----------
export async function savePinFailure(env, id, { streak, day, count, lockedUntil }) {
  await env.DB.prepare('UPDATE pet SET pin_fail_streak=?1, pin_fail_day=?2, pin_fail_count=?3, pin_locked_until=?4 WHERE id=?5')
    .bind(streak, day, count, lockedUntil, id).run();
}
export async function savePinSuccess(env, id) {
  await env.DB.prepare('UPDATE pet SET pin_fail_streak=0 WHERE id=?1').bind(id).run();
}
export async function savePinHash(env, id, pinHash) {
  await env.DB.prepare('UPDATE pet SET pin_hash=?1, pin_fail_streak=0 WHERE id=?2').bind(pinHash, id).run();
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

// Changing the PIN signs out every other device of that pet.
export async function deleteOtherSessions(env, petId, keepTokenHash) {
  await env.DB.prepare('DELETE FROM sessions WHERE pet_id = ?1 AND token_hash <> ?2').bind(petId, keepTokenHash).run();
}

// ---------- coins and daily counters ----------
export async function dailyCounts(env, petId, day) {
  const { results } = await env.DB.prepare('SELECT kind, n FROM daily WHERE pet_id = ?1 AND day = ?2').bind(petId, day).all();
  return Object.fromEntries(results.map((r) => [r.kind, r.n]));
}

const dailyAdd = (env, petId, day, kind, n) => env.DB.prepare(
  `INSERT INTO daily (pet_id, day, kind, n) VALUES (?1, ?2, ?3, ?4)
   ON CONFLICT(pet_id, day, kind) DO UPDATE SET n = n + excluded.n`
).bind(petId, day, kind, n);

// Counts one event of `kind` for today (battles, Pampers, ...). Returns the new count.
export async function countDaily(env, petId, day, kind, n = 1) {
  const row = await env.DB.prepare(
    `INSERT INTO daily (pet_id, day, kind, n) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT(pet_id, day, kind) DO UPDATE SET n = n + excluded.n RETURNING n`
  ).bind(petId, day, kind, n).first();
  return row.n;
}

// Pays coins against a daily cap kept under `kind`. Returns the coins actually paid (0 at the cap).
export async function earnCapped(env, petId, day, kind, amount, cap) {
  const row = await env.DB.prepare('SELECT n FROM daily WHERE pet_id = ?1 AND day = ?2 AND kind = ?3').bind(petId, day, kind).first();
  const grant = Math.max(0, Math.min(amount, cap - (row ? row.n : 0)));
  if (grant > 0) {
    await env.DB.batch([
      dailyAdd(env, petId, day, kind, grant),
      env.DB.prepare('UPDATE pet SET coins = coins + ?1 WHERE id = ?2').bind(grant, petId),
    ]);
  }
  return grant;
}

export async function addCoins(env, petId, n) {
  await env.DB.prepare('UPDATE pet SET coins = coins + ?1 WHERE id = ?2').bind(n, petId).run();
}

// Tier-up reward: pays once per tier. Returns true when this call paid.
export async function payTierReward(env, petId, tier, coins) {
  const r = await env.DB.prepare('UPDATE pet SET coins = coins + ?1, tier_paid = ?2 WHERE id = ?3 AND tier_paid < ?2')
    .bind(coins, tier, petId).run();
  return r.meta.changes === 1;
}

// Daily check-in: once per MYT day. Returns true when this call checked in.
export async function checkIn(env, petId, { day, streak, coins }) {
  const r = await env.DB.prepare(
    `UPDATE pet SET checkin_day = ?1, streak = ?2, coins = coins + ?3
      WHERE id = ?4 AND (checkin_day IS NULL OR checkin_day <> ?1)`
  ).bind(day, streak, coins, petId).run();
  return r.meta.changes === 1;
}

// ---------- referrals ----------
// Settles one waiting referral. state: 1 paid, 2 void. Returns true when this call settled it.
export async function settleReferral(env, { petId, state, newPlayerCoins }) {
  const r = await env.DB.prepare(
    'UPDATE pet SET referral_state = ?1, coins = coins + ?2 WHERE id = ?3 AND referral_state = 0'
  ).bind(state, newPlayerCoins, petId).run();
  return r.meta.changes === 1;
}

// ---------- cosmetics ----------
export async function inventoryOf(env, petId) {
  const { results } = await env.DB.prepare('SELECT item, acquired_at, from_pet FROM inventory WHERE pet_id = ?1 ORDER BY acquired_at')
    .bind(petId).all();
  return results;
}

// Buys an item: takes the coins and adds the item in one transaction, or does nothing when the pet
// cannot afford it or already owns it. Returns true on success.
export async function buyItem(env, { petId, item, price, now }) {
  const [take] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE pet SET coins = coins - ?2 WHERE id = ?1 AND coins >= ?2
         AND NOT EXISTS (SELECT 1 FROM inventory WHERE pet_id = ?1 AND item = ?3)`
    ).bind(petId, price, item),
    env.DB.prepare('INSERT INTO inventory (pet_id, item, acquired_at) SELECT ?1, ?2, ?3 WHERE changes() = 1').bind(petId, item, now),
  ]);
  return take.meta.changes === 1;
}

// A gift: the giver pays the item's price; the item goes straight into the other pet's inventory,
// with an event for its owner and one more on the giver's daily gift count. All or nothing.
export async function giftItem(env, { fromId, toId, item, price, now, day }) {
  const [take] = await env.DB.batch([
    env.DB.prepare(
      `UPDATE pet SET coins = coins - ?2 WHERE id = ?1 AND coins >= ?2
         AND NOT EXISTS (SELECT 1 FROM inventory WHERE pet_id = ?3 AND item = ?4)`
    ).bind(fromId, price, toId, item),
    env.DB.prepare('INSERT INTO inventory (pet_id, item, acquired_at, from_pet) SELECT ?1, ?2, ?3, ?4 WHERE changes() = 1')
      .bind(toId, item, now, fromId),
    env.DB.prepare(`INSERT INTO events (pet_id, kind, from_pet, data, at) SELECT ?1, 'gift', ?2, ?3, ?4 WHERE changes() = 1`)
      .bind(toId, fromId, JSON.stringify({ item }), now),
    env.DB.prepare(
      `INSERT INTO daily (pet_id, day, kind, n) SELECT ?1, ?2, 'gifts', 1 WHERE changes() = 1
       ON CONFLICT(pet_id, day, kind) DO UPDATE SET n = n + 1`
    ).bind(fromId, day),
  ]);
  return take.meta.changes === 1;
}

export async function saveEquipped(env, petId, equipped) {
  await env.DB.prepare('UPDATE pet SET equipped = ?1 WHERE id = ?2').bind(JSON.stringify(equipped), petId).run();
}

// ---------- events (things that happened while the owner was away) ----------
export async function addEvent(env, { petId, kind, fromPet, data, at }) {
  await env.DB.prepare('INSERT INTO events (pet_id, kind, from_pet, data, at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(petId, kind, fromPet ?? null, JSON.stringify(data || {}), at).run();
}

// Newest unseen events (at most 10), with the other pet's public name and code.
export async function unseenEvents(env, petId) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.kind, e.data, e.at, p.call_code AS from_code, p.name AS from_name, p.name_status AS from_name_status
       FROM events e LEFT JOIN pet p ON p.id = e.from_pet
      WHERE e.pet_id = ?1 AND e.seen = 0 ORDER BY e.id DESC LIMIT 10`
  ).bind(petId).all();
  return results;
}

export async function markEventsSeen(env, petId, upToId) {
  await env.DB.prepare('UPDATE events SET seen = 1 WHERE pet_id = ?1 AND id <= ?2 AND seen = 0').bind(petId, upToId).run();
}

// ---------- Tangkap Kelip-kelip ----------
export async function startRun(env, { tokenHash, petId, now }) {
  await env.DB.prepare('INSERT INTO game_runs (token_hash, pet_id, started_at) VALUES (?1, ?2, ?3)').bind(tokenHash, petId, now).run();
}

export async function runsStartedSince(env, petId, since) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM game_runs WHERE pet_id = ?1 AND started_at >= ?2').bind(petId, since).first();
  return row.n;
}

// Closes a run once. Returns its start time, or null when unknown, someone else's, or already finished.
export async function finishRun(env, { tokenHash, petId, now }) {
  const row = await env.DB.prepare(
    'UPDATE game_runs SET finished_at = ?3 WHERE token_hash = ?1 AND pet_id = ?2 AND finished_at IS NULL RETURNING started_at'
  ).bind(tokenHash, petId, now).first();
  return row ? row.started_at : null;
}

// Keeps the best score per pet per day. Returns { best, allTime }.
export async function saveScore(env, { petId, day, score, now }) {
  const [, best, all] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO game_scores (pet_id, day, best, at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(pet_id, day) DO UPDATE SET best = excluded.best, at = excluded.at WHERE excluded.best > game_scores.best`
    ).bind(petId, day, score, now),
    env.DB.prepare('SELECT best FROM game_scores WHERE pet_id = ?1 AND day = ?2').bind(petId, day),
    env.DB.prepare('SELECT MAX(best) AS best FROM game_scores WHERE pet_id = ?1').bind(petId),
  ]);
  return { best: best.results[0]?.best ?? 0, allTime: all.results[0]?.best ?? 0 };
}

const BOARD_COLS = 'p.call_code, p.name, p.name_status, p.type, p.palette, p.tier, p.died_at, p.ascended_at, p.born_at, p.country';

// How a board can be ordered. "age" lists the oldest Peetako first; "recent" the latest score first.
const BOARD_SORTS = {
  score: 'score DESC, at ASC',
  age: 'born_at ASC, score DESC, at ASC',
  recent: 'last_at DESC, score DESC',
};
export const BOARD_SORT_KEYS = Object.keys(BOARD_SORTS);

// Top scores for one day (day set) or all time (day null), best per pet, ties to the earlier score.
// Optionally only pets of one country (an ISO code), in one of the BOARD_SORTS orders.
export async function leaderboard(env, { day, country = null, sort = 'score', limit }) {
  const args = [day ?? null, limit];
  let cw = '';
  if (country) { args.push(country); cw = 'AND p.country = ?3'; }
  const order = BOARD_SORTS[sort] || BOARD_SORTS.score;
  const sql = day
    ? `SELECT ${BOARD_COLS}, s.best AS score, s.at AS at, s.at AS last_at FROM game_scores s JOIN pet p ON p.id = s.pet_id
        WHERE s.day = ?1 ${cw} ORDER BY ${order} LIMIT ?2`
    : `SELECT ${BOARD_COLS}, b.score, b.at, b.last_at
         FROM (SELECT pet_id, MAX(best) AS score, MIN(at) AS at, MAX(at) AS last_at FROM game_scores GROUP BY pet_id) b
         JOIN pet p ON p.id = b.pet_id WHERE 1 = 1 ${cw} ORDER BY ${order} LIMIT ?2`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return results;
}

// A pet's best and rank (1 = top) for a day or all time, optionally among one country's pets only;
// null when it has no score there.
export async function rankOf(env, { petId, day, country = null }) {
  if (day) {
    const cw = country ? 'AND op.country = ?3' : '';
    const stmt = env.DB.prepare(
      `SELECT s.best AS score,
         (SELECT COUNT(*) FROM game_scores o JOIN pet op ON op.id = o.pet_id
            WHERE o.day = ?2 ${cw} AND (o.best > s.best OR (o.best = s.best AND o.at < s.at))) + 1 AS rank
       FROM game_scores s WHERE s.pet_id = ?1 AND s.day = ?2`
    );
    return (await (country ? stmt.bind(petId, day, country) : stmt.bind(petId, day)).first()) || null;
  }
  const cw = country ? 'JOIN pet gp ON gp.id = g.pet_id WHERE gp.country = ?2' : '';
  const stmt = env.DB.prepare(
    `WITH b AS (SELECT g.pet_id, MAX(g.best) AS score FROM game_scores g ${cw} GROUP BY g.pet_id)
     SELECT score, (SELECT COUNT(*) FROM b o WHERE o.score > b.score) + 1 AS rank FROM b WHERE pet_id = ?1`
  );
  return (await (country ? stmt.bind(petId, country) : stmt.bind(petId)).first()) || null;
}

// Country-to-country board: the MEDIAN of each player's best score (fair to small and large countries alike),
// listing only countries with at least minPlayers players. Players who prefer not to say are left out.
// Median = the middle score, or the average of the two middle scores when the count is even.
export async function countryBoard(env, { day, minPlayers, limit }) {
  const pool = day
    ? `SELECT p.country AS c, s.best AS v FROM game_scores s JOIN pet p ON p.id = s.pet_id
        WHERE s.day = ?1 AND p.country IS NOT NULL AND p.country <> 'ZZ'`
    : `SELECT p.country AS c, MAX(g.best) AS v FROM game_scores g JOIN pet p ON p.id = g.pet_id
        WHERE ?1 IS NULL AND p.country IS NOT NULL AND p.country <> 'ZZ' GROUP BY g.pet_id`;
  const { results } = await env.DB.prepare(
    `WITH pool AS (${pool}),
     ranked AS (SELECT c, v, ROW_NUMBER() OVER (PARTITION BY c ORDER BY v) AS rn, COUNT(*) OVER (PARTITION BY c) AS n FROM pool)
     SELECT c AS country, n AS players, AVG(v) AS median FROM ranked
       WHERE rn IN ((n + 1) / 2, (n + 2) / 2) GROUP BY c, n HAVING n >= ?2
       ORDER BY median DESC, players DESC, c ASC LIMIT ?3`
  ).bind(day ?? null, minPlayers, limit).all();
  return results;
}

// How many players of one country have a score in the period (explains why a country is not listed yet).
export async function countryPlayerCount(env, { day, country }) {
  const row = day
    ? await env.DB.prepare('SELECT COUNT(*) AS n FROM game_scores s JOIN pet p ON p.id = s.pet_id WHERE s.day = ?1 AND p.country = ?2').bind(day, country).first()
    : await env.DB.prepare('SELECT COUNT(DISTINCT g.pet_id) AS n FROM game_scores g JOIN pet p ON p.id = g.pet_id WHERE p.country = ?1').bind(country).first();
  return row?.n ?? 0;
}

export async function bestScoreOf(env, petId) {
  const row = await env.DB.prepare('SELECT MAX(best) AS best FROM game_scores WHERE pet_id = ?1').bind(petId).first();
  return row?.best ?? 0;
}

// ---------- names and reports ----------
// First report hides the text at once. Returns 'hidden' (new report filed), 'pending' (already hidden),
// 'approved' (an admin already kept this text) or 'none' (nothing to report).
export async function reportField(env, { petId, field, text, reporterPet, now }) {
  const col = 'name_status'; // only pet names can be reported (the Tier 7 title feature was removed)
  const [hide] = await env.DB.batch([
    env.DB.prepare(`UPDATE pet SET ${col} = 'hidden' WHERE id = ?1 AND ${col} = 'ok'`).bind(petId),
    env.DB.prepare(
      'INSERT INTO reports (pet_id, field, text, reporter_pet, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE changes() = 1'
    ).bind(petId, field, text, reporterPet, now),
  ]);
  if (hide.meta.changes === 1) return 'hidden';
  const row = await env.DB.prepare(`SELECT ${col} AS s FROM pet WHERE id = ?1`).bind(petId).first();
  return row?.s === 'approved' ? 'approved' : 'pending';
}

export async function openReports(env, limit = 50) {
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.field, r.text, r.created_at, p.call_code, p.type, p.tier,
            rp.call_code AS reporter_code
       FROM reports r JOIN pet p ON p.id = r.pet_id LEFT JOIN pet rp ON rp.id = r.reporter_pet
      WHERE r.status = 'open' ORDER BY r.created_at ASC LIMIT ?1`
  ).bind(limit).all();
  return results;
}

// approve: the text stays and cannot be reported again. reject: a name becomes `fallbackName`.
// A leftover report on the removed Tier 7 title is just closed and the title cleared.
// Returns false when the report was already handled.
export async function resolveReport(env, { id, decision, fallbackName, now }) {
  const rep = await env.DB.prepare("SELECT * FROM reports WHERE id = ?1 AND status = 'open'").bind(id).first();
  if (!rep) return false;
  const writes = [env.DB.prepare('UPDATE reports SET status = ?1, resolved_at = ?2 WHERE id = ?3')
    .bind(decision === 'approve' ? 'approved' : 'rejected', now, id)];
  if (rep.field === 'name') {
    writes.push(decision === 'approve'
      ? env.DB.prepare("UPDATE pet SET name_status = 'approved' WHERE id = ?1").bind(rep.pet_id)
      : env.DB.prepare("UPDATE pet SET name = ?1, name_status = 'approved' WHERE id = ?2").bind(fallbackName, rep.pet_id));
  } else {
    writes.push(env.DB.prepare("UPDATE pet SET title = NULL, title_status = 'ok' WHERE id = ?1").bind(rep.pet_id));
  }
  await env.DB.batch(writes);
  return true;
}

// ---------- battles ----------
export async function recordBattle(env, { attacker, defender, winner, now }) {
  const loser = winner === attacker ? defender : attacker;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO battles (attacker, defender, winner, at) VALUES (?1, ?2, ?3, ?4)').bind(attacker, defender, winner, now),
    env.DB.prepare('UPDATE pet SET battle_wins = battle_wins + 1 WHERE id = ?1').bind(winner),
    env.DB.prepare('UPDATE pet SET battle_losses = battle_losses + 1 WHERE id = ?1').bind(loser),
  ]);
}

// Pamper: only the FUN (mood) stat of the other pet changes; its care timer does not.
export async function saveMood(env, p) {
  await env.DB.prepare('UPDATE pet SET stats_at=?1, energy=?2, health=?3, temperature=?4, mood=?5, tier=?6, died_at=?7 WHERE id=?8')
    .bind(p.stats_at, p.energy, p.health, p.temperature, p.mood, p.tier, p.died_at ?? null, p.id).run();
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

// 2C housekeeping: old daily counters, finished or abandoned game runs, and events seen long ago.
// Leaderboard scores, battles and reports are kept.
export async function purgeSocial(env, { dayCutoff, runCutoff, eventCutoff }) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM daily WHERE day < ?1').bind(dayCutoff),
    env.DB.prepare('DELETE FROM game_runs WHERE started_at < ?1').bind(runCutoff),
    env.DB.prepare('DELETE FROM events WHERE at < ?1').bind(eventCutoff),
  ]);
}

// Fallen pets get no more alerts. Kept separate from recordDeathsAndPurge so the core cleanup
// still runs if the alert tables are missing.
export async function purgeFallenAlerts(env) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM push_subscriptions WHERE pet_id IN (SELECT id FROM pet WHERE died_at IS NOT NULL OR ascended_at IS NOT NULL)'),
    env.DB.prepare('DELETE FROM notify_state WHERE pet_id IN (SELECT id FROM pet WHERE died_at IS NOT NULL OR ascended_at IS NOT NULL)'),
  ]);
}
