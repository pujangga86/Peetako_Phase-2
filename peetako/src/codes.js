// Call Codes chosen by the player (Phase 2C).
import { randInt } from './http.js';

// ---------- Call Code (chosen by the player, 16 Oct 2026) ----------
// PTK- plus 6 to 8 letters and digits. O, I and L are allowed so Borneo words fit (TOKAY, RIMBA, BUKIT);
// uniqueness treats 0 as O and 1/L as I, so look-alike codes cannot both exist. Locked after hatch.
export const CODE_MIN = 6;
export const CODE_MAX = 8;
export const prefix = (env) => env.CALL_CODE_PREFIX || 'PTK';

// The part after the prefix, upper-case, or null when the shape is wrong. Accepts "tokay88",
// "PTK-TOKAY88" and "ptk tokay88".
export function codeSuffix(env, raw) {
  let s = String(raw || '').toUpperCase().replace(/[\s_]+/g, '');
  const p = prefix(env);
  if (s.startsWith(p + '-')) s = s.slice(p.length + 1);
  else if (s.startsWith(p) && s.length > CODE_MAX) s = s.slice(p.length); // "PTKTOKAY88" typed without the dash
  return new RegExp(`^[A-Z0-9]{${CODE_MIN},${CODE_MAX}}$`).test(s) ? s : null;
}
export const codeKeyOf = (env, suffix) => `${prefix(env)}-${suffix.replace(/0/g, 'O').replace(/[1L]/g, 'I')}`;

// Cute suggestions, some Borneo-themed. Words of 6–8 letters stand alone; shorter ones get digits or a partner.
const CODE_WORDS = ['TOKAY', 'RIMBA', 'BUKIT', 'KELIP', 'SAGO', 'MULU', 'BAKO', 'DANUM', 'RAJANG', 'KAPIT', 'KUDAT', 'SAPE',
  'MIDIN', 'TUHAU', 'PANDAN', 'DURIAN', 'LANGSAT', 'BINTANG', 'ENGGANG', 'KINABALU', 'PITAK', 'TAKO', 'BORNEO', 'CICAK',
  'CHIKCHAK', 'BULAN', 'AWAN', 'PELANGI', 'COMEL', 'MANJA', 'GECKO', 'LUNDU', 'RANAU', 'BARIO', 'SIPUT', 'KATAK', 'PADI', 'NIPAH'];
export function suggestion() {
  const w = CODE_WORDS[randInt(CODE_WORDS.length)];
  if (w.length >= CODE_MIN && randInt(3) === 0) return w;
  const partner = CODE_WORDS.filter((x) => w.length + x.length <= CODE_MAX && x !== w);
  if (w.length + 3 <= CODE_MAX && randInt(2) === 0 && partner.length) return w + partner[randInt(partner.length)];
  const digits = Math.max(2, CODE_MIN - w.length);
  if (w.length + digits > CODE_MAX) return w;
  return w + String(randInt(10 ** digits)).padStart(digits, '0');
}

