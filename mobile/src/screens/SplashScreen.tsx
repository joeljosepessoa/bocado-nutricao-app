import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

export function SplashScreen() {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bocado de Nutrição</Text>
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { ...typography.title, color: colors.primaryDark },
});
