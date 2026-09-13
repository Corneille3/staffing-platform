// Initials avatar colour, derived from the person's name so the same worker
// wears the same tone on every screen (Boîte header, Profil) — and two
// neighbours in a list don't all read as the same terra blob. No avatar
// photo exists in the API (worker-screens plan, étape 5), so this is the
// only identity cue we have.
//
// Pure (no React, no i18n): safe to import from server and client modules
// alike, and unit-tested.

export type AvatarTone = "terra" | "moss" | "sand";

const TONES: readonly AvatarTone[] = ["terra", "moss", "sand"];

export function avatarTone(name: string): AvatarTone {
  // djb2 xor variant — stable across runtimes, cheap, spreads short strings
  // well enough for a three-way split.
  let hash = 5381;
  for (const char of name.trim().toLowerCase()) {
    hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  }
  return TONES[hash % TONES.length];
}
