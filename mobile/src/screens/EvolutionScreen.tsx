import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { ComparisonCard } from '../components/ComparisonCard';
import { EvolutionChart } from '../components/EvolutionChart';
import { MeasurementsGrid } from '../components/MeasurementsGrid';
import { MetricTabs } from '../components/MetricTabs';
import { PeriodSelector } from '../components/PeriodSelector';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import { toChartPoints } from '../evolution/chartData';
import { resolveEvolutionViewState } from '../evolution/emptyState';
import { ALL_METRICS, COMPOSITION_METRICS, MEASUREMENT_METRICS, PRIMARY_METRICS, findMetric } from '../evolution/metricCatalog';
import { filterByPeriod, type Period } from '../evolution/periodFilter';
import type { EvolutionEntry } from '../types/api';
import { colors, spacing, typography } from '../theme/tokens';

// Bem acima do volume real de avaliações por cliente (dezenas, não
// centenas) — na prática funciona como "buscar tudo" para o gráfico e o
// filtro de período, sem precisar de um endpoint dedicado (ver desenho da
// Fase 8, Seção 15/16).
const EVOLUTION_FETCH_PAGE_SIZE = 200;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function EvolutionEntryCard({ entry }: { entry: EvolutionEntry }) {
  return (
    <Card>
      <Text style={styles.date}>{formatDate(entry.evaluatedAt)}</Text>
      {entry.weightKg != null ? <Text style={styles.metric}>Peso: {entry.weightKg} kg</Text> : null}
      {entry.bmiClassification ? <Text style={styles.metric}>IMC: {entry.bmiClassification}</Text> : null}
      {entry.bodyFatPercent != null ? <Text style={styles.metric}>% de gordura: {entry.bodyFatPercent}%</Text> : null}
      {entry.fatMassKg != null ? <Text style={styles.metric}>Massa gorda: {entry.fatMassKg} kg</Text> : null}
      {entry.leanMassKg != null ? <Text style={styles.metric}>Massa magra: {entry.leanMassKg} kg</Text> : null}
    </Card>
  );
}

export function EvolutionScreen() {
  const [entries, setEntries] = useState<EvolutionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');
  const [metricKey, setMetricKey] = useState<string>('weightKg');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sem cache em disco de propósito: se o profissional retirar a
      // liberação de uma avaliação, ela precisa sumir na próxima leitura,
      // não continuar visível a partir de uma cópia local (Fase 8, Seção 9).
      const result = await api.getEvolution(1, EVOLUTION_FETCH_PAGE_SIZE);
      setEntries(result.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // O backend ordena desc (mais recente primeiro); aqui só derivamos
  // "atual" (primeiro) e "inicial" (último) — sem endpoint dedicado.
  const current = entries[0] ?? null;
  const initial = entries.length > 0 ? entries[entries.length - 1] : null;
  const viewState = resolveEvolutionViewState(entries);

  const periodEntries = useMemo(() => filterByPeriod(entries, period), [entries, period]);
  const availableMetrics = useMemo(
    () => ALL_METRICS.filter((metric) => entries.some((entry) => metric.accessor(entry) != null)),
    [entries],
  );
  const selectedMetric = useMemo(() => {
    if (availableMetrics.some((m) => m.key === metricKey)) {
      return findMetric(metricKey);
    }
    return availableMetrics[0] ?? findMetric('weightKg');
  }, [availableMetrics, metricKey]);
  const chartPoints = useMemo(
    () => toChartPoints(periodEntries, selectedMetric),
    [periodEntries, selectedMetric],
  );

  if (viewState === 'none') {
    return (
      <ScreenContainer onRefresh={load} refreshing={loading}>
        <Text style={styles.empty}>
          Nenhuma avaliação liberada ainda. Seu profissional libera os indicadores de evolução após cada avaliação
          física.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      {current ? (
        <View style={styles.currentGrid}>
          {PRIMARY_METRICS.map((metric) => {
            const value = metric.accessor(current);
            if (value == null) return null;
            return (
              <View key={metric.key} style={styles.currentTile}>
                <Text style={styles.currentLabel}>{metric.label}</Text>
                <Text style={styles.currentValue}>
                  {value}
                  {metric.unit}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {current ? (
        <>
          <MeasurementsGrid title="Circunferências" metrics={MEASUREMENT_METRICS} entry={current} />
          <MeasurementsGrid title="Composição (bioimpedância)" metrics={COMPOSITION_METRICS} entry={current} />
        </>
      ) : null}

      {viewState === 'single' ? (
        <Text style={styles.singleNotice}>
          Assim que houver uma segunda avaliação liberada, o gráfico de evolução e a comparação aparecem aqui.
        </Text>
      ) : (
        <>
          <Card>
            <Text style={styles.sectionTitle}>Gráfico</Text>
            <MetricTabs metrics={availableMetrics} selectedKey={selectedMetric.key} onSelect={setMetricKey} />
            <PeriodSelector value={period} onChange={setPeriod} />
            <EvolutionChart points={chartPoints} unit={selectedMetric.unit} />
          </Card>

          {initial && current && initial.id !== current.id ? (
            <>
              <Text style={styles.sectionTitle}>Comparação — inicial vs. atual</Text>
              <ComparisonCard from={initial} to={current} />
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Histórico</Text>
          {entries.map((entry) => (
            <EvolutionEntryCard key={entry.id} entry={entry} />
          ))}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  date: { ...typography.subtitle, color: colors.textPrimary },
  metric: { ...typography.body, color: colors.textSecondary },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  singleNotice: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', padding: spacing.sm },
  currentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  currentTile: {
    flexGrow: 1,
    minWidth: '28%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.sm,
    alignItems: 'center',
  },
  currentLabel: { ...typography.caption, color: colors.textSecondary, fontSize: 11, textAlign: 'center' },
  currentValue: { ...typography.subtitle, color: colors.primaryDark, fontSize: 18 },
});
