import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Droplets, Dumbbell, Flame, Moon, Plus, Scale, Target, TrendingUp, UtensilsCrossed, WifiOff } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { ActionRow, ErrorState, FadeIn, GradientCard, LoadingState, ProgressBar } from '../components/ui';
import { WeightChart } from '../components/WeightChart';
import { Button } from '../components/Button';
import * as api from '../api/endpoints';
import type { ClientSelf, DietClientSummary, WaterDay, WeightList, WorkoutClientSummary } from '../types/api';
import type { AppNavigation } from '../navigation/types';
import { buildDietPresentation } from '../diet/dietPresentation';
import { dietDays } from '../diet/dietView';
import {
  DIET_DAY_STORAGE_KEY,
  dailyGoals,
  dietDayIndex,
  formatKg,
  formatMl,
  greeting,
  hasTrainingAndRest,
  latestWeight,
  localDateKey,
  nextMeal,
  nextWorkoutDay,
  waterProgress,
  weightChartPoints,
  weightGoalText,
  type DietDayChoice,
} from '../dashboard/dashboardModel';
import { radius, spacing, typography } from '../theme/tokens';
import { shadow, useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface DashboardData {
  me: ClientSelf | null;
  diet: DietClientSummary | null;
  workout: WorkoutClientSummary | null;
  weights: WeightList | null;
  water: WaterDay | null;
  lastWorkoutDayId: string | null;
}

const QUICK_WATER_ML = 250;

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export function HomeScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { user } = useAuth();
  const navigation = useNavigation<AppNavigation>();
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dayChoice, setDayChoice] = useState<DietDayChoice>('training');
  const [addingWater, setAddingWater] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DIET_DAY_STORAGE_KEY)
      .then((saved) => {
        if (saved === 'training' || saved === 'rest') setDayChoice(saved);
      })
      .catch(() => undefined);
  }, []);

  const chooseDay = (choice: DietDayChoice) => {
    setDayChoice(choice);
    AsyncStorage.setItem(DIET_DAY_STORAGE_KEY, choice).catch(() => undefined);
  };

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      api.getMe(),
      api.getCurrentDiet(),
      api.getCurrentWorkout(),
      api.getWeights(),
      api.getWaterDay(localDateKey(new Date())),
      api.listWorkoutExecutions(1, 1),
    ]);
    if (results.every((r) => r.status === 'rejected')) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setData({
      me: settled(results[0]),
      diet: settled(results[1]),
      workout: settled(results[2]),
      weights: settled(results[3]),
      water: settled(results[4]),
      lastWorkoutDayId: settled(results[5])?.items[0]?.workoutDayId ?? null,
    });
  }, []);

  // Recarrega ao voltar para o Dashboard (ex.: depois de registrar peso ou água).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const addWater = async () => {
    setAddingWater(true);
    try {
      const water = await api.addWater(QUICK_WATER_ML, localDateKey(new Date()));
      setData((current) => (current ? { ...current, water } : current));
    } catch {
      // Sem rede: o cartão continua com o total anterior.
    } finally {
      setAddingWater(false);
    }
  };

  const view = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const days = data.diet ? dietDays(data.diet) : [];
    const presentation = data.diet ? buildDietPresentation(data.diet) : null;
    const index = dietDayIndex(days, dayChoice);
    const day = presentation && index >= 0 ? presentation.days[index] : null;
    const items = data.weights?.items ?? [];
    return {
      firstName: (data.me?.user.fullName ?? user?.fullName ?? '').split(' ')[0],
      showDaySelector: hasTrainingAndRest(days),
      goals: dailyGoals(day),
      meal: day ? nextMeal(day.meals, now) : null,
      current: latestWeight(items),
      goalText: weightGoalText(data.weights?.targetWeightKg ?? data.me?.targetWeightKg),
      points: weightChartPoints(items, now),
      water: waterProgress(data.water),
      nextWorkout: nextWorkoutDay(data.workout, data.lastWorkoutDayId),
      dateText: now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }),
      hello: greeting(now),
    };
  }, [data, dayChoice, user?.fullName]);

  if (!data && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar seu painel." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!data || !view) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const goWeight = () => navigation.navigate('Weight');
  const water = data.water;

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <FadeIn>
        <Text style={styles.hello}>
          {view.hello}
          {view.firstName ? `, ${view.firstName}` : ''}!
        </Text>
        <Text style={styles.date}>{view.dateText}</Text>
      </FadeIn>

      <FadeIn delay={60} style={styles.grid}>
        <StatCard
          icon={Scale}
          tint={colors.primary}
          label="Peso Atual"
          value={view.current ? formatKg(view.current.weightKg) : 'Registrar'}
          highlight={!view.current}
          onPress={goWeight}
        />
        <StatCard icon={Target} tint={colors.success} label="Meta" value={view.goalText} />
        <StatCard
          icon={Flame}
          tint={colors.danger}
          label="Calorias do dia"
          value={view.goals?.kcalText ?? '--'}
          detail={view.goals ? `${view.goals.mealCount} ${view.goals.mealCount === 1 ? 'refeição' : 'refeições'}` : 'Sem dieta ativa'}
          onPress={() => navigation.navigate('Diet')}
        />
        <StatCard
          icon={Droplets}
          tint={colors.water}
          label="Água"
          value={water ? formatMl(water.totalMl) : '--'}
          detail={water ? `de ${formatMl(water.goalMl)}` : null}
          onPress={() => navigation.navigate('Water')}
        />
      </FadeIn>

      {view.showDaySelector ? (
        <FadeIn delay={100}>
          <Text style={styles.sectionLabel}>Hoje é dia de</Text>
          <View style={styles.segment} accessibilityRole="radiogroup">
            <Segment icon={Dumbbell} label="Treino" active={dayChoice === 'training'} onPress={() => chooseDay('training')} />
            <Segment icon={Moon} label="Descanso" active={dayChoice === 'rest'} onPress={() => chooseDay('rest')} />
          </View>
        </FadeIn>
      ) : null}

      {water && view.water ? (
        <FadeIn delay={140}>
          <GradientCard colors={['#06B6D4', '#2563EB']}>
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <Text style={styles.waterLabel}>Hidratação de hoje</Text>
                <Text style={styles.waterValue}>
                  {formatMl(water.totalMl)} <Text style={styles.waterGoal}>/ {formatMl(water.goalMl)}</Text>
                </Text>
              </View>
              <Droplets size={36} color="rgba(255,255,255,0.85)" />
            </View>
            <ProgressBar value={view.water.percent * 100} colors={['#FFFFFF', '#E0F2FE']} />
            <View style={styles.rowBetween}>
              <Text style={styles.waterLabel}>
                {view.water.remainingMl > 0 ? `Faltam ${formatMl(view.water.remainingMl)}` : 'Meta de hoje alcançada!'}
              </Text>
              <Pressable
                onPress={addWater}
                disabled={addingWater}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${QUICK_WATER_ML} ml de água`}
                style={({ pressed }) => [styles.waterButton, (pressed || addingWater) && styles.pressed]}
              >
                <Plus size={16} color="#0E7490" />
                <Text style={styles.waterButtonText}>{QUICK_WATER_ML} ml</Text>
              </Pressable>
            </View>
          </GradientCard>
        </FadeIn>
      ) : null}

      <FadeIn delay={180}>
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Evolução do peso</Text>
            <Text style={styles.cardHint}>Últimos 30 dias</Text>
          </View>
          {view.points.length >= 2 ? (
            <WeightChart points={view.points} />
          ) : (
            <View style={styles.chartEmpty}>
              <TrendingUp size={40} color={colors.textMuted} strokeWidth={1.5} />
              <Text style={styles.chartEmptyText}>Registre seu peso para acompanhar a evolução</Text>
              <Button title="Registrar peso" onPress={goWeight} compact icon={<Scale size={18} color={colors.textInverse} />} />
            </View>
          )}
        </Card>
      </FadeIn>

      <FadeIn delay={220}>
        <Card>
          <Text style={styles.cardTitle}>Próximas ações</Text>
          <View style={styles.actions}>
            {view.nextWorkout ? (
              <ActionRow
                icon={Dumbbell}
                tint={colors.primary}
                background={colors.primarySoft}
                title={`Próximo treino: ${view.nextWorkout.name}`}
                detail={`${view.nextWorkout.exercises.length} exercício(s)`}
                onPress={() => navigation.navigate('Workout')}
                right={<ChevronRight size={18} color={colors.textMuted} />}
              />
            ) : null}
            {view.meal ? (
              <ActionRow
                icon={UtensilsCrossed}
                tint={colors.success}
                background={colors.successSoft}
                title={`Próxima refeição: ${view.meal.name}`}
                detail={view.meal.time}
                onPress={() => navigation.navigate('Diet')}
                right={<ChevronRight size={18} color={colors.textMuted} />}
              />
            ) : null}
            {view.water && view.water.remainingMl > 0 ? (
              <ActionRow
                icon={Droplets}
                tint={colors.water}
                background={colors.waterSoft}
                title="Beber água"
                detail={`Faltam ${formatMl(view.water.remainingMl)} para a meta de hoje`}
                onPress={() => navigation.navigate('Water')}
                right={<ChevronRight size={18} color={colors.textMuted} />}
              />
            ) : null}
            {!view.nextWorkout && !view.meal && !(view.water && view.water.remainingMl > 0) ? (
              <Text style={styles.cardHint}>Nada pendente por agora.</Text>
            ) : null}
          </View>
        </Card>
      </FadeIn>
    </ScreenContainer>
  );
}

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
  detail,
  highlight = false,
  onPress,
}: {
  icon: typeof Scale;
  tint: string;
  label: string;
  value: string;
  detail?: string | null;
  highlight?: boolean;
  onPress?: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { colors, isDark } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.stat, isDark ? styles.statBorder : shadow('md'), pressed && styles.pressed]}
    >
      <View style={styles.statHeader}>
        <Icon size={18} color={tint} />
        <Text style={styles.statLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[styles.statValue, highlight && { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {detail ? <Text style={styles.statDetail}>{detail}</Text> : null}
    </Pressable>
  );
}

function Segment({ icon: Icon, label, active, onPress }: { icon: typeof Scale; label: string; active: boolean; onPress: () => void }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={[styles.segmentItem, active && styles.segmentActive]}
    >
      <Icon size={16} color={active ? colors.textInverse : colors.textSecondary} />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.75 },
    hello: { ...typography.title, color: colors.textPrimary },
    date: { ...typography.body, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
    stat: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: 4,
    },
    statBorder: { borderWidth: 1, borderColor: colors.border },
    statHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
    statValue: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
    statDetail: { ...typography.tiny, color: colors.textMuted },
    sectionLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '600', marginBottom: spacing.xs },
    segment: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4, gap: 4 },
    segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.sm + 2 },
    segmentActive: { backgroundColor: colors.primary },
    segmentText: { ...typography.body, fontWeight: '600', color: colors.textSecondary },
    segmentTextActive: { color: colors.textInverse },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    waterLabel: { ...typography.caption, color: 'rgba(255,255,255,0.9)' },
    waterValue: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
    waterGoal: { fontSize: 15, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },
    waterButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
    waterButtonText: { ...typography.caption, fontWeight: '700', color: '#0E7490' },
    cardTitle: { ...typography.subtitle, color: colors.textPrimary },
    cardHint: { ...typography.caption, color: colors.textMuted },
    chartEmpty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
    chartEmptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
    actions: { gap: spacing.sm },
  });
