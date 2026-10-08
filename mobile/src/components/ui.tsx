import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { radius, spacing, typography } from '../theme/tokens';
import { shadow, useStyles, useTheme, type ThemeColors } from '../theme/theme';
import { Button } from './Button';
import { Card } from './Card';

/**
 * Peças visuais da referência recriadas em React Native: entrada animada,
 * título de página, carregando, estado vazio, cartão em gradiente, ícone em
 * caixa colorida e barra de progresso.
 */

/** Entrada com fade + deslize (initial {opacity:0, y:20} → animate da referência). */
export function FadeIn({ children, delay = 0, offset = 16, style }: { children: React.ReactNode; delay?: number; offset?: number; style?: StyleProp<ViewStyle> }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: 350, delay, useNativeDriver: true }).start();
  }, [value, delay]);
  return (
    <Animated.View style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return (
    <FadeIn offset={-12}>
      <View style={styles.pageTitleRow}>
        <View style={styles.flex}>
          <Text style={styles.pageTitle} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
        </View>
        {right}
      </View>
    </FadeIn>
  );
}

/** Spinner laranja centralizado (animate-spin border-orange da referência). */
export function LoadingState({ label = 'Carregando...' }: { label?: string }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <FadeIn>
      <Card style={styles.empty}>
        <Icon size={56} color={colors.textMuted} strokeWidth={1.5} />
        <Text style={styles.emptyTitle}>{title}</Text>
        {description ? <Text style={styles.emptyText}>{description}</Text> : null}
        {actionLabel && onAction ? <Button title={actionLabel} onPress={onAction} style={styles.emptyAction} /> : null}
      </Card>
    </FadeIn>
  );
}

export function ErrorState({ message, onRetry, retrying = false, icon }: { message: string; onRetry: () => void; retrying?: boolean; icon: LucideIcon }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const Icon = icon;
  return (
    <Card style={styles.empty}>
      <Icon size={48} color={colors.danger} strokeWidth={1.5} />
      <Text style={styles.emptyTitle} accessibilityRole="alert">
        {message}
      </Text>
      <Text style={styles.emptyText}>Verifique sua conexão e tente novamente.</Text>
      <Button title="Tentar novamente" onPress={onRetry} loading={retrying} style={styles.emptyAction} />
    </Card>
  );
}

/** Cartão com o gradiente da marca (laranja → vermelho) ou outro par de cores. */
export function GradientCard({ children, colors: pair, style }: { children: React.ReactNode; colors?: [string, string]; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const gradient = pair ?? [colors.gradientStart, colors.gradientEnd];
  return (
    <View style={[styles.gradientOuter, shadow('lg', gradient[0]), style]}>
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradientInner}>
        {children}
      </LinearGradient>
    </View>
  );
}

/** Ícone dentro de uma caixa arredondada colorida (w-10 h-10 rounded-xl). */
export function IconBox({ icon: Icon, color, background, size = 40 }: { icon: LucideIcon; color: string; background: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: background, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color={color} />
    </View>
  );
}

/** Barra de progresso (h-2.5 rounded-full) com gradiente. */
export function ProgressBar({ value, colors: pair, height = 10 }: { value: number; colors?: [string, string]; height?: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 500, useNativeDriver: false }).start();
  }, [anim, pct]);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <Animated.View style={{ height: '100%', width: anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }}>
        <LinearGradient colors={pair ?? [colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: height }} />
      </Animated.View>
    </View>
  );
}

/** Linha clicável da referência ("Próximas ações"): ícone, título, detalhe e seta. */
export function ActionRow({
  icon,
  title,
  detail,
  tint,
  background,
  onPress,
  right,
}: {
  icon: LucideIcon;
  title: string;
  detail?: string | null;
  tint: string;
  background: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  const styles = useStyles(makeStyles);
  const body = (
    <View style={[styles.actionRow, { backgroundColor: background }]}>
      <IconBox icon={icon} color={tint} background="transparent" size={36} />
      <View style={styles.flex}>
        <Text style={styles.actionTitle}>{title}</Text>
        {detail ? <Text style={styles.actionDetail}>{detail}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.8 }}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pageTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pageTitle: { ...typography.title, color: colors.textPrimary },
    pageSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: 2 },
    loading: { flex: 1, minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    loadingText: { ...typography.caption, color: colors.textSecondary },
    empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
    emptyTitle: { ...typography.subtitle, color: colors.textPrimary, textAlign: 'center' },
    emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
    emptyAction: { marginTop: spacing.sm, alignSelf: 'stretch' },
    gradientOuter: { borderRadius: radius.lg },
    gradientInner: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
    actionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm + 4, borderRadius: radius.md },
    actionTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
    actionDetail: { ...typography.caption, color: colors.textSecondary },
  });
