import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import type { MealView } from '../dietPresentation';
import { colors, spacing, typography } from '../../theme/tokens';
import { MealSection } from './MealSection';

export function MealCard({ meal }: { meal: MealView }) {
  const { calories } = meal;
  return (
    <Card>
      <View style={styles.header}>
        <Text style={styles.icon}>{meal.icon}</Text>
        <Text style={styles.name} accessibilityRole="header">
          {meal.name}
        </Text>
        {meal.time ? <Text style={styles.time}>{meal.time}</Text> : null}
      </View>
      {meal.notes ? <Text style={styles.notes}>{meal.notes}</Text> : null}
      <View style={styles.sections}>
        {meal.sections.map((section, i) => (
          <MealSection key={i} section={section} />
        ))}
      </View>
      {calories.text ? (
        <View style={styles.footer}>
          <Text style={styles.kcal}>
            {calories.text}
            {calories.status === 'partial' ? <Text style={styles.partial}> · cálculo parcial</Text> : null}
          </Text>
          {calories.macros ? <Text style={styles.macros}>{calories.macros}</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { fontSize: 22 },
  name: { ...typography.subtitle, color: colors.textPrimary, flex: 1 },
  time: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  sections: { gap: spacing.md, marginTop: spacing.xs },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  kcal: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  partial: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },
  macros: { ...typography.caption, color: colors.textSecondary },
});
