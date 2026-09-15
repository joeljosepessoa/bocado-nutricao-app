import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors, typography } from '../theme/tokens';

export function PrivacyConsentScreen() {
  const { acceptPrivacyTerms, logout } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    setLoading(true);
    try {
      await acceptPrivacyTerms();
    } catch {
      setError('Não foi possível registrar o aceite agora. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Privacidade dos seus dados</Text>
      <Text style={styles.body}>
        Seu profissional utiliza este aplicativo para acompanhar sua dieta, seus treinos e sua evolução física.
        Seus dados pessoais e de saúde são tratados conforme a Lei Geral de Proteção de Dados (LGPD) e ficam
        visíveis apenas para você e para o profissional responsável pelo seu acompanhamento.
      </Text>
      <Text style={styles.body}>
        Dados técnicos da sua avaliação física (como dobras cutâneas e medidas brutas) não são exibidos neste
        aplicativo — você vê apenas os indicadores liberados pelo seu profissional.
      </Text>
      <Text style={styles.body}>Ao continuar, você concorda com o tratamento dos seus dados para esse fim.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Li e concordo" onPress={handleAccept} loading={loading} />
      <Button title="Sair" variant="secondary" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { color: colors.danger, ...typography.body },
});
