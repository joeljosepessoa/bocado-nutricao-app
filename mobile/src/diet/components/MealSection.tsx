import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ChoiceView, SectionView } from '../dietPresentation';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, type ThemeColors } from '../../theme/theme';

import { FoodLine } from './FoodLine';

/** Alternativa de um bloco: "○ 65 g de arroz" (uma ou mais linhas ligadas por "+"). */
function Alternative({ choice }: { choice: ChoiceView }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.alternative}>
      <View style={styles.radio} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.alternativeBody}>
        {choice.title ? <Text style={styles.choiceTitle}>{choice.title}</Text> : null}
        {choice.foods.map((food, i) => (
          <View key={i} style={styles.inline}>
            {i > 0 ? <Text style={styles.plus}>+</Text> : null}
            <FoodLine food={food} />
          </View>
        ))}
        {choice.calories.status === 'calculated' && choice.foods.length > 1 ? <Text style={styles.kcal}>{choice.calories.text}</Text> : null}
      </View>
    </View>
  );
}

/** Opção completa: cartão "Opção 1" com os alimentos daquela opção. */
function Option({ choice }: { choice: ChoiceView }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.option}>
      <View style={styles.optionHeader}>
        <View style={styles.radio} accessibilityElementsHidden importantForAccessibility="no" />
        <Text style={styles.optionTitle}>{choice.title}</Text>
        {choice.calories.status === 'calculated' ? <Text style={styles.kcal}>{choice.calories.text}</Text> : null}
      </View>
      <View style={styles.optionFoods}>
        {choice.foods.map((food, i) => (
          <FoodLine key={i} food={food} />
        ))}
      </View>
    </View>
  );
}

function SectionTitle({ title, instruction }: { title: string; instruction?: string }) {
  const styles = useStyles(makeStyles);
  return (
    <Text style={styles.sectionTitle} accessibilityRole="header">
      {title.toLocaleUpperCase('pt-BR')}
      {instruction ? <Text style={styles.instruction}>{` — ${instruction.toLocaleUpperCase('pt-BR')}`}</Text> : null}
    </Text>
  );
}

export function MealSection({ section }: { section: SectionView }) {
  const styles = useStyles(makeStyles);
  if (section.kind === 'fixed') {
    return (
      <View style={section.title ? styles.fixedBox : styles.plain}>
        {section.title ? <SectionTitle title={section.title} /> : null}
        {section.foods.map((food, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <FoodLine food={food} />
          </View>
        ))}
      </View>
    );
  }
  if (section.kind === 'options') {
    return (
      <View style={styles.choiceBox}>
        <SectionTitle title={section.title} />
        {section.choices.map((choice, i) => (
          <Option key={i} choice={choice} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.choiceBox}>
      <SectionTitle title={section.title} instruction={section.instruction} />
      {section.choices.map((choice, i) => (
        <Alternative key={i} choice={choice} />
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  plain: { gap: spacing.xs },
  fixedBox: { gap: spacing.xs, backgroundColor: colors.background, borderRadius: radius.md, padding: spacing.sm },
  choiceBox: { gap: spacing.sm },
  sectionTitle: { ...typography.caption, color: colors.primaryDark, fontWeight: '800', letterSpacing: 0.6 },
  instruction: { color: colors.accent, fontWeight: '800' },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { ...typography.body, color: colors.primary, lineHeight: 21 },
  option: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.surface },
  optionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  optionTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700', flex: 1 },
  optionFoods: { gap: spacing.xs, paddingLeft: spacing.lg },
  alternative: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  alternativeBody: { flex: 1, gap: 2 },
  inline: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  plus: { ...typography.body, color: colors.textSecondary, lineHeight: 21 },
  choiceTitle: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.accent, marginTop: 3 },
  kcal: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});
