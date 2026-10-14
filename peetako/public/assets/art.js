// Peetako art (Phase 2B): the retro-frame gecko from the "Peetako Retro Frame" mockups, in five palettes,
// with tier accessories, mood faces, the Robot line and the nine tier backdrops.
//
//   drawScene(tier, sky, pal)              → SVG string, viewBox 0 0 300 300 (backdrop only)
//   drawPet({ type, tier, status, mood, pal }) → SVG string, viewBox 0 0 300 300 (pet only, same box)
//   drawMoodSymbols(symbols, type, label)  → SVG string, same box, floating mood symbols
//
// The pet sits in the same 300×300 box as the scene, so in the framed view the two layers line up
// exactly as in the mockup; in the full-screen view the scene is stretched to cover and the pet is
// centred above it.
//
// Cultural notes (GDD, Cultural sensitivity): no halo, holy light, rays or crown at any tier. Tier 7 has
// an orbit of fireflies, Tier 8 a gold aura with awan larat curls and a gold headcloth. The tanjak, the
// Terabai shield and the hornbill feathers are to be confirmed with the cultural reviewers.

import { palette, FALLEN } from './palettes.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------------------------------------------
// Scene (backdrop). `s` is the sky object from sky.js; `p` the palette (for lights, sails, fireflies).
// ---------------------------------------------------------------------------------------------------
let gradSeq = 0; // unique gradient id per scene on the page
const STARS = '<circle cx="30" cy="40" r="1.8"/><circle cx="90" cy="24" r="1.5"/><circle cx="150" cy="46" r="1.8"/><circle cx="196" cy="22" r="1.5"/><circle cx="278" cy="104" r="1.6"/><circle cx="60" cy="76" r="1.3"/><circle cx="120" cy="88" r="1.2"/>';

function sceneTier(t, s, p) {
  switch (t) {
    case 0: return `
      <rect x="0" y="232" width="300" height="68" fill="${s.ground}"/>
      <polygon points="8,150 150,112 292,150" fill="${s.near}"/>
      <rect x="22" y="150" width="256" height="44" fill="${s.mid}"/>
      <g fill="${p.gold}" opacity="${s.glowOp}"><rect x="40" y="162" width="14" height="12"/><rect x="80" y="162" width="14" height="12"/><rect x="120" y="162" width="14" height="12"/><rect x="166" y="162" width="14" height="12"/><rect x="206" y="162" width="14" height="12"/><rect x="246" y="162" width="14" height="12"/></g>
      <g fill="${s.near}"><rect x="30" y="194" width="6" height="40"/><rect x="72" y="194" width="6" height="40"/><rect x="114" y="194" width="6" height="40"/><rect x="180" y="194" width="6" height="40"/><rect x="222" y="194" width="6" height="40"/><rect x="264" y="194" width="6" height="40"/></g>`;
    case 1: return `
      <polygon points="20,126 70,94 120,126" fill="${s.mid}"/>
      <rect x="30" y="126" width="80" height="46" fill="${s.mid}"/>
      <rect x="58" y="138" width="20" height="16" rx="2" fill="${p.gold}" opacity="${s.glowOp}"/>
      <g fill="${s.mid}"><rect x="36" y="172" width="6" height="52"/><rect x="70" y="172" width="6" height="52"/><rect x="100" y="172" width="6" height="52"/></g>
      <path d="M0 236 Q150 212 300 236 V300 H0 Z" fill="${s.ground}"/>
      <path d="M266 232 V168" fill="none" stroke="${s.near}" stroke-width="6" stroke-linecap="round"/>
      <path d="M266 176 Q296 156 298 186 Q280 180 266 176 Z M266 186 Q236 162 222 190 Q246 186 266 186 Z M266 168 Q278 140 296 146 Q282 158 266 168 Z" fill="${s.near}"/>`;
    case 2: {
      const palm = `<path d="M0 110 Q-30 96 -46 116 M0 110 Q30 96 46 116 M0 110 Q-20 80 -36 72 M0 110 Q20 80 36 72 M0 110 Q0 84 2 64" fill="none" stroke-width="6" stroke-linecap="round"/>`;
      return `
      <path d="M0 236 Q150 218 300 236 V300 H0 Z" fill="${s.ground}"/>
      <g transform="translate(150 40) scale(0.7)" stroke="${s.far}"><rect x="-4" y="110" width="8" height="190" fill="${s.far}" stroke="none"/>${palm}</g>
      <g transform="translate(40 0)" stroke="${s.near}"><rect x="-5" y="110" width="10" height="130" fill="${s.near}" stroke="none"/>${palm}</g>
      <g transform="translate(262 20)" stroke="${s.near}"><rect x="-5" y="110" width="10" height="110" fill="${s.near}" stroke="none"/>${palm}</g>`;
    }
    case 3: return `
      <g fill="${s.far}"><circle cx="90" cy="120" r="40"/><circle cx="200" cy="110" r="46"/><rect x="84" y="120" width="12" height="120"/><rect x="194" y="110" width="12" height="130"/></g>
      <path d="M0 236 Q150 214 300 236 V300 H0 Z" fill="${s.ground}"/>
      <g fill="${s.near}"><rect x="10" y="0" width="26" height="240"/><rect x="264" y="0" width="30" height="240"/><circle cx="20" cy="-6" r="58"/><circle cx="120" cy="-24" r="56"/><circle cx="214" cy="-10" r="60"/><circle cx="296" cy="6" r="50"/></g>
      <path d="M100 0 Q90 50 104 104 M236 20 Q246 70 232 120" fill="none" stroke="${s.near}" stroke-width="4" stroke-linecap="round"/>`;
    case 4: return `
      <path d="M0 182 Q20 150 40 176 Q60 144 86 172 Q110 150 130 176 Q156 146 180 174 Q206 152 226 176 Q250 146 272 172 Q290 156 300 168 V204 H0 Z" fill="${s.far}"/>
      <rect x="0" y="198" width="300" height="102" fill="${s.water}"/>
      <path d="M20 214 h30 M200 222 h40 M120 290 h30" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="2" stroke-linecap="round"/>
      <path d="M50 300 Q80 240 150 234 Q222 232 254 300 Z" fill="${s.ground}"/>
      <g fill="${p.gold}" opacity="${s.glowOp}" class="twinkle"><circle cx="30" cy="150" r="2.6"/><circle cx="62" cy="128" r="2.2"/><circle cx="98" cy="156" r="2.8"/><circle cx="130" cy="134" r="2.2"/><circle cx="172" cy="150" r="2.6"/><circle cx="204" cy="126" r="2.2"/><circle cx="238" cy="148" r="2.8"/><circle cx="268" cy="130" r="2.2"/><circle cx="286" cy="160" r="2.4"/><circle cx="12" cy="176" r="2.2"/></g>`;
    case 5: {
      const bats = [[76, 104], [98, 86], [118, 74], [138, 60], [160, 52], [182, 42], [204, 38], [226, 30], [110, 92], [150, 72], [190, 58], [250, 24], [272, 18]]
        .map(([x, y]) => `<path d="M${x} ${y} q3 -4 6 0 q3 -4 6 0"/>`).join('');
      return `
      <path d="M228 236 L240 92 L300 72 V236 Z" fill="${s.far}"/>
      <path d="M0 44 L70 32 L122 62 L132 236 L0 236 Z" fill="${s.mid}"/>
      <path d="M14 236 Q22 124 62 112 Q100 124 112 236 Z" fill="#000000" opacity="0.5"/>
      <path d="M0 236 Q150 220 300 236 V300 H0 Z" fill="${s.ground}"/>
      <g stroke="#120F28" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${bats}</g>`;
    }
    case 6: return `
      <path d="M0 176 Q40 150 80 172 Q120 156 150 176 V200 H0 Z" fill="${s.far}"/>
      <rect x="0" y="176" width="300" height="124" fill="${s.water}"/>
      <path d="M20 200 h24 M120 196 h30 M240 280 h30 M20 286 h30" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
      <g fill="${s.near}"><rect x="206" y="166" width="4" height="40"/><rect x="232" y="166" width="4" height="40"/><rect x="262" y="166" width="4" height="40"/><rect x="164" y="182" width="4" height="26"/><rect x="186" y="182" width="4" height="26"/></g>
      <rect x="198" y="134" width="76" height="34" fill="${s.mid}"/><polygon points="192,136 236,108 280,136" fill="${s.near}"/>
      <rect x="158" y="160" width="36" height="24" fill="${s.mid}"/><polygon points="154,162 176,144 198,162" fill="${s.near}"/>
      <rect x="226" y="146" width="12" height="10" fill="${p.gold}" opacity="${s.glowOp}"/>
      <path d="M14 208 Q44 224 84 208 Z" fill="#8A5A3B"/><polygon points="48,206 48,160 78,200" fill="${p.spot}"/>
      <rect x="50" y="246" width="216" height="10" fill="#8A5A3B"/>
      <g fill="#6B4229"><rect x="62" y="256" width="6" height="44"/><rect x="152" y="256" width="6" height="44"/><rect x="246" y="256" width="6" height="44"/></g>`;
    case 7: return `
      <path d="M0 150 Q60 108 120 140 Q190 98 300 132 V300 H0 Z" fill="${s.far}"/>
      <path d="M0 192 Q80 150 160 180 Q230 160 300 176 V300 H0 Z" fill="${s.mid}"/>
      <g fill="none" stroke="${s.near}" stroke-opacity="0.6" stroke-width="2"><path d="M10 206 Q80 176 150 198"/><path d="M14 218 Q90 190 160 210"/><path d="M180 196 Q240 182 296 190"/><path d="M180 208 Q240 194 296 202"/></g>
      <path d="M0 236 Q150 220 300 236 V300 H0 Z" fill="${s.ground}"/>`;
    default: return `
      <path d="M0 200 L30 150 L50 165 L80 100 L100 120 L120 70 L140 95 L160 60 L175 90 L195 74 L215 110 L240 95 L270 150 L300 140 V300 H0 Z" fill="${s.far}"/>
      <g fill="#FFFFFF" opacity="0.75"><ellipse cx="40" cy="206" rx="60" ry="14"/><ellipse cx="150" cy="214" rx="70" ry="14"/><ellipse cx="262" cy="204" rx="60" ry="14"/></g>
      <path d="M30 300 L64 240 L150 226 L236 236 L276 300 Z" fill="${s.mid}"/>`;
  }
}

// fit: 'slice' fills the box and crops (square screens, wide windows); 'meet' shows the whole scene and
// extends sky and ground beyond it (tall phone windows, so the scenery is not cropped at the sides).
export function drawScene(tier, s, pal, { label = '', fit = 'slice' } = {}) {
  const p = typeof pal === 'string' ? palette(pal) : pal;
  const t = Math.max(0, Math.min(8, tier | 0));
  return `<svg viewBox="0 0 300 300" preserveAspectRatio="${fit === 'meet' ? 'xMidYMid meet' : 'xMidYMax slice'}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">
  <defs><linearGradient id="sky-grad-${++gradSeq}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.sky1}"/><stop offset="1" stop-color="${s.sky2}"/></linearGradient></defs>
  <rect x="-300" y="-300" width="900" height="900" fill="url(#sky-grad-${gradSeq})"/>
  <g opacity="${s.starOp.toFixed(2)}" fill="#FDE68A">${STARS}</g>
  <circle cx="238" cy="56" r="18" fill="#FDE68A" opacity="${s.moonOp.toFixed(2)}"/>
  <circle cx="${s.sunX.toFixed(1)}" cy="${s.sunY.toFixed(1)}" r="22" fill="${s.sunC}" opacity="${s.sunOp.toFixed(2)}"/>
  <g opacity="${s.cloudOp.toFixed(2)}" fill="#FFFFFF"><ellipse cx="70" cy="58" rx="30" ry="10"/><ellipse cx="88" cy="50" rx="18" ry="10"/><ellipse cx="190" cy="92" rx="26" ry="8"/></g>
  ${sceneTier(t, s, p)}
  <rect x="-300" y="300" width="900" height="300" fill="${s.ground}"/>
</svg>`;
}

// ---------------------------------------------------------------------------------------------------
// Faces. Coordinates are the mockup's head (rect 82,70 136×118). Each mood has its own shape so it
// reads without colour (GDD, Visible mood).
// ---------------------------------------------------------------------------------------------------
function organicFace(face, p, status) {
  const L = p.line;
  const eye = (cx, cy = 128, rx = 17, ry = 20, hx = -6, hy = -8) => `
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${L}"/>
    <ellipse cx="${cx}" cy="${cy + 9}" rx="${rx * 0.65}" ry="${ry * 0.4}" fill="${p.eye}" opacity="0.9"/>
    <circle cx="${cx + hx}" cy="${cy + hy}" r="${rx * 0.36}" fill="#FFFFFF"/><circle cx="${cx - hx}" cy="${cy + 10}" r="2.5" fill="#FFFFFF"/>`;
  const arc = (x0, y, up) => `<path d="M${x0} ${y} Q${x0 + 17} ${up ? y - 22 : y + 12} ${x0 + 34} ${y}" fill="none" stroke="${L}" stroke-width="7" stroke-linecap="round"/>`;
  const nose = `<circle cx="144" cy="145" r="1.8" fill="${L}"/><circle cx="156" cy="145" r="1.8" fill="${L}"/>`;
  const blush = (c = '#FDA4AF', rx = 8) => `<ellipse cx="97" cy="152" rx="${rx}" ry="${rx * 0.56}" fill="${c}"/><ellipse cx="203" cy="152" rx="${rx}" ry="${rx * 0.56}" fill="${c}"/>`;
  const tear = (x) => `<path d="M${x} 152 q6 10 0 17 q-6 -7 0 -17 z" fill="#A5F3FC" stroke="${L}" stroke-width="1.5"/>`;

  if (status === 'dead') {
    return `<path d="M106 128 H134 M166 128 H194" stroke="${L}" stroke-width="6" stroke-linecap="round"/>${nose}
      <path d="M140 158 H160" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`;
  }
  switch (face) {
    case 'happy': return `${arc(103, 134, true)}${arc(163, 134, true)}${blush('#FB7185', 11)}${nose}
      <path d="M132 154 Q150 178 168 154 Z" fill="${L}" stroke="${L}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="150" cy="166" rx="8" ry="4" fill="#FB7185"/>`;
    case 'hungry': return `${eye(120, 128, 17, 20, 4, -9)}${eye(180, 128, 17, 20, 4, -9)}${blush()}${nose}
      <path d="M136 160 Q143 154 150 160 T164 160" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M162 163 q4 6 0 11 q-4 -5 0 -11 z" fill="#67E8F9" stroke="${L}" stroke-width="1.5"/>`;
    case 'sleepy': return `${arc(103, 130, false)}${arc(163, 130, false)}${blush()}${nose}
      <ellipse cx="150" cy="160" rx="4.5" ry="6" fill="${L}"/>`;
    case 'sad': return `<path d="M102 116 L136 104 M198 116 L164 104" stroke="${L}" stroke-width="5" stroke-linecap="round"/>
      ${eye(120, 132, 17, 20, -6, -8)}${eye(180, 132, 17, 20, -6, -8)}${nose}
      <path d="M138 166 Q150 156 162 166" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>${tear(104)}`;
    case 'excited': return `${eye(120, 126, 20, 23, -7, -9)}${eye(180, 126, 20, 23, -7, -9)}
      <circle cx="126" cy="112" r="2.5" fill="#FFFFFF"/><circle cx="186" cy="112" r="2.5" fill="#FFFFFF"/>${blush('#FB7185', 9)}${nose}
      <path d="M130 156 Q150 184 170 156 Z" fill="${L}" stroke="${L}" stroke-width="3" stroke-linejoin="round"/><ellipse cx="150" cy="168" rx="9" ry="4.5" fill="#FB7185"/>`;
    default: return `${eye(120)}${eye(180)}${blush()}${nose}<path d="M140 155 Q150 163 160 155" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

function robotFace(face, p, status) {
  const L = p.line;
  const led = p.eye;
  const visor = `<rect x="96" y="100" width="108" height="50" rx="25" fill="${L}"/>`;
  const cheeks = (c = '#FDA4AF') => `<rect x="96" y="156" width="14" height="6" rx="3" fill="${c}"/><rect x="190" y="156" width="14" height="6" rx="3" fill="${c}"/>`;
  const stroke = (d, op = 1) => `<path d="${d}" fill="none" stroke="${led}" stroke-width="16" stroke-linecap="round" opacity="${0.3 * op}"/><path d="${d}" fill="none" stroke="${led}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
  if (status === 'dead') return `${visor}<path d="M134 125 H166" stroke="#64748B" stroke-width="6" stroke-linecap="round"/>${cheeks('#CBD5E1')}<path d="M138 168 H162" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`;
  switch (face) {
    case 'happy': return `${visor}${stroke('M132 134 Q150 108 168 134')}${cheeks('#FB7185')}<path d="M136 166 Q150 180 164 166" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`;
    case 'hungry': return `${visor}<circle cx="156" cy="120" r="15" fill="${led}" opacity="0.3"/><circle cx="156" cy="120" r="9" fill="${led}"/><circle cx="153" cy="116" r="3" fill="#FFFFFF"/>${cheeks()}
      <path d="M134 170 l8 -6 l8 6 l8 -6 l8 6" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'sleepy': return `${visor}${stroke('M134 124 Q150 134 166 124', 0.7)}${cheeks()}<ellipse cx="150" cy="170" rx="5" ry="6" fill="${L}"/>`;
    case 'sad': return `${visor}<path d="M135 122 H165 A15 15 0 0 1 135 122 Z" fill="${led}"/><circle cx="145" cy="126" r="3" fill="#FFFFFF"/>${cheeks()}
      <path d="M136 172 Q150 162 164 172" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>
      <path d="M104 152 q6 10 0 17 q-6 -7 0 -17 z" fill="#A5F3FC" stroke="${L}" stroke-width="1.5"/>`;
    case 'excited': return `${visor}<circle cx="150" cy="125" r="23" fill="${led}" opacity="0.3"/><circle cx="150" cy="125" r="17" fill="${led}"/>
      <circle cx="144" cy="119" r="5" fill="#FFFFFF"/><circle cx="157" cy="132" r="2.5" fill="#FFFFFF"/>${cheeks('#FB7185')}
      <rect x="134" y="162" width="32" height="14" rx="7" fill="${L}"/><path d="M142 164 V174 M150 164 V174 M158 164 V174" stroke="${led}" stroke-width="2.5" stroke-linecap="round"/>`;
    default: return `${visor}<circle cx="150" cy="125" r="20" fill="${led}" opacity="0.3"/><circle cx="150" cy="125" r="13" fill="${led}"/><circle cx="145" cy="120" r="4" fill="#FFFFFF"/>${cheeks()}
      <path d="M136 168 H164 M143 164 V172 M150 164 V172 M157 164 V172" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/>`;
  }
}

// ---------------------------------------------------------------------------------------------------
// Tier accessories. "back" draws behind the body, "front" over it.
// ---------------------------------------------------------------------------------------------------
const AWAN_LARAT = (c, o) => // gold curls inspired by the awan larat motif (not a copy of a specific piece)
  `<g fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" opacity="${o}">
    <path d="M40 120 q-18 -10 -8 -28 q12 -16 26 -2 q8 10 -2 18"/><path d="M260 120 q18 -10 8 -28 q-12 -16 -26 -2 q-8 10 2 18"/>
    <path d="M28 210 q-14 -14 2 -28 q16 -10 24 6"/><path d="M272 210 q14 -14 -2 -28 q-16 -10 -24 6"/></g>`;

function fireflyOrbit(c) { // Tier 7 Organic: fireflies circling the pet (replaces the mockup's halo)
  const flies = [0, 60, 120, 180, 240, 300].map((a, i) => {
    const r = (a * Math.PI) / 180;
    return `<circle cx="${(150 + Math.cos(r) * 132).toFixed(1)}" cy="${(170 + Math.sin(r) * 40).toFixed(1)}" r="${i % 2 ? 6 : 8}" fill="#FDE047" stroke="#1E1B4B" stroke-width="2"/>`;
  }).join('');
  return `<g class="orbit" style="transform-origin:150px 170px">${flies}</g>`;
}

function organicAccessories(t, p) {
  const L = p.line;
  const acc = `stroke="${L}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
  const back = [];
  const front = [];
  const sash = `<path d="M106 196 L194 238" stroke="${L}" stroke-width="16" stroke-linecap="round"/><path d="M106 196 L194 238" stroke="${p.gold}" stroke-width="10" stroke-linecap="round"/>`;
  if (t === 6) back.push(`<circle cx="150" cy="170" r="130" fill="${p.gold}" opacity="0.18"/><path d="M104 184 Q68 230 72 272 L228 272 Q232 230 196 184 Z" fill="${p.spot}" ${acc}/>`);
  if (t === 7) back.push(`<circle cx="150" cy="160" r="134" fill="${p.gold}" opacity="0.14"/>`);
  if (t === 8) back.push(`<circle cx="150" cy="160" r="140" fill="${p.gold}" opacity="0.2"/>${AWAN_LARAT(p.gold, 0.75)}`);
  if (t === 4 || t === 5) front.push({ layer: 'body', svg: sash });
  if (t === 2) front.push({ layer: 'head', svg: `<rect x="84" y="78" width="132" height="16" rx="6" fill="${p.spot}" stroke="${L}" stroke-width="3"/>
    <path d="M214 86 L240 74 L236 94 Z M214 88 L238 104 L224 108 Z" fill="${p.spot}" stroke="${L}" stroke-width="3" stroke-linejoin="round"/>` });
  if (t === 3) front.push({ layer: 'head', svg: `
    <g transform="rotate(-22 124 76)"><ellipse cx="124" cy="48" rx="9" ry="26" fill="#FFFFFF" stroke="${L}" stroke-width="3"/><ellipse cx="124" cy="30" rx="7" ry="9" fill="${L}"/></g>
    <ellipse cx="150" cy="42" rx="9" ry="28" fill="#FFFFFF" stroke="${L}" stroke-width="3"/><ellipse cx="150" cy="22" rx="7" ry="9" fill="${L}"/>
    <g transform="rotate(22 176 76)"><ellipse cx="176" cy="48" rx="9" ry="26" fill="#FFFFFF" stroke="${L}" stroke-width="3"/><ellipse cx="176" cy="30" rx="7" ry="9" fill="${L}"/></g>
    <rect x="86" y="72" width="128" height="16" rx="6" fill="${p.gold}" stroke="${L}" stroke-width="3"/>` });
  if (t === 4) front.push({ layer: 'head', svg: `<polygon points="92,84 208,84 202,62 176,50 156,26 132,48 100,62" fill="${p.spot}" ${acc}/><path d="M98 74 L204 74" stroke="${p.gold}" stroke-width="5" stroke-linecap="round"/>` });
  if (t === 5) {
    front.push({ layer: 'head', svg: `<rect x="88" y="76" width="124" height="12" rx="5" fill="${p.gold}" stroke="${L}" stroke-width="3"/>` });
    front.push({ layer: 'top', svg: `<rect x="30" y="148" width="48" height="110" rx="22" fill="${p.belly}" ${acc}/><path d="M54 156 V250" stroke="${L}" stroke-width="3"/>
      <path d="M54 178 q14 0 14 14 q0 14 -14 14 q-10 0 -10 -10 q0 -7 7 -7" fill="none" stroke="${p.spot}" stroke-width="4" stroke-linecap="round"/>
      <path d="M54 216 q-14 0 -14 14 q0 14 14 14 q10 0 10 -10 q0 -7 -7 -7" fill="none" stroke="${p.spot}" stroke-width="4" stroke-linecap="round"/>` });
  }
  if (t === 7) front.push({ layer: 'top', svg: fireflyOrbit(p.gold) });
  if (t === 8) front.push({ layer: 'head', svg: `<rect x="86" y="70" width="128" height="18" rx="7" fill="${p.gold}" stroke="${L}" stroke-width="3"/>
    <path d="M100 79 h100" stroke="${L}" stroke-width="2" stroke-dasharray="6 6"/><circle cx="150" cy="79" r="6" fill="${p.spot}" stroke="${L}" stroke-width="2"/>
    <path d="M212 76 q22 -6 26 10 q-14 -2 -24 4 Z" fill="${p.gold}" stroke="${L}" stroke-width="3" stroke-linejoin="round"/>` });
  return { back: back.join(''), front };
}

function robotAccessories(t, p) {
  const L = p.line;
  const acc = `stroke="${L}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
  const back = [];
  const front = [];
  if (t >= 6) back.push(`<circle cx="150" cy="165" r="${t === 8 ? 140 : 132}" fill="${p.gold}" opacity="${t === 8 ? 0.2 : 0.15}"/>`);
  if (t === 6 || t === 7 || t === 8) { // jet wings shaped like hornbill wings (GDD, Robot look)
    back.push(`<path d="M104 196 C56 168 30 132 36 96 C60 118 84 128 112 176 Z" fill="${p.belly}" ${acc}/><path d="M196 196 C244 168 270 132 264 96 C240 118 216 128 188 176 Z" fill="${p.belly}" ${acc}/>
      <path d="M50 116 L92 168 M250 116 L208 168" stroke="${p.eye}" stroke-width="4" stroke-linecap="round"/>`);
  }
  if (t === 2) front.push({ layer: 'head', svg: `<rect x="84" y="80" width="132" height="12" rx="6" fill="${p.spot}" stroke="${L}" stroke-width="3"/><path d="M182 74 L196 52" stroke="${L}" stroke-width="4"/><circle cx="198" cy="48" r="5" fill="${p.eye}" stroke="${L}" stroke-width="3"/>` });
  if (t >= 3) front.push({ layer: 'body', svg: `<path d="M112 196 V226 H122 M188 196 V226 H178" fill="none" stroke="${p.eye}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M112 192 c-6 0 -6 -8 0 -8 c4 0 4 5 0 5 M188 192 c6 0 6 -8 0 -8 c-4 0 -4 5 0 5" fill="none" stroke="${p.eye}" stroke-width="3" stroke-linecap="round"/>` });
  if (t >= 4) front.push({ layer: 'head', svg: `<path d="M84 96 Q84 74 104 72 H196 Q216 74 216 96 Z" fill="${p.spot}" ${acc}/>
    <g fill="${p.gold}"><circle cx="112" cy="86" r="3"/><circle cx="130" cy="82" r="3"/><circle cx="150" cy="80" r="3"/><circle cx="170" cy="82" r="3"/><circle cx="188" cy="86" r="3"/></g>` });
  if (t >= 4) front.push({ layer: 'body', svg: `<path d="M98 190 q-18 2 -20 20 l16 4 Z M202 190 q18 2 20 20 l-16 4 Z" fill="${p.spot}" ${acc}/>` });
  if (t === 5) front.push({ layer: 'top', svg: `<rect x="30" y="148" width="48" height="110" rx="22" fill="#E2E8F0" ${acc}/><path d="M54 156 V250" stroke="${L}" stroke-width="3"/>
    <path d="M42 178 h24 M42 230 h24" stroke="${p.eye}" stroke-width="4" stroke-linecap="round"/><circle cx="54" cy="204" r="7" fill="${p.gold}" stroke="${L}" stroke-width="2.5"/>` });
  if (t === 5) front.push({ layer: 'body', svg: `<path d="M104 238 h92" stroke="${p.gold}" stroke-width="5" stroke-dasharray="4 6" stroke-linecap="round"/>` });
  if (t === 7) front.push({ layer: 'top', svg: `<g class="orbit" style="transform-origin:150px 170px">${[20, 160, 200, 340].map((a) => { // kept to the sides, clear of the face and body
    const r = (a * Math.PI) / 180;
    const x = 150 + Math.cos(r) * 132, y = 170 + Math.sin(r) * 40;
    return `<rect x="${(x - 7).toFixed(1)}" y="${(y - 7).toFixed(1)}" width="14" height="14" rx="3" fill="${p.belly}" stroke="${L}" stroke-width="2.5"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${p.eye}"/>`;
  }).join('')}</g>` });
  if (t === 8) front.push({ layer: 'top', svg: `<g fill="none" stroke="${p.gold}" stroke-width="3" opacity="0.8" class="float">
    <path d="M30 120 l12 -12 l12 12 l-12 12 Z"/><path d="M246 112 l10 -14 l10 14 l-10 14 Z"/><path d="M40 220 l8 -8 l8 8 l-8 8 Z"/><path d="M250 214 l9 -9 l9 9 l-9 9 Z"/></g>` });
  return { back: back.join(''), front };
}

// ---------------------------------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------------------------------
const pick = (front, layer) => front.filter((f) => f.layer === layer).map((f) => f.svg).join('');

function organicBody(t, p, face, status) {
  const L = p.line;
  const ol = `stroke="${L}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
  const { back, front } = organicAccessories(t, p);
  const tail = `
    <path d="M186 220 C222 232 252 222 258 196" fill="none" stroke="${L}" stroke-width="28" stroke-linecap="round"/>
    <path d="M258 196 C264 172 246 158 232 166 C222 172 226 186 238 184" fill="none" stroke="${L}" stroke-width="20" stroke-linecap="round"/>
    <path d="M186 220 C222 232 252 222 258 196" fill="none" stroke="${t >= 5 && status !== 'dead' ? '#FDE047' : p.body}" stroke-width="20" stroke-linecap="round"/>
    <path d="M258 196 C264 172 246 158 232 166 C222 172 226 186 238 184" fill="none" stroke="${t >= 5 && status !== 'dead' ? '#FDE047' : p.body}" stroke-width="12" stroke-linecap="round"/>`;
  const foot = (cx, toes) => `<ellipse cx="${cx}" cy="246" rx="16" ry="10" fill="${p.body}" ${ol}/>` +
    toes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${p.toe}" stroke="${L}" stroke-width="3"/>`).join('');
  return `${back}${tail}
    <ellipse cx="150" cy="210" rx="50" ry="38" fill="${p.shade}"/><ellipse cx="145" cy="205" rx="45" ry="33" fill="${p.body}"/>
    <ellipse cx="150" cy="222" rx="28" ry="20" fill="${p.belly}"/>
    <circle cx="116" cy="196" r="5" fill="${p.spot}"/><circle cx="184" cy="198" r="5" fill="${p.spot}"/>
    <ellipse cx="150" cy="210" rx="50" ry="38" fill="none" ${ol}/>
    ${foot(110, [[97, 252], [108, 256], [120, 254]])}${foot(190, [[180, 254], [192, 256], [203, 252]])}
    ${pick(front, 'body')}
    <rect x="82" y="70" width="136" height="118" rx="36" fill="${p.shade}"/><rect x="82" y="70" width="128" height="110" rx="34" fill="${p.body}"/>
    <circle cx="150" cy="84" r="6" fill="${p.spot}"/><circle cx="126" cy="90" r="4" fill="${p.spot}"/><circle cx="174" cy="90" r="4" fill="${p.spot}"/>
    <rect x="82" y="70" width="136" height="118" rx="36" fill="none" ${ol}/>
    ${organicFace(face, p, status)}
    ${pick(front, 'head')}${pick(front, 'top')}`;
}

function robotBody(t, p, face, status) {
  const L = p.line;
  const ol = `stroke="${L}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"`;
  const { back, front } = robotAccessories(t, p);
  const tail = (stroke) => `
    <path d="M186 220 C222 232 252 222 258 196" fill="none" stroke="${stroke.c}" stroke-width="${stroke.w1}" stroke-linecap="round" ${stroke.dash ? `stroke-dasharray="${stroke.dash[0]}"` : ''}/>
    <path d="M258 196 C264 172 246 158 232 166 C222 172 226 186 238 184" fill="none" stroke="${stroke.c}" stroke-width="${stroke.w2}" stroke-linecap="round" ${stroke.dash ? `stroke-dasharray="${stroke.dash[1]}"` : ''}/>`;
  const foot = (cx, toes) => `<ellipse cx="${cx}" cy="248" rx="16" ry="10" fill="${p.body}" ${ol}/>` +
    toes.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="${p.eye}" stroke="${L}" stroke-width="3"/>`).join('');
  // antenna: drooping when sad, unlit when sleepy, sparking when excited
  const sad = face === 'sad' && status !== 'dead';
  const bulbFill = status === 'dead' ? '#94A3B8' : face === 'sleepy' || status === 'dormant' ? p.shade : p.spot;
  const antenna = sad
    ? `<path d="M150 76 Q150 58 166 56" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/><circle cx="170" cy="56" r="7" fill="${bulbFill}" stroke="${L}" stroke-width="3"/>`
    : `<path d="M150 76 V54" fill="none" stroke="${L}" stroke-width="3" stroke-linecap="round"/><circle cx="150" cy="48" r="7" fill="${bulbFill}" stroke="${L}" stroke-width="3"/>` +
      (face === 'excited' && status === 'active' ? `<path d="M150 28 v8 M134 34 l5 5 M166 34 l-5 5 M130 48 h7 M170 48 h-7" stroke="${p.gold}" stroke-width="3" stroke-linecap="round"/>` : '');
  const core = t === 8 && status !== 'dead' ? `<circle cx="150" cy="210" r="16" fill="${p.gold}" opacity="0.35"/><circle cx="150" cy="210" r="9" fill="${p.gold}" stroke="${L}" stroke-width="2"/>` : '';
  return `${back}
    ${tail({ c: L, w1: 28, w2: 20 })}${tail({ c: p.belly, w1: 20, w2: 12 })}${tail({ c: L, w1: 20, w2: 12, dash: ['3 14', '3 10'] })}
    <circle cx="238" cy="184" r="5" fill="${p.eye}"/>
    <rect x="100" y="176" width="100" height="70" rx="30" fill="${p.shade}"/><rect x="100" y="176" width="92" height="62" rx="28" fill="${p.body}"/>
    <rect x="100" y="176" width="100" height="70" rx="30" fill="none" ${ol}/>
    <rect x="128" y="196" width="44" height="28" rx="8" fill="${L}"/>
    ${core || `<circle cx="139" cy="210" r="3.5" fill="${p.eye}"/><circle cx="150" cy="210" r="3.5" fill="${p.gold}"/><circle cx="161" cy="210" r="3.5" fill="${p.spot}"/>`}
    <circle cx="113" cy="216" r="3" fill="${L}"/><circle cx="187" cy="216" r="3" fill="${L}"/>
    ${pick(front, 'body')}
    ${foot(110, [[97, 254], [108, 258], [120, 256]])}${foot(190, [[180, 256], [192, 258], [203, 254]])}
    ${antenna}
    <circle cx="78" cy="130" r="9" fill="${p.shade}" stroke="${L}" stroke-width="3"/><circle cx="222" cy="130" r="9" fill="${p.shade}" stroke="${L}" stroke-width="3"/>
    <rect x="80" y="70" width="140" height="116" rx="30" fill="${p.shade}"/><rect x="80" y="70" width="132" height="108" rx="28" fill="${p.body}"/>
    <rect x="80" y="70" width="140" height="116" rx="30" fill="none" ${ol}/>
    ${robotFace(face, p, status)}
    ${pick(front, 'head')}${pick(front, 'top')}`;
}

function egg(type, p, status) {
  const L = p.line;
  if (type === 'robot') {
    const pulse = status === 'active' ? '<animate attributeName="opacity" values=".25;.6;.25" dur="2.4s" repeatCount="indefinite"/>' : '';
    return `<ellipse cx="150" cy="262" rx="86" ry="14" fill="#000" opacity="0.25"/>
      <circle cx="150" cy="186" r="84" fill="${p.eye}" opacity="0.3">${pulse}</circle>
      <rect x="84" y="116" width="132" height="140" rx="40" fill="${p.body}" stroke="${L}" stroke-width="5"/>
      <rect x="104" y="136" width="92" height="96" rx="22" fill="${L}"/>
      <path d="M150 150 L176 165 L176 199 L150 214 L124 199 L124 165 Z" fill="none" stroke="${p.eye}" stroke-width="5" stroke-linejoin="round"/>
      <circle cx="150" cy="182" r="10" fill="${p.eye}"/>
      <g fill="${p.shade}"><circle cx="96" cy="128" r="4"/><circle cx="204" cy="128" r="4"/><circle cx="96" cy="244" r="4"/><circle cx="204" cy="244" r="4"/></g>`;
  }
  return `<ellipse cx="150" cy="262" rx="86" ry="16" fill="#8A5A3B" stroke="${L}" stroke-width="4"/>
    <path d="M76 258 q12 8 24 0 q12 8 24 0 q12 8 24 0 q12 8 24 0 q12 8 24 0 q12 8 24 0" fill="none" stroke="#5E3B22" stroke-width="3"/>
    <ellipse cx="150" cy="190" rx="60" ry="76" fill="${p.body}" stroke="${L}" stroke-width="4"/>
    <ellipse cx="136" cy="168" rx="24" ry="34" fill="#FFFFFF" opacity="0.25"/>
    <g fill="${p.spot}"><circle cx="126" cy="150" r="8"/><circle cx="172" cy="178" r="10"/><circle cx="140" cy="226" r="9"/><circle cx="182" cy="226" r="6"/><circle cx="114" cy="196" r="6"/></g>
    <path d="M112 140 L128 152 L138 138 L152 150 L164 136" fill="none" stroke="${L}" stroke-width="3" stroke-linejoin="round"/>`;
}

// mood: happy | hungry | sleepy | sad | excited (mood.js); status: active | dormant | dead | ascended
export function drawPet({ type = 'organic', tier = 1, status = 'active', mood = 'happy', pal = 'hijau' } = {}) {
  const dead = status === 'dead';
  const p = dead ? FALLEN : (typeof pal === 'string' ? palette(pal) : pal);
  const st = status === 'ascended' ? 'active' : status;
  const face = dead ? 'fallen' : st === 'dormant' ? 'sleepy' : mood;
  const label = `${type === 'robot' ? 'Robot' : 'Organic'} Peetako, ${p.name} palette, ${dead ? 'fallen' : tier === 0 ? 'egg' : `tier ${tier}, ${face}`}`;
  const inner = tier === 0 ? egg(type, p, st) : (type === 'robot' ? robotBody(tier, p, face, st) : organicBody(tier, p, face, st));
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">
    <g transform="translate(37.5 62) scale(0.75)"><ellipse cx="150" cy="262" rx="74" ry="9" fill="#000000" opacity="0.25"/><g class="bob">${inner}</g></g>
  </svg>`;
}

// ---------------------------------------------------------------------------------------------------
// Floating mood symbols (Phase 2A shapes, placed beside the retro gecko's head). At most two.
// ---------------------------------------------------------------------------------------------------
const SLOTS = [[232, 92], [64, 96]];
const OUT = '#1E1B4B';
const heart = (x, y, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 6 C -10 -2 -8 -12 0 -7 C 8 -12 10 -2 0 6 Z" fill="#FB7185" fill-opacity=".85" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>`;
const zed = (x, y, k) => `<path transform="translate(${x} ${y}) scale(${k})" d="M-6 -7 H6 L-6 7 H6" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
  <path transform="translate(${x} ${y}) scale(${k})" d="M-6 -7 H6 L-6 7 H6" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
const sparkle = (x, y, k) => `<path transform="translate(${x} ${y}) scale(${k})" d="M0 -10 Q 2 -2 10 0 Q 2 2 0 10 Q -2 2 -10 0 Q -2 -2 0 -10 Z" fill="#FDE047" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>`;

function symbol(kind, type, [x, y]) {
  switch (kind) {
    case 'happy':
      return `<g class="fx fx-rise">${heart(x - 10, y + 16, 1.3)}</g><g class="fx fx-rise d2">${heart(x + 10, y + 6, 1)}</g><g class="fx fx-rise d3">${heart(x, y - 6, .8)}</g>`;
    case 'hungry': {
      const inner = type === 'robot'
        ? `<rect x="${x - 13}" y="${y - 8}" width="24" height="16" rx="3" fill="#fff" stroke="${OUT}" stroke-width="2.5"/><rect x="${x + 11}" y="${y - 4}" width="4" height="8" fill="${OUT}"/><rect x="${x - 10}" y="${y - 5}" width="6" height="10" fill="#E11D48"/>`
        : `<ellipse cx="${x - 10}" cy="${y - 5}" rx="11" ry="5" fill="#E0F2FE" stroke="${OUT}" stroke-width="1.8" transform="rotate(-20 ${x - 10} ${y - 5})"/>
           <ellipse cx="${x + 10}" cy="${y - 5}" rx="11" ry="5" fill="#E0F2FE" stroke="${OUT}" stroke-width="1.8" transform="rotate(20 ${x + 10} ${y - 5})"/>
           <ellipse cx="${x}" cy="${y + 2}" rx="5" ry="10" fill="#92400E" stroke="${OUT}" stroke-width="1.8"/>`;
      return `<g class="fx fx-pulse"><circle cx="${x - 24}" cy="${y + 32}" r="4" fill="#fff" stroke="${OUT}" stroke-width="2"/><circle cx="${x - 16}" cy="${y + 22}" r="6" fill="#fff" stroke="${OUT}" stroke-width="2"/>
        <ellipse cx="${x}" cy="${y}" rx="27" ry="21" fill="#fff" stroke="${OUT}" stroke-width="2.5"/>${inner}</g>`;
    }
    case 'sleepy':
      return `<g class="fx fx-rise">${zed(x - 6, y + 16, 1.1)}</g><g class="fx fx-rise d2">${zed(x + 8, y + 2, 1.5)}</g><g class="fx fx-rise d3">${zed(x + 18, y - 14, 1.9)}</g>`;
    case 'sad':
      return `<g class="fx fx-bob"><path d="M${x - 24} ${y + 5} a 11 11 0 0 1 5 -20 a 14 14 0 0 1 26 -4 a 11 11 0 0 1 15 14 a 10 10 0 0 1 -5 10 Z" fill="#CBD5E1" stroke="${OUT}" stroke-width="2.5" stroke-linejoin="round"/>
        <g class="fx-rain"><path d="M${x - 14} ${y + 12} l-3 8 M${x} ${y + 14} l-3 8 M${x + 14} ${y + 12} l-3 8" stroke="#38BDF8" stroke-width="4" stroke-linecap="round"/></g></g>`;
    case 'excited':
      return `<g class="fx fx-twinkle">${sparkle(x - 12, y + 10, 1.2)}</g><g class="fx fx-twinkle d2">${sparkle(x + 14, y - 4, .9)}</g><g class="fx fx-twinkle d3">${sparkle(x - 2, y - 20, .7)}</g>`;
    default: return '';
  }
}

export function drawMoodSymbols(symbols = [], type = 'organic', label = '') {
  const body = symbols.slice(0, 2).map((k, i) => symbol(k, type, SLOTS[i])).join('');
  if (!body) return '';
  return `<svg viewBox="0 0 300 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}">${body}</svg>`;
}
