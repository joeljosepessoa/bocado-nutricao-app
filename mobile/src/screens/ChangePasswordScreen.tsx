import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CheckCircle2, Circle } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { changePasswordFailureMessage, newPasswordError, passwordChecklist } from '../auth/passwordRules';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';


export function ChangePasswordScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const invalid = newPasswordError(newPassword, confirmPassword);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      const response = (err as { response?: { status?: number; data?: { message?: unknown } } })?.response;
      setError(changePasswordFailureMessage(response?.status, response?.data?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer safeTop>
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
      <View style={styles.rules} accessibilityLabel="Como deve ser a nova senha">
        <Text style={styles.rulesTitle}>Como deve ser a nova senha</Text>
        {passwordChecklist(newPassword, confirmPassword).map((rule) => (
          <View key={rule.label} style={styles.rule} accessibilityState={{ checked: rule.ok }}>
            {rule.ok ? <CheckCircle2 size={16} color={colors.success} /> : <Circle size={16} color={colors.textMuted} />}
            <Text style={[styles.ruleText, rule.ok && { color: colors.success }]}>{rule.label}</Text>
          </View>
        ))}
        <Text style={styles.ruleExample}>Exemplo: bocado2026x (não use esse, crie a sua)</Text>
      </View>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  title: { ...typography.subtitle, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary },
  rules: { backgroundColor: colors.primarySoft, borderRadius: radius.md, padding: spacing.sm + 4, gap: 6 },
  rulesTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  rule: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ruleText: { ...typography.caption, color: colors.textSecondary },
  ruleExample: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  error: { color: colors.danger, ...typography.body },
});
