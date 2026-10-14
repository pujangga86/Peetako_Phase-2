// Peetako vector art — square-faced gecko, Organic or Robot, with tier accessories.
// drawPet({ type, tier, status, mood }) returns an SVG string (viewBox 240×240).
// drawMoodSymbols(symbols) returns the floating mood symbols as an overlay SVG of the same size.

const OUT = '#1B1A2E';

function palette(type, dead) {
  if (dead) return { body: '#CBD5E1', dark: '#94A3B8', belly: '#E2E8F0', accent: '#F1F5F9', screen: '#64748B', glow: '#E2E8F0' };
  return type === 'robot'
    ? { body: '#A5B4C8', dark: '#64748B', belly: '#DCE3EC', accent: '#67E8F9', screen: '#0F172A', glow: '#67E8F9' }
    : { body: '#34C76A', dark: '#16A34A', belly: '#C9F7D6', accent: '#F5B700', screen: null, glow: '#FDE68A' };
}

function egg(type, dead, status) {
  const c = palette(type, dead);
  if (type === 'robot') {
    const pulse = dead || status === 'dormant' ? '' : '<animate attributeName="opacity" values=".35;.8;.35" dur="2.4s" repeatCount="indefinite"/>';
    return `
      <ellipse cx="120" cy="210" rx="56" ry="10" fill="#000" opacity=".2"/>
      <circle cx="120" cy="140" r="70" fill="${c.glow}" opacity=".35">${pulse}</circle>
      <rect x="62" y="82" width="116" height="116" rx="34" fill="${c.body}" stroke="${OUT}" stroke-width="5"/>
      <rect x="80" y="100" width="80" height="80" rx="20" fill="${c.screen}" stroke="${OUT}" stroke-width="4"/>
      <path d="M120 112 L144 126 L144 154 L120 168 L96 154 L96 126 Z" fill="none" stroke="${c.accent}" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="120" cy="140" r="9" fill="${c.accent}"/>
      <circle cx="72" cy="92" r="4" fill="${c.dark}"/><circle cx="168" cy="92" r="4" fill="${c.dark}"/>
      <circle cx="72" cy="188" r="4" fill="${c.dark}"/><circle cx="168" cy="188" r="4" fill="${c.dark}"/>`;
  }
  return `
    <ellipse cx="120" cy="210" rx="56" ry="10" fill="#000" opacity=".2"/>
    <path d="M120 58 C 168 58 186 120 186 152 C 186 190 156 206 120 206 C 84 206 54 190 54 152 C 54 120 72 58 120 58 Z"
          fill="${dead ? c.belly : '#FFF4D6'}" stroke="${OUT}" stroke-width="5"/>
    <circle cx="98" cy="110" r="9" fill="${c.body}"/><circle cx="142" cy="96" r="6" fill="${c.body}"/>
    <circle cx="150" cy="150" r="11" fill="${c.body}"/><circle cx="92" cy="166" r="7" fill="${c.body}"/>
    <circle cx="124" cy="186" r="5" fill="${c.body}"/>
    <path d="M86 132 l10 -8 l10 8 l10 -8 l10 8 l10 -8 l10 8 l10 -8" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>`;
}

// Faces per mood. Each mood has a different SHAPE (not only a different colour) so it reads without colour.
function eyes(type, c, status, face) {
  if (status === 'dead' || status === 'dormant') {
    const y = 94;
    const lid = (x) => `<path d="M${x - 15} ${y} Q ${x} ${y + 12} ${x + 15} ${y}" fill="none" stroke="${type === 'robot' ? c.accent : OUT}" stroke-width="5" stroke-linecap="round"/>`;
    return lid(96) + lid(144);
  }
  if (type === 'robot') {
    // LED eyes on the screen face
    const a = c.accent;
    const led = {
      happy: (x) => `<rect x="${x - 12}" y="80" width="24" height="24" rx="3" fill="${a}"/><rect x="${x - 4}" y="84" width="8" height="8" fill="#ECFEFF"/>`,
      excited: (x) => `<path d="M${x - 14} 100 L${x} 82 L${x + 14} 100" fill="none" stroke="${a}" stroke-width="7" stroke-linejoin="miter"/>`,
      hungry: (x) => `<rect x="${x - 12}" y="78" width="24" height="24" rx="3" fill="${a}"/><rect x="${x - 4}" y="78" width="8" height="8" fill="#ECFEFF"/>`,
      sleepy: (x) => `<rect x="${x - 12}" y="94" width="24" height="7" rx="2" fill="${a}"/>`,
      sad: (x) => `<rect x="${x - 12}" y="86" width="24" height="14" rx="3" fill="${a}" transform="rotate(${x < 120 ? -14 : 14} ${x} 93)"/>`,
    };
    const f = led[face] || led.happy;
    return f(96) + f(144);
  }
  const round = (x, look = 0) => `
    <circle cx="${x}" cy="92" r="21" fill="#fff" stroke="${OUT}" stroke-width="4"/>
    <circle cx="${x + 2}" cy="${95 + look}" r="13" fill="#1E1B4B"/>
    <circle cx="${x + 7}" cy="${88 + look}" r="5" fill="#fff"/>
    <circle cx="${x - 3}" cy="${101 + look}" r="2.5" fill="#fff"/>`;
  if (face === 'excited') {
    // Closed happy eyes (upturned arcs)
    const arc = (x) => `<path d="M${x - 15} 100 Q ${x} 74 ${x + 15} 100" fill="none" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>`;
    return arc(96) + arc(144);
  }
  if (face === 'hungry') return round(96, -7) + round(144, -7); // looking up, toward food
  if (face === 'sleepy') {
    // Heavy eyelids: the top half of each eye is covered by the body colour
    const half = (x) => `${round(x, 4)}
      <path d="M${x - 21} 92 A 21 21 0 0 1 ${x + 21} 92 Z" fill="${c.body}" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>`;
    return half(96) + half(144);
  }
  if (face === 'sad') {
    const brow = (x, d) => `<path d="M${x - 14} ${66 + d * 6} L${x + 14} ${66 - d * 6}" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/>`;
    return round(96, 5) + round(144, 5) + brow(96, -1) + brow(144, 1)
      + `<path d="M154 112 q -5 9 0 13 q 5 -4 0 -13 Z" fill="#7DD3FC" stroke="${OUT}" stroke-width="2"/>`; // a tear
  }
  return round(96) + round(144);
}

function mouth(type, c, status, face) {
  const col = type === 'robot' ? c.accent : OUT;
  const tongue = type === 'robot' ? 'none' : '#F87171';
  if (status === 'dead') return `<path d="M108 124 L132 124" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
  if (status === 'dormant') return `<circle cx="120" cy="124" r="4" fill="${col}"/>`;
  switch (face) {
    case 'excited':
      return `<path d="M100 116 Q 120 144 140 116 Z" fill="${tongue}" stroke="${col}" stroke-width="4" stroke-linejoin="round"/>`;
    case 'hungry':
      return `<ellipse cx="120" cy="124" rx="7" ry="8" fill="${tongue}" stroke="${col}" stroke-width="4"/>`
        + (type === 'robot' ? '' : `<path d="M131 128 q -3 8 0 11 q 4 -3 0 -11 Z" fill="#BAE6FD" stroke="${OUT}" stroke-width="2"/>`); // drool
    case 'sleepy':
      return `<path d="M110 124 q 5 -4 10 0 q 5 4 10 0" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    case 'sad':
      return `<path d="M106 130 Q 120 116 134 130" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"/>`;
    default:
      return `<path d="M106 118 Q 120 134 134 118" fill="${tongue}" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
}

function backAura(type, tier, dead) {
  if (dead) return ''; // no halo or holy-light effect on a fallen pet (GDD, Cultural sensitivity)
  let s = '';
  if (tier >= 8) {
    s += `<circle cx="120" cy="125" r="112" fill="#F5B700" opacity=".18"/>
          <path d="M40 70 q 14 -18 30 -4 q -16 4 -10 16 M200 70 q -14 -18 -30 -4 q 16 4 10 16" fill="none" stroke="#F5B700" stroke-width="5" stroke-linecap="round"/>`;
  }
  if (tier >= 6 && type === 'robot') {
    // Jet wings shaped like hornbill wings
    s += `<path d="M70 150 C 30 120 14 90 22 66 C 40 84 56 92 78 126 Z" fill="#E2E8F0" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
          <path d="M170 150 C 210 120 226 90 218 66 C 200 84 184 92 162 126 Z" fill="#E2E8F0" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
          <path d="M34 82 L60 116 M206 82 L180 116" stroke="#67E8F9" stroke-width="4" stroke-linecap="round"/>`;
  }
  return s;
}

function frontAura(type, tier, dead) {
  if (dead || tier < 6 || type === 'robot') return '';
  // Firefly aura
  const flies = [[36, 70], [206, 58], [24, 150], [214, 140], [60, 26], [182, 196], [48, 206]];
  return flies.map(([x, y], i) =>
    `<circle cx="${x}" cy="${y}" r="5" fill="#FDE047"><animate attributeName="opacity" values=".2;1;.2" dur="${2 + (i % 3) * .7}s" begin="${i * .3}s" repeatCount="indefinite"/></circle>`
  ).join('');
}

// Robot antenna bulb follows the mood: rays when excited, a blink when hungry, dim when sleepy, dark when sad.
function bulb(c, face, status) {
  const base = `<circle cx="120" cy="18" r="8" stroke="${OUT}" stroke-width="4"`;
  if (status === 'dead') return `${base} fill="${c.dark}"/>`;
  if (status === 'dormant' || face === 'sleepy') return `${base} fill="${c.accent}" opacity=".35"/>`;
  if (face === 'sad') return `${base} fill="${c.dark}"/>`;
  if (face === 'hungry') return `${base} fill="${c.accent}"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle>`;
  if (face === 'excited') return `${base} fill="${c.accent}"/>
    <path d="M120 2 v5 M104 10 l4 3 M136 10 l-4 3 M102 22 h5 M138 22 h-5" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>`;
  return `${base} fill="${c.accent}"/>`;
}

function headwear(type, tier, c, face = 'happy', status = 'active') {
  if (type === 'robot') {
    let s = `<line x1="120" y1="40" x2="120" y2="22" stroke="${OUT}" stroke-width="5"/>
             ${bulb(c, face, status)}`;
    if (tier >= 2) s += `<line x1="150" y1="42" x2="160" y2="26" stroke="${OUT}" stroke-width="4"/><circle cx="162" cy="23" r="5" fill="${c.accent}" stroke="${OUT}" stroke-width="3"/>`;
    return s;
  }
  if (tier >= 4) {
    // Gold headgear, loosely inspired by the Kadazandusun siga (not a copy of any piece)
    return `<path d="M58 62 Q 120 30 182 62 L 176 74 Q 120 48 64 74 Z" fill="#F5B700" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M74 64 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8" fill="none" stroke="#E11D48" stroke-width="3" stroke-linejoin="round"/>
            <path d="M182 62 l18 -10 l-4 18 Z" fill="#F5B700" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  if (tier >= 3) {
    // Warrior headcloth with a knot
    return `<path d="M60 66 Q 120 44 180 66 L 180 80 Q 120 60 60 80 Z" fill="#E11D48" stroke="${OUT}" stroke-width="4" stroke-linejoin="round"/>
            <path d="M178 70 q 22 -6 26 10 q -14 -2 -24 2 Z" fill="#E11D48" stroke="${OUT}" stroke-width="3" stroke-linejoin="round"/>
            <path d="M80 66 l6 6 M100 60 l6 6 M120 58 l6 6 M140 60 l6 6 M160 64 l6 6" stroke="#F5B700" stroke-width="3" stroke-linecap="round"/>`;
  }
  if (tier >= 2) return `<path d="M120 44 C 112 30 116 20 130 16 C 132 30 128 38 120 44 Z" fill="#86EFAC" stroke="${OUT}" stroke-width="3"/>`;
  return '';
}

function bodyDetails(type, tier, c) {
  let s = '';
  if (type === 'robot') {
    s += `<circle cx="96" cy="176" r="4" fill="${c.dark}"/><circle cx="144" cy="176" r="4" fill="${c.dark}"/>`;
    if (tier >= 3) s += `<path d="M90 160 h14 v10 h14 M150 160 h-14 v12 h-10" fill="none" stroke="${c.accent}" stroke-width="3" stroke-linecap="round"/>
                        <circle cx="118" cy="170" r="3" fill="${c.accent}"/><circle cx="126" cy="172" r="3" fill="${c.accent}"/>`;
    if (tier >= 4) s += `<path d="M84 186 h72" stroke="#F5B700" stroke-width="5" stroke-dasharray="4 6" stroke-linecap="round"/>`;
  } else {
    s += `<circle cx="84" cy="160" r="4" fill="${c.dark}"/><circle cx="158" cy="156" r="5" fill="${c.dark}"/><circle cx="170" cy="176" r="3.5" fill="${c.dark}"/>`;
    if (tier >= 1) s += `<path d="M96 150 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6 l6 -6 l6 6" fill="none" stroke="${c.accent}" stroke-width="3" stroke-linejoin="round"/>`;
  }
  return s;
}

function shield(type, tier, dead) {
  if (dead || tier < 5) return '';
  // Long oval shield, generic design inspired by Borneo shields (not a copy of a specific motif)
  const fill = type === 'robot' ? '#CBD5E1' : '#FFF4D6';
  const line = type === 'robot' ? '#0891B2' : '#E11D48';
  return `<g transform="rotate(-12 44 160)">
    <ellipse cx="44" cy="160" rx="20" ry="46" fill="${fill}" stroke="${OUT}" stroke-width="4"/>
    <path d="M44 120 L44 200 M30 140 Q 44 150 58 140 M30 180 Q 44 170 58 180" fill="none" stroke="${line}" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="44" cy="160" r="6" fill="#F5B700" stroke="${OUT}" stroke-width="2.5"/></g>`;
}

// mood: one of happy | hungry | sleepy | sad | excited (see mood.js). A number is still accepted
// (average stat 0-100) so older callers keep working.
export function drawPet({ type = 'organic', tier = 1, status = 'active', mood = 'happy' } = {}) {
  const face = typeof mood === 'number' ? (mood >= 60 ? 'happy' : mood >= 30 ? 'sleepy' : 'sad') : mood;
  if (status === 'ascended') status = 'active'; // an ascended pet is drawn awake and well
  const dead = status === 'dead';
  const c = palette(type, dead);
  const label = `${type === 'robot' ? 'Robot' : 'Organic'} Peetako${dead ? ' (fallen)' : ''}`;
  if (tier === 0) {
    return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label} egg"><g class="bob">${egg(type, dead, status)}</g></svg>`;
  }

  const head = type === 'robot'
    ? `<rect x="58" y="40" width="124" height="104" rx="30" fill="${c.body}" stroke="${OUT}" stroke-width="5"/>
       <rect x="70" y="54" width="100" height="78" rx="18" fill="${c.screen}" stroke="${OUT}" stroke-width="4"/>
       <circle cx="64" cy="92" r="5" fill="${c.dark}"/><circle cx="176" cy="92" r="5" fill="${c.dark}"/>`
    : `<rect x="58" y="40" width="124" height="104" rx="34" fill="${c.body}" stroke="${OUT}" stroke-width="5"/>
       <circle cx="84" cy="52" r="5" fill="${c.dark}" opacity=".7"/><circle cx="156" cy="50" r="4" fill="${c.dark}" opacity=".7"/>
       <ellipse cx="80" cy="120" rx="10" ry="6" fill="#FB7185" opacity="${dead ? 0 : .55}"/>
       <ellipse cx="160" cy="120" rx="10" ry="6" fill="#FB7185" opacity="${dead ? 0 : .55}"/>`;

  const tail = type === 'robot'
    ? `<path d="M164 182 L188 176 L200 160 L212 140" fill="none" stroke="${OUT}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
       <path d="M164 182 L188 176 L200 160 L212 140" fill="none" stroke="${c.body}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
       <circle cx="188" cy="176" r="5" fill="${c.dark}"/><circle cx="200" cy="160" r="5" fill="${c.dark}"/>
       <circle cx="213" cy="138" r="7" fill="${tier >= 5 && !dead ? c.accent : c.dark}" stroke="${OUT}" stroke-width="3"/>`
    : `<path d="M162 184 C 196 190 214 168 206 144 C 200 128 184 132 188 146" fill="none" stroke="${OUT}" stroke-width="18" stroke-linecap="round"/>
       <path d="M162 184 C 196 190 214 168 206 144 C 200 128 184 132 188 146" fill="none" stroke="${tier >= 5 && !dead ? '#FDE047' : c.body}" stroke-width="10" stroke-linecap="round"/>`;

  const legs = [[78, 196], [104, 204], [136, 204], [162, 196]].map(([x, y]) =>
    `<rect x="${x - 9}" y="${y - 18}" width="18" height="22" rx="8" fill="${c.body}" stroke="${OUT}" stroke-width="4"/>
     <circle cx="${x - 7}" cy="${y + 4}" r="4" fill="${c.body}" stroke="${OUT}" stroke-width="2.5"/>
     <circle cx="${x}" cy="${y + 6}" r="4" fill="${c.body}" stroke="${OUT}" stroke-width="2.5"/>
     <circle cx="${x + 7}" cy="${y + 4}" r="4" fill="${c.body}" stroke="${OUT}" stroke-width="2.5"/>`).join('');

  const zzz = status === 'dormant'
    ? `<text x="184" y="44" font-family="Bangers, sans-serif" font-size="26" fill="#fff" stroke="${OUT}" stroke-width="1.5">z</text>
       <text x="200" y="26" font-family="Bangers, sans-serif" font-size="20" fill="#fff" stroke="${OUT}" stroke-width="1.2">z</text>` : '';

  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
    ${backAura(type, tier, dead)}
    <ellipse cx="120" cy="214" rx="76" ry="10" fill="#000" opacity=".2"/>
    <g class="bob">
      ${tail}
      ${legs}
      <ellipse cx="120" cy="174" rx="56" ry="34" fill="${c.body}" stroke="${OUT}" stroke-width="5"/>
      <ellipse cx="120" cy="182" rx="34" ry="18" fill="${c.belly}"/>
      ${bodyDetails(type, tier, c)}
      ${head}
      ${headwear(type, tier, c, face, status)}
      ${eyes(type, c, status, face)}
      ${mouth(type, c, status, face)}
      ${shield(type, tier, dead)}
      ${zzz}
    </g>
    ${frontAura(type, tier, dead)}
  </svg>`;
}


// ---------- floating mood symbols (Phase 2A) ----------
// Drawn on a separate overlay SVG (same 240×240 box as the pet) so they can float beside it.
// At most two symbols: the first sits to the upper right of the head, the second to the upper left.
// Every symbol has a dark outline so it reads on any sky, and a distinct shape so it reads without colour.
const SLOTS = [[198, 58], [42, 62]];
const heart = (x, y, k = 1) =>
  `<path transform="translate(${x} ${y}) scale(${k})" d="M0 6 C -10 -2 -8 -12 0 -7 C 8 -12 10 -2 0 6 Z" fill="#FB7185" fill-opacity=".85" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>`;
const zed = (x, y, k) =>
  `<path transform="translate(${x} ${y}) scale(${k})" d="M-6 -7 H6 L-6 7 H6" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke"/>
   <path transform="translate(${x} ${y}) scale(${k})" d="M-6 -7 H6 L-6 7 H6" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const sparkle = (x, y, k) =>
  `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -10 Q 2 -2 10 0 Q 2 2 0 10 Q -2 2 -10 0 Q -2 -2 0 -10 Z" fill="#FDE047" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>`;

function symbol(kind, type, [x, y]) {
  switch (kind) {
    case 'happy': // hearts drifting up
      return `<g class="fx fx-rise">${heart(x - 8, y + 14, 1)}</g>
              <g class="fx fx-rise d2">${heart(x + 8, y + 6, .8)}</g>
              <g class="fx fx-rise d3">${heart(x, y - 4, .65)}</g>`;
    case 'hungry': { // thought bubble: kelkatu (winged termite) for Organic, a battery for Robot
      const inner = type === 'robot'
        ? `<rect x="${x - 11}" y="${y - 7}" width="20" height="14" rx="3" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>
           <rect x="${x + 9}" y="${y - 3}" width="3" height="6" fill="${OUT}"/>
           <rect x="${x - 8}" y="${y - 4}" width="5" height="8" fill="#E11D48"/>`
        : `<ellipse cx="${x - 9}" cy="${y - 4}" rx="9" ry="4" fill="#E0F2FE" stroke="${OUT}" stroke-width="1.8" transform="rotate(-20 ${x - 9} ${y - 4})"/>
           <ellipse cx="${x + 9}" cy="${y - 4}" rx="9" ry="4" fill="#E0F2FE" stroke="${OUT}" stroke-width="1.8" transform="rotate(20 ${x + 9} ${y - 4})"/>
           <ellipse cx="${x}" cy="${y + 2}" rx="4" ry="8" fill="#92400E" stroke="${OUT}" stroke-width="1.8"/>`;
      return `<g class="fx fx-pulse">
        <circle cx="${x - 20}" cy="${y + 26}" r="3" fill="#fff" stroke="${OUT}" stroke-width="2"/>
        <circle cx="${x - 13}" cy="${y + 18}" r="5" fill="#fff" stroke="${OUT}" stroke-width="2"/>
        <ellipse cx="${x}" cy="${y}" rx="22" ry="17" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>
        ${inner}</g>`;
    }
    case 'sleepy': // Z letters drifting up
      return `<g class="fx fx-rise">${zed(x - 6, y + 14, .9)}</g>
              <g class="fx fx-rise d2">${zed(x + 6, y + 2, 1.2)}</g>
              <g class="fx fx-rise d3">${zed(x + 14, y - 12, 1.5)}</g>`;
    case 'sad': // rain cloud
      return `<g class="fx fx-bob">
        <path d="M${x - 20} ${y + 4} a 9 9 0 0 1 4 -17 a 12 12 0 0 1 22 -3 a 9 9 0 0 1 12 12 a 8 8 0 0 1 -4 8 Z" fill="#CBD5E1" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
        <g class="fx-rain"><path d="M${x - 12} ${y + 10} l-3 7 M${x} ${y + 12} l-3 7 M${x + 12} ${y + 10} l-3 7" stroke="#38BDF8" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M${x - 12} ${y + 10} l-3 7 M${x} ${y + 12} l-3 7 M${x + 12} ${y + 10} l-3 7" stroke="${OUT}" stroke-width="1" stroke-linecap="round" opacity=".6"/></g></g>`;
    case 'excited': // sparkles
      return `<g class="fx fx-twinkle">${sparkle(x - 10, y + 8, 1)}</g>
              <g class="fx fx-twinkle d2">${sparkle(x + 12, y - 4, .75)}</g>
              <g class="fx fx-twinkle d3">${sparkle(x - 2, y - 16, .55)}</g>`;
    default: return '';
  }
}

export function drawMoodSymbols(symbols = [], type = 'organic', label = '') {
  const body = symbols.slice(0, 2).map((k, i) => symbol(k, type, SLOTS[i])).join('');
  if (!body) return '';
  return `<svg viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${body}</svg>`;
}


// ---------- tier land (Phase 2A) ----------
// Simple silhouettes under the sky, one per tier. Tier sets the place; sky.js sets the time of day.
// Placeholders until the full tier backdrops arrive with the retro frame and palettes (Phase 2B).
const LAND = [
  // [far ridge, near ground, extra feature]
  ['#4B3A63', '#6B4F2A', 'longhouse'],   // 0 Longhouse at night
  ['#65A30D', '#3F7E0B', 'kampung'],     // 1 Kampung garden
  ['#4D7C0F', '#365314', 'sago'],        // 2 Sago garden (Mukah)
  ['#166534', '#052E16', 'trees'],       // 3 Rainforest (Danum / Bako)
  ['#14532D', '#0F3D24', 'river'],       // 4 Kinabatangan River
  ['#78716C', '#292524', 'cave'],        // 5 Mulu Caves
  ['#0891B2', '#155E75', 'sea'],         // 6 Semporna sea
  ['#4ADE80', '#166534', 'ridges'],      // 7 Highlands (Bario / Crocker Range)
  ['#64748B', '#334155', 'peak'],        // 8 Kinabalu summit (scenic peak only)
];

function landFeature(kind, near) {
  switch (kind) {
    case 'longhouse': return `<g fill="${near}" stroke="#1B1A2E" stroke-width="2"><rect x="250" y="62" width="120" height="22"/><path d="M244 64 L310 44 L376 64 Z"/>
      <path d="M262 84 v14 M290 84 v14 M318 84 v14 M346 84 v14" stroke-width="4"/></g>
      <g fill="#FDE68A"><rect x="266" y="68" width="10" height="8"/><rect x="300" y="68" width="10" height="8"/><rect x="334" y="68" width="10" height="8"/></g>`;
    case 'kampung': return `<g fill="${near}" stroke="#1B1A2E" stroke-width="2"><rect x="300" y="66" width="56" height="26"/><path d="M294 68 L328 50 L362 68 Z"/></g>
      <circle cx="70" cy="70" r="18" fill="${near}"/><rect x="67" y="76" width="6" height="20" fill="#5B3A1E"/>`;
    case 'sago': return [60, 150, 330].map((x) => `<g stroke="#1B1A2E" stroke-width="1.5"><rect x="${x - 3}" y="50" width="6" height="46" fill="#5B3A1E"/>
      <path d="M${x} 50 q -26 -2 -34 12 M${x} 50 q 26 -2 34 12 M${x} 50 q -14 -14 -26 -14 M${x} 50 q 14 -14 26 -14" fill="none" stroke="${near}" stroke-width="5" stroke-linecap="round"/></g>`).join('');
    case 'trees': return [40, 110, 300, 360].map((x, i) => `<path d="M${x} ${40 + (i % 2) * 8} l-22 52 h44 Z" fill="${near}" stroke="#1B1A2E" stroke-width="1.5"/>`).join('');
    case 'river': return `<path d="M0 96 C 100 84 180 104 260 92 S 360 86 400 96 V 110 H 0 Z" fill="#0E7490" stroke="#1B1A2E" stroke-width="1.5"/>`;
    case 'cave': return `<path d="M120 100 C 120 46 280 46 280 100 Z" fill="#0C0A09" stroke="#1B1A2E" stroke-width="2"/>`;
    case 'sea': return `<rect x="0" y="80" width="400" height="40" fill="#0E7490"/>
      <g fill="${near}" stroke="#1B1A2E" stroke-width="1.5"><rect x="280" y="58" width="60" height="20"/><path d="M274 60 L310 44 L346 60 Z"/></g>
      <path d="M288 78 v18 M310 78 v18 M332 78 v18" stroke="#1B1A2E" stroke-width="3"/>`;
    case 'ridges': return `<path d="M0 82 L60 60 L120 78 L190 54 L260 80 L330 58 L400 76 V 120 H 0 Z" fill="${near}" opacity=".85"/>`;
    case 'peak': return `<path d="M140 92 L200 22 L214 36 L226 26 L290 92 Z" fill="#94A3B8" stroke="#1B1A2E" stroke-width="2"/>
      <path d="M188 36 L200 22 L214 36 L226 26 L238 40 L222 44 L210 38 L198 46 Z" fill="#F8FAFC"/>`;
    default: return '';
  }
}

export function drawLand(tier = 1) {
  const [far, near, kind] = LAND[Math.max(0, Math.min(LAND.length - 1, tier))];
  return `<svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M0 70 C 70 40 140 60 200 52 S 330 36 400 60 V 120 H 0 Z" fill="${far}"/>
    ${kind === 'peak' ? landFeature(kind, near) : ''}
    <path d="M0 92 C 90 78 170 98 250 88 S 350 80 400 90 V 120 H 0 Z" fill="${near}"/>
    ${kind === 'peak' ? '' : landFeature(kind, near)}
  </svg>`;
}

// Stage background per tier (gradients evoke each tier's Borneo backdrop)
export const BACKDROPS = [
  'linear-gradient(180deg,#1E1B4B 0%,#3B2F6B 60%,#6B4F2A 100%)', // longhouse at night
  'linear-gradient(180deg,#38BDF8 0%,#86EFAC 70%,#65A30D 100%)', // kampung garden
  'linear-gradient(180deg,#7DD3FC 0%,#A7F3D0 55%,#4D7C0F 100%)', // sago garden
  'linear-gradient(180deg,#14532D 0%,#166534 50%,#052E16 100%)', // rainforest
  'linear-gradient(180deg,#0F172A 0%,#1E3A5F 60%,#0E7490 100%)', // Kinabatangan with fireflies
  'linear-gradient(180deg,#F97316 0%,#7C2D12 55%,#292524 100%)', // Mulu caves at dusk
  'linear-gradient(180deg,#22D3EE 0%,#0891B2 55%,#155E75 100%)', // Semporna sea
  'linear-gradient(180deg,#A5B4FC 0%,#4ADE80 60%,#166534 100%)', // highlands
  'linear-gradient(180deg,#FDE68A 0%,#F59E0B 35%,#475569 100%)', // Kinabalu summit
];
