import { randomInt } from 'node:crypto';

// OS-backed cryptographic randomness. No clock seeds, counters or repeat filters.
// The object gives tests a narrow server-only seam for deterministic rolls.
export const diceRandom = { roll: () => randomInt(1, 7) };
