import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { browserInstallHint } from '../platform/installHint';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, type ThemeColors } from '../theme/theme';

export function LoginScreen() {
  const styles = useStyles(makeStyles);
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstallHint] = useState(() => browserInstallHint(Platform.OS));

  async function handleSubmit() {
    if (!email || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch {
      setError('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.content}>
        <Text style={styles.title}>Bocado de Nutrição</Text>
        <Text style={styles.subtitle}>Entre com os dados enviados pelo seu profissional.</Text>

        <TextField
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="Senha"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Entrar" onPress={handleSubmit} loading={loading} />

        {showInstallHint ? (
          <View style={styles.hint} accessibilityRole="summary">
            <Text style={styles.hintTitle}>Salve o app no seu iPhone</Text>
            <Text style={styles.hintText}>
              No Safari, toque em Compartilhar (o quadrado com a seta para cima) e depois em “Adicionar à Tela de Início”. O
              Bocado vai aparecer junto com os outros apps.
            </Text>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  title: { ...typography.title, color: colors.primaryDark, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  error: { color: colors.danger, ...typography.body },
  hint: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primarySoft, gap: spacing.xs },
  hintTitle: { ...typography.body, fontWeight: '600', color: colors.primaryDark },
  hintText: { ...typography.caption, color: colors.textSecondary },
});
