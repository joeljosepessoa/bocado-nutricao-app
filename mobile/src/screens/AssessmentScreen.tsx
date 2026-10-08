import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRoute, type RouteProp } from '@react-navigation/native';
import { ClipboardList, WifiOff } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, LoadingState, PageTitle } from '../components/ui';
import { EvaluationReport } from '../components/EvaluationReport';
import { AiAssistPanel } from '../components/AiAssistPanel';
import * as api from '../api/endpoints';
import type { EvolutionEntry } from '../types/api';
import type { MainTabParamList } from '../navigation/types';
import { formatDay } from '../tracking/trackingModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, type ThemeColors } from '../theme/theme';

/**
 * Avaliação: as avaliações liberadas pelo nutricionista (a mais recente por
 * padrão, ou a escolhida no Histórico), com o relatório visual e a
 * explicação em linguagem simples.
 */
export function AssessmentScreen() {
  const styles = useStyles(makeStyles);
  const route = useRoute<RouteProp<MainTabParamList, 'Assessment'>>();
  const requestedId = route.params?.evaluationId;
  const [entries, setEntries] = useState<EvolutionEntry[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(requestedId ?? null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (requestedId) setSelectedId(requestedId);
  }, [requestedId]);

  // Sem cache: se o nutricionista retirar a liberação, a avaliação some na próxima leitura.
  const load = useCallback(async () => {
    try {
      const result = await api.getEvolution(1, 200);
      setEntries(result.items);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!entries && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar suas avaliações." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!entries) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }
  if (entries.length === 0) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <PageTitle title="Avaliação" />
        <EmptyState
          icon={ClipboardList}
          title="Nenhuma avaliação liberada"
          description="Depois de cada avaliação física, seu nutricionista libera os resultados para você ver aqui."
        />
      </ScreenContainer>
    );
  }

  const current = entries.find((e) => e.id === selectedId) ?? entries[0];

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Avaliação" subtitle={`${entries.length} ${entries.length === 1 ? 'avaliação liberada' : 'avaliações liberadas'}`} />

      {entries.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {entries.map((entry) => {
            const active = entry.id === current.id;
            return (
              <Pressable
                key={entry.id}
                onPress={() => setSelectedId(entry.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatDay(entry.evaluatedAt)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <FadeIn key={current.id}>
        <EvaluationReport entries={entries} evaluationId={current.id} />
      </FadeIn>

      <AiAssistPanel
        key={`ai-${current.id}`}
        title="Explicar em linguagem simples"
        helperText="Descreve, em texto simples, os números liberados pelo seu nutricionista nesta avaliação — sem diagnosticar nem interpretar além do que os dados mostram."
        generate={() => api.explainEvaluation(current.id)}
      />
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chips: { gap: spacing.sm, paddingVertical: 2 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
    chipActive: { backgroundColor: colors.primary },
    chipText: { ...typography.caption, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: colors.textInverse },
  });
