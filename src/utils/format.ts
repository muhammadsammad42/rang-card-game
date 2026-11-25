/**
 * format.ts — small text helpers shared by screens (team names, dates, plurals).
 */
import { SUIT_NAMES, SUIT_SYMBOLS } from '@/game/deck';
import type { Suit, Team } from '@/game/types';

export const teamLabel = (team: Team): string => (team === 'A' ? 'Your team' : 'Opponents');
export const teamShort = (team: Team): string => (team === 'A' ? 'Us' : 'Them');
export const suitText = (suit: Suit): string => `${SUIT_SYMBOLS[suit]} ${SUIT_NAMES[suit]}`;
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "24 Nov 2026, 21:30" in the device locale. */
export function formatDate(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "3m 05s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}
