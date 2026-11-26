/**
 * roomCode.ts — 6-character room codes that are easy to read aloud and type.
 *
 * The alphabet leaves out look-alike characters (0/O, 1/I/L), so a code read
 * from another phone's screen can't be mistyped.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** A random code like "K7MQ2X". `rng` returns floats in [0, 1). */
export function generateRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Cleans user input: upper-case, no spaces or dashes. */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

/** True if `code` (already normalised) is a well-formed room code. */
export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((ch) => ROOM_CODE_ALPHABET.includes(ch));
}

/** Explains what is wrong with a typed code (or null if it is fine). */
export function roomCodeError(input: string): string | null {
  const code = normalizeRoomCode(input);
  if (code.length === 0) return 'Enter the 6-character room code.';
  if (code.length !== ROOM_CODE_LENGTH) return `Room codes have ${ROOM_CODE_LENGTH} characters.`;
  if (/[01OIL]/.test(code)) return 'Room codes never contain 0, O, 1, I or L — check the code.';
  if (!isValidRoomCode(code)) return 'Room codes use only letters and the digits 2–9.';
  return null;
}
