/**
 * players.ts — who sits where. Seat 0 is always the human; the three bots
 * have fixed names, avatars and accent colours so they are easy to tell apart.
 */
import type { Seat } from './types';

export interface PlayerProfile {
  seat: Seat;
  name: string;
  /** Emoji avatar drawn inside a coloured medallion. */
  avatar: string;
  /** Medallion gradient colours. */
  colors: [string, string];
  isBot: boolean;
}

export const HUMAN_SEAT: Seat = 0;

/** Compass position of each seat on screen (used for layout and animations). */
export const SEAT_POSITION = ['south', 'west', 'north', 'east'] as const;
export type SeatPosition = (typeof SEAT_POSITION)[number];

const BOTS: Omit<PlayerProfile, 'seat' | 'isBot'>[] = [
  { name: 'Noor', avatar: '🦉', colors: ['#7A4FD1', '#3B2378'] }, // West  (opponent)
  { name: 'Bilal', avatar: '🐯', colors: ['#2F9E8F', '#14524A'] }, // North (your partner)
  { name: 'Sana', avatar: '🦊', colors: ['#D9733F', '#7A3316'] }, // East  (opponent)
];

/** Builds the four player profiles, using the human's chosen name for seat 0. */
export function getPlayers(humanName: string): PlayerProfile[] {
  return [
    { seat: 0, name: humanName.trim() || 'You', avatar: '🎩', colors: ['#D9B65D', '#8A6A22'], isBot: false },
    ...BOTS.map((b, i) => ({ ...b, seat: (i + 1) as Seat, isBot: true })),
  ];
}
