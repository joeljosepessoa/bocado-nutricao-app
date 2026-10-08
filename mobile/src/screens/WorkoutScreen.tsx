import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Dumbbell, Play, WifiOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Collapsible } from '../components/Collapsible';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, IconBox, LoadingState, PageTitle } from '../components/ui';
import * as api from '../api/endpoints';
import type { WorkoutClientSummary } from '../types/api';
import type { AppNavigation } from '../navigation/types';
import { nextWorkoutDay } from '../dashboard/dashboardModel';
import { exerciseSummary, prescriptionText } from '../workout/executionModel';
import { spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface LoadedWorkout {
  workout: WorkoutClientSummary | null;
  lastDayId: string | null;
}

/** Meus Treinos: os dias do treino publicado, com exercícios e séries; "Iniciar treino" abre a execução. */
export function WorkoutScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const navigation = useNavigation<AppNavigation>();
  const [data, setData] = useState<LoadedWorkout | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // No máximo um GIF aberto por vez: limita memória/dados (cada GIF é 1920x1080).
  const [openDemoId, setOpenDemoId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [workout, executions] = await Promise.all([api.getCurrentWorkout(), api.listWorkoutExecutions(1, 1).catch(() => null)]);
      setData({ workout, lastDayId: executions?.items[0]?.workoutDayId ?? null });
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

  if (!data && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar seu treino." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
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

  const { workout } = data;
  if (!workout || workout.days.length === 0) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <PageTitle title="Meus Treinos" />
        <EmptyState icon={Dumbbell} title="Nenhum treino publicado" description="Seu profissional ainda não publicou um treino para você." />
      </ScreenContainer>
    );
  }

  const days = [...workout.days].sort((a, b) => a.order - b.order);
  const next = nextWorkoutDay(workout, data.lastDayId);

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Meus Treinos" subtitle={`${days.length} ${days.length === 1 ? 'treino' : 'treinos'} no seu plano`} />

      {days.map((day, index) => {
        const exercises = [...day.exercises].sort((a, b) => a.order - b.order);
        const isNext = next?.workoutDayId === day.workoutDayId;
        return (
          <FadeIn key={day.workoutDayId} delay={Math.min(index, 6) * 60}>
            <Card style={isNext ? styles.nextCard : undefined}>
              <Collapsible
                initiallyOpen={isNext}
                accessibilityLabel={`${day.name}, ${exercises.length} exercícios`}
                header={
                  <View style={styles.dayHeader}>
                    <IconBox icon={Dumbbell} color={colors.textInverse} background={isNext ? colors.primary : colors.textMuted} size={44} />
                    <View style={styles.flex}>
                      <Text style={styles.dayName}>{day.name}</Text>
                      <Text style={styles.dayMeta}>
                        {exercises.length} {exercises.length === 1 ? 'exercício' : 'exercícios'}
                        {isNext ? ' · Próximo treino' : ''}
                      </Text>
                    </View>
                  </View>
                }
              >
                {exercises.map((exercise, i) => (
                  <View key={exercise.workoutExerciseId} style={[styles.exercise, i > 0 && styles.exerciseBorder]}>
                    <View style={styles.exerciseTop}>
                      <Text style={styles.exerciseIndex}>{i + 1}</Text>
                      <View style={styles.flex}>
                        <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                        <Text style={styles.dayMeta}>
                          {[exercise.muscleGroup, exerciseSummary(exercise.sets)].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </View>
                    {[...exercise.sets]
                      .sort((a, b) => a.order - b.order)
                      .map((set, s) => (
                        <Text key={set.order} style={styles.setLine}>
                          Série {s + 1}: {prescriptionText(set)}
                        </Text>
                      ))}
                    <ExerciseDemo
                      imageUrl={exercise.imageUrl}
                      exerciseName={exercise.exerciseName}
                      expanded={openDemoId === exercise.workoutExerciseId}
                      onToggle={() => setOpenDemoId((current) => (current === exercise.workoutExerciseId ? null : exercise.workoutExerciseId))}
                    />
                  </View>
                ))}
                <Button
                  title="Iniciar treino"
                  onPress={() => navigation.navigate('WorkoutExecution', { workout, day })}
                  icon={<Play size={18} color={colors.textInverse} />}
                />
              </Collapsible>
            </Card>
          </FadeIn>
        );
      })}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    nextCard: { borderWidth: 2, borderColor: colors.primaryLight },
    dayHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
    dayName: { ...typography.subtitle, color: colors.textPrimary },
    dayMeta: { ...typography.caption, color: colors.textSecondary },
    exercise: { gap: 4, paddingTop: spacing.sm },
    exerciseBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    exerciseTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    exerciseIndex: {
      width: 26,
      height: 26,
      borderRadius: 13,
      overflow: 'hidden',
      textAlign: 'center',
      lineHeight: 26,
      backgroundColor: colors.primarySoft,
      color: colors.primaryDark,
      fontWeight: '800',
      fontSize: 13,
    },
    exerciseName: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    setLine: { ...typography.caption, color: colors.textSecondary, marginLeft: 34 },
  });
