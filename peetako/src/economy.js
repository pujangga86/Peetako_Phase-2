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

// ---------- all mini-games (decided 20 Oct 2026) ----------
// Five games share one daily coin cap (COIN.gameMaxPerDay, kind 'game_coins'). Each has its own leaderboards and
// daily top-3 badges. The server never replays a run: it checks that the result is possible in the time the run
// took, then works out the score itself wherever it can (Ikut Rentak, Padan Motif, Panjat Pokok).
export const GAMES = {
  // Tangkap Kelip-kelip: tap fireflies. count = fireflies caught; 1 coin per 5.
  kelip: { name: 'Tangkap Kelip-kelip', unit: 'firefly', units: 'fireflies', perCoin: COIN.firefliesPerCoin,
    runMs: GAME.runMs, misses: GAME.misses, goldValue: GAME.goldValue, combo: GAME.comboSteps,
    maxPerSecond: GAME.maxPerSecond, maxScore: GAME.maxScore },
  // Ikut Rentak: repeat a growing pattern of sompoton, sape, agung and chik-chak. count = rounds cleared; 1 coin
  // per round. Round r (from 1) is startLen + r - 1 notes long; score = 10 points per note repeated.
  rentak: { name: 'Ikut Rentak', unit: 'round', units: 'rounds', perCoin: 1, startLen: 3, maxRounds: 40,
    pointsPerNote: 10, minMsPerNote: 500 },
  // Lidah Pantas: flick the tongue at bugs crossing the screen. count = bugs caught; 1 coin per 5.
  lidah: { name: 'Lidah Pantas', unit: 'bug', units: 'bugs', perCoin: 5, runMs: 60_000, misses: 3, goldValue: 5,
    combo: [[15, 3], [5, 2]], maxPerSecond: 2.5, maxScore: 3000 },
  // Padan Motif: match pairs of Borneo motifs on three boards (6, 8 and 10 pairs). No clock. count = pairs
  // matched; score = 10 a pair, −2 a wrong guess (never below 0), +50 for each board cleared; 1 coin per 3 pairs.
  motif: { name: 'Padan Motif', unit: 'pair', units: 'pairs', perCoin: 3, boards: [6, 8, 10], pairPoints: 10,
    missPenalty: 2, clearBonus: 50, minMsPerPair: 500, maxMisses: 2000 },
  // Panjat Pokok: climb the tree, dodging branches, before the timer runs out. count = metres; score = metres;
  // 1 coin per 20 m.
  panjat: { name: 'Panjat Pokok', unit: 'metre', units: 'metres', perCoin: 20, maxPerSecond: 8, maxScore: 5000 },
};
export const GAME_IDS = Object.keys(GAMES);
export const isGame = (id) => typeof id === 'string' && Object.hasOwn(GAMES, id);
export const coinsFor = (game, count) => Math.floor(count / GAMES[game].perCoin);

// What the client needs to set up a run of `game`.
export function gameSetup(game) {
  const g = GAMES[game];
  const { name, unit, units, perCoin, ...rest } = g;
  return { game, name, unit, units, perCoin, ...rest };
}

// Checks a finished run and returns { score, count } or { error } (an error code for the API).
// body is what the client sent; elapsed is how long the run lasted in ms, measured by the server.
export function judgeRun(game, body, elapsed) {
  const g = GAMES[game];
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
  const secs = elapsed / 1000;
  if (game === 'kelip' || game === 'lidah') {
    const score = int(Number(body.score));
    const raw = body.count ?? body.fireflies;
    const count = raw === undefined ? score : int(Number(raw)); // older clients sent fireflies only
    if (score === null || count === null) return { error: 'bad_run' };
    const topCombo = g.combo[0][1];
    const maxCount = Math.floor((Math.min(elapsed, g.runMs + 10_000) / 1000) * g.maxPerSecond);
    if (count > maxCount || score < count || score > Math.min(g.maxScore, count * g.goldValue * topCombo)) return { error: 'implausible' };
    return { score, count };
  }
  if (game === 'rentak') {
    const count = int(Number(body.count));
    if (count === null) return { error: 'bad_run' };
    if (count > g.maxRounds) return { error: 'implausible' };
    let notes = 0;
    for (let r = 1; r <= count; r++) notes += g.startLen + r - 1;
    // Every note is played once by the game and once by the player.
    if (elapsed < notes * g.minMsPerNote) return { error: 'implausible' };
    return { score: notes * g.pointsPerNote, count };
  }
  if (game === 'motif') {
    const count = int(Number(body.count));
    const misses = int(Number(body.misses ?? 0));
    if (count === null || misses === null) return { error: 'bad_run' };
    const total = g.boards.reduce((a, b) => a + b, 0);
    if (count > total || misses > g.maxMisses || elapsed < count * g.minMsPerPair) return { error: 'implausible' };
    let cleared = 0;
    for (let i = 0, sum = 0; i < g.boards.length; i++) { sum += g.boards[i]; if (count >= sum) cleared += 1; }
    const score = Math.max(0, count * g.pairPoints - misses * g.missPenalty) + cleared * g.clearBonus;
    return { score, count };
  }
  if (game === 'panjat') {
    const count = int(Number(body.count));
    if (count === null) return { error: 'bad_run' };
    if (count > Math.min(g.maxScore, Math.floor(secs * g.maxPerSecond))) return { error: 'implausible' };
    return { score: count, count };
  }
  return { error: 'bad_game' };
}

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
