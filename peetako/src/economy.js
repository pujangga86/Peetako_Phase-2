// Peetako Phase 2C — coins, cosmetics, gifts, mini-game, battles and Pamper.
// Every tunable number for the social and economy slice lives here (decided 14 and 17 Oct 2026).
// No real-money purchases, no gacha, no loot boxes: every item has a fixed, visible price.

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// ---------- daily reset: 00:00 Malaysia time (UTC+8) ----------
export const MYT_OFFSET = 8 * HOUR;
export const mytDay = (ms) => new Date(ms + MYT_OFFSET).toISOString().slice(0, 10);
export const prevDay = (day) => new Date(Date.parse(day + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
// Milliseconds until the next 00:00 MYT (shown to players as "resets in ...").
export const msToReset = (now) => DAY - ((now + MYT_OFFSET) % DAY);

// ---------- earning ----------
export const COIN = {
  care: 10,              // for the FIRST care action of each type per day (Feed, Clean, Warm/Cool, Play)
  careMaxPerDay: 30,     // coins from care per day (any 3 of the 4 types)
  checkin: 10,           // daily check-in
  streakEvery: 7,        // every 7th consecutive check-in day ...
  streakBonus: 30,       // ... pays this on top
  firefliesPerCoin: 5,   // Tangkap Kelip-kelip
  gameMaxPerDay: 50,
  tierUp: 50,            // × the tier reached
  referral: 100,         // to the player who invited
  referralMaxPerDay: 3,  // paid referrals per inviter per day
  referralNewPlayer: 50, // to the new player, once their pet has been cared for after its first day
};
export const REFERRAL_AFTER = DAY; // the new pet must be at least a day old when it is cared for

// ---------- cosmetics ----------
// slot: head | neck | back | backdrop. Prices 100 / 300 / 800, extra backdrop 500.
// Names are English (the game's language); "ms" gives the Malay word the item is named after.
export const CATALOG = [
  { id: 'ikat-manik',    slot: 'head',     price: 100, name: 'Beaded headband',  ms: 'Ikat kepala manik', robot: 'LED headband' },
  { id: 'rantai-manik',  slot: 'neck',     price: 100, name: 'Bead necklace',    ms: 'Rantai manik',      robot: 'Bead cable' },
  { id: 'terendak',      slot: 'head',     price: 300, name: 'Terendak hat',     ms: 'Terendak',          robot: 'Terendak dish' },
  { id: 'selempang-pua', slot: 'neck',     price: 300, name: 'Pua sash',         ms: 'Selempang pua',     robot: 'Pua circuit sash' },
  { id: 'sayap-kelip',   slot: 'back',     price: 800, name: 'Firefly wings',    ms: 'Sayap kelip-kelip', robot: 'Firefly thrusters' },
  { id: 'payung',        slot: 'back',     price: 800, name: 'Parasol',          ms: 'Payung tradisional', robot: 'Solar parasol' },
  { id: 'bg-kinabalu',   slot: 'backdrop', price: 500, name: 'Kinabalu from Kundasang', ms: 'Kinabalu dari Kundasang' },
  { id: 'bg-rajang',     slot: 'backdrop', price: 500, name: 'Rajang River',     ms: 'Sungai Rajang' },
];
export const ITEMS = Object.fromEntries(CATALOG.map((i) => [i.id, i]));
export const SLOTS = ['head', 'neck', 'back', 'backdrop'];

// Equipped items, stored as JSON on the pet. Unknown ids and wrong slots are dropped.
export function parseEquipped(raw) {
  let e = {};
  try { e = JSON.parse(raw || '{}'); } catch { e = {}; }
  const out = {};
  for (const s of SLOTS) if (e && typeof e[s] === 'string' && ITEMS[e[s]]?.slot === s) out[s] = e[s];
  return out;
}

// ---------- Legacy Egg (decided 20 Oct 2026) ----------
// The egg hatches straight to Tier 1, keeps half the old coins plus this bonus, and every cosmetic.
export const LEGACY_EGG = { coinShare: 0.5, bonus: 200 };

// ---------- gifts ----------
export const GIFT_MAX_PER_DAY = 5; // gifts sent per pet per day, at the item's price; no resale

// ---------- Tangkap Kelip-kelip (rules aligned with the GDD on 20 Oct 2026) ----------
// A run ends after 3 misses (a tap that catches nothing) or after 60 seconds. Consecutive catches build a combo
// (×2 from 5, ×3 from 10, ×4 from 20); a miss resets it. Golden fireflies are worth 5. Score = points;
// coins = 1 per 5 fireflies caught. The server checks plausibility, it does not replay the run.
export const GAME = {
  runMs: 60_000,           // longest run
  misses: 3,               // a run ends after this many misses
  minMs: 2_000,            // a finish sooner than this is not accepted
  maxMs: 10 * 60_000,      // a run left open longer than this has expired
  maxPerSecond: 4,         // plausibility: fireflies caught per second of play
  goldValue: 5,            // points for a golden firefly
  comboSteps: [[20, 4], [10, 3], [5, 2]], // [consecutive catches, multiplier]
  maxScore: 5000,
  startsPerHour: 40,       // per pet
};
export const maxCombo = () => GAME.comboSteps[0][1];
export const coinsForFireflies = (n) => Math.floor(n / COIN.firefliesPerCoin);

// ---------- Bond (decided 20 Oct 2026) ----------
// Points shared by a pair of pets. Level names show as badges; Level 2 unlocks the shared selfie.
export const BOND = {
  points: { pamper: 10, gift: 20, battle: 5, mentor: 10 },
  levels: [
    { at: 0, name: null },
    { at: 30, name: 'Friends' },
    { at: 100, name: 'Buddies' },
    { at: 250, name: 'Best Friends' },
    { at: 500, name: 'Forever Friends' },
  ],
  selfieFromLevel: 2,
};
export function bondInfo(points = 0) {
  let level = 0;
  BOND.levels.forEach((l, i) => { if (points >= l.at) level = i; });
  const next = BOND.levels[level + 1];
  return {
    points, level, name: BOND.levels[level].name,
    next: next ? { level: level + 1, name: next.name, at: next.at } : null,
    selfie: level >= BOND.selfieFromLevel,
  };
}

// ---------- Contacts and Block ----------
export const MAX_CONTACTS = 100;
export const MAX_BLOCKS = 200;

// ---------- Mentor Boost (decided 20 Oct 2026) ----------
// An active Tier 4+ pet boosts a living pet of a lower tier: 10% slower decay for 24 h (game.js).
export const MENTOR = { minTier: 4, perGiverPerDay: 3, perReceiverPerDay: 1 };

// ---------- friendly battles (decided 17 Oct 2026) ----------
// Outcome from stats + tier + a small random part. No penalty for the loser, no coins.
export const BATTLE = {
  maxPerDay: 5,
  statWeight: 0.6,   // × average of the four stats (0..100)
  tierWeight: 6,     // × tier
  luck: 20,          // + random 0..luck
  rounds: 3,
};
export function battlePower(p) {
  const avg = (p.energy + p.health + p.temperature + p.mood) / 4;
  return avg * BATTLE.statWeight + p.tier * BATTLE.tierWeight;
}

// ---------- Pamper ----------
// Both pets get +5 FUN (mood) and the pair gains Bond. Gives no coins and does not count as care, so nobody
// else can keep a pet alive on its owner's behalf.
export const PAMPER = { gain: 5, maxPerDay: 3 };
