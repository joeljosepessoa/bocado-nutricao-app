import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { EvolutionEntry } from '../types/api';
import { colors, spacing, typography } from '../theme/tokens';

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('pt-BR');
}

export function EvolutionScreen() {
  const [entries, setEntries] = useState<EvolutionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getEvolution();
      setEntries(result.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && entries.length === 0) {
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
      {entries.map((entry) => (
        <Card key={entry.id}>
          <Text style={styles.date}>{formatDate(entry.evaluatedAt)}</Text>
          {entry.weightKg != null ? <Text style={styles.metric}>Peso: {entry.weightKg} kg</Text> : null}
          {entry.bmiClassification ? <Text style={styles.metric}>IMC: {entry.bmiClassification}</Text> : null}
          {entry.bodyFatPercent != null ? (
            <Text style={styles.metric}>% de gordura: {entry.bodyFatPercent}%</Text>
          ) : null}
          {entry.leanMassKg != null ? <Text style={styles.metric}>Massa magra: {entry.leanMassKg} kg</Text> : null}
        </Card>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  date: { ...typography.subtitle, color: colors.textPrimary },
  metric: { ...typography.body, color: colors.textSecondary },
});
