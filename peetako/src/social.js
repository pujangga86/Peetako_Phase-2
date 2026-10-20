// Peetako Phase 2C — social and economy routes: coins (check-in), cosmetics shop, gifts, Pamper and Bond,
// friendly battles, Mentor Boost, Friends (contacts and blocks), the five mini-games and their leaderboards
// and daily badges, Report and its admin review, and the public pet page /p/PTK-XXXXXX that share links point to.
import { advance, view as ownerView, TIERS, HOUR, MENTOR_HOURS } from './game.js';
import {
  COIN, CATALOG, ITEMS, SLOTS, parseEquipped, GIFT_MAX_PER_DAY, GAME, isGame, gameSetup, judgeRun, coinsFor, BATTLE, battlePower, PAMPER,
  BOND, bondInfo, MAX_CONTACTS, MAX_BLOCKS, MENTOR, mytDay, prevDay, msToReset,
} from './economy.js';
import { codeSuffix, codeKeyOf } from './codes.js';
import { isCountry, normCountry, UNDISCLOSED, MIN_COUNTRY_PLAYERS } from './countries.js';
import {
  petByCodeKey, petById, dailyCounts, countDaily, earnCapped, checkIn, inventoryOf, buyItem, giftItem, saveEquipped,
  unseenEvents, markEventsSeen, addEvent, startRun, runsStartedSince, finishRun, saveScore, leaderboard, rankOf, countryBoard, countryPlayerCount, BOARD_SORT_KEYS,
  bestScoresOf, reportField, openReports, resolveReport, recordBattle, saveMood, saveMentor, setOpenToChallenge,
  addBond, bondOf, contactsOf, isContact, saveContact, removeContact, blockState, blockPet, unblockPet, blockedBy, badgesOf,
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
  const [counts, inv, events, badges] = await Promise.all([dailyCounts(env, row.id, day), inventoryOf(env, row.id), unseenEvents(env, row.id), badgesOf(env, row.id)]);
  const living = alive(row);
  return {
    coins: row.coins || 0,
    streak: row.checkin_day === day || row.checkin_day === prevDay(day) ? row.streak || 0 : 0,
    checkedIn: row.checkin_day === day,
    canCheckIn: living && row.checkin_day !== day,
    today: {
      careCoins: counts.care_coins || 0, gameCoins: counts.game_coins || 0, gifts: counts.gifts || 0,
      battles: counts.battles || 0, pampers: counts.pampers || 0, mentors: counts.mentors || 0,
      // care types that have already paid their coins today
      caredTypes: Object.keys(counts).filter((k) => k.startsWith('care:')).map((k) => k.slice(5)),
    },
    caps: {
      careCoins: COIN.careMaxPerDay, gameCoins: COIN.gameMaxPerDay, gifts: GIFT_MAX_PER_DAY,
      battles: BATTLE.maxPerDay, pampers: PAMPER.maxPerDay, mentors: MENTOR.perGiverPerDay,
    },
    badges,
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
    canReport: { name: v.nameStatus === 'ok' },
    country: v.country && v.country !== UNDISCLOSED ? v.country : null, // null: prefers not to say (or not chosen yet)
    type: v.type, palette: v.palette, tier: v.tier, tierName: v.tierName, backdrop: v.backdrop, status: v.status,
    ageHours: v.ageHours, careDays: v.careDays, stats: v.stats, equipped: v.equipped, battles: v.battles,
    legacyScore: v.legacyScore, openToChallenge: v.openToChallenge, legacy: v.legacy,
    hibernating: !!v.hibernation?.active, mentored: !!v.mentorUntil,
  };
}

async function targetFrom(env, raw) {
  const suffix = codeSuffix(env, raw);
  if (!suffix) return null;
  return petByCodeKey(env, codeKeyOf(env, suffix));
}

// Blocking is silent: a pet that was blocked only learns that the other pet is not accepting it now.
async function blockedFail(env, row, t) {
  const b = await blockState(env, row.id, t.id);
  if (b.mine) return fail(403, 'you_blocked', 'You blocked this Peetako. Unblock it in Friends first.');
  if (b.theirs) return fail(403, 'not_accepting', 'This Peetako is not accepting that right now.');
  return null;
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

// ---------- visiting another pet ----------
async function visit(env, req, url) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const t = await targetFrom(env, url.searchParams.get('code'));
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  const day = mytDay(now);
  const self = t.id === row.id;
  const [counts, theirCounts, inv, blocks, points, saved, badges] = await Promise.all([
    dailyCounts(env, row.id, day), dailyCounts(env, t.id, day), inventoryOf(env, t.id),
    self ? { mine: false, theirs: false } : blockState(env, row.id, t.id), self ? 0 : bondOf(env, row.id, t.id),
    self ? false : isContact(env, row.id, t.id), badgesOf(env, t.id),
  ]);
  const open = !self && !blocks.mine && !blocks.theirs;
  const a = advance(row, now);
  const tp = advance(t, now);
  return json({
    pet: publicView(t, now), self, owns: inv.map((i) => i.item), badges,
    bond: self ? null : bondInfo(points), contact: saved, blocked: blocks.mine,
    can: {
      pamper: open && alive(a) && alive(tp) && (counts.pampers || 0) < PAMPER.maxPerDay && !counts[`pamper:${t.id}`],
      battle: open && isActive(a, now) && alive(tp) && a.tier >= 1 && tp.tier >= 1 && !!t.open_to_challenge && (counts.battles || 0) < BATTLE.maxPerDay,
      gift: open && !a.died_at && alive(tp) && (counts.gifts || 0) < GIFT_MAX_PER_DAY,
      mentor: open && isActive(a, now) && a.tier >= MENTOR.minTier && alive(tp) && tp.tier < a.tier
        && (counts.mentors || 0) < MENTOR.perGiverPerDay && (theirCounts.mentored || 0) < MENTOR.perReceiverPerDay,
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
  const blocked = await blockedFail(env, row, t);
  if (blocked) return blocked;
  const day = mytDay(now);
  if (((await dailyCounts(env, row.id, day)).gifts || 0) >= GIFT_MAX_PER_DAY) return fail(429, 'gift_cap', `You can send ${GIFT_MAX_PER_DAY} gifts a day. More tomorrow!`);
  if (!(await giftItem(env, { fromId: row.id, toId: t.id, item: item.id, price: item.price, now, day }))) {
    const owns = (await inventoryOf(env, t.id)).some((i) => i.item === item.id);
    return owns ? fail(409, 'owned', 'They already have this one. Pick another gift.') : fail(402, 'not_enough', `Not enough coins: this costs ${item.price}.`);
  }
  const bond = bondInfo(await addBond(env, row.id, t.id, BOND.points.gift, now));
  const fresh = await petById(env, row.id);
  return json({ ok: true, item: item.id, to: publicView(t, now), bond, me: await buildMe(env, fresh, now) });
}

// Pamper: +5 FUN for both pets and Bond for the pair, once per pet per day, 3 a day. No coins; not care.
async function pamper(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.to);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'Use PLAY to cheer up your own Peetako.');
  if (!alive(row)) return fail(409, 'pet_ended', 'Only a living Peetako can Pamper.');
  if (!alive(t)) return fail(409, 'target_ended', 'Only a living Peetako can be Pampered.');
  const blocked = await blockedFail(env, row, t);
  if (blocked) return blocked;
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
  const mp = advance(row, now);
  if (!mp.died_at) { mp.mood = Math.min(100, mp.mood + PAMPER.gain); await saveMood(env, mp); }
  const bond = bondInfo(await addBond(env, row.id, t.id, BOND.points.pamper, now));
  await addEvent(env, { petId: t.id, kind: 'pamper', fromPet: row.id, data: { fun: PAMPER.gain, bond: bond.level }, at: now });
  const fresh = await petById(env, row.id);
  return json({ ok: true, gain: PAMPER.gain, bond, mine: publicView(fresh, now), to: publicView(tp, now), pet: ownerView(advance(fresh, now), now), me: await buildMe(env, fresh, now) });
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
  const blocked = await blockedFail(env, row, t);
  if (blocked) return blocked;
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
  const bond = bondInfo(await addBond(env, row.id, t.id, BOND.points.battle, now));
  const [freshA, freshD] = await Promise.all([petById(env, row.id), petById(env, t.id)]);
  return json({
    won: attackerWins, rounds, power: { me: Math.round(pa), them: Math.round(pd) }, bond,
    mine: publicView(freshA, now), them: publicView(freshD, now), me: await buildMe(env, freshA, now),
  });
}

// ---------- Mentor Boost: an active Tier 4+ pet helps a younger one (slower decay for 24 h) ----------
async function mentor(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.to);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'Mentor Boost is for a younger Peetako, not your own.');
  const a = advance(row, now);
  if (!isActive(a, now)) return fail(409, 'not_active', 'Care for your Peetako first: only an active Peetako can mentor.');
  if (a.tier < MENTOR.minTier) return fail(403, 'tier_low', `Mentor Boost opens at Tier ${MENTOR.minTier}.`);
  const tp = advance(t, now);
  if (!alive(tp)) return fail(409, 'target_ended', 'Only a living Peetako can be mentored.');
  if (tp.tier >= a.tier) return fail(409, 'not_younger', 'Mentor Boost is for a Peetako of a lower tier than yours.');
  const blocked = await blockedFail(env, row, t);
  if (blocked) return blocked;
  const day = mytDay(now);
  if (((await dailyCounts(env, row.id, day)).mentors || 0) >= MENTOR.perGiverPerDay) return fail(429, 'mentor_cap', `You can mentor ${MENTOR.perGiverPerDay} Peetako a day. More tomorrow!`);
  if (((await dailyCounts(env, t.id, day)).mentored || 0) >= MENTOR.perReceiverPerDay) return fail(429, 'mentor_again', 'This Peetako has already been mentored today.');
  await countDaily(env, row.id, day, 'mentors');
  await countDaily(env, t.id, day, 'mentored');
  const until = now + MENTOR_HOURS * HOUR;
  await saveMentor(env, tp, until);
  const bond = bondInfo(await addBond(env, row.id, t.id, BOND.points.mentor, now));
  await addEvent(env, { petId: t.id, kind: 'mentor', fromPet: row.id, data: { hours: MENTOR_HOURS }, at: now });
  const fresh = await petById(env, row.id);
  return json({ ok: true, until, bond, mine: publicView(fresh, now), to: publicView(await petById(env, t.id), now), me: await buildMe(env, fresh, now) });
}

// ---------- Friends: saved contacts and blocked pets ----------
async function friends(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const [list, blocked] = await Promise.all([contactsOf(env, row.id), blockedBy(env, row.id)]);
  return json({
    max: MAX_CONTACTS, maxBlocked: MAX_BLOCKS,
    contacts: list.map((c) => ({
      callCode: c.call_code, name: c.name_status === 'hidden' ? null : c.name, type: c.type, palette: c.palette, tier: c.tier,
      tierName: TIERS[c.tier] ? TIERS[c.tier][c.type] : '',
      status: c.died_at ? 'dead' : c.ascended_at ? 'ascended' : now - c.last_cared_at > 24 * HOUR ? 'dormant' : 'active',
      country: c.country && c.country !== UNDISCLOSED ? c.country : null, bond: bondInfo(c.bond), savedAt: c.created_at,
    })),
    blocked: blocked.map((x) => ({ callCode: x.call_code, name: x.name_status === 'hidden' ? null : x.name, type: x.type, tier: x.tier, at: x.created_at })),
  });
}

async function contact(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.code);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'That is your own Peetako.');
  if (b.save === false) { await removeContact(env, row.id, t.id); return json({ ok: true, contact: false }); }
  if ((await blockState(env, row.id, t.id)).mine) return fail(409, 'you_blocked', 'You blocked this Peetako. Unblock it first.');
  const r = await saveContact(env, { petId: row.id, otherId: t.id, now, max: MAX_CONTACTS });
  if (r === 'full') return fail(409, 'contacts_full', `Your Friends list is full (${MAX_CONTACTS}). Remove someone first.`);
  return json({ ok: true, contact: true });
}

async function block(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const t = await targetFrom(env, b.code);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'You cannot block your own Peetako.');
  if (b.block === false) { await unblockPet(env, row.id, t.id); return json({ ok: true, blocked: false }); }
  const r = await blockPet(env, { petId: row.id, otherId: t.id, now, max: MAX_BLOCKS });
  if (r === 'full') return fail(409, 'blocks_full', `You have blocked ${MAX_BLOCKS} Peetako. Unblock someone first.`);
  return json({ ok: true, blocked: true });
}

// "Open to challenges" switch (on by default).
async function challenges(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  if (typeof b.open !== 'boolean') return fail(400, 'bad_request', 'Send { open: true | false }.');
  await setOpenToChallenge(env, row.id, b.open);
  const fresh = await petById(env, row.id);
  return json({ ok: true, pet: ownerView(advance(fresh, now), now) });
}

// ---------- Report (pet name) ----------
async function report(env, req) {
  const { row, now, error } = await me(env, req, 'report');
  if (error) return error;
  const b = await readBody(req);
  if (b.field !== 'name') return fail(400, 'bad_field', 'Only a pet name can be reported.');
  const t = await targetFrom(env, b.target);
  if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
  if (t.id === row.id) return fail(400, 'self', 'You cannot report your own Peetako.');
  const text = t.name;
  if (!text) return fail(400, 'nothing', 'There is nothing to report.');
  const r = await reportField(env, { petId: t.id, field: 'name', text, reporterPet: row.id, now });
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

// ---------- mini-games ----------
// Tangkap Kelip-kelip, Ikut Rentak, Lidah Pantas, Padan Motif and Panjat Pokok. A run is started by the server
// (so its length is measured here), finished once, and checked by judgeRun (economy.js). Coins from every game
// share one daily cap.
const gameOf = (b) => (b && b.game !== undefined ? b.game : 'kelip'); // older clients only knew Kelip-kelip

async function gameStart(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  const game = gameOf(b);
  if (!isGame(game)) return fail(400, 'bad_game', 'Choose a game from the list.');
  if (row.died_at) return fail(409, 'pet_ended', 'A fallen Peetako cannot play.');
  if ((await runsStartedSince(env, row.id, now - 3600 * 1000)) >= GAME.startsPerHour) return fail(429, 'too_many_runs', 'Lots of games played! Rest a little and play again later.');
  const token = newToken();
  await startRun(env, { tokenHash: await sha256(token), petId: row.id, now, game });
  const setup = gameSetup(game);
  // Tangkap Kelip-kelip keeps its original field names for the client.
  const extra = game === 'kelip' ? { durationMs: GAME.runMs, misses: GAME.misses, goldValue: GAME.goldValue, combo: GAME.comboSteps } : {};
  return json({ run: token, ...extra, setup });
}

async function gameFinish(env, req) {
  const { row, now, error } = await me(env, req);
  if (error) return error;
  const b = await readBody(req);
  if (typeof b.run !== 'string' || !/^[a-f0-9]{64}$/.test(b.run)) return fail(400, 'bad_run', 'That run cannot be counted.');
  const run = await finishRun(env, { tokenHash: await sha256(b.run), petId: row.id, now });
  if (run === null) return fail(409, 'run_closed', 'That run was already counted or has expired.');
  const { game } = run;
  const elapsed = now - run.startedAt;
  if (elapsed < GAME.minMs || elapsed > GAME.maxMs) return fail(409, 'run_time', 'That run cannot be counted.');
  const judged = judgeRun(game, b, elapsed);
  if (judged.error === 'bad_run') return fail(400, 'bad_run', 'That run cannot be counted.');
  if (judged.error) return fail(409, 'implausible', 'That score cannot be counted.');
  const { score, count } = judged;
  const day = mytDay(now);
  const coins = row.died_at ? 0 : await earnCapped(env, row.id, day, 'game_coins', coinsFor(game, count), COIN.gameMaxPerDay);
  const best = await saveScore(env, { game, petId: row.id, day, score, now });
  const [rankDay, rankAll] = await Promise.all([rankOf(env, { game, petId: row.id, day }), rankOf(env, { game, petId: row.id, day: null })]);
  const fresh = await petById(env, row.id);
  return json({ game, score, count, coins, best: best.best, allTime: best.allTime, rankDay: rankDay?.rank ?? null, rankAll: rankAll?.rank ?? null, me: await buildMe(env, fresh, now) });
}

// Which game a leaderboard is for (?game=..., Tangkap Kelip-kelip when left out).
const boardGame = (url) => url.searchParams.get('game') || 'kelip';

const BOARD_LIMIT = 20;
const COUNTRY_BOARD_LIMIT = 50;
const periodDay = (url, now) => (url.searchParams.get('period') === 'all' ? null : mytDay(now));

// Pet leaderboard. scope: global (everyone), mine (the player's own country) or country (any ISO country, with ?country=MY).
// sort: score (default), age (oldest Peetako first) or recent (latest score first). Rank is the position in the list.
async function board(env, req, url) {
  if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
  const now = Date.now();
  const game = boardGame(url);
  if (!isGame(game)) return fail(400, 'bad_game', 'Choose a game from the list.');
  const day = periodDay(url, now);
  const period = day ? 'day' : 'all';
  const sortRaw = url.searchParams.get('sort') || 'score';
  if (!BOARD_SORT_KEYS.includes(sortRaw)) return fail(400, 'bad_sort', 'Sort by score, age or recent.');
  const sort = sortRaw;
  const scope = url.searchParams.get('scope') || 'global';
  if (!['global', 'mine', 'country'].includes(scope)) return fail(400, 'bad_scope', 'Choose global, mine or country.');
  const row = await petFromSession(env, req);

  let country = null;
  if (scope === 'mine') {
    if (!row) return NO_SESSION();
    if (!row.country) return fail(409, 'no_country', 'Choose your country first to see its leaderboard.');
    if (row.country === UNDISCLOSED) return fail(409, 'no_country', 'You chose not to share a country, so there is no country leaderboard for you.');
    country = row.country;
  } else if (scope === 'country') {
    country = normCountry(url.searchParams.get('country'));
    if (!country || !isCountry(country)) return fail(400, 'bad_country', 'Choose a country from the list.');
  }

  const rows = await leaderboard(env, { game, day, country, sort, limit: BOARD_LIMIT });
  const mine = row && sort === 'score' ? await rankOf(env, { game, petId: row.id, day, country }) : null;
  return json({
    game, period, day, scope, country, sort, resetsInMs: day ? msToReset(now) : null,
    rows: rows.map((r, i) => ({
      rank: i + 1, callCode: r.call_code, name: r.name_status === 'hidden' ? null : r.name, score: r.score,
      type: r.type, palette: r.palette, tier: r.tier, status: r.died_at ? 'dead' : r.ascended_at ? 'ascended' : 'alive',
      country: r.country && r.country !== UNDISCLOSED ? r.country : null,
      ageHours: Math.floor(((r.died_at || r.ascended_at || now) - r.born_at) / 3600000),
    })),
    me: mine && row ? { callCode: row.call_code, rank: mine.rank, score: mine.score } : null,
  });
}

// Country-to-country board: the median of each player's best score, countries with at least
// MIN_COUNTRY_PLAYERS players only. The player's own country is reported even when it is not listed yet.
async function countriesBoard(env, req, url) {
  if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
  const now = Date.now();
  const game = boardGame(url);
  if (!isGame(game)) return fail(400, 'bad_game', 'Choose a game from the list.');
  const day = periodDay(url, now);
  const rows = await countryBoard(env, { game, day, minPlayers: MIN_COUNTRY_PLAYERS, limit: COUNTRY_BOARD_LIMIT });
  const row = await petFromSession(env, req);
  let mine = null;
  if (row?.country && row.country !== UNDISCLOSED) {
    mine = { country: row.country, players: await countryPlayerCount(env, { game, day, country: row.country }) };
    mine.listed = rows.some((r) => r.country === row.country);
  }
  return json({
    game, period: day ? 'day' : 'all', day, resetsInMs: day ? msToReset(now) : null, minPlayers: MIN_COUNTRY_PLAYERS,
    rows: rows.map((r, i) => ({ rank: i + 1, country: r.country, players: r.players, median: Math.round(r.median * 10) / 10 })),
    mine,
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
<script src="/assets/vendor/qrcode.js"></script>
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
    if (p === '/api/leaderboard/countries') return countriesBoard(env, req, url);
    if (p === '/api/public') {
      if (!(await rateLimit(env, req, 'social'))) return SLOW_DOWN();
      const t = await targetFrom(env, url.searchParams.get('code'));
      if (!t) return fail(404, 'not_found', 'No Peetako has that Call Code.');
      const bests = await bestScoresOf(env, t.id);
      return json({ pet: publicView(t, Date.now()), best: bests.kelip ?? 0, bests, owns: (await inventoryOf(env, t.id)).map((i) => i.item), badges: await badgesOf(env, t.id) });
    }
    if (p === '/api/admin/reports') return adminReports(env, req);
    if (p === '/api/friends') return friends(env, req);
    return null;
  }
  if (m === 'POST') {
    if (p === '/api/checkin') return checkin(env, req);
    if (p === '/api/shop/buy') return buy(env, req);
    if (p === '/api/equip') return equip(env, req);
    if (p === '/api/gift') return gift(env, req);
    if (p === '/api/pamper') return pamper(env, req);
    if (p === '/api/battle') return battle(env, req);
    if (p === '/api/report') return report(env, req);
    if (p === '/api/events/seen') return eventsSeen(env, req);
    if (p === '/api/game/start') return gameStart(env, req);
    if (p === '/api/game/finish') return gameFinish(env, req);
    if (p === '/api/admin/resolve') return adminResolve(env, req);
    if (p === '/api/mentor') return mentor(env, req);
    if (p === '/api/contact') return contact(env, req);
    if (p === '/api/block') return block(env, req);
    if (p === '/api/challenges') return challenges(env, req);
  }
  return null;
}
