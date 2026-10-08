import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Collapsible } from '../../components/Collapsible';
import type { MealView } from '../dietPresentation';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, type ThemeColors } from '../../theme/theme';

import { MealSection } from './MealSection';

/** Refeição em card que expande/recolhe: cabeçalho com horário e calorias; alimentos no corpo. */
export function MealCard({ meal, initiallyOpen = false }: { meal: MealView; initiallyOpen?: boolean }) {
  const styles = useStyles(makeStyles);
  const { calories } = meal;
  const summary = [meal.time, calories.text].filter(Boolean).join(' · ');
  return (
    <Card>
      <Collapsible
        initiallyOpen={initiallyOpen}
        accessibilityLabel={[meal.name, summary].filter(Boolean).join(', ')}
        header={
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Text style={styles.icon}>{meal.icon}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.name} accessibilityRole="header">
                {meal.name}
              </Text>
              {summary ? <Text style={styles.summary}>{summary}</Text> : null}
            </View>
          </View>
        }
      >
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
      </Collapsible>
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  iconBox: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 22 },
  name: { ...typography.subtitle, color: colors.textPrimary },
  summary: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  sections: { gap: spacing.md },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, gap: 2 },
  kcal: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  partial: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },
  macros: { ...typography.caption, color: colors.textSecondary },
});
