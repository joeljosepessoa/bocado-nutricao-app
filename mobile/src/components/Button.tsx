import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius, spacing, typography } from '../theme/tokens';
import { shadow, useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface Props {
  title: string;
  onPress: () => void;
  /** primary = gradiente laranja→vermelho da marca. */
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  compact?: boolean;
}

export function Button({ title, onPress, variant = 'primary', loading = false, disabled = false, icon, style, compact = false }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const isDisabled = disabled || loading;
  const onColor = variant === 'secondary' || variant === 'outline' ? colors.primaryDark : colors.textInverse;
  const gradient =
    variant === 'primary' ? [colors.gradientStart, colors.gradientEnd] : variant === 'success' ? ['#22C55E', '#059669'] : null;

  const content = loading ? (
    <ActivityIndicator color={onColor} />
  ) : (
    <View style={styles.row}>
      {icon}
      <Text style={[styles.text, { color: onColor }]}>{title}</Text>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.outer,
        gradient ? shadow('md', colors.primary) : null,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {gradient ? (
        <LinearGradient colors={gradient as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.base, compact && styles.compact]}>
          {content}
        </LinearGradient>
      ) : (
        <View style={[styles.base, compact && styles.compact, styles[variant as 'secondary' | 'outline' | 'danger']]}>{content}</View>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    outer: { borderRadius: radius.md },
    base: {
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
    },
    compact: { minHeight: 38, paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.5 },
    text: { ...typography.button },
    secondary: { backgroundColor: colors.primaryLight },
    outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    danger: { backgroundColor: colors.danger },
  });
