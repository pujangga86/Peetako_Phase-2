// Peetako game rules — every tunable number lives here.
// All values are first proposals from the GDD, to be tuned in playtesting.
// Phase 2: compressed tier schedule (decided 10 Oct 2026; survival windows unchanged) and Ascension.

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

// Tiers: [reached at day, organic name, robot name, survives unattended (hours)]
export const TIERS = [
  { day: 0,  organic: 'Egg',                           robot: 'Core',        survive: 48,  backdrop: 'Longhouse at night' },
  { day: 1,  organic: 'Hatchling',                     robot: 'Prototype',   survive: 48,  backdrop: 'Kampung garden' },
  { day: 2,  organic: 'Scout',                         robot: 'Unit',        survive: 60,  backdrop: 'Sago garden (Mukah)' },
  { day: 4,  organic: 'Bujang Berani (Brave Warrior)', robot: 'Sentinel',    survive: 72,  backdrop: 'Rainforest (Danum / Bako)' },
  { day: 7,  organic: 'Panglima (Champion)',           robot: 'Guardian',    survive: 96,  backdrop: 'Kinabatangan River with fireflies' },
  { day: 14, organic: 'Hero',                          robot: 'Titan',       survive: 120, backdrop: 'Mulu Caves at the evening bat exodus' },
  { day: 21, organic: 'Legend',                        robot: 'Apex',        survive: 168, backdrop: 'Semporna sea, Bajau stilt village' },
  { day: 30, organic: 'Mythic',                        robot: 'Prime',       survive: 240, backdrop: 'Highlands (Bario / Crocker Range)' },
  { day: 60, organic: 'Ageless',                       robot: 'Singularity', survive: 336, backdrop: 'Kinabalu summit' },
];
export const TOP_TIER = TIERS.length - 1;

// Colour palettes (Phase 2B). Cosmetic only: never affects stats, survival or battles.
// A new pet gets one at random; the owner can switch any time from the menu.
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

// When a pet dies if nobody cares for it again: survival window of the tier it had when last cared for.
export function deathTime(pet) {
  const tier = tierAt(pet.last_cared_at - pet.born_at);
  return pet.last_cared_at + TIERS[tier].survive * HOUR;
}

// Bring a stored pet row up to `now`. Pure: returns a new object, never writes.
export function advance(pet, now) {
  const p = { ...pet };
  if (p.died_at || p.ascended_at) return p; // fallen or ascended pets no longer change

  const deadline = deathTime(p);
  const until = Math.min(now, deadline);

  // Decay stats from stats_at to `until`, applying the slower rate once Tier 3 is reached.
  let t = p.stats_at;
  while (t < until) {
    const tier = tierAt(t - p.born_at);
    // Step to the next tier boundary (or `until`) so the decay factor changes exactly there.
    const next = TIERS[tier + 1] ? p.born_at + TIERS[tier + 1].day * DAY : Infinity;
    const end = Math.min(until, next);
    const hours = (end - t) / HOUR;
    const f = tier >= SLOW_DECAY_FROM_TIER ? SLOW_DECAY_FACTOR : 1;
    for (const s of Object.keys(DECAY_PER_HOUR)) p[s] = clamp(p[s] - DECAY_PER_HOUR[s] * f * hours);
    t = end;
  }
  p.stats_at = until;
  p.tier = tierAt(until - p.born_at);
  if (now >= deadline) p.died_at = deadline;
  return p;
}

export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export function applyCare(pet, action, now) {
  const def = ACTIONS[pet.type][action];
  if (!def) return null;
  const p = { ...pet };
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

// Public shape sent to the browser. Never includes key_hash or id.
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

  return {
    name: pet.name,
    type: pet.type,
    palette: PALETTES.includes(pet.palette) ? pet.palette : DEFAULT_PALETTE,
    callCode: pet.call_code,
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
    hoursLeftUnattended: ended ? 0 : Math.max(0, (deathTime(pet) - now) / HOUR),
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
