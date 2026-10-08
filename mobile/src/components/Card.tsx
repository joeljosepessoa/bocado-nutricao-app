import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, spacing } from '../theme/tokens';
import { shadow, useStyles, useTheme, type ThemeColors } from '../theme/theme';

/** Cartão da referência: sem borda, cantos arredondados (rounded-2xl) e sombra (shadow-lg). */
export function Card({ children, style, flat = false }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; flat?: boolean }) {
  const { isDark } = useTheme();
  const styles = useStyles(makeStyles);
  return <View style={[styles.card, flat || isDark ? styles.flat : shadow('lg'), style]}>{children}</View>;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    // No escuro (e nos cartões "flat") a sombra some; uma borda sutil separa do fundo.
    flat: { borderWidth: 1, borderColor: colors.border },
  });
