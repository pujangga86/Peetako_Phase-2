// Peetako day and night sky (Phase 2A, recoloured in 2B). Cosmetic only and browser only:
// it reads the device clock. Survival and hunger timers stay on server time.
//
// Phases (GDD): dawn 05:30–07:00, day 07:00–17:30, dusk 17:30–19:30, night 19:30–05:30,
// blending over 30 minutes around each change. Tier sets the scenery; time of day sets the
// sky, the scenery colours and the light. Colours come from the "Tiers 0-8 x 5 palettes" mockup.

const PHASES = {
  dawn:  { sky1: '#6C6FB8', sky2: '#FFB38A', far: '#8C7BB0', mid: '#5E5A95', near: '#3E3A70', ground: '#4F6A4A', water: '#7C93C8', sunC: '#FFD18A',
           starOp: 0.25, moonOp: 0, sunOp: 1, sunX: 236, sunY: 168, cloudOp: 0.35, glowOp: 0.5 },
  day:   { sky1: '#5CBDEB', sky2: '#CFF1FA', far: '#8FBFCB', mid: '#4E9A6E', near: '#2F7350', ground: '#5DA35A', water: '#3FB6D8', sunC: '#FFE066',
           starOp: 0, moonOp: 0, sunOp: 1, sunX: 236, sunY: 56, cloudOp: 0.9, glowOp: 0 },
  dusk:  { sky1: '#3D2D6B', sky2: '#F2885B', far: '#A0607A', mid: '#6A3D63', near: '#3C2546', ground: '#4A3A3E', water: '#6A4E8A', sunC: '#FF9F5A',
           starOp: 0.4, moonOp: 0, sunOp: 1, sunX: 64, sunY: 176, cloudOp: 0.3, glowOp: 0.85 },
  night: { sky1: '#14123A', sky2: '#2B2770', far: '#3B3787', mid: '#2A2766', near: '#1C1A4A', ground: '#173A2A', water: '#1E3A6A', sunC: '#FFE066',
           starOp: 1, moonOp: 1, sunOp: 0, sunX: 236, sunY: 56, cloudOp: 0, glowOp: 1 },
};
// Phase that starts at each boundary, in minutes after local midnight.
const BOUNDARIES = [[330, 'dawn'], [420, 'day'], [1050, 'dusk'], [1170, 'night']];
const ORDER = ['night', 'dawn', 'day', 'dusk'];
const BLEND_MIN = 30;

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => {
  const A = hexToRgb(a), B = hexToRgb(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
function mix(a, b, t) {
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = typeof a[k] === 'number' ? a[k] + (b[k] - a[k]) * t : mixHex(a[k], b[k], t);
  }
  return out;
}

function phaseAt(min) {
  let phase = 'night';
  for (const [b, name] of BOUNDARIES) if (min >= b) phase = name;
  return phase;
}

// Sky for a given local time. `minute` = minutes after local midnight (0–1439).
export function skyAt(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  const phase = phaseAt(m);
  let colours = PHASES[phase];
  for (const [b, next] of BOUNDARIES) {
    const d = m - b;
    if (Math.abs(d) < BLEND_MIN / 2) {
      const prev = ORDER[(ORDER.indexOf(next) + ORDER.length - 1) % ORDER.length];
      colours = mix(PHASES[prev], PHASES[next], (d + BLEND_MIN / 2) / BLEND_MIN);
    }
  }
  return { phase, ...colours };
}

// For testing on a phone without changing the clock: add ?sky=dawn|day|dusk|night to the address.
const OVERRIDE = { dawn: 380, day: 720, dusk: 1110, night: 1380 };
export function localMinute(date = new Date()) {
  let forced = null;
  try { forced = new URLSearchParams(location.search).get('sky'); } catch { /* not in a browser */ }
  if (forced in OVERRIDE) return OVERRIDE[forced];
  return date.getHours() * 60 + date.getMinutes();
}
