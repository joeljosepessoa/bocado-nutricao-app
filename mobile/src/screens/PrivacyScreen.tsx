import React, { useState } from 'react';
import { Share, StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as api from '../api/endpoints';
import { colors, typography } from '../theme/tokens';

export function PrivacyScreen() {
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

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  body: { ...typography.body, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
});
