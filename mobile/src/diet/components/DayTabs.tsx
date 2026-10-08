import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import type { DayView } from '../dietPresentation';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, type ThemeColors } from '../../theme/theme';

/** [ 🏋️ DIA DE TREINO ] [ 🛏️ DIA DE DESCANSO ] — mostra só as refeições do dia escolhido. */
export function DayTabs({ days, selected, onSelect }: { days: DayView[]; selected: number; onSelect: (index: number) => void }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.tabs} accessibilityRole="tablist">
      {days.map((day, i) => {
        const active = i === selected;
        return (
          <Pressable
            key={day.key}
            onPress={() => onSelect(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && styles.tabActive]}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={2}>
              {day.icon} {day.title.toLocaleUpperCase('pt-BR')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Instrução de uso e total do dia — o aviso de cálculo aparece aqui, uma única vez. */
export function DayIntro({ day, showTitle }: { day: DayView; showTitle: boolean }) {
  const styles = useStyles(makeStyles);
  const { calories } = day;
  if (!showTitle && !day.usageNotes && !calories.text && !day.calorieNote) return null;
  return (
    <Card style={styles.intro}>
      {showTitle ? (
        <Text style={styles.title} accessibilityRole="header">
          {day.icon} {day.title}
        </Text>
      ) : null}
      {day.usageNotes ? <Text style={styles.usage}>{day.usageNotes}</Text> : null}
      {calories.text ? (
        <View>
          <Text style={styles.kcal}>
            {calories.status === 'calculated' ? 'Total do dia: ' : ''}
            {calories.text}
          </Text>
          {calories.macros ? <Text style={styles.macros}>{calories.macros}</Text> : null}
        </View>
      ) : null}
      {day.calorieNote ? <Text style={styles.note}>{day.calorieNote}</Text> : null}
    </Card>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: colors.textInverse },
  intro: { gap: spacing.xs },
  title: { ...typography.subtitle, color: colors.textPrimary },
  usage: { ...typography.body, color: colors.textSecondary },
  kcal: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  macros: { ...typography.caption, color: colors.textSecondary },
  note: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
});
