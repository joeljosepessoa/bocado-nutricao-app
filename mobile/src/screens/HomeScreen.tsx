import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { DietClientSummary, WorkoutClientSummary } from '../types/api';
import type { MainTabParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/tokens';

export function HomeScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [diet, setDiet] = useState<DietClientSummary | null>(null);
  const [workout, setWorkout] = useState<WorkoutClientSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dietResult, workoutResult] = await Promise.all([api.getCurrentDiet(), api.getCurrentWorkout()]);
      setDiet(dietResult);
      setWorkout(workoutResult);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const mealCount = diet?.meals.length ?? 0;
  const dayCount = workout?.days.length ?? 0;

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      <Text style={styles.greeting}>Olá, {user?.fullName?.split(' ')[0] ?? ''}!</Text>

      <Card>
        <Text style={styles.cardTitle}>Minha dieta</Text>
        <Text style={styles.cardBody}>
          {diet ? `${mealCount} refeição(ões) prescrita(s).` : 'Nenhuma dieta publicada ainda.'}
        </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Diet')}>
          Ver dieta completa →
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Meu treino</Text>
        <Text style={styles.cardBody}>
          {workout ? `${dayCount} dia(s) de treino prescrito(s).` : 'Nenhum treino publicado ainda.'}
        </Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Workout')}>
          Ver treino completo →
        </Text>
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Evolução</Text>
        <Text style={styles.cardBody}>Acompanhe os indicadores liberados pelo seu profissional.</Text>
        <Text style={styles.link} onPress={() => navigation.navigate('Evolution')}>
          Ver evolução →
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  greeting: { ...typography.title, color: colors.primaryDark },
  cardTitle: { ...typography.subtitle, color: colors.textPrimary },
  cardBody: { ...typography.body, color: colors.textSecondary },
  link: { ...typography.body, color: colors.primary, fontWeight: '600', marginTop: spacing.xs },
});
