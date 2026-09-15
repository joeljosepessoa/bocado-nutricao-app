import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MetricDescriptor } from '../evolution/metricCatalog';
import type { EvolutionEntry } from '../types/api';
import { colors, radius, spacing, typography } from '../theme/tokens';

interface Props {
  title: string;
  metrics: MetricDescriptor[];
  entry: EvolutionEntry;
  defaultCollapsed?: boolean;
}

export function MeasurementsGrid({ title, metrics, entry, defaultCollapsed = true }: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const rows = metrics
    .map((metric) => ({ metric, value: metric.accessor(entry) }))
    .filter((row) => row.value != null);

  if (rows.length === 0) {
    return null;
  }

  return (
    <View>
      <Pressable style={styles.toggle} onPress={() => setCollapsed((c) => !c)}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chevron}>{collapsed ? '▾ ver' : '▴ ocultar'}</Text>
      </Pressable>
      {!collapsed ? (
        <View style={styles.grid}>
          {rows.map((row) => (
            <View key={row.metric.key} style={styles.cell}>
              <Text style={styles.label}>{row.metric.label}</Text>
              <Text style={styles.value}>
                {row.value}
                {row.metric.unit}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  title: { ...typography.subtitle, color: colors.textPrimary, fontSize: 15 },
  chevron: { ...typography.caption, color: colors.primary, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  cell: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  label: { ...typography.caption, color: colors.textSecondary, fontSize: 11 },
  value: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
});
