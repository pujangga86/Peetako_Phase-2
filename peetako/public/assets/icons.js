// Small Borneo motif icons (48 × 48, ink outline, flat colour) for Ikut Rentak and Padan Motif.
// Each has its own shape as well as its own colour, so they can be told apart without colour.
const INK = '#1B1A2E';
const wrap = (body) => `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

export const ICONS = {
  // hornbill: big curved casque and beak
  kenyalang: { name: 'Kenyalang', svg: wrap(`<path d="M8 30c0-8 6-14 14-14h4c3 0 5 2 5 5v4l9 8c-6 1-11-1-14-4" fill="#1B1A2E"/>
    <path d="M26 16c4-6 12-6 16-1-4 0-8 1-11 4z" fill="#F5B700"/><path d="M31 21l11 8c-4 2-8 1-11-2z" fill="#FB923C"/>
    <circle cx="25" cy="21" r="1.8" fill="#fff" stroke="none"/><path d="M10 31l-4 9M16 33l-2 8" />`) },
  // terendak: wide conical hat with a woven band
  terendak: { name: 'Terendak', svg: wrap(`<path d="M4 34L24 10l20 24z" fill="#FDE68A"/><path d="M4 34h40" />
    <path d="M10 27h28M14 22h20" stroke="#E11D48" stroke-width="2.6"/><path d="M24 10v24" />`) },
  // sape: long lute with a carved head
  sape: { name: 'Sape', svg: wrap(`<path d="M14 40c-4-4-3-10 2-13l14-14 4 4-14 14c-3 5-3 8-6 9z" fill="#B45309"/>
    <path d="M30 13l6-6 4 2-2 4-6 6" fill="#F5B700"/><path d="M17 31l13-13M19 33l13-13" stroke="#FEF3C7" stroke-width="1.4"/>`) },
  // pua kumbu: diamond weave
  pua: { name: 'Pua kumbu', svg: wrap(`<rect x="6" y="6" width="36" height="36" fill="#7F1D1D"/>
    <path d="M24 9l15 15-15 15L9 24z" fill="#FEF3C7"/><path d="M24 16l8 8-8 8-8-8z" fill="#7F1D1D"/><circle cx="24" cy="24" r="2.4" fill="#FEF3C7"/>`) },
  // agung: hanging gong with a raised boss
  agung: { name: 'Agung', svg: wrap(`<path d="M12 6h24" /><path d="M18 6v6M30 6v6" />
    <circle cx="24" cy="28" r="15" fill="#D97706"/><circle cx="24" cy="28" r="9" fill="#F59E0B"/><circle cx="24" cy="28" r="4" fill="#FDE68A"/>`) },
  // perahu: longboat on water
  perahu: { name: 'Perahu', svg: wrap(`<path d="M4 26h40l-6 9H10z" fill="#0EA5E9"/><path d="M4 26c2-3 4-3 6 0" />
    <path d="M24 26V10l10 12H24" fill="#FFF8EC"/><path d="M4 41c4-2 6 2 10 0s6 2 10 0 6 2 10 0 6 2 10 0" stroke="#0EA5E9"/>`) },
  // rafflesia: five round petals with spots
  rafflesia: { name: 'Rafflesia', svg: wrap(`${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="24" cy="12" rx="8" ry="9" fill="#DC2626" transform="rotate(${a} 24 24)"/>`).join('')}
    <circle cx="24" cy="24" r="7" fill="#7F1D1D"/><circle cx="24" cy="24" r="3" fill="#FCA5A5"/>
    <circle cx="20" cy="9" r="1.4" fill="#FEE2E2" stroke="none"/><circle cx="38" cy="22" r="1.4" fill="#FEE2E2" stroke="none"/>`) },
  // kelip-kelip: firefly with a glowing tail
  kelip: { name: 'Kelip-kelip', svg: wrap(`<circle cx="30" cy="30" r="11" fill="#FDE047" stroke="none" opacity=".45"/>
    <ellipse cx="22" cy="22" rx="7" ry="5" fill="#1E1B4B" transform="rotate(35 22 22)"/><circle cx="30" cy="29" r="5" fill="#FDE047"/>
    <path d="M18 18c-5-6-11-4-11 0 0 3 6 3 11 0zM22 15c-1-7 4-11 7-8 2 2-2 7-7 8z" fill="#E0F2FE"/>`) },
  // tempayan: big glazed jar
  tempayan: { name: 'Tempayan', svg: wrap(`<path d="M17 6h14v5c7 3 10 10 9 18-1 9-7 13-16 13S9 38 8 29c-1-8 2-15 9-18z" fill="#166534"/>
    <path d="M12 22c6 3 18 3 24 0" stroke="#FDE68A"/><path d="M18 30l3-3 3 3 3-3 3 3" stroke="#FDE68A"/>`) },
  // pokok tapang: a tall tree with a crown of leaves
  pokok: { name: 'Pokok tapang', svg: wrap(`<path d="M20 44V22h8v22z" fill="#92400E"/><path d="M20 30l-7-4M28 26l7-4" />
    <path d="M24 3c9 0 15 5 15 11 0 5-5 9-15 9S9 19 9 14C9 8 15 3 24 3z" fill="#22C55E"/><path d="M15 13c3 2 6 2 9 0 3 2 6 2 9 0" />`) },
  // sompoton: bundle of pipes on a gourd
  sompoton: { name: 'Sompoton', svg: wrap(`<path d="M14 6v20M18 4v22M22 6v20M26 8v18M30 6v20" stroke-width="3"/>
    <ellipse cx="22" cy="34" rx="12" ry="9" fill="#CA8A04"/><path d="M22 43v3" />`) },
  // chik-chak: the house gecko, top view
  chikchak: { name: 'Chik-chak', svg: wrap(`<path d="M24 6c4 0 5 4 5 7 0 2-1 4-2 5v12c0 6-1 10-3 12-2-2-3-6-3-12V18c-1-1-2-3-2-5 0-3 1-7 5-7z" fill="#A3E635"/>
    <path d="M21 20l-8-4-2 3M27 20l8-4 2 3M21 30l-8 3-1 4M27 30l8 3 1 4" /><circle cx="21.5" cy="10" r="1.2" fill="${INK}"/><circle cx="26.5" cy="10" r="1.2" fill="${INK}"/>`) },
};
