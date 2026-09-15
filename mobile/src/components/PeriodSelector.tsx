import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PERIOD_OPTIONS, type Period } from '../evolution/periodFilter';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
  value: Period;
  onChange: (period: Period) => void;
}

export function PeriodSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  label: { ...typography.caption, color: colors.textSecondary },
  labelActive: { color: colors.primary, fontWeight: '600' },
});
