import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { MetricDescriptor } from '../evolution/metricCatalog';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
  metrics: MetricDescriptor[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

export function MetricTabs({ metrics, selectedKey, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {metrics.map((metric) => {
        const active = metric.key === selectedKey;
        return (
          <Pressable
            key={metric.key}
            onPress={() => onSelect(metric.key)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{metric.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs, paddingVertical: 2 },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { ...typography.caption, color: colors.textSecondary },
  labelActive: { color: colors.textInverse, fontWeight: '600' },
});
