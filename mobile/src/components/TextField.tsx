import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

/**
 * Campo de texto do app. Campo de senha (`secureTextEntry`) ganha o "olho"
 * para mostrar/esconder o que foi digitado.
 */
export function TextField({ label, error, style, secureTextEntry, ...rest }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  const [visible, setVisible] = useState(false);
  const isPassword = Boolean(secureTextEntry);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, isPassword && styles.inputWithIcon, style]}
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          secureTextEntry={isPassword && !visible}
          accessibilityLabel={label}
          {...rest}
        />
        {isPassword ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? `Esconder ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
            style={styles.eye}
          >
            {visible ? <EyeOff size={20} color={colors.textSecondary} /> : <Eye size={20} color={colors.textSecondary} />}
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textSecondary },
  inputRow: { justifyContent: 'center' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 15,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  inputWithIcon: { paddingRight: 44 },
  eye: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.danger, ...typography.caption },
});
