import React, { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as api from '../api/endpoints';
import { spacing, typography } from '../theme/tokens';
import { useStyles, type ThemeColors } from '../theme/theme';

import { AI_FEATURES, consentStatusLabel, isConsentGranted, setAiConsent } from '../privacy/aiConsent';

/**
 * Consulta, concessão e revogação do consentimento de IA da própria cliente.
 * Abrir a tela só CONSULTA; conceder exige marcar a caixa e salvar.
 */
function AiConsentSection() {
  const styles = useStyles(makeStyles);
  const [consentedAt, setConsentedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [checked, setChecked] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getAiConsent()
      .then((state) => setConsentedAt(state.aiDataProcessingConsentAt))
      .catch(() => setError('Não foi possível consultar sua preferência agora.'))
      .finally(() => setLoaded(true));
  }, []);

  async function save(granted: boolean) {
    setError(null);
    setSaving(true);
    try {
      const state = await setAiConsent(api, granted);
      setConsentedAt(state.aiDataProcessingConsentAt);
      setChecked(false);
      setConfirmRevoke(false);
    } catch {
      setError('Não foi possível salvar sua preferência agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const granted = isConsentGranted({ aiDataProcessingConsentAt: consentedAt });

  return (
    <Card>
      <Text style={styles.title}>Uso de inteligência artificial</Text>
      <Text style={styles.body}>
        Alguns recursos do Bocado de Nutrição usam inteligência artificial (IA). Veja o que cada um usa e se depende da
        sua autorização:
      </Text>
      {AI_FEATURES.map((feature) => (
        <View key={feature.name} style={styles.feature}>
          <Text style={styles.featureName}>• {feature.name}</Text>
          <Text style={styles.body}>{feature.data}</Text>
          <Text style={styles.caption}>
            {feature.requiresConsent ? 'Depende da sua autorização.' : 'Não depende desta autorização.'}
          </Text>
        </View>
      ))}
      <Text style={styles.caption}>
        Texto informativo sobre o funcionamento técnico do aplicativo. A política de privacidade definitiva ainda será
        revisada.
      </Text>

      {!loaded ? <Text style={styles.body}>Carregando sua preferência…</Text> : <Text style={styles.featureName}>{consentStatusLabel(consentedAt)}</Text>}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loaded && !granted ? (
        <>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            onPress={() => setChecked((value) => !value)}
            style={styles.checkboxRow}
          >
            <Text style={styles.checkbox}>{checked ? '☑' : '☐'}</Text>
            <Text style={[styles.body, styles.checkboxLabel]}>
              Autorizo o processamento dos meus dados por inteligência artificial para os recursos que dependem desta
              autorização.
            </Text>
          </Pressable>
          <Button title="Salvar preferência" onPress={() => save(true)} loading={saving} disabled={!checked} />
        </>
      ) : null}

      {loaded && granted ? (
        <>
          <Text style={styles.body}>
            Você pode revogar quando quiser. A revogação bloqueia novos usos desses recursos; o que já foi gerado e
            seus demais dados não são apagados.
          </Text>
          {!confirmRevoke ? (
            <Button title="Revogar autorização" variant="secondary" onPress={() => setConfirmRevoke(true)} />
          ) : (
            <>
              <Button title="Confirmar revogação" variant="danger" onPress={() => save(false)} loading={saving} />
              <Button title="Cancelar" variant="secondary" onPress={() => setConfirmRevoke(false)} />
            </>
          )}
        </>
      ) : null}
    </Card>
  );
}

export function PrivacyScreen() {
  const styles = useStyles(makeStyles);
  const { logout } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmStep, setConfirmStep] = useState(false);

  async function handleExport() {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.exportMyData();
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch {
      setExportError('Não foi possível exportar seus dados agora. Tente novamente.');
    } finally {
      setExporting(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteMyAccount(password);
      await logout();
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setDeleteError(status === 401 ? 'Senha incorreta.' : 'Não foi possível excluir a conta agora.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ScreenContainer>
      <AiConsentSection />

      <Card>
        <Text style={styles.title}>Exportar meus dados</Text>
        <Text style={styles.body}>
          Baixe uma cópia de tudo que registramos sobre você: perfil, avaliações liberadas, dieta e treino atuais,
          relatórios, mensagens, consultas, dispositivos e preferências.
        </Text>
        {exportError ? <Text style={styles.error}>{exportError}</Text> : null}
        <Button title="Exportar meus dados" variant="secondary" onPress={handleExport} loading={exporting} />
      </Card>

      <Card>
        <Text style={styles.title}>Excluir minha conta</Text>
        <Text style={styles.body}>
          Isso remove permanentemente seu nome, e-mail e senha de acesso — você nunca mais conseguirá entrar com esta
          conta. Não é possível desfazer.
        </Text>

        {!confirmStep ? (
          <Button title="Quero excluir minha conta" variant="danger" onPress={() => setConfirmStep(true)} />
        ) : (
          <>
            <TextField
              label="Digite sua senha atual para confirmar"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {deleteError ? <Text style={styles.error}>{deleteError}</Text> : null}
            <Button
              title="Confirmar exclusão definitiva"
              variant="danger"
              onPress={handleDelete}
              loading={deleting}
              disabled={!password}
            />
            <Button title="Cancelar" variant="secondary" onPress={() => setConfirmStep(false)} />
          </>
        )}
      </Card>
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  caption: { ...typography.caption, color: colors.textSecondary },
  feature: { gap: spacing.xs },
  featureName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: { fontSize: 22, color: colors.primary, lineHeight: 24 },
  checkboxLabel: { flex: 1 },
});
