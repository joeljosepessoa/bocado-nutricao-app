export const colors = {
  primary: '#1F7A5C',
  primaryDark: '#155C45',
  primaryLight: '#E4F3EC',
  accent: '#E8A33D',
  background: '#F7F8F6',
  surface: '#FFFFFF',
  border: '#E1E4E0',
  textPrimary: '#1B231F',
  textSecondary: '#5B665F',
  textInverse: '#FFFFFF',
  danger: '#C1443B',
  dangerLight: '#FBEAE8',
  success: '#2E8B57',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const },
  subtitle: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
};
