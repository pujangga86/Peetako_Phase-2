// Peetako Phase 2C — social and economy routes: coins (check-in), cosmetics shop, gifts, Pamper,
// friendly battles, Tangkap Kelip-kelip and its leaderboards, Tier 7 titles, Report and its admin
// review, and the public pet page /p/PTK-XXXXXX that share links point to.
import { advance, view as ownerView, TIERS } from './game.js';
import {
  COIN, CATALOG, ITEMS, SLOTS, parseEquipped, GIFT_MAX_PER_DAY, GAME, coinsForScore, BATTLE, battlePower, PAMPER, TITLE,
  mytDay, prevDay, msToReset,
} from './economy.js';
import { isBlocked } from './filter.js';
import { codeSuffix, codeKeyOf } from './codes.js';
import {
  petByCodeKey, petById, dailyCounts, countDaily, earnCapped, checkIn, inventoryOf, buyItem, giftItem, saveEquipped,
  unseenEvents, markEventsSeen, addEvent, startRun, runsStartedSince, finishRun, saveScore, leaderboard, rankOf,
  bestScoreOf, saveTitle, reportField, openReports, resolveReport, recordBattle, saveMood,
} from './store.js';
import {
  json, fail, readBody, rateLimit, petFromSession, sha256, newToken, randInt, sameSecret, NO_SESSION, SLOW_DOWN,
} from './http.js';

const FALLBACK_NAME = 'Peetako'; // a rejected name is replaced by this

const alive = (p) => !p.died_at && !p.ascended_at;
const isActive = (p, now) => alive(p) && now - p.last_cared_at <= 24 * 3600 * 1000;

// ---------- what the owner sees about their own coins, items and news ----------
export async function buildMe(env, row, now) {
  const day = mytDay(now);
  const [counts, inv, events] = await Promise.all([dailyCounts(env, row.id, day), inventoryOf(env, row.id), unseenEvents(env, row.id)]);
  const living = alive(row);
  return {
    coins: row.coins || 0,
    streak: row.checkin_day === day || row.checkin_day === prevDay(day) ? row.streak || 0 : 0,
    checkedIn: row.checkin_day === day,
    canCheckIn: living && row.checkin_day !== day,
    today: {
      careCoins: counts.care_coins || 0, gameCoins: counts.game_coins || 0, gifts: counts.gifts || 0,
      battles: counts.battles || 0, pampers: counts.pampers || 0,
    },
    caps: {
      careCoins: COIN.careMaxPerDay, gameCoins: COIN.gameMaxPerDay, gifts: GIFT_MAX_PER_DAY,
      battles: BATTLE.maxPerDay, pampers: PAMPER.maxPerDay,
    },
    resetsInMs: msToReset(now),
    owned: inv.map((i) => i.item),
    referral: row.referred_by ? ['waiting', 'paid', 'void'][row.referral_state] || 'waiting' : null,
    events: events.map((e) => ({
      id: e.id, kind: e.kind, at: e.at, data: safeJson(e.data),
      from: e.from_code ? { callCode: e.from_code, name: e.from_name_status === 'hidden' ? null : e.from_name } : null,
    })),
  };
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// ---------- what anyone can see about a pet (share link, visits, leaderboards) ----------
export function publicView(row, now) {
  const p = advance(row, now);
  const v = ownerView(p, now);
  return {
    callCode: v.callCode,
    name: v.nameStatus === 'hidden' ? null : v.name,
    nameHidden: v.nameStatus === 'hidden',
    title: v.title && v.titleStatus !== 'hidden' ? v.title : null,
    titleHidden: !!v.title && v.titleStatus === 'hidden',
    canReport: { name: v.nameStatus === 'ok', title: !!v.title && v.titleStatus === 'ok' },
    type: v.type, palette: v.palette, tier: v.tier, tierName: v.tierName, backdrop: v.backdrop, status: v.status,
    ageHours: v.ageHours, careDays: v.careDays, stats: v.stats, equipped: v.equipped, battles: v.battles,
    legacyScore: v.legacyScore,
  };
}

async function targetFrom(env, raw) {
  const suffix = codeSuffix(env, raw);
  if (!suffix) return null;
  return petByCodeKey(env, codeKeyOf(env, suffix));
}

// Common start for routes that need the player's own pet.
async function me(env, req, limit = 'social') {
  const row = await petFromSession(env, req);
  if (!row) return { error: NO_SESSION() };
  if (!(await rateLimit(env, req, limit))) return { error: SLOW_DOWN() };
  return { row, now: Date.now() };
}

// ---------- daily check-in (+10, and +30 on every 7th day in a row) ----------
async function checkin(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  if (!alive(row)) return fail(409, 'pet_ended', 'Check-in is for a living Peetako.');
  const day = mytDay(now);
  if (row.checkin_day === day) return fail(409, 'already', 'Already checked in today. Come back after midnight (Malaysia time).');
  const streak = row.checkin_day === prevDay(day) ? (row.streak || 0) + 1 : 1;
  const bonus = streak % COIN.streakEvery === 0 ? COIN.streakBonus : 0;
  if (!(await checkIn(env, row.id, { day, streak, coins: COIN.checkin + bonus }))) return fail(409, 'already', 'Already checked in today.');
  const fresh = await petById(env, row.id);
  return json({ earned: { checkin: COIN.checkin, streak: bonus }, streak, me: await buildMe(env, fresh, now) });
}

// ---------- shop and wardrobe ----------
async function shop(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const owned = new Set((await inventoryOf(env, row.id)).map((i) => i.item));
  return json({
    coins: row.coins, equipped: parseEquipped(row.equipped), type: row.type,
    items: CATALOG.map((i) => ({ ...i, owned: owned.has(i.id) })),
    resetsInMs: msToReset(now),
  });
}

async function buy(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  if (row.died_at) return fail(409, 'pet_ended', 'A fallen Peetako cannot shop.');
  const b = await readBody(req);
  const item = ITEMS[b.item];
  if (!item) return fail(400, 'bad_item', 'Unknown item.');
  if (!(await buyItem(env, { petId: row.id, item: item.id, price: item.price, now }))) {
    const owned = (await inventoryOf(env, row.id)).some((i) => i.item === item.id);
    return owned ? fail(409, 'owned', 'You already have this.') : fail(402, 'not_enough', `Not enough coins: this costs ${item.price}.`);
  }
  // A new item is put on straight away (the owner can take it off in the wardrobe).
  const equipped = { ...parseEquipped(row.equipped), [item.slot]: item.id };
  await saveEquipped(env, row.id, equipped);
  const fresh = await petById(env, row.id);
  return json({ ok: true, item: item.id, pet: ownerView(advance(fresh, now), now), me: await buildMe(env, fresh, now) });
}

async function equip(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  if (row.died_at) return fail(409, 'pet_ended', 'A fallen Peetako cannot change its look.');
  const b = await readBody(req);
  if (!SLOTS.includes(b.slot)) return fail(400, 'bad_slot', 'Unknown slot.');
  const equipped = parseEquipped(row.equipped);
  if (b.item == null || b.item === '') delete equipped[b.slot];
  else {
    const item = ITEMS[b.item];
    if (!item || item.slot !== b.slot) return fail(400, 'bad_item', 'That item does not go there.');
    if (!(await inventoryOf(env, row.id)).some((i) => i.item === item.id)) return fail(403, 'not_owned', 'You do not own this yet.');
    equipped[b.slot] = item.id;
  }
  await saveEquipped(env, row.id, equipped);
  const fresh = await petById(env, row.id);
  return json({ ok: true, pet: ownerView(advance(fresh, now), now) });
}

// ---------- Tier 7 title ----------
function cleanTitle(raw) {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (t === '') return '';
  const re = new RegExp(`^[A-Za-z0-9][A-Za-z0-9 '\\-]{0,${TITLE.maxLen - 2}}[A-Za-z0-9]$`);
  return re.test(t) ? t : null;
}
async function setTitle(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const p = advance(row, now);
  if (!alive(p) || p.tier < TITLE.fromTier) return fail(403, 'too_young', `A custom title opens at Tier ${TITLE.fromTier}.`);
  const b = await readBody(req);
  const title = cleanTitle(b.title);
  if (title === null) return fail(400, 'bad_title', `A title is 2–${TITLE.maxLen} letters, numbers, spaces, hyphens or apostrophes.`);
  if (title && isBlocked(title)) return fail(400, 'title_blocked', 'Please choose a kinder title.');
  await saveTitle(env, row.id, title || null);
  const fresh = await petById(env, row.id);
  return json({ ok: true, pet: ownerView(advance(fresh, now), now) });
}

// ---------- visiting another pet ----------
async function visit(env, req, url) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const t = await targetFrom(env, url.searchParams.get('code'));
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  const day = mytDay(now);
  const counts = await dailyCounts(env, row.id, day);
  const owns = (await inventoryOf(env, t.id)).map((i) => i.item);
  return json({
    pet: publicView(t, now), self: t.id === row.id, owns,
    can: {
      pamper: t.id !== row.id && alive(row) && alive(t) && (counts.pampers || 0) < PAMPER.maxPerDay && !counts[`pamper:${t.id}`],
      battle: t.id !== row.id && isActive(row, now) && alive(t) && row.tier >= 1 && t.tier >= 1 && !!t.open_to_challenge && (counts.battles || 0) < BATTLE.maxPerDay,
      gift: t.id !== row.id && !row.died_at && alive(t) && (counts.gifts || 0) < GIFT_MAX_PER_DAY,
    },
  });
}

async function gift(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const item = ITEMS[b.item];
  if (!item) return fail(400, 'bad_item', 'Unknown item.');
  const t = await targetFrom(env, b.to);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'Buy it in the shop instead — gifts are for other Peetako.');
  if (row.died_at) return fail(409, 'pet_ended', 'A fallen Peetako cannot send gifts.');
  if (!alive(t)) return fail(409, 'target_ended', 'Only a living Peetako can receive gifts.');
  const day = mytDay(now);
  if (((await dailyCounts(env, row.id, day)).gifts || 0) >= GIFT_MAX_PER_DAY) return fail(429, 'gift_cap', `You can send ${GIFT_MAX_PER_DAY} gifts a day. More tomorrow!`);
  if (!(await giftItem(env, { fromId: row.id, toId: t.id, item: item.id, price: item.price, now, day }))) {
    const owns = (await inventoryOf(env, t.id)).some((i) => i.item === item.id);
    return owns ? fail(409, 'owned', 'They already have this one. Pick another gift.') : fail(402, 'not_enough', `Not enough coins: this costs ${item.price}.`);
  }
  const fresh = await petById(env, row.id);
  return json({ ok: true, item: item.id, to: publicView(t, now), me: await buildMe(env, fresh, now) });
}

// Pamper: +5 FUN for the other pet, once per pet per day, 3 a day. No coins; not care.
async function pamper(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.to);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'Use PLAY to cheer up your own Peetako.');
  if (!alive(row)) return fail(409, 'pet_ended', 'Only a living Peetako can Pamper.');
  if (!alive(t)) return fail(409, 'target_ended', 'Only a living Peetako can be Pampered.');
  const day = mytDay(now);
  const counts = await dailyCounts(env, row.id, day);
  if ((counts.pampers || 0) >= PAMPER.maxPerDay) return fail(429, 'pamper_cap', `You can Pamper ${PAMPER.maxPerDay} times a day. More tomorrow!`);
  if (counts[`pamper:${t.id}`]) return fail(429, 'pamper_again', 'You already Pampered this Peetako today.');
  await countDaily(env, row.id, day, `pamper:${t.id}`);
  await countDaily(env, row.id, day, 'pampers');
  const tp = advance(t, now);
  if (tp.died_at) return fail(409, 'target_ended', 'Only a living Peetako can be Pampered.');
  tp.mood = Math.min(100, tp.mood + PAMPER.gain);
  await saveMood(env, tp);
  await addEvent(env, { petId: t.id, kind: 'pamper', fromPet: row.id, data: { fun: PAMPER.gain }, at: now });
  return json({ ok: true, gain: PAMPER.gain, mine: publicView(row, now), to: publicView(tp, now), me: await buildMe(env, row, now) });
}

// Friendly battle: stats + tier + a little luck. No penalty for the loser, no coins.
async function battle(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.to);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'Your Peetako cannot battle itself.');
  const a = advance(row, now);
  if (!isActive(a, now)) return fail(409, 'not_active', 'Care for your Peetako first: only an active Peetako can battle.');
  if (a.tier < 1) return fail(409, 'egg', 'Your Peetako has to hatch first.');
  const d = advance(t, now);
  if (!alive(d)) return fail(409, 'target_ended', 'That Peetako cannot battle any more.');
  if (d.tier < 1) return fail(409, 'target_egg', 'That Peetako is still an egg.');
  if (!t.open_to_challenge) return fail(409, 'closed', 'That Peetako is not taking challenges.');
  const day = mytDay(now);
  if (((await dailyCounts(env, row.id, day)).battles || 0) >= BATTLE.maxPerDay) return fail(429, 'battle_cap', `You can battle ${BATTLE.maxPerDay} times a day. More tomorrow!`);
  await countDaily(env, row.id, day, 'battles');

  const pa = battlePower(a) + randInt(BATTLE.luck + 1);
  const pd = battlePower(d) + randInt(BATTLE.luck + 1);
  const attackerWins = pa > pd || (pa === pd && randInt(2) === 0);
  // Three rounds for the animation: the winner takes two of them.
  const w = attackerWins ? 'a' : 'd', l = attackerWins ? 'd' : 'a';
  const rounds = [[w, w, l], [w, l, w], [l, w, w]][randInt(3)];
  const winner = attackerWins ? row.id : t.id;
  await recordBattle(env, { attacker: row.id, defender: t.id, winner, now });
  await addEvent(env, { petId: t.id, kind: 'battle', fromPet: row.id, data: { won: !attackerWins }, at: now });
  const [freshA, freshD] = await Promise.all([petById(env, row.id), petById(env, t.id)]);
  return json({
    won: attackerWins, rounds, power: { me: Math.round(pa), them: Math.round(pd) },
    mine: publicView(freshA, now), them: publicView(freshD, now), me: await buildMe(env, freshA, now),
  });
}

// ---------- Report (name or Tier 7 title) ----------
async function report(env, req) {
  const { row, now, error } = await me(env, req, 'report');
  if (error) return error;
  const b = await readBody(req);
  if (!['name', 'title'].includes(b.field)) return fail(400, 'bad_field', 'Report a name or a title.');
  const t = await targetFrom(env, b.target);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'You cannot report your own Peetako.');
  const text = b.field === 'title' ? t.title : t.name;
  if (!text) return fail(400, 'nothing', 'There is nothing to report.');
  const r = await reportField(env, { petId: t.id, field: b.field, text, reporterPet: row.id, now });
  const msg = {
    hidden: 'Thank you. It is hidden until we review it.',
    pending: 'Thank you. It is already hidden and waiting for review.',
    approved: 'Thank you. This one was already reviewed and kept.',
  }[r];
  return json({ ok: true, result: r, message: msg });
}

// ---------- news ----------
async function eventsSeen(env, req) {
  const { row, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const upTo = Number.isSafeInteger(b.upTo) ? b.upTo : 0;
  if (upTo > 0) await markEventsSeen(env, row.id, upTo);
  return json({ ok: true });
}

// ---------- Tangkap Kelip-kelip ----------
async function gameStart(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  if (row.died_at) return fail(409, 'pet_ended', 'A fallen Peetako cannot play.');
  if ((await runsStartedSince(env, row.id, now - 3600 * 1000)) >= GAME.startsPerHour) return fail(429, 'too_many_runs', 'Lots of fireflies caught! Rest a little and play again later.');
  const token = newToken();
  await startRun(env, { tokenHash: await sha256(token), petId: row.id, now });
  return json({ run: token, durationMs: GAME.runMs });
}

async function gameFinish(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const score = Number(b.score);
  if (typeof b.run !== 'string' || !/^[a-f0-9]{64}$/.test(b.run) || !Number.isInteger(score) || score < 0) return fail(400, 'bad_run', 'That run cannot be counted.');
  const started = await finishRun(env, { tokenHash: await sha256(b.run), petId: row.id, now });
  if (started === null) return fail(409, 'run_closed', 'That run was already counted or has expired.');
  const elapsed = now - started;
  if (elapsed < GAME.minMs || elapsed > GAME.maxMs) return fail(409, 'run_time', 'That run cannot be counted.');
  if (score > Math.min(GAME.maxScore, Math.floor((elapsed / 1000) * GAME.maxPerSecond))) return fail(409, 'implausible', 'That score cannot be counted.');
  const day = mytDay(now);
  const coins = row.died_at ? 0 : await earnCapped(env, row.id, day, 'game_coins', coinsForScore(score), COIN.gameMaxPerDay);
  const best = await saveScore(env, { petId: row.id, day, score, now });
  const [rankDay, rankAll] = await Promise.all([rankOf(env, { petId: row.id, day }), rankOf(env, { petId: row.id, day: null })]);
  const fresh = await petById(env, row.id);
  return json({ score, coins, best: best.best, allTime: best.allTime, rankDay: rankDay?.rank ?? null, rankAll: rankAll?.rank ?? null, me: await buildMe(env, fresh, now) });
}

async function board(env, req, url) {
  if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
  const now = Date.now();
  const period = url.searchParams.get('period') === 'all' ? 'all' : 'day';
  const day = period === 'day' ? mytDay(now) : null;
  const rows = await leaderboard(env, { day, limit: 20 });
  const row = await petFromSession(env, req);
  const mine = row ? await rankOf(env, { petId: row.id, day }) : null;
  return json({
    period, day, resetsInMs: period === 'day' ? msToReset(now) : null,
    rows: rows.map((r, i) => ({
      rank: i + 1, callCode: r.call_code, name: r.name_status === 'hidden' ? null : r.name, score: r.score,
      type: r.type, palette: r.palette, tier: r.tier, status: r.died_at ? 'dead' : r.ascended_at ? 'ascended' : 'alive',
    })),
    me: mine && row ? { callCode: row.call_code, rank: mine.rank, score: mine.score } : null,
  });
}

// ---------- admin review of reports (K6: /admin, ADMIN_TOKEN secret) ----------
async function admin(env, req) {
  if (!env.ADMIN_TOKEN) return { error: fail(503, 'admin_off', 'Set the ADMIN_TOKEN secret in Cloudflare to use the review page.') };
  if (!(await rateLimit(env, req, 'admin'))) return { error: SLOW_DOWN() };
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/);
  if (!m || !sameSecret(m[1].trim(), env.ADMIN_TOKEN)) return { error: fail(401, 'bad_token', 'Wrong admin token.') };
  return {};
}
async function adminReports(env, req) {
  const { error } = await admin(env, req);
  if (error) return error;
  const rows = await openReports(env);
  return json({ reports: rows.map((r) => ({ id: r.id, field: r.field, text: r.text, at: r.created_at, callCode: r.call_code, tier: r.tier, type: r.type, reporter: r.reporter_code })) });
}
async function adminResolve(env, req) {
  const { error } = await admin(env, req);
  if (error) return error;
  const b = await readBody(req);
  if (!Number.isSafeInteger(b.id) || !['approve', 'reject'].includes(b.decision)) return fail(400, 'bad_request', 'Send { id, decision: approve | reject }.');
  if (!(await resolveReport(env, { id: b.id, decision: b.decision, fallbackName: FALLBACK_NAME, now: Date.now() }))) return fail(409, 'done', 'That report was already handled.');
  return json({ ok: true });
}

// ---------- the public pet page (share links) ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function publicPage(env, req, url) {
  const raw = decodeURIComponent(url.pathname.slice(3)).replace(/\/$/, '');
  const t = await targetFrom(env, raw);
  const now = Date.now();
  const origin = url.origin;
  if (!t) {
    return new Response(pageShell({ origin, title: 'Peetako not found', desc: 'No Peetako has that Call Code.', url: `${origin}/`, code: '' }), {
      status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  const v = publicView(t, now);
  const name = v.name || 'A Peetako';
  const kind = v.type === 'robot' ? 'Robot' : 'Organic';
  const tier = TIERS[v.tier] ? TIERS[v.tier][v.type] : '';
  const title = `${name} · Tier ${v.tier} ${tier.replace(/\s*\(.*\)$/, '')} | Peetako`;
  const desc = `Visit ${name}, a${kind === 'Organic' ? 'n' : ''} ${kind} Peetako from Malaysian Borneo. Call Code ${v.callCode}. Pamper it, send a gift or challenge it to a friendly battle.`;
  return new Response(pageShell({ origin, title, desc, url: `${origin}/p/${v.callCode}`, code: v.callCode }), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' },
  });
}

function pageShell({ origin, title, desc, url, code }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Peetako">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(origin)}/icons/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1A1840">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bangers&family=Nunito:wght@400;600;700;800;900&family=Press+Start+2P&family=VT323&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="/" aria-label="Peetako home"><svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="5" width="32" height="28" rx="9" fill="#34C76A" stroke="#1B1A2E" stroke-width="2.5"/><circle cx="14" cy="17" r="5" fill="#fff" stroke="#1B1A2E" stroke-width="1.5"/><circle cx="26" cy="17" r="5" fill="#fff" stroke="#1B1A2E" stroke-width="1.5"/><circle cx="15" cy="18" r="3" fill="#1E1B4B"/><circle cx="27" cy="18" r="3" fill="#1E1B4B"/><path d="M15 26 Q20 30 25 26" fill="none" stroke="#1B1A2E" stroke-width="2" stroke-linecap="round"/></svg><span class="logo-text">Peetako</span></a>
    <nav class="nav" aria-label="Main"><a href="/">Play</a><a href="/faq">FAQ</a><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/contact">Contact</a></nav>
  </div>
</header>
<main class="wrap">
  <section id="public" class="game retro" data-code="${esc(code)}" aria-live="polite">
    <div class="frame"><p>Loading…</p></div>
  </section>
</main>
<footer class="site-footer">
  <div class="wrap">
    <span>© 2026 Peetako · Made in Malaysian Borneo, from the Land of the Hornbills to the Land Below the Wind.</span>
    <span><a href="/faq">FAQ</a> · <a href="/about">About</a> · <a href="/privacy">Privacy</a> · <a href="/contact">Contact</a></span>
  </div>
</footer>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<script src="/assets/sound.js"></script>
<script type="module" src="/assets/public.js"></script>
</body>
</html>`;
}

// Returns a Response for a 2C route, or null when the path is not one of them.
export async function socialRoute(env, req, url) {
  const p = url.pathname;
  const m = req.method;
  if (m === 'GET') {
    if (p === '/api/shop') return shop(env, req);
    if (p === '/api/visit') return visit(env, req, url);
    if (p === '/api/leaderboard') return board(env, req, url);
    if (p === '/api/public') {
      if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
      const t = await targetFrom(env, url.searchParams.get('code'));
      if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
      return json({ pet: publicView(t, Date.now()), best: await bestScoreOf(env, t.id), owns: (await inventoryOf(env, t.id)).map((i) => i.item) });
    }
    if (p === '/api/admin/reports') return adminReports(env, req);
    return null;
  }
  if (m === 'POST') {
    if (p === '/api/checkin') return checkin(env, req);
    if (p === '/api/shop/buy') return buy(env, req);
    if (p === '/api/equip') return equip(env, req);
    if (p === '/api/title') return setTitle(env, req);
    if (p === '/api/gift') return gift(env, req);
    if (p === '/api/pamper') return pamper(env, req);
    if (p === '/api/battle') return battle(env, req);
    if (p === '/api/report') return report(env, req);
    if (p === '/api/events/seen') return eventsSeen(env, req);
    if (p === '/api/game/start') return gameStart(env, req);
    if (p === '/api/game/finish') return gameFinish(env, req);
    if (p === '/api/admin/resolve') return adminResolve(env, req);
  }
  return null;
}
