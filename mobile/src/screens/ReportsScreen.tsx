import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { EvolutionEntry } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/tokens';

// Mesmo truque de "buscar tudo" já usado em EvolutionScreen — sem endpoint
// dedicado de listagem paginada pro app, e o volume real por cliente é
// baixo (dezenas de avaliações, não milhares).
const EVOLUTION_FETCH_PAGE_SIZE = 200;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function EvaluationCard({ entry, onOpen }: { entry: EvolutionEntry; onOpen: () => void }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>Avaliação corporal</Text>
      <Text style={styles.cardDate}>{formatDate(entry.evaluatedAt)}</Text>
      <View style={styles.cardMetrics}>
        {entry.weightKg != null ? <Text style={styles.metric}>Peso: {entry.weightKg} kg</Text> : null}
        {entry.bodyFatPercent != null ? <Text style={styles.metric}>Gordura: {entry.bodyFatPercent}%</Text> : null}
        {entry.composition?.muscleMassKg != null ? (
          <Text style={styles.metric}>Massa muscular: {entry.composition.muscleMassKg} kg</Text>
        ) : null}
      </View>
      <Button title="Ver relatório" variant="secondary" onPress={onOpen} />
    </Card>
  );
}

export function ReportsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [entries, setEntries] = useState<EvolutionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Sem cache em disco de propósito — mesma razão de EvolutionScreen:
      // se o profissional retirar a liberação, a avaliação precisa sumir na
      // próxima leitura, não continuar visível a partir de cópia local.
      const result = await api.getEvolution(1, EVOLUTION_FETCH_PAGE_SIZE);
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
          Nenhuma avaliação liberada ainda. Seu profissional libera o relatório visual da sua avaliação depois de
          registrá-la.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      {entries.map((entry) => (
        <EvaluationCard
          key={entry.id}
          entry={entry}
          onOpen={() => navigation.navigate('ReportDetail', { entries, evaluationId: entry.id })}
        />
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  cardTitle: { ...typography.caption, color: colors.textSecondary, textTransform: 'uppercase' },
  cardDate: { ...typography.subtitle, color: colors.textPrimary },
  cardMetrics: { gap: 2 },
  metric: { ...typography.body, color: colors.textSecondary },
});
