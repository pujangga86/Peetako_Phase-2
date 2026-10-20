// Peetako game rules — every tunable number for care and tiers lives here (2C economy: economy.js).
import { parseEquipped } from './economy.js';

// All values are first proposals from the GDD, to be tuned in playtesting.
// Phase 2: compressed tier schedule (decided 10 Oct 2026; survival windows unchanged) and Ascension.

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

// Tiers: [reached at day, organic name, robot name, survives unattended (hours)]
export const TIERS = [
  { day: 0,  organic: 'Egg',                           robot: 'Core',        survive: 48,  backdrop: 'Longhouse' },
  { day: 1,  organic: 'Hatchling',                     robot: 'Prototype',   survive: 48,  backdrop: 'Kampung garden' },
  { day: 2,  organic: 'Scout',                         robot: 'Unit',        survive: 60,  backdrop: 'Sago garden (Mukah)' },
  { day: 4,  organic: 'Bujang Berani (Brave Warrior)', robot: 'Sentinel',    survive: 72,  backdrop: 'Rainforest (Danum / Bako)' },
  { day: 7,  organic: 'Panglima (Champion)',           robot: 'Guardian',    survive: 96,  backdrop: 'Kinabatangan River' },
  { day: 14, organic: 'Hero',                          robot: 'Titan',       survive: 120, backdrop: 'Mulu Caves' },
  { day: 21, organic: 'Legend',                        robot: 'Apex',        survive: 168, backdrop: 'Semporna sea, Bajau stilt village' },
  { day: 30, organic: 'Mythic',                        robot: 'Prime',       survive: 240, backdrop: 'Highlands (Bario / Crocker Range)' },
  { day: 60, organic: 'Ageless',                       robot: 'Singularity', survive: 336, backdrop: 'Kinabalu summit' },
];
export const TOP_TIER = TIERS.length - 1;

// Colour palettes (Phase 2B). Cosmetic only: never affects stats, survival or battles.
// Chosen once by the owner at hatch, then locked.
export const PALETTES = ['hijau', 'tokay', 'kenyalang', 'puakumbu', 'laut'];
export const DEFAULT_PALETTE = 'hijau';

// Soft cap and Ascension (Tier 8). No maximum lifespan: after this many days at Tier 8, age stops
// counting for rankings and power, and the owner may choose Ascension (optional, cannot be undone).
export const ASCENSION_AFTER_DAYS_AT_TOP = 30;
export const SOFT_CAP_DAY = TIERS[TOP_TIER].day + ASCENSION_AFTER_DAYS_AT_TOP; // Day 90
// Legacy Score = whole days lived + points per distinct care day. Bond and battle wins join in Phase 3.
export const LEGACY_POINTS_PER_CARE_DAY = 2;

// Points lost per hour, before tier modifiers.
export const DECAY_PER_HOUR = { energy: 3.5, health: 2, temperature: 3, mood: 3 };
export const SLOW_DECAY_FROM_TIER = 3;   // "Stats decay 10% slower" from Tier 3
export const SLOW_DECAY_FACTOR = 0.9;
export const DORMANT_AFTER_HOURS = 24;   // no care for 24 h → Dormant
export const MENTOR_FACTOR = 0.9;        // Mentor Boost: the receiver decays 10% slower for 24 h (on top of Tier 3)
export const MENTOR_HOURS = 24;
export const LEGACY_FROM_DAY = 30;       // a pet that fell at Day 30 or later (or ascended) can claim a Legacy Egg

// Hibernation (decided 20 Oct 2026): automatic. When the survival window runs out, the pet sleeps instead of
// falling, using the days left this Malaysia calendar month. Stats stop decaying while it sleeps; care wakes it.
export const HIBERNATION_DAYS_PER_MONTH = 3;
const MYT = 8 * HOUR;
export const mytMonth = (ms) => new Date(ms + MYT).toISOString().slice(0, 7);
export const START_STATS = { energy: 80, health: 80, temperature: 80, mood: 80 };

// Care actions. Each raises one stat; any action counts as care.
export const ACTIONS = {
  organic: {
    feed:  { stat: 'energy',      gain: 35, label: 'Feed kelkatu' },
    shed:  { stat: 'health',      gain: 30, label: 'Help shed skin' },
    bask:  { stat: 'temperature', gain: 40, label: 'Bask under lamp' },
    play:  { stat: 'mood',        gain: 30, label: 'Play' },
  },
  robot: {
    charge: { stat: 'energy',      gain: 35, label: 'Charge Hydro Cell' },
    oil:    { stat: 'health',      gain: 30, label: 'Oil and de-rust' },
    cool:   { stat: 'temperature', gain: 40, label: 'Rajang Coolant' },
    update: { stat: 'mood',        gain: 30, label: 'Firmware update' },
  },
};

export function tierAt(ageMs) {
  const days = ageMs / DAY;
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (days >= TIERS[i].day) t = i;
  return t;
}

const clamp = (v) => Math.max(0, Math.min(100, v));

// When the survival window runs out if nobody cares for it again: the window of the tier it had when last cared for.
export function windowEnd(pet) {
  const tier = tierAt(pet.last_cared_at - pet.born_at);
  return pet.last_cared_at + TIERS[tier].survive * HOUR;
}

// Hibernation days still free for the month in which the window runs out.
export function hibernationLeft(pet) {
  const month = mytMonth(windowEnd(pet));
  const used = pet.hib_month === month ? pet.hibernation_days_used || 0 : 0;
  return Math.max(0, HIBERNATION_DAYS_PER_MONTH - used);
}

// When a pet falls if nobody cares for it again: the end of its window plus the hibernation days it has left.
export function deathTime(pet) {
  return windowEnd(pet) + hibernationLeft(pet) * DAY;
}

// Bring a stored pet row up to `now`. Pure: returns a new object, never writes.
export function advance(pet, now) {
  const p = { ...pet };
  if (p.died_at || p.ascended_at) return p; // fallen or ascended pets no longer change

  const deadline = deathTime(p);
  // Stats decay until the window ends; during hibernation they stay where they were.
  const decayUntil = Math.min(now, windowEnd(p));

  // Decay stats from stats_at, applying the slower rate from Tier 3 and while a Mentor Boost lasts.
  let t = p.stats_at;
  const mentorUntil = p.mentor_until || 0;
  while (t < decayUntil) {
    const tier = tierAt(t - p.born_at);
    // Step to the next tier boundary, the end of a Mentor Boost (or `decayUntil`) so the factor changes exactly there.
    const next = TIERS[tier + 1] ? p.born_at + TIERS[tier + 1].day * DAY : Infinity;
    const end = Math.min(decayUntil, next, t < mentorUntil ? mentorUntil : Infinity);
    const hours = (end - t) / HOUR;
    let f = tier >= SLOW_DECAY_FROM_TIER ? SLOW_DECAY_FACTOR : 1;
    if (t < mentorUntil) f *= MENTOR_FACTOR;
    for (const s of Object.keys(DECAY_PER_HOUR)) p[s] = clamp(p[s] - DECAY_PER_HOUR[s] * f * hours);
    t = end;
  }
  p.stats_at = Math.max(p.stats_at, Math.min(now, deadline));
  p.tier = tierAt(Math.min(now, deadline) - p.born_at);
  if (now >= deadline) p.died_at = deadline;
  return p;
}

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// True while the pet sleeps through hibernation (its window has run out, it has not fallen yet).
export const isHibernating = (pet, now) => !pet.died_at && !pet.ascended_at && now >= windowEnd(pet) && now < deathTime(pet);

export function applyCare(pet, action, now) {
  const def = ACTIONS[pet.type][action];
  if (!def) return null;
  const p = { ...pet };
  if (isHibernating(pet, now)) { // waking up: the days slept count against this month (whole days)
    const end = windowEnd(pet);
    const month = mytMonth(end);
    const used = pet.hib_month === month ? pet.hibernation_days_used || 0 : 0;
    p.hib_month = month;
    p.hibernation_days_used = Math.min(HIBERNATION_DAYS_PER_MONTH, used + Math.max(1, Math.ceil((now - end) / DAY)));
  }
  p[def.stat] = clamp(p[def.stat] + def.gain);
  p.last_cared_at = now;
  const day = utcDay(now);
  if (p.last_care_day !== day) { p.care_days = (p.care_days || 0) + 1; p.last_care_day = day; }
  return p;
}

export const legacyScore = (pet, now) =>
  Math.floor((now - pet.born_at) / DAY) + (pet.care_days || 0) * LEGACY_POINTS_PER_CARE_DAY;

// Why a pet cannot ascend right now, or null when it can. Only an active (cared for in the last 24 h)
// Tier 8 pet that has been at the top tier for ASCENSION_AFTER_DAYS_AT_TOP days may ascend.
export function ascensionBlock(pet, now) {
  if (pet.ascended_at) return 'already_ascended';
  if (pet.died_at) return 'fallen';
  if (now - pet.born_at < SOFT_CAP_DAY * DAY) return 'too_young';
  if (now - pet.last_cared_at > DORMANT_AFTER_HOURS * HOUR) return 'dormant';
  return null;
}

export function ascend(pet, now) {
  return { ...pet, ascended_at: now, legacy_score: legacyScore(pet, now), stats_at: now };
}

// Owner's view of the pet. Never includes pin_hash, reg_ip or id.
// Whether this ended pet's owner can claim a Legacy Egg: null for a living pet.
export function legacyEggState(pet, status) {
  if (status !== 'dead' && status !== 'ascended') return null;
  if (pet.legacy_claimed) return { available: false, reason: 'claimed' };
  if (status === 'dead' && pet.died_at - pet.born_at < LEGACY_FROM_DAY * DAY) return { available: false, reason: 'too_young' };
  return { available: true, reason: null };
}

export function view(pet, now) {
  const tier = TIERS[pet.tier];
  const end = pet.died_at || pet.ascended_at || now;
  const ageMs = end - pet.born_at;
  const next = TIERS[pet.tier + 1];
  const sinceCare = now - pet.last_cared_at;
  let status = 'active';
  if (pet.ascended_at) status = 'ascended';
  else if (pet.died_at) status = 'dead';
  else if (sinceCare > DORMANT_AFTER_HOURS * HOUR) status = 'dormant';
  const ended = status === 'dead' || status === 'ascended';
  const block = ended ? null : ascensionBlock(pet, now);
  const hibernating = isHibernating(pet, now);

  return {
    name: pet.name,
    nameStatus: pet.name_status || 'ok',           // 'hidden' while a report waits for review
    equipped: parseEquipped(pet.equipped),
    battles: { wins: pet.battle_wins || 0, losses: pet.battle_losses || 0 },
    type: pet.type,
    palette: PALETTES.includes(pet.palette) ? pet.palette : DEFAULT_PALETTE,
    callCode: pet.call_code,
    country: pet.country || null,                  // ISO code, 'ZZ' = prefers not to say, null = not chosen yet
    status,
    bornAt: pet.born_at,
    diedAt: pet.died_at || null,
    lastCaredAt: pet.last_cared_at,
    ageHours: Math.floor(ageMs / HOUR),
    tier: pet.tier,
    tierName: tier[pet.type],
    backdrop: tier.backdrop,
    nextTier: next ? { tier: pet.tier + 1, name: next[pet.type], atHours: next.day * 24 } : null,
    survivesUnattendedHours: tier.survive,
    hoursLeftUnattended: ended ? 0 : Math.max(0, (deathTime(pet) - now) / HOUR),   // including hibernation days
    hoursLeftInWindow: ended ? 0 : Math.max(0, (windowEnd(pet) - now) / HOUR),      // before hibernation starts
    // Hibernation: automatic when the window runs out; `daysLeft` is what is free in that month.
    hibernation: ended ? null : {
      active: hibernating,
      daysLeft: hibernationLeft(pet),
      windowEndsAt: windowEnd(pet),
      wakeBy: hibernating ? deathTime(pet) : null,
    },
    mentorUntil: !ended && (pet.mentor_until || 0) > now ? pet.mentor_until : null,
    openToChallenge: !!pet.open_to_challenge,
    legacy: !!pet.legacy_from,
    legacyEgg: legacyEggState(pet, status),
    // Age that counts for rankings and power stops at the soft cap.
    rankAgeHours: Math.floor(Math.min(ageMs, SOFT_CAP_DAY * DAY) / HOUR),
    careDays: pet.care_days || 0,
    ascendedAt: pet.ascended_at || null,
    legacyScore: pet.ascended_at ? pet.legacy_score : null,
    ascension: ended || pet.tier < TOP_TIER ? null : {
      available: block === null,
      reason: block,                                   // 'too_young' | 'dormant' | null
      atHours: SOFT_CAP_DAY * 24,                      // age when it becomes available
      projectedScore: legacyScore(pet, now),
    },
    stats: {
      energy: Math.round(pet.energy),
      health: Math.round(pet.health),
      temperature: Math.round(pet.temperature),
      mood: Math.round(pet.mood),
    },
    actions: ended ? [] : Object.entries(ACTIONS[pet.type]).map(([id, a]) => ({ id, label: a.label, stat: a.stat })),
  };
}
