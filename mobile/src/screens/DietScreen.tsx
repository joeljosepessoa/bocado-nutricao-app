import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { DietClientDay, DietClientFoodItem, DietClientGroup, DietClientMealNode, DietClientSummary, NutritionRange } from '../types/api';
import {
  choiceTitle,
  dayTitle,
  dietDays,
  foodStatus,
  formatKcal,
  formatMacros,
  GROUP_TEXT,
  groupTitle,
  isRange,
  quantityText,
  showDayTabs,
  supplementQuantityText,
} from '../diet/dietView';
import { colors, radius, spacing, typography } from '../theme/tokens';

function PartialNote() {
  return <Text style={styles.partial}>Total parcial — itens à vontade ou sem cálculo ficam fora da soma.</Text>;
}

function Nutrition({ range, label }: { range: NutritionRange | null; label?: string }) {
  if (!range) return null;
  return (
    <View style={styles.nutrition}>
      <Text style={styles.kcal}>
        {label ? `${label} ` : ''}
        {formatKcal(range)}
      </Text>
      <Text style={styles.macros}>{formatMacros(range)}</Text>
    </View>
  );
}

function FoodRow({ food }: { food: DietClientFoodItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasSubstitutions = food.substitutions.length > 0;
  const quantity = quantityText(food);
  const status = foodStatus(food);

  return (
    <View style={styles.foodRow}>
      <View style={styles.foodHeader}>
        <Text style={styles.foodName}>{food.foodName}</Text>
        {quantity ? <Text style={styles.foodQuantity}>{quantity}</Text> : null}
      </View>
      {status ? (
        <Text style={styles.noCalc}>{status}</Text>
      ) : (
        <Text style={styles.foodMacros}>
          {food.quantityMax != null ? 'a partir de ' : ''}
          {Math.round(food.kcal!)} kcal · P {food.proteinG ?? '-'}g · C {food.carbG ?? '-'}g · G {food.fatG ?? '-'}g
        </Text>
      )}

      {hasSubstitutions ? (
        <>
          <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button">
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

function GroupBlock({ group, compact }: { group: DietClientGroup; compact: boolean }) {
  const instruction = GROUP_TEXT[group.kind].instruction;

  if (group.kind === 'fixed') {
    const foods = group.choices[0]?.foods ?? [];
    return (
      <View style={compact ? undefined : styles.group}>
        {!compact ? (
          <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{groupTitle(group)}</Text>
            <Text style={[styles.badge, styles.badgeFixed]}>{instruction}</Text>
          </View>
        ) : null}
        {foods.map((food, i) => (
          <FoodRow key={i} food={food} />
        ))}
        {!compact && group.nutrition ? <Text style={styles.groupTotal}>Total: {formatKcal(group.nutrition)}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{groupTitle(group)}</Text>
        <Text style={[styles.badge, group.kind === 'meal_options' ? styles.badgeOptions : styles.badgeAlternatives]}>{instruction}</Text>
      </View>
      {group.choices.map((choice, i) =>
        group.kind === 'meal_options' ? (
          <View key={i} style={styles.optionCard}>
            <Text style={styles.optionTitle}>{choiceTitle(choice.label, i).toUpperCase()}</Text>
            {choice.foods.map((food, j) => (
              <FoodRow key={j} food={food} />
            ))}
            {choice.nutrition ? <Text style={styles.optionKcal}>{formatKcal(choice.nutrition)}</Text> : null}
          </View>
        ) : (
          <View key={i} style={styles.alternative}>
            <View style={styles.radio} />
            <View style={{ flex: 1 }}>
              {choice.foods.length > 1 || choice.label ? <Text style={styles.alternativeTitle}>{choiceTitle(choice.label, i)}</Text> : null}
              {choice.foods.map((food, j) => (
                <FoodRow key={j} food={food} />
              ))}
              {choice.foods.length > 1 && choice.nutrition ? <Text style={styles.optionKcal}>{formatKcal(choice.nutrition)}</Text> : null}
            </View>
          </View>
        ),
      )}
      {group.nutrition ? (
        <Text style={styles.groupTotal}>
          Faixa: {formatKcal(group.nutrition)}
          {group.nutrition.partial ? ' (parcial)' : ''}
        </Text>
      ) : null}
    </View>
  );
}

function MealCard({ meal }: { meal: DietClientMealNode }) {
  const compact = meal.groups.length === 1 && meal.groups[0].kind === 'fixed';
  return (
    <Card>
      <View style={styles.mealHeader}>
        <Text style={styles.mealName}>{meal.name}</Text>
        {meal.time ? <Text style={styles.mealTime}>{meal.time}</Text> : null}
      </View>
      {meal.notes ? <Text style={styles.mealNotes}>{meal.notes}</Text> : null}
      {meal.groups.map((group, i) => (
        <GroupBlock key={i} group={group} compact={compact} />
      ))}
      <Nutrition range={meal.nutrition} label={meal.nutrition && isRange(meal.nutrition) ? 'Refeição:' : 'Total:'} />
      {meal.nutrition?.partial ? <PartialNote /> : null}
    </Card>
  );
}

function DayTabs({ days, selected, onSelect }: { days: DietClientDay[]; selected: number; onSelect: (i: number) => void }) {
  return (
    <View style={styles.dayTabs} accessibilityRole="tablist">
      {days.map((day, i) => (
        <Pressable
          key={i}
          onPress={() => onSelect(i)}
          accessibilityRole="tab"
          accessibilityState={{ selected: i === selected }}
          style={[styles.dayTab, i === selected && styles.dayTabActive]}
        >
          <Text style={[styles.dayTabText, i === selected && styles.dayTabTextActive]}>{dayTitle(day, i)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DietScreen() {
  const [diet, setDiet] = useState<DietClientSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(0);

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

  const days = diet ? dietDays(diet) : [];
  const tabs = showDayTabs(days);
  const dayIndex = Math.min(selectedDay, Math.max(days.length - 1, 0));
  const day = days[dayIndex];
  const supplements = [...(diet?.supplements ?? [])].sort((a, b) => a.order - b.order);

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      {tabs ? <DayTabs days={days} selected={dayIndex} onSelect={setSelectedDay} /> : null}

      {day && (tabs || day.usageNotes || day.nutrition) ? (
        <Card>
          {tabs ? <Text style={styles.dayTitle}>{dayTitle(day, dayIndex)}</Text> : null}
          {day.usageNotes ? <Text style={styles.mealNotes}>{day.usageNotes}</Text> : null}
          <Nutrition range={day.nutrition} label={day.nutrition && isRange(day.nutrition) ? 'Faixa do dia:' : 'Total do dia:'} />
          {day.nutrition?.partial ? <PartialNote /> : null}
        </Card>
      ) : null}

      {day?.meals.map((meal, i) => (
        <MealCard key={`${dayIndex}-${i}`} meal={meal} />
      ))}

      {supplements.length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>Suplementação</Text>
          {supplements.map((s, i) => (
            <View key={i} style={styles.supplement}>
              <Text style={styles.foodName}>{s.name}</Text>
              {supplementQuantityText(s) ? <Text style={styles.foodQuantity}>{supplementQuantityText(s)}</Text> : null}
              {s.timing ? <Text style={styles.mealNotes}>{s.timing}</Text> : null}
              {s.notes ? <Text style={styles.mealNotes}>{s.notes}</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}

      {diet?.patientGuidelines?.trim() ? (
        <Card>
          <Text style={styles.sectionTitle}>Orientações</Text>
          <Text style={styles.guidelines}>{diet.patientGuidelines}</Text>
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  dayTabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  dayTab: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: 'transparent' },
  dayTabActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  dayTabText: { ...typography.body, color: colors.textSecondary, fontWeight: '600' },
  dayTabTextActive: { color: colors.primaryDark },
  dayTitle: { ...typography.subtitle, color: colors.textPrimary },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mealName: { ...typography.subtitle, color: colors.textPrimary },
  mealTime: { ...typography.caption, color: colors.textSecondary },
  mealNotes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  nutrition: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm, gap: 2 },
  kcal: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  macros: { ...typography.caption, color: colors.textSecondary },
  partial: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  group: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  groupTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', textTransform: 'uppercase' },
  badge: { ...typography.caption, fontWeight: '700', paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  badgeFixed: { backgroundColor: colors.primaryLight, color: colors.success },
  badgeOptions: { backgroundColor: colors.primaryLight, color: colors.primaryDark },
  badgeAlternatives: { backgroundColor: colors.background, color: colors.textPrimary, borderWidth: 1, borderColor: colors.accent },
  groupTotal: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.xs },
  optionCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  optionTitle: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.5 },
  optionKcal: { ...typography.caption, color: colors.textPrimary, fontWeight: '700', marginTop: spacing.xs },
  alternative: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', paddingTop: spacing.xs },
  alternativeTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.accent, marginTop: spacing.sm + 2 },
  foodRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    gap: 2,
    flex: 1,
  },
  foodHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  foodName: { ...typography.body, color: colors.textPrimary, fontWeight: '600', flexShrink: 1 },
  foodQuantity: { ...typography.body, color: colors.textSecondary },
  foodMacros: { ...typography.caption, color: colors.textSecondary },
  noCalc: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
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
  supplement: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm, gap: 2 },
  guidelines: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
});
