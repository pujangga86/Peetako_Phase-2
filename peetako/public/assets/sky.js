// Peetako day and night sky (Phase 2A). Cosmetic only and browser only: it reads the device clock.
// Survival and hunger timers stay on server time; nothing here touches game state.
//
// Phases (GDD): dawn 05:30–07:00, day 07:00–17:30, dusk 17:30–19:30, night 19:30–05:30,
// blending over 30 minutes around each change. Tier sets the scenery; time of day sets sky and light.

const PHASES = {
  night: { top: '#0B1026', mid: '#1E1B4B', low: '#3B2F6B', shade: 0.55, stars: 1 },
  dawn:  { top: '#3B4A8C', mid: '#E9A0B0', low: '#FDBA74', shade: 0.25, stars: 0.25 },
  day:   { top: '#2BA8E8', mid: '#7DD3FC', low: '#E0F2FE', shade: 0,    stars: 0 },
  dusk:  { top: '#312E81', mid: '#C2410C', low: '#FB923C', shade: 0.3,  stars: 0.15 },
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
const mix = (a, b, t) => ({
  top: mixHex(a.top, b.top, t), mid: mixHex(a.mid, b.mid, t), low: mixHex(a.low, b.low, t),
  shade: a.shade + (b.shade - a.shade) * t, stars: a.stars + (b.stars - a.stars) * t,
});

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
  // Sun crosses from 06:00 to 18:30; moon from 18:30 to 06:00. pos = 0 (left horizon) … 1 (right).
  const sunPos = (m - 360) / 750;
  const moonPos = (((m - 1110) + 1440) % 1440) / 690;
  return {
    phase,
    ...colours,
    sun: sunPos >= 0 && sunPos <= 1 ? sunPos : null,
    moon: moonPos >= 0 && moonPos <= 1 ? moonPos : null,
  };
}

// For testing on a phone without changing the clock: add ?sky=dawn|day|dusk|night to the address.
const OVERRIDE = { dawn: 380, day: 720, dusk: 1080, night: 1380 };
export function localMinute(date = new Date()) {
  const forced = new URLSearchParams(location.search).get('sky');
  if (forced in OVERRIDE) return OVERRIDE[forced];
  return date.getHours() * 60 + date.getMinutes();
}

// Fixed star field (no randomness, so it does not jump between renders).
const STARS = [[8, 12], [18, 30], [27, 8], [36, 22], [44, 6], [52, 34], [61, 14], [70, 26], [78, 9], [88, 20], [94, 36], [14, 44], [66, 42], [40, 46]];

export function skyLayer(sky) {
  // Percent of the stage. The sun and moon keep to the side bands so they never sit behind the pet:
  // the first half of the arc climbs on the left, the second half descends on the right.
  const arc = (p) => ({
    x: p < 0.5 ? 6 + p * 44 : 72 + (p - 0.5) * 44,
    y: 44 - Math.sin(p * Math.PI) * 32,
  });
  let html = `<div class="sky-grad" style="background:linear-gradient(180deg,${sky.top} 0%,${sky.mid} 55%,${sky.low} 100%)"></div>`;
  if (sky.stars > 0.02) {
    html += `<svg class="sky-stars" viewBox="0 0 100 50" preserveAspectRatio="none" aria-hidden="true" style="opacity:${sky.stars.toFixed(2)}">${
      STARS.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 0.35 : 0.55}" fill="#fff"/>`).join('')}</svg>`;
  }
  if (sky.sun !== null) {
    const { x, y } = arc(sky.sun);
    html += `<span class="sky-body sun" style="left:${x}%;top:${y}%"></span>`;
  }
  if (sky.moon !== null) {
    const { x, y } = arc(sky.moon);
    html += `<span class="sky-body moon" style="left:${x}%;top:${y}%"></span>`;
  }
  return html;
}
