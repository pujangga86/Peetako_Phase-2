// Palette colours as CSS variables on an element (used by the public pet page).
import { palette } from './palettes.js';

export function applyPalette(el, id) {
  const p = palette(id);
  const vars = { '--pg': p.page, '--card': p.belly, '--ink': p.line, '--gold': p.gold, '--body': p.body, '--spot': p.spot,
    '--b1': p.btn[0], '--b2': p.btn[1], '--b3': p.btn[2], '--b4': p.btn[3] };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}
