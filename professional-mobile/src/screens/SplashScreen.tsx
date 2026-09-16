import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bocado de Nutrição</Text>
      <Text style={styles.subtitle}>Painel do profissional</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primaryDark },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
});
