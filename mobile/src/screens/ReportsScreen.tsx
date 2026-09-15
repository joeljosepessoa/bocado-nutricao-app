import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Stub proposital da Fase 7: a entidade Report e a geração de relatórios em
 * PDF ficam para uma fase futura. Esta tela só existe para reservar o
 * espaço de navegação já previsto no desenho aprovado.
 */
export function ReportsScreen() {
  return (
    <ScreenContainer>
      <Text style={styles.title}>Relatórios</Text>
      <Text style={styles.body}>Em breve você poderá acompanhar aqui os relatórios preparados pelo seu profissional.</Text>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
});
