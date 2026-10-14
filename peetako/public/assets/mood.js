// Peetako visible mood (Phase 2A). Browser only: derived from the stats the server already sends.
// Five moods (GDD): happy, hungry, sleepy, sad, excited. Each has its own face and one floating
// symbol, and every mood must read without colour (shapes differ, not just hues).

export const MOODS = ['happy', 'hungry', 'sleepy', 'sad', 'excited'];
export const NEED_BELOW = 40;      // a stat under this shows its need (same threshold as the "!" badge in the GDD)
export const EXCITED_FROM = 85;    // every stat at or above this reads as excited
export const EXCITED_AFTER_CARE_MS = 8000; // a care action makes the pet excited for a few seconds

// Which mood a low stat produces. Temperature: an Organic gecko is cold-blooded and turns sluggish
// when cold; a Robot overheats and drops into power-saving mode. Both read as sleepy.
const NEED_MOOD = { energy: 'hungry', temperature: 'sleepy', health: 'sad', mood: 'sad' };

// Returns { face, symbols } where face is one mood and symbols holds at most two moods.
export function moodOf(pet, { now = Date.now(), caredAt = 0 } = {}) {
  if (pet.status === 'dead') return { face: 'fallen', symbols: [] };
  if (pet.status === 'ascended') return { face: 'happy', symbols: ['excited'] };
  if (pet.status === 'dormant') return { face: 'sleepy', symbols: ['sleepy'] };

  const needs = Object.entries(pet.stats)
    .filter(([, v]) => v < NEED_BELOW)
    .sort((a, b) => a[1] - b[1])
    .map(([k]) => NEED_MOOD[k]);
  const symbols = [...new Set(needs)].slice(0, 2);
  if (symbols.length) return { face: symbols[0], symbols };

  const values = Object.values(pet.stats);
  if (now - caredAt < EXCITED_AFTER_CARE_MS || values.every((v) => v >= EXCITED_FROM)) {
    return { face: 'excited', symbols: ['excited'] };
  }
  return { face: 'happy', symbols: ['happy'] };
}

// Short words for screen readers and the mood chip.
export const MOOD_LABEL = {
  happy: 'Happy', hungry: 'Hungry', sleepy: 'Sleepy', sad: 'Sad', excited: 'Excited', fallen: 'Fallen',
};
