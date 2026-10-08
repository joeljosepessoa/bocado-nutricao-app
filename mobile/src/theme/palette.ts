/**
 * Paletas do app do cliente (claro/escuro) e a regra de escolha do tema — puro,
 * sem React Native, para poder ser testado.
 */

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  gradientStart: string;
  gradientEnd: string;
  accent: string;
  danger: string;
  dangerLight: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  water: string;
  waterSoft: string;
  violet: string;
  overlay: string;
}

const light: ThemeColors = {
  background: '#F9FAFB',
  surface: '#FFFFFF',
  surfaceMuted: '#F3F4F6',
  border: '#E5E7EB',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textInverse: '#FFFFFF',
  primary: '#F97316',
  primaryDark: '#EA580C',
  primaryLight: '#FFEDD5',
  primarySoft: '#FFF7ED',
  gradientStart: '#F97316',
  gradientEnd: '#DC2626',
  accent: '#F59E0B',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  success: '#16A34A',
  successSoft: '#F0FDF4',
  info: '#2563EB',
  infoSoft: '#EFF6FF',
  water: '#0891B2',
  waterSoft: '#ECFEFF',
  violet: '#8B5CF6',
  overlay: 'rgba(0,0,0,0.5)',
};

const dark: ThemeColors = {
  background: '#111827',
  surface: '#1F2937',
  surfaceMuted: '#374151',
  border: '#374151',
  textPrimary: '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  textInverse: '#FFFFFF',
  primary: '#F97316',
  primaryDark: '#FB923C',
  primaryLight: 'rgba(249,115,22,0.20)',
  primarySoft: 'rgba(249,115,22,0.12)',
  gradientStart: '#F97316',
  gradientEnd: '#DC2626',
  accent: '#FBBF24',
  danger: '#F87171',
  dangerLight: 'rgba(239,68,68,0.15)',
  success: '#4ADE80',
  successSoft: 'rgba(34,197,94,0.15)',
  info: '#60A5FA',
  infoSoft: 'rgba(59,130,246,0.15)',
  water: '#22D3EE',
  waterSoft: 'rgba(6,182,212,0.15)',
  violet: '#A78BFA',
  overlay: 'rgba(0,0,0,0.6)',
};

export const PALETTES = { light, dark } as const;
export type ThemeMode = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'theme';

/** Preferência salva vence; sem ela, o sistema decide (null do sistema = claro). */
export function resolveMode(saved: string | null, system: string | null | undefined): ThemeMode {
  if (saved === 'light' || saved === 'dark') return saved;
  return system === 'dark' ? 'dark' : 'light';
}
