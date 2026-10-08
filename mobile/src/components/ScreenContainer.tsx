import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { spacing } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: ViewStyle;
}

/** Conteúdo das telas: fundo do tema, espaçamento da referência e "puxar para atualizar" laranja. */
export function ScreenContainer({ children, scroll = true, onRefresh, refreshing = false, style }: Props) {
  const { colors } = useTheme();
  const styles = useStyles(makeStyles);
  if (!scroll) {
    return <View style={[styles.container, style]}>{children}</View>;
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.surface}
            title={refreshing ? 'Atualizando...' : 'Puxe para atualizar'}
            titleColor={colors.textSecondary}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: colors.background },
    container: { flexGrow: 1, backgroundColor: colors.background, padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  });
