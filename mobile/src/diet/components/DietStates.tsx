import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DIET_SCREEN_TEXT } from '../dietScreenState';
import { radius, spacing, typography } from '../../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../../theme/theme';

/** Esqueleto enquanto a dieta carrega pela primeira vez. */
export function DietSkeleton() {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.skeleton} accessibilityLabel={DIET_SCREEN_TEXT.loading} accessibilityRole="progressbar">
      <View style={[styles.bar, styles.titleBar]} />
      <View style={styles.tabsRow}>
        <View style={[styles.bar, styles.tabBar]} />
        <View style={[styles.bar, styles.tabBar]} />
      </View>
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <View style={[styles.bar, styles.lineWide]} />
          <View style={[styles.bar, styles.line]} />
          <View style={[styles.bar, styles.line]} />
        </Card>
      ))}
      <View style={styles.loadingRow}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.hint}>{DIET_SCREEN_TEXT.loading}</Text>
      </View>
    </View>
  );
}

export function DietErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const styles = useStyles(makeStyles);
  return (
    <Card style={styles.center}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.message} accessibilityRole="alert">
        {DIET_SCREEN_TEXT.error}
      </Text>
      <Text style={styles.hint}>{DIET_SCREEN_TEXT.errorHint}</Text>
      <Button title={DIET_SCREEN_TEXT.retry} onPress={onRetry} loading={retrying} />
    </Card>
  );
}

export function DietEmptyState() {
  const styles = useStyles(makeStyles);
  return (
    <Card style={styles.center}>
      <Text style={styles.icon}>🍽️</Text>
      <Text style={styles.message}>{DIET_SCREEN_TEXT.empty}</Text>
      <Text style={styles.hint}>{DIET_SCREEN_TEXT.emptyHint}</Text>
    </Card>
  );
}

/** Atualização falhou, mas a dieta já carregada continua na tela. */
export function RefreshFailedBanner({ onRetry }: { onRetry: () => void }) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.bannerText}>{DIET_SCREEN_TEXT.refreshFailed}</Text>
      <Text style={styles.bannerAction} onPress={onRetry} accessibilityRole="button">
        {DIET_SCREEN_TEXT.retry}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  skeleton: { gap: spacing.md },
  bar: { backgroundColor: colors.border, borderRadius: radius.sm },
  titleBar: { height: 26, width: '45%' },
  tabsRow: { flexDirection: 'row', gap: spacing.sm },
  tabBar: { flex: 1, height: 40, borderRadius: radius.md },
  lineWide: { height: 18, width: '60%' },
  line: { height: 14, width: '85%' },
  loadingRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  icon: { fontSize: 32 },
  message: { ...typography.subtitle, color: colors.textPrimary, textAlign: 'center' },
  hint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  banner: {
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  bannerText: { ...typography.caption, color: colors.danger },
  bannerAction: { ...typography.caption, color: colors.danger, fontWeight: '700' },
});
