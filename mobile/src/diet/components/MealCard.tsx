import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import { Collapsible } from '../../components/Collapsible';
import type { MealView } from '../dietPresentation';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, type ThemeColors } from '../../theme/theme';

import { MealSection } from './MealSection';

/** Refeição em card que expande/recolhe: cabeçalho com horário; alimentos no corpo. */
export function MealCard({ meal, initiallyOpen = false }: { meal: MealView; initiallyOpen?: boolean }) {
  const styles = useStyles(makeStyles);
  const summary = meal.time;
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
});
