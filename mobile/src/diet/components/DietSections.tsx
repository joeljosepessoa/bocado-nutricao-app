import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Card';
import type { SupplementView } from '../dietPresentation';
import { colors, spacing, typography } from '../../theme/tokens';

/** Cabeçalho "Minha dieta" — só o que a API realmente envia (nenhuma meta inventada). */
export function DietHeader({ title, instruction }: { title: string; instruction: string | null }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {instruction ? <Text style={styles.instruction}>{instruction}</Text> : null}
    </View>
  );
}

/** 💊 Suplementação — não aparece quando não há suplementos. */
export function SupplementsCard({ supplements }: { supplements: SupplementView[] }) {
  if (supplements.length === 0) return null;
  return (
    <Card>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        💊 Suplementação
      </Text>
      {supplements.map((s, i) => (
        <View key={i} style={[styles.item, i > 0 && styles.divider]}>
          <Text style={styles.name}>{s.name}</Text>
          {s.dose ? <Text style={styles.dose}>{s.dose}</Text> : null}
          {s.timing ? <Text style={styles.detail}>{s.timing}</Text> : null}
          {s.notes ? <Text style={styles.notes}>{s.notes}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

/** 📋 Orientações em tópicos — não aparece quando não há orientações. */
export function GuidelinesCard({ guidelines }: { guidelines: string[] }) {
  if (guidelines.length === 0) return null;
  return (
    <Card>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        📋 Orientações
      </Text>
      {guidelines.map((text, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.guideline}>{text}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 2 },
  title: { ...typography.title, color: colors.primaryDark },
  instruction: { ...typography.caption, color: colors.textSecondary },
  sectionTitle: { ...typography.subtitle, color: colors.textPrimary },
  item: { gap: 2, paddingTop: spacing.xs },
  divider: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.xs },
  name: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  dose: { ...typography.body, color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  notes: { ...typography.caption, color: colors.textSecondary, fontStyle: 'italic' },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  bullet: { ...typography.body, color: colors.primary, lineHeight: 22 },
  guideline: { ...typography.body, color: colors.textPrimary, lineHeight: 22, flex: 1 },
});
