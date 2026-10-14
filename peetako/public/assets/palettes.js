// Peetako colour palettes (Phase 2B), taken from the "Retro frame: 5 palettes v2" mockup.
// Pet colours: body, shade, belly, spot, gold, eye, line (outline), toe.
// Frame colours: page (screen around the frame), belly (frame card), line (frame ink), btn (four control buttons).

export const PALETTES = {
  hijau: {
    name: 'Hijau Rimba', sub: 'Jungle green (original)',
    body: '#4ADE80', shade: '#16A34A', belly: '#FEF3C7', spot: '#16A34A', gold: '#F5B700', eye: '#F59E0B', line: '#1E1B4B', toe: '#BBF7D0',
    page: '#1A1840', btn: ['#FB923C', '#F5B700', '#67E8F9', '#C4B5FD'],
  },
  tokay: {
    name: 'Tokay', sub: 'Blue-grey, orange spots',
    body: '#6E9FC4', shade: '#4D7EA5', belly: '#F4EBD0', spot: '#FF8A3D', gold: '#FFD166', eye: '#FFD166', line: '#2E3F5C', toe: '#FBF5E6',
    page: '#1E2A47', btn: ['#FFD166', '#9CC3E0', '#F4EBD0', '#FFB07A'],
  },
  kenyalang: {
    name: 'Kenyalang', sub: 'Orange, red and gold',
    body: '#F59A3C', shade: '#D97A1E', belly: '#FFF1D6', spot: '#D7432F', gold: '#F7C948', eye: '#F7C948', line: '#2A1E1A', toe: '#FFF8EA',
    page: '#2E211C', btn: ['#F7C948', '#F59A3C', '#FFF1D6', '#F2907F'],
  },
  puakumbu: {
    name: 'Pua Kumbu', sub: 'Burgundy, indigo, ochre',
    body: '#8E2F3A', shade: '#6E212B', belly: '#F2DDB0', spot: '#2F4B8A', gold: '#E0A030', eye: '#E0A030', line: '#2B1215', toe: '#F8EBCB',
    page: '#220F13', btn: ['#E0A030', '#C76A74', '#F2DDB0', '#8FA6DA'],
  },
  laut: {
    name: 'Laut Borneo', sub: 'Bright aqua, coral, sand',
    body: '#5ED8E0', shade: '#2FB0BC', belly: '#FFF6D6', spot: '#FF6F61', gold: '#F7B731', eye: '#F7B731', line: '#14495C', toe: '#FFFBEA',
    page: '#0E3140', btn: ['#F7B731', '#7FD9DF', '#FFF6D6', '#FF9A8F'],
  },
};

export const PALETTE_IDS = Object.keys(PALETTES);
export const palette = (id) => PALETTES[id] || PALETTES.hijau;

// Fallen pets are drawn in greys, whatever their palette.
export const FALLEN = {
  name: 'Fallen', body: '#CBD5E1', shade: '#94A3B8', belly: '#E2E8F0', spot: '#94A3B8', gold: '#CBD5E1', eye: '#94A3B8', line: '#1E1B4B', toe: '#E2E8F0',
  page: '#1A1840', btn: ['#CBD5E1', '#CBD5E1', '#CBD5E1', '#CBD5E1'],
};
