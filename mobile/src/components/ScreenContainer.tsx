import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, spacing } from '../theme/tokens';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: ViewStyle;
}

export function ScreenContainer({ children, scroll = true, onRefresh, refreshing = false, style }: Props) {
  if (!scroll) {
    return <View style={[styles.container, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, style]}
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.md, gap: spacing.md },
});
