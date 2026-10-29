import React, { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { LegalDocumentModal } from '../components/LegalDocumentModal';
import * as api from '../api/endpoints';
import type { LegalDocument, LegalDocumentsResponse, LegalStatus } from '../types/api';
import { acceptedAtLabel } from '../legal/legalGate';
import { consentStatusLabel, isConsentGranted, setAiConsent } from '../privacy/aiConsent';
import { spacing, typography } from '../theme/tokens';
import { useStyles, type ThemeColors } from '../theme/theme';

/** Termos de Uso e Política de Privacidade: versões aceitas, data do aceite e o texto completo. */
function LegalDocumentsSection() {
  const styles = useStyles(makeStyles);
  const [status, setStatus] = useState<LegalStatus | null>(null);
  const [docs, setDocs] = useState<LegalDocumentsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<LegalDocument | null>(null);

  useEffect(() => {
    Promise.all([api.getLegalStatus(), api.getLegalDocuments()])
      .then(([legalStatus, legalDocs]) => {
        setStatus(legalStatus);
        setDocs(legalDocs);
      })
      .catch(() => setError('Não foi possível carregar seus documentos agora.'));
  }, []);

  const open = (kind: LegalDocument['kind']) => setReading(docs?.documents.find((d) => d.kind === kind) ?? null);
  const termsVersion = status?.accepted?.termsVersion ?? status?.currentTermsVersion;
  const privacyVersion = status?.accepted?.privacyVersion ?? status?.currentPrivacyVersion;

  return (
    <Card>
      <Text style={styles.title}>Seus documentos</Text>
      {status ? (
        <>
          <Text style={styles.body}>
            Termos de Uso {termsVersion} e Política de Privacidade {privacyVersion}.
          </Text>
          {status.accepted ? <Text style={styles.caption}>{acceptedAtLabel(status.accepted.acceptedAt)}</Text> : null}
        </>
      ) : !error ? (
        <Text style={styles.body}>Carregando…</Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {docs ? (
        <View style={styles.row}>
          <Button title="Termos de Uso" variant="secondary" compact onPress={() => open('terms')} style={styles.rowButton} />
          <Button title="Política de Privacidade" variant="secondary" compact onPress={() => open('privacy')} style={styles.rowButton} />
        </View>
      ) : null}
      <LegalDocumentModal document={reading} onClose={() => setReading(null)} />
    </Card>
  );
}

/**
 * Autorização das análises automáticas (ferramentas de apoio que o profissional usa com os dados do
 * paciente). É obrigatória para usar o app, mas dá para desativar a qualquer momento (LGPD) — aí o app
 * volta a pedir a autorização antes de continuar.
 */
function AnalysesSection() {
  const styles = useStyles(makeStyles);
  const { requireAi } = useAuth();
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
      if (!state.aiDataProcessingConsentAt) requireAi();
    } catch {
      setError('Não foi possível salvar sua preferência agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const granted = isConsentGranted({ aiDataProcessingConsentAt: consentedAt });

  return (
    <Card>
      <Text style={styles.title}>Análises automáticas</Text>
      <Text style={styles.body}>
        Permite que o seu profissional use ferramentas de apoio com os seus dados ao organizar o seu acompanhamento.
        Essa autorização é necessária para usar o aplicativo.
      </Text>

      {!loaded ? (
        <Text style={styles.body}>Carregando sua preferência…</Text>
      ) : (
        <Text style={styles.status}>{consentStatusLabel(consentedAt)}</Text>
      )}
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
            <Text style={[styles.body, styles.checkboxLabel]}>Autorizo as análises automáticas dos meus dados para esses recursos.</Text>
          </Pressable>
          <Button title="Salvar preferência" onPress={() => save(true)} loading={saving} disabled={!checked} />
        </>
      ) : null}

      {loaded && granted ? (
        <>
          <Text style={styles.body}>
            Ao desativar, esses recursos deixam de ser usados a partir de agora; o que já foi gerado e seus demais dados
            não são apagados. Como a autorização é necessária para usar o aplicativo, ele vai pedir de novo antes de continuar.
          </Text>
          {!confirmRevoke ? (
            <Button title="Desativar" variant="secondary" onPress={() => setConfirmRevoke(true)} />
          ) : (
            <>
              <Button title="Confirmar desativação" variant="danger" onPress={() => save(false)} loading={saving} />
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
      <LegalDocumentsSection />
      <AnalysesSection />

      <Card>
        <Text style={styles.title}>Baixar meus dados</Text>
        <Text style={styles.body}>
          Baixe uma cópia de tudo que registramos sobre você: perfil, avaliações liberadas, dieta e treino atuais,
          relatórios, mensagens, consultas, dispositivos, preferências e o histórico de aceite dos termos.
        </Text>
        {exportError ? <Text style={styles.error}>{exportError}</Text> : null}
        <Button title="Baixar meus dados" variant="secondary" onPress={handleExport} loading={exporting} />
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
  status: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  checkbox: { fontSize: 22, color: colors.primary, lineHeight: 24 },
  checkboxLabel: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowButton: { flexGrow: 1 },
});
