// Short server-side blocklist (English and Malay) for the only free text in Peetako: pet names,
// and chosen Call Codes. Decided 11 Oct 2026: blocklist + Report button, no chat.
// (The Tier 7 custom title was removed on 17 Oct 2026, so pet names are now the only free text.)
//
// The list is deliberately short. It catches the common slurs and swear words, including simple
// disguises (spaces, dots, l33t digits, stretched letters). Anything it misses is handled by Report:
// a reported name is hidden at once until an admin reviews it.

// Matched anywhere inside the text (long or unambiguous words).
const ANYWHERE = [
  // English
  'fuck', 'shit', 'bitch', 'cunt', 'pussy', 'nigger', 'nigga', 'faggot', 'retard',
  'slut', 'whore', 'rapist', 'hitler', 'porn', 'penis', 'vagina', 'bastard', 'asshole',
  'blowjob', 'dildo', 'twat',
  // Malay
  'pukimak', 'puki', 'kimak', 'lancau', 'pantat', 'butoh', 'burit', 'kontol', 'memek', 'ngentot', 'bangsat',
  'keparat', 'sundal', 'pelacur', 'lahanat', 'cibai', 'pundek', 'jubur', 'haramjadah', 'anakharam', 'celaka',
  'bodoh', 'babi', 'bapuk', 'pondan', 'tetek', 'mampus',
];
// Matched only as a whole word, because they are also parts of innocent words.
// (e.g. Grape, Peacock, Nazir, Semenggoh, Kelingking, Swanky, Thorny must stay allowed)
const WHOLE = ['sial', 'anjing', 'kote', 'sex', 'sexy', 'ass', 'tits', 'boob', 'boobs', 'jalang', 'bodo', 'bangang', 'beruk',
  'rape', 'cock', 'dick', 'nazi', 'semen', 'keling', 'wank', 'horny', 'setan',
  // Religion (added 20 Oct 2026, GDD Cultural sensitivity): sacred names and terms, and religious insults.
  'allah', 'tuhan', 'nabi', 'rasul', 'rasulullah', 'muhammad', 'mohammad', 'mohamad', 'muhamad', 'quran', 'alquran',
  'god', 'jesus', 'yesus', 'christ', 'kristus', 'buddha', 'bible', 'injil', 'kafir', 'murtad', 'jihad', 'isis', 'satan', 'syaitan',
  // Royalty (added 20 Oct 2026): titles of Malaysia's rulers. Whole words only, so Rajang and Tengkuk stay allowed.
  'sultan', 'sultanah', 'agong', 'raja', 'permaisuri', 'tunku', 'tengku', 'baginda', 'tuanku', 'ydpa', 'yangdipertuan', 'king', 'queen'];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
const squash = (s) => s.replace(/(.)\1+/g, '$1');            // "fuuuck" → "fuck"
const deleet = (s) => s.toLowerCase().replace(/[0134578@$!]/g, (c) => LEET[c] || c);

const ANY = ANYWHERE.map(squash);
const WHOLESET = new Set(WHOLE.map(squash));

// True when the text should be refused.
export function isBlocked(text) {
  const raw = String(text || '');
  return check(deleet(raw)) || check(raw.toLowerCase().replace(/[0-9]/g, ' ')); // "SEX123" as well as "S3X"
}

function check(t) {
  const joined = squash(t.replace(/[^a-z]/g, ''));
  if (ANY.some((w) => joined.includes(w))) return true;
  const words = t.split(/[^a-z]+/).filter(Boolean).map(squash);
  if (words.some((w) => WHOLESET.has(w))) return true;
  return WHOLESET.has(joined); // "S E X" or a Call Code made of one blocked word plus digits
}
