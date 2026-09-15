import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { colors, typography } from '../theme/tokens';

const MIN_PASSWORD_LENGTH = 8;

export function ChangePasswordScreen() {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch {
      setError('Não foi possível trocar a senha. Confira a senha atual.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.title}>Defina uma nova senha</Text>
      <Text style={styles.subtitle}>
        Por segurança, você precisa trocar a senha temporária recebida do seu profissional antes de continuar.
      </Text>

      <TextField
        label="Senha temporária atual"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <TextField label="Nova senha" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <TextField
        label="Confirmar nova senha"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button title="Salvar nova senha" onPress={handleSubmit} loading={loading} />
      <Button title="Sair" variant="secondary" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  error: { color: colors.danger, ...typography.body },
});
