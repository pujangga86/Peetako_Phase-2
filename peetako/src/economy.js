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
  care: 10,              // per care action
  careMaxPerDay: 30,     // coins from care per day
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

// ---------- gifts ----------
export const GIFT_MAX_PER_DAY = 5; // gifts sent per pet per day, at the item's price; no resale

// ---------- Tangkap Kelip-kelip ----------
export const GAME = {
  runMs: 45_000,           // one run (within the decided 30–60 s)
  minMs: 20_000,           // a finish sooner than this is not accepted
  maxMs: 10 * 60_000,      // a run left open longer than this has expired
  maxPerSecond: 4,         // plausibility: fireflies caught per second of play
  maxScore: 180,
  startsPerHour: 40,       // per pet
};
export const coinsForScore = (score) => Math.floor(score / COIN.firefliesPerCoin);

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
// Raises the other pet's FUN (mood). Gives no coins and does not count as care, so nobody else
// can keep a pet alive on its owner's behalf.
export const PAMPER = { gain: 5, maxPerDay: 3 };
