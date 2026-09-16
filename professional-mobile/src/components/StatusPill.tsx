import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
  label: string;
  tone?: 'neutral' | 'progress' | 'success' | 'danger';
}

export function StatusPill({ label, tone = 'neutral' }: Props) {
  return (
    <View style={[styles.pill, toneStyles[tone]]}>
      <Text style={[styles.text, tone === 'neutral' ? styles.textNeutral : styles.textOnTint]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  text: { ...typography.caption, fontWeight: '600' },
  textNeutral: { color: colors.textSecondary },
  textOnTint: { color: colors.textInverse },
});

const toneStyles = StyleSheet.create({
  neutral: { backgroundColor: colors.border },
  progress: { backgroundColor: colors.accent },
  success: { backgroundColor: colors.success },
  danger: { backgroundColor: colors.danger },
});
