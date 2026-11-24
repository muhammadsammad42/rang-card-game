/**
 * theme.ts — the single source of truth for Rang's visual identity.
 *
 * "Midnight Lounge": a deep navy room, an emerald felt table, brass/gold
 * accents and frosted-glass panels. Every component reads colours, spacing,
 * radii, typography and shadows from here so the look stays consistent and
 * can be re-skinned from one file.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

/** Raw colour palette. Components should prefer the semantic names below. */
export const colors = {
  // Room / background
  night: '#060A13',
  nightElevated: '#0C1424',
  nightPanel: '#111B2E',

  // Felt table (used as gradient stops)
  feltLight: '#11543F',
  felt: '#0A3D2E',
  feltDark: '#05241B',
  feltEdge: '#3A2A12', // wooden rail around the felt

  // Brass / gold accents
  gold: '#D9B65D',
  goldLight: '#F3DB97',
  goldDeep: '#9C7A2E',
  goldGlow: 'rgba(217, 182, 93, 0.35)',

  // Text
  ivory: '#F5F0E3',
  textMuted: '#A7B0C2',
  textDim: '#6C778C',
  textOnGold: '#1B1406',

  // Teams (seat 0 & 2 = Team A, seat 1 & 3 = Team B)
  teamA: '#4FD1C5',
  teamASoft: 'rgba(79, 209, 197, 0.18)',
  teamB: '#F2916B',
  teamBSoft: 'rgba(242, 145, 107, 0.18)',

  // Status
  success: '#3DD68C',
  danger: '#EF5A5F',
  warning: '#F5B544',
  info: '#7AA7FF',

  // Glass panels
  glass: 'rgba(12, 20, 36, 0.78)',
  glassStrong: 'rgba(8, 13, 24, 0.92)',
  glassBorder: 'rgba(217, 182, 93, 0.28)',
  hairline: 'rgba(255, 255, 255, 0.08)',
  scrim: 'rgba(3, 6, 12, 0.72)',

  // Playing cards
  cardFace: '#FBF8F1',
  cardFaceShade: '#EDE6D6',
  cardBorder: '#D8CFBC',
  suitRed: '#C62838',
  suitBlack: '#18202E',
  cardBack: '#13213D',
  cardBackAccent: '#D9B65D',
} as const;

/** Background gradients (pass to expo-linear-gradient `colors`). */
export const gradients = {
  room: [colors.nightElevated, colors.night] as const,
  felt: [colors.feltLight, colors.felt, colors.feltDark] as const,
  gold: [colors.goldLight, colors.gold, colors.goldDeep] as const,
  panel: ['rgba(22, 34, 58, 0.92)', 'rgba(10, 16, 30, 0.95)'] as const,
  win: ['#1E5C45', '#0B2A20'] as const,
  lose: ['#4A1E26', '#1A0B10'] as const,
};

/** 4-point spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Serif for display text gives the "lounge" feel without loading fonts. */
const displayFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const typography = {
  display: { fontFamily: displayFamily, fontSize: 44, fontWeight: '700', letterSpacing: 2 } as TextStyle,
  title: { fontFamily: displayFamily, fontSize: 26, fontWeight: '700', letterSpacing: 0.5 } as TextStyle,
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: 0.3 } as TextStyle,
  body: { fontSize: 15, fontWeight: '500' } as TextStyle,
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4 } as TextStyle,
  caption: { fontSize: 12, fontWeight: '500' } as TextStyle,
  micro: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' } as TextStyle,
};

/** Cross-platform shadow presets (iOS shadow* + Android elevation). */
export const shadows: Record<'sm' | 'md' | 'lg' | 'glow', ViewStyle> = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  glow: {
    shadowColor: colors.gold,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
};

/** Animation timing used across Reanimated animations (ms). */
export const motion = {
  fast: 150,
  normal: 260,
  slow: 420,
  deal: 70, // stagger between dealt cards
  trickHold: 900, // how long a finished trick stays visible before sweeping
} as const;

export const theme = { colors, gradients, spacing, radii, typography, shadows, motion };
export type Theme = typeof theme;
export default theme;
