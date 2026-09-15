import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { WorkoutClientSummary } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/tokens';

export function WorkoutScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [workout, setWorkout] = useState<WorkoutClientSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setWorkout(await api.getCurrentWorkout());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && !workout) {
    return (
      <ScreenContainer onRefresh={load} refreshing={loading}>
        <Text style={styles.empty}>Seu profissional ainda não publicou um treino para você.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      {workout?.days
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((day) => (
          <Card key={day.workoutDayId}>
            <Text style={styles.dayName}>{day.name}</Text>
            {day.exercises
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((exercise) => (
                <View key={exercise.workoutExerciseId} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
                  {exercise.muscleGroup ? (
                    <Text style={styles.exerciseMeta}>{exercise.muscleGroup}</Text>
                  ) : null}
                  <Text style={styles.exerciseMeta}>{exercise.sets.length} série(s) prescrita(s)</Text>
                </View>
              ))}
            <Button
              title="Iniciar execução"
              onPress={() => navigation.navigate('WorkoutExecution', { workout, day })}
            />
          </Card>
        ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  dayName: { ...typography.subtitle, color: colors.textPrimary },
  exerciseRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  exerciseName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  exerciseMeta: { ...typography.caption, color: colors.textSecondary },
});
