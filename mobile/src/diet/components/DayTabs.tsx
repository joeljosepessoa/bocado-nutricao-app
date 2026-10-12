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

/** Título e instrução de uso do dia. Calorias não aparecem para o paciente. */
export function DayIntro({ day, showTitle }: { day: DayView; showTitle: boolean }) {
  const styles = useStyles(makeStyles);
  if (!showTitle && !day.usageNotes) return null;
  return (
    <Card style={styles.intro}>
      {showTitle ? (
        <Text style={styles.title} accessibilityRole="header">
          {day.icon} {day.title}
        </Text>
      ) : null}
      {day.usageNotes ? <Text style={styles.usage}>{day.usageNotes}</Text> : null}
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
});
