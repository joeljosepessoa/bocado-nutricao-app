import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, FileText, Leaf } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { LegalDocumentModal } from '../components/LegalDocumentModal';
import { ErrorState, IconBox, LoadingState } from '../components/ui';
import * as api from '../api/endpoints';
import type { LegalDocument, LegalDocumentsResponse } from '../types/api';
import { canContinue, isOutdatedVersionError } from '../legal/legalGate';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

type Mode = 'firstOpen' | 'account';

function CheckRow({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={[styles.checkRow, checked && styles.checkRowOn]}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check size={16} color={colors.textInverse} strokeWidth={3} /> : null}</View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

/**
 * Boas-vindas + aceite dos Termos de Uso e da Política de Privacidade.
 * - firstOpen: primeira abertura do app (antes do login) — o aceite é guardado no aparelho e
 *   enviado ao servidor logo após o login;
 * - account: já logado e o servidor pede o aceite (quem atualizou o app ou documento novo).
 */
function TermsAcceptance({ mode }: { mode: Mode }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { acceptTermsOnDevice, acceptTerms, logout } = useAuth();
  const [docs, setDocs] = useState<LegalDocumentsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [acceptTermsChecked, setAcceptTermsChecked] = useState(false);
  const [acceptPrivacyChecked, setAcceptPrivacyChecked] = useState(false);
  const [reading, setReading] = useState<LegalDocument | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setDocs(await api.getLegalDocuments());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const versions = docs ? { termsVersion: docs.termsVersion, privacyVersion: docs.privacyVersion } : null;
  const ready = canContinue(acceptTermsChecked, acceptPrivacyChecked, versions);
  const open = (kind: LegalDocument['kind']) => setReading(docs?.documents.find((d) => d.kind === kind) ?? null);

  async function handleContinue() {
    if (!ready || !versions) return;
    setError(null);
    setSaving(true);
    try {
      if (mode === 'firstOpen') await acceptTermsOnDevice(versions);
      else await acceptTerms(versions);
    } catch (err) {
      if (isOutdatedVersionError(err)) {
        // O texto foi atualizado: recarrega e pede a confirmação de novo.
        setAcceptTermsChecked(false);
        setAcceptPrivacyChecked(false);
        await load();
        setError('Os documentos foram atualizados. Leia a versão nova e confirme novamente.');
      } else {
        setError('Não foi possível registrar agora. Verifique sua internet e tente novamente.');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading && !docs) {
    return (
      <ScreenContainer safeTop>
        <LoadingState label="Carregando..." />
      </ScreenContainer>
    );
  }

  if (loadError && !docs) {
    return (
      <ScreenContainer safeTop>
        <ErrorState icon={FileText} message="Não foi possível carregar os termos. Verifique sua internet e tente novamente." onRetry={load} retrying={loading} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer safeTop>
      <View style={styles.header}>
        <IconBox icon={Leaf} color={colors.primaryDark} background={colors.primaryLight} size={48} />
        <Text style={styles.title}>Bem-vindo ao Bocado de Nutrição!</Text>
      </View>

      <Text style={styles.body}>
        Para utilizar o aplicativo, precisamos que você leia e aceite nossos Termos de Uso e nossa Política de Privacidade.
      </Text>
      <Text style={styles.body}>
        Seus dados são utilizados para oferecer uma experiência personalizada, acompanhar sua evolução e disponibilizar os recursos do aplicativo.
      </Text>
      <Text style={styles.body}>A proteção dos seus dados é importante para nós.</Text>

      <View style={styles.checks}>
        <CheckRow checked={acceptTermsChecked} onToggle={() => setAcceptTermsChecked((v) => !v)}>
          Li e aceito os{' '}
          <Text style={styles.link} onPress={() => open('terms')} accessibilityRole="link">
            Termos de Uso
          </Text>{' '}
          do Bocado de Nutrição.
        </CheckRow>
        <CheckRow checked={acceptPrivacyChecked} onToggle={() => setAcceptPrivacyChecked((v) => !v)}>
          Li e estou ciente da{' '}
          <Text style={styles.link} onPress={() => open('privacy')} accessibilityRole="link">
            Política de Privacidade
          </Text>{' '}
          e do tratamento dos meus dados pessoais.
        </CheckRow>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Continuar" onPress={handleContinue} loading={saving} disabled={!ready} />
      {mode === 'account' ? <Button title="Sair" variant="secondary" onPress={() => logout()} /> : null}

      <LegalDocumentModal document={reading} onClose={() => setReading(null)} />
    </ScreenContainer>
  );
}

export function FirstOpenTermsScreen() {
  return <TermsAcceptance mode="firstOpen" />;
}

export function AccountTermsScreen() {
  return <TermsAcceptance mode="account" />;
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { gap: spacing.md, marginTop: spacing.md },
    title: { ...typography.title, color: colors.textPrimary },
    body: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
    checks: { gap: spacing.sm, marginTop: spacing.sm },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    checkRowOn: { borderColor: colors.primary },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkText: { ...typography.body, color: colors.textPrimary, flex: 1, lineHeight: 22 },
    link: { color: colors.primaryDark, fontWeight: '600', textDecorationLine: 'underline' },
    error: { ...typography.caption, color: colors.danger },
  });
