import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ExerciseDemo } from '../components/ExerciseDemo';
import { ScreenContainer } from '../components/ScreenContainer';
import { useRestTimer } from '../hooks/useRestTimer';
import * as api from '../api/endpoints';
import { enqueueExecutionLogOffline } from '../offline/sync';
import type { RootStackParamList } from '../navigation/types';
import type { ExecutionSetInput } from '../types/api';
import { colors, radius, spacing, typography } from '../theme/tokens';

const DEFAULT_REST_SECONDS = 60;

interface LoggedSet {
  key: string;
  workoutExerciseId: string;
  exerciseName: string;
  setOrder: number;
  done: boolean;
  reps: string;
  load: string;
  restSeconds: number;
}

export function WorkoutExecutionScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'WorkoutExecution'>>();
  const { day } = route.params;
  const timer = useRestTimer(DEFAULT_REST_SECONDS);

  const [sets, setSets] = useState<LoggedSet[]>(() =>
    day.exercises.flatMap((exercise) =>
      exercise.sets.map((set) => ({
        key: `${exercise.workoutExerciseId}-${set.order}`,
        workoutExerciseId: exercise.workoutExerciseId,
        exerciseName: exercise.exerciseName,
        setOrder: set.order,
        done: false,
        reps: set.reps != null ? String(set.reps) : '',
        load: set.loadValue != null ? String(set.loadValue) : '',
        restSeconds: set.restSeconds ?? DEFAULT_REST_SECONDS,
      })),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  // No máximo um GIF aberto por vez (cada GIF é 1920x1080).
  const [openDemo, setOpenDemo] = useState<string | null>(null);

  function updateSet(key: string, patch: Partial<LoggedSet>) {
    setSets((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  function markDone(set: LoggedSet) {
    updateSet(set.key, { done: true });
    timer.reset(set.restSeconds);
    timer.start(set.restSeconds);
  }

  async function handleFinish() {
    const doneSets = sets.filter((s) => s.done);
    const payload = {
      workoutDayId: day.workoutDayId,
      sets: doneSets.map<ExecutionSetInput>((s) => ({
        workoutExerciseId: s.workoutExerciseId,
        setOrder: s.setOrder,
        repsPerformed: s.reps ? Number(s.reps) : undefined,
        loadValue: s.load ? Number(s.load) : undefined,
      })),
    };

    if (payload.sets.length === 0) {
      navigation.goBack();
      return;
    }

    setSubmitting(true);
    try {
      await api.logWorkoutExecution(payload);
      navigation.goBack();
    } catch {
      await enqueueExecutionLogOffline(payload);
      setSavedOffline(true);
      setTimeout(() => navigation.goBack(), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  const exerciseNames = Array.from(new Set(sets.map((s) => s.exerciseName)));

  return (
    <ScreenContainer>
      <Card style={styles.timerCard}>
        <Text style={styles.timerLabel}>Descanso</Text>
        <Text style={styles.timerValue}>{timer.label}</Text>
        <View style={styles.timerActions}>
          <Button title="-15s" variant="secondary" onPress={() => timer.adjust(-15)} />
          <Button title={timer.running ? 'Pausar' : 'Iniciar'} onPress={() => (timer.running ? timer.pause() : timer.start())} />
          <Button title="+15s" variant="secondary" onPress={() => timer.adjust(15)} />
        </View>
      </Card>

      {exerciseNames.map((name) => (
        <Card key={name}>
          <Text style={styles.exerciseName}>{name}</Text>
          <ExerciseDemo
            imageUrl={day.exercises.find((e) => e.exerciseName === name)?.imageUrl ?? null}
            exerciseName={name}
            expanded={openDemo === name}
            onToggle={() => setOpenDemo((current) => (current === name ? null : name))}
          />
          {sets
            .filter((s) => s.exerciseName === name)
            .map((set) => (
              <View key={set.key} style={styles.setRow}>
                <Text style={styles.setLabel}>Série {set.setOrder + 1}</Text>
                <TextInput
                  style={styles.setInput}
                  keyboardType="numeric"
                  value={set.reps}
                  placeholder="reps"
                  onChangeText={(v) => updateSet(set.key, { reps: v })}
                />
                <TextInput
                  style={styles.setInput}
                  keyboardType="numeric"
                  value={set.load}
                  placeholder="carga"
                  onChangeText={(v) => updateSet(set.key, { load: v })}
                />
                <Button
                  title={set.done ? 'Feita ✓' : 'Concluir'}
                  variant={set.done ? 'secondary' : 'primary'}
                  onPress={() => markDone(set)}
                />
              </View>
            ))}
        </Card>
      ))}

      {savedOffline ? (
        <Text style={styles.offlineNotice}>Sem conexão — execução salva no aparelho e será enviada depois.</Text>
      ) : null}

      <Button title="Finalizar execução" onPress={handleFinish} loading={submitting} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  timerCard: { alignItems: 'center' },
  timerLabel: { ...typography.caption, color: colors.textSecondary },
  timerValue: { fontSize: 40, fontWeight: '700', color: colors.primaryDark },
  timerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  exerciseName: { ...typography.subtitle, color: colors.textPrimary },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  setLabel: { ...typography.body, color: colors.textSecondary, width: 70 },
  setInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    width: 64,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  offlineNotice: { ...typography.caption, color: colors.accent, textAlign: 'center' },
});
