// Peetako countries (decided 17 Oct 2026): the ISO 3166-1 alpha-2 list and nothing else.
// No additions, no removals, no political judgement: the standard decides what is on the list.
// A player picks a country once, when the Peetako hatches (or once, later, for a pet that hatched before
// countries existed). The choice is locked. "Prefer not to say" is stored as UNDISCLOSED and only ever
// appears on the global leaderboard.

export const COUNTRIES = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
  'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
  'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ ' +
  'EC EE EG EH ER ES ET ' +
  'FI FJ FK FM FO FR ' +
  'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
  'HK HM HN HR HT HU ' +
  'ID IE IL IM IN IO IQ IR IS IT ' +
  'JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ ' +
  'LA LB LC LI LK LR LS LT LU LV LY ' +
  'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
  'NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM ' +
  'PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA ' +
  'RE RO RS RU RW ' +
  'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
  'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG UM US UY UZ ' +
  'VA VC VE VG VI VN VU ' +
  'WF WS ' +
  'YE YT ' +
  'ZA ZM ZW'
).split(' ').filter(Boolean);

const SET = new Set(COUNTRIES);

// Stored when the player chooses "Prefer not to say". Not a country: never ranked, never shown with a flag.
export const UNDISCLOSED = 'ZZ';

// Smallest number of players a country needs before it is listed on the country-to-country board.
// Lowered from 5 to 3 for the early days (17 Oct 2026); raise it again when there are enough players.
export const MIN_COUNTRY_PLAYERS = 3;

// 'my', ' MY ' -> 'MY'; anything else -> null.
export const normCountry = (raw) => {
  const c = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : null;
};
export const isCountry = (c) => SET.has(c);
// A country chosen at hatch: a real ISO country, or UNDISCLOSED. Returns the code or null.
export function countryChoice(raw) {
  const c = normCountry(raw);
  return c && (SET.has(c) || c === UNDISCLOSED) ? c : null;
}
// Cloudflare's guess from the network (request.cf.country). Only ever a suggestion; ignores Tor ("T1"),
// unknown ("XX") and anything that is not on the list.
export function suggestedCountry(req) {
  const c = normCountry(req?.cf?.country);
  return c && SET.has(c) ? c : null;
}
