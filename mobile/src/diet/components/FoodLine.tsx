import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { FoodLineView } from '../dietPresentation';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, type ThemeColors } from '../../theme/theme';

/** "110 g de fruta" + "À vontade"/observação embaixo + substituições (quando houver). */
export function FoodLine({ food, emphasized = false }: { food: FoodLineView; emphasized?: boolean }) {
  const styles = useStyles(makeStyles);
  const [expanded, setExpanded] = useState(false);
  const count = food.substitutions.length;
  return (
    <View style={styles.row}>
      <Text style={[styles.text, emphasized && styles.emphasized]}>{food.text}</Text>
      {food.quantityNote ? <Text style={styles.free}>{food.quantityNote}</Text> : null}
      {food.notes ? <Text style={styles.notes}>{food.notes}</Text> : null}
      {count > 0 ? (
        <>
          <Pressable onPress={() => setExpanded((v) => !v)} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.toggle}>{expanded ? 'Ocultar substituições' : `Ver substituições (${count})`}</Text>
          </Pressable>
          {expanded
            ? food.substitutions.map((sub) => (
                <Text key={sub.substituteFoodId} style={styles.substitution}>
                  • {sub.substituteFoodName} — {sub.substituteQuantity} {sub.substituteUnit}
                </Text>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  row: { gap: 2, flexShrink: 1 },
  text: { ...typography.body, color: colors.textPrimary, lineHeight: 21 },
  emphasized: { fontWeight: '600' },
  free: { ...typography.caption, color: colors.success, fontWeight: '600' },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  toggle: { ...typography.caption, color: colors.primary, fontWeight: '600', marginTop: 2 },
  substitution: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    marginTop: 2,
  },
});
