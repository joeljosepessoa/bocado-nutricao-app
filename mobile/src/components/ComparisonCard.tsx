import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { computeDelta, computePercentDelta } from '../evolution/delta';
import { PRIMARY_METRICS } from '../evolution/metricCatalog';
import type { EvolutionEntry } from '../types/api';
import { colors, spacing, typography } from '../theme/tokens';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

interface Props {
  from: EvolutionEntry;
  to: EvolutionEntry;
}

/**
 * Comparação sempre calculada aqui, no app — nunca chamando um endpoint
 * dedicado (ver Fase 8, Seção 4: o cliente já recebe só os campos
 * autorizados, então subtrair dois pontos localmente é suficiente e não
 * duplica lógica de autorização em duas rotas).
 */
export function ComparisonCard({ from, to }: Props) {
  const rows = PRIMARY_METRICS.map((metric) => {
    const a = metric.accessor(from);
    const b = metric.accessor(to);
    return { metric, a, b, delta: computeDelta(a, b), percent: computePercentDelta(a, b) };
  }).filter((row) => row.a != null || row.b != null);

  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>{formatDate(from.evaluatedAt)}</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={styles.headerLabel}>{formatDate(to.evaluatedAt)}</Text>
      </View>
      {rows.map((row) => (
        <View key={row.metric.key} style={styles.row}>
          <Text style={styles.metricLabel}>{row.metric.label}</Text>
          <Text style={styles.value}>
            {row.a ?? '—'}
            {row.metric.unit} → {row.b ?? '—'}
            {row.metric.unit}
          </Text>
          <Text style={[styles.delta, row.delta != null && row.delta < 0 ? styles.deltaDown : styles.deltaUp]}>
            {row.delta == null ? '—' : `${row.delta > 0 ? '+' : ''}${row.delta}${row.metric.unit}`}
            {row.percent != null ? ` (${row.percent > 0 ? '+' : ''}${row.percent}%)` : ''}
          </Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
  headerLabel: { ...typography.caption, color: colors.textSecondary },
  arrow: { color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: spacing.xs,
    flexWrap: 'wrap',
    gap: 4,
  },
  metricLabel: { ...typography.body, color: colors.textPrimary, flexBasis: '100%' },
  value: { ...typography.caption, color: colors.textSecondary },
  delta: { ...typography.caption, fontWeight: '600' },
  deltaDown: { color: colors.danger },
  deltaUp: { color: colors.primary },
});
