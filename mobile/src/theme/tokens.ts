import { PALETTES } from './palette';

/**
 * Tokens estáticos. As cores aqui são as do tema CLARO — telas e componentes
 * usam `useTheme()` / `useStyles()` (theme.tsx) para acompanhar o modo escuro.
 */
export const colors = PALETTES.light;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** rounded-lg / rounded-xl / rounded-2xl / rounded-3xl da referência. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 30, fontWeight: '800' as const },
  title: { fontSize: 24, fontWeight: '700' as const },
  subtitle: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  tiny: { fontSize: 11, fontWeight: '500' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
};
