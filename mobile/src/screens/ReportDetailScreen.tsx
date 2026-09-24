import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { ComparisonCard } from '../components/ComparisonCard';
import { EvolutionChart } from '../components/EvolutionChart';
import { MeasurementsGrid } from '../components/MeasurementsGrid';
import { MetricTabs } from '../components/MetricTabs';
import { EvaluationPhotoGallery } from '../components/EvaluationPhotoGallery';
import { useAuth } from '../auth/AuthContext';
import { toChartPoints } from '../evolution/chartData';
import { ALL_METRICS, COMPOSITION_METRICS, MEASUREMENT_METRICS, PRIMARY_METRICS, findMetric } from '../evolution/metricCatalog';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/tokens';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

/**
 * Experiência visual "Meu relatório" — versão em rolagem vertical (não em
 * páginas) da mesma estrutura do PDF profissional: resumo → composição →
 * evolução → medidas → fotos. Só usa o que o backend já libera ao cliente
 * (allowlist de PhysicalEvaluationClientSummaryDto) — nunca dobras, notas,
 * protocolo ou sinais vitais, porque esses campos simplesmente não chegam
 * aqui (o backend nem os envia, não é uma omissão da tela).
 */
export function ReportDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReportDetail'>>();
  const { entries, evaluationId } = route.params;
  const { user } = useAuth();
  const [metricKey, setMetricKey] = useState('weightKg');

  // A API devolve em ordem decrescente (mais recente primeiro) — "anterior"
  // é o próximo item da lista, nunca recalculado aqui.
  const index = entries.findIndex((e) => e.id === evaluationId);
  const current = index >= 0 ? entries[index] : entries[0];
  const previous = index >= 0 && index + 1 < entries.length ? entries[index + 1] : null;
  const hasHistory = entries.length > 1;

  const availableMetrics = useMemo(
    () => ALL_METRICS.filter((metric) => entries.some((entry) => metric.accessor(entry) != null)),
    [entries],
  );
  const selectedMetric = availableMetrics.some((m) => m.key === metricKey)
    ? findMetric(metricKey)
    : (availableMetrics[0] ?? findMetric('weightKg'));
  const chartPoints = useMemo(() => toChartPoints(entries, selectedMetric), [entries, selectedMetric]);

  if (!current) {
    return (
      <ScreenContainer>
        <Text style={styles.empty}>Avaliação não encontrada.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.brand}>BOCADO DE NUTRIÇÃO</Text>
        <Text style={styles.kind}>Avaliação Corporal</Text>
        {user?.fullName ? <Text style={styles.clientName}>{user.fullName}</Text> : null}
        <Text style={styles.date}>{formatDate(current.evaluatedAt)}</Text>
      </View>

      <Text style={styles.sectionTitle}>Resumo da sua evolução</Text>
      {previous ? (
        <ComparisonCard from={previous} to={current} />
      ) : (
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
      )}
      {!previous ? (
        <Text style={styles.singleNotice}>
          Esta é sua primeira avaliação liberada — a comparação aparece a partir da segunda.
        </Text>
      ) : null}

      <MeasurementsGrid title="Composição corporal" metrics={COMPOSITION_METRICS} entry={current} defaultCollapsed={false} />

      {hasHistory ? (
        <Card>
          <Text style={styles.sectionTitle}>Sua evolução</Text>
          <MetricTabs metrics={availableMetrics} selectedKey={selectedMetric.key} onSelect={setMetricKey} />
          <EvolutionChart points={chartPoints} unit={selectedMetric.unit} />
        </Card>
      ) : null}

      <MeasurementsGrid title="Medidas corporais" metrics={MEASUREMENT_METRICS} entry={current} defaultCollapsed={false} />

      <EvaluationPhotoGallery evaluationId={current.id} photos={current.photos} />

      <Text style={styles.footer}>Gerado a partir da avaliação de {formatDate(current.evaluatedAt)}</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  header: { alignItems: 'center', paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { ...typography.subtitle, color: colors.primaryDark, letterSpacing: 0.5 },
  kind: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase', marginTop: 2 },
  clientName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginTop: spacing.xs },
  date: { ...typography.caption, color: colors.textSecondary },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary, fontSize: 16 },
  singleNotice: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
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
  footer: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
});
