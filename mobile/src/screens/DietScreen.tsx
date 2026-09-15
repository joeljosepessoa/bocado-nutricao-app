import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { DietClientMealFood, DietClientSummary } from '../types/api';
import { colors, radius, spacing, typography } from '../theme/tokens';

function FoodRow({ food }: { food: DietClientMealFood }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubstitutions = food.substitutions.length > 0;

  return (
    <View style={styles.foodRow}>
      <View style={styles.foodHeader}>
        <Text style={styles.foodName}>{food.foodName}</Text>
        <Text style={styles.foodQuantity}>
          {food.quantity} {food.unit}
        </Text>
      </View>
      {food.kcal != null ? (
        <Text style={styles.foodMacros}>
          {food.kcal} kcal · P {food.proteinG ?? '-'}g · C {food.carbG ?? '-'}g · G {food.fatG ?? '-'}g
        </Text>
      ) : null}

      {hasSubstitutions ? (
        <>
          <Pressable onPress={() => setExpanded((v) => !v)}>
            <Text style={styles.substitutionToggle}>
              {expanded ? 'Ocultar substituições' : `Ver substituições (${food.substitutions.length})`}
            </Text>
          </Pressable>
          {expanded
            ? food.substitutions.map((sub) => (
                <Text key={sub.substituteFoodId} style={styles.substitutionItem}>
                  • {sub.substituteFoodName} — {sub.substituteQuantity} {sub.substituteUnit}
                  {sub.substituteKcal != null ? ` (${sub.substituteKcal} kcal)` : ''}
                </Text>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

export function DietScreen() {
  const [diet, setDiet] = useState<DietClientSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDiet(await api.getCurrentDiet());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!loading && !diet) {
    return (
      <ScreenContainer onRefresh={load} refreshing={loading}>
        <Text style={styles.empty}>Seu profissional ainda não publicou uma dieta para você.</Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      {diet?.meals
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((meal) => (
          <Card key={meal.name + meal.order}>
            <View style={styles.mealHeader}>
              <Text style={styles.mealName}>{meal.name}</Text>
              {meal.time ? <Text style={styles.mealTime}>{meal.time}</Text> : null}
            </View>
            {meal.notes ? <Text style={styles.mealNotes}>{meal.notes}</Text> : null}
            {meal.foods.map((food, index) => (
              <FoodRow key={`${meal.name}-${index}`} food={food} />
            ))}
          </Card>
        ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealName: { ...typography.subtitle, color: colors.textPrimary },
  mealTime: { ...typography.caption, color: colors.textSecondary },
  mealNotes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  foodRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: 2,
  },
  foodHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  foodName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  foodQuantity: { ...typography.body, color: colors.textSecondary },
  foodMacros: { ...typography.caption, color: colors.textSecondary },
  substitutionToggle: { ...typography.caption, color: colors.primary, marginTop: spacing.xs, fontWeight: '600' },
  substitutionItem: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginTop: 2,
  },
});
