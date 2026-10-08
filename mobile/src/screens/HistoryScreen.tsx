import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ChevronRight, ClipboardList, Droplets, Dumbbell, History, Scale, WifiOff } from 'lucide-react-native';
import { Card } from '../components/Card';
import { Collapsible } from '../components/Collapsible';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, LoadingState, PageTitle } from '../components/ui';
import * as api from '../api/endpoints';
import type { EvolutionEntry, WaterHistory, WeightEntry, WorkoutClientSummary, WorkoutExecutionRecord } from '../types/api';
import type { AppNavigation } from '../navigation/types';
import { formatKg, formatMl } from '../dashboard/dashboardModel';
import { executionView, formatCalendarDay, formatDateTime, formatDay, formatDelta, weightRows } from '../tracking/trackingModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

type Tab = 'workouts' | 'weights' | 'water' | 'evaluations';

const TABS: Array<{ key: Tab; label: string; icon: typeof Dumbbell }> = [
  { key: 'workouts', label: 'Treinos', icon: Dumbbell },
  { key: 'weights', label: 'Peso', icon: Scale },
  { key: 'water', label: 'Água', icon: Droplets },
  { key: 'evaluations', label: 'Avaliações', icon: ClipboardList },
];

interface HistoryData {
  executions: WorkoutExecutionRecord[];
  workout: WorkoutClientSummary | null;
  weights: WeightEntry[];
  water: WaterHistory | null;
  evaluations: EvolutionEntry[];
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

/** Histórico: treinos concluídos (com séries, cargas e observação), pesos, água e avaliações. */
export function HistoryScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const navigation = useNavigation<AppNavigation>();
  const [tab, setTab] = useState<Tab>('workouts');
  const [data, setData] = useState<HistoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.listWorkoutExecutions(1, 50),
      api.getCurrentWorkout(),
      api.getWeights(),
      api.getWaterHistory(30),
      api.getEvolution(1, 100),
    ]);
    if (results.every((r) => r.status === 'rejected')) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      executions: settled(results[0])?.items ?? [],
      workout: settled(results[1]),
      weights: settled(results[2])?.items ?? [],
      water: settled(results[3]),
      evaluations: settled(results[4])?.items ?? [],
    });
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

  if (!data && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar seu histórico." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!data) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Histórico" subtitle="Tudo o que você registrou" />

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Icon size={16} color={active ? colors.textInverse : colors.textSecondary} />
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'workouts' ? (
        data.executions.length === 0 ? (
          <EmptyState icon={History} title="Nenhum treino concluído" description="Ao finalizar um treino, ele aparece aqui com as séries e cargas." />
        ) : (
          data.executions.map((record, index) => {
            const view = executionView(record, data.workout);
            return (
              <FadeIn key={view.id} delay={Math.min(index, 8) * 40}>
                <Card>
                  <Collapsible
                    accessibilityLabel={`${view.dayName}, ${view.date}`}
                    header={
                      <View>
                        <Text style={styles.itemTitle}>{view.dayName}</Text>
                        <Text style={styles.itemDetail}>
                          {view.date} · {view.setCount} {view.setCount === 1 ? 'série' : 'séries'}
                        </Text>
                      </View>
                    }
                  >
                    {view.exercises.map((exercise, i) => (
                      <View key={`${exercise.name}-${i}`} style={styles.exercise}>
                        <Text style={styles.exerciseName}>{exercise.name}</Text>
                        {exercise.sets.map((set, s) => (
                          <Text key={s} style={styles.itemDetail}>
                            Série {s + 1}: {set}
                          </Text>
                        ))}
                      </View>
                    ))}
                    {view.notes ? (
                      <View style={styles.notes}>
                        <Text style={styles.notesLabel}>Observação</Text>
                        <Text style={styles.notesText}>{view.notes}</Text>
                      </View>
                    ) : null}
                  </Collapsible>
                </Card>
              </FadeIn>
            );
          })
        )
      ) : null}

      {tab === 'weights' ? (
        data.weights.length === 0 ? (
          <EmptyState icon={Scale} title="Nenhum peso registrado" actionLabel="Registrar peso" onAction={() => navigation.navigate('Weight')} />
        ) : (
          <Card>
            {weightRows(data.weights).map((row, index) => (
              <View key={row.id ?? `evaluation-${row.recordedAt}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>{formatKg(row.weightKg)}</Text>
                  <Text style={styles.itemDetail}>
                    {formatDateTime(row.recordedAt)}
                    {row.source === 'evaluation' ? ' · Avaliação' : ''}
                  </Text>
                </View>
                {row.delta !== null ? (
                  <Text style={[styles.delta, { color: row.delta > 0 ? colors.danger : colors.success }]}>{formatDelta(row.delta)}</Text>
                ) : null}
              </View>
            ))}
          </Card>
        )
      ) : null}

      {tab === 'water' ? (
        !data.water || data.water.days.length === 0 ? (
          <EmptyState icon={Droplets} title="Nenhum registro de água" description="Últimos 30 dias." actionLabel="Registrar água" onAction={() => navigation.navigate('Water')} />
        ) : (
          <Card>
            <Text style={styles.itemDetail}>Últimos 30 dias · meta atual {formatMl(data.water.goalMl)}</Text>
            {data.water.days.map((day, index) => {
              const reached = day.totalMl >= (data.water?.goalMl ?? Infinity);
              return (
                <View key={day.date} style={[styles.row, index > 0 && styles.rowBorder]}>
                  <Droplets size={18} color={reached ? colors.success : colors.water} />
                  <Text style={[styles.itemTitle, styles.flex]}>{formatCalendarDay(day.date)}</Text>
                  <Text style={[styles.delta, { color: reached ? colors.success : colors.textSecondary }]}>{formatMl(day.totalMl)}</Text>
                </View>
              );
            })}
          </Card>
        )
      ) : null}

      {tab === 'evaluations' ? (
        data.evaluations.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma avaliação liberada" description="Seu nutricionista libera as avaliações após cada consulta." />
        ) : (
          <Card>
            {data.evaluations.map((entry, index) => (
              <Pressable
                key={entry.id}
                onPress={() => navigation.navigate('Assessment', { evaluationId: entry.id })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, index > 0 && styles.rowBorder, pressed && styles.pressed]}
              >
                <View style={styles.flex}>
                  <Text style={styles.itemTitle}>Avaliação de {formatDay(entry.evaluatedAt)}</Text>
                  <Text style={styles.itemDetail}>
                    {[entry.weightKg != null ? formatKg(entry.weightKg) : null, entry.bodyFatPercent != null ? `${entry.bodyFatPercent}% de gordura` : null]
                      .filter(Boolean)
                      .join(' · ') || 'Ver detalhes'}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </Card>
        )
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.7 },
    tabs: { flexDirection: 'row', gap: 6, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: radius.sm + 2 },
    tabActive: { backgroundColor: colors.primary },
    tabText: { ...typography.tiny, fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    tabTextActive: { color: colors.textInverse },
    itemTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    itemDetail: { ...typography.caption, color: colors.textSecondary },
    exercise: { gap: 2, paddingLeft: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primaryLight },
    exerciseName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    notes: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
    notesLabel: { ...typography.tiny, color: colors.primaryDark, textTransform: 'uppercase' },
    notesText: { ...typography.body, color: colors.textPrimary },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    delta: { ...typography.caption, fontWeight: '700' },
  });
