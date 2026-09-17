import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import * as api from '../api/endpoints';
import type { ClientSelf } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme/tokens';

export function ProfileScreen() {
  const { logout } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [profile, setProfile] = useState<ClientSelf | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.getMe().then((data) => {
      setProfile(data);
      setFullName(data.user.fullName);
      setPhone(data.phone ?? '');
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateMe({ fullName, phone });
      setProfile(updated);
      setMessage('Dados atualizados.');
    } catch {
      setMessage('Não foi possível salvar agora.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer>
      <Card>
        <Text style={styles.label}>E-mail</Text>
        <Text style={styles.value}>{profile?.user.email ?? ''}</Text>

        <TextField label="Nome" value={fullName} onChangeText={setFullName} />
        <TextField label="Telefone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Button title="Salvar" onPress={handleSave} loading={saving} />
      </Card>

      <Button title="Mensagens" variant="secondary" onPress={() => navigation.navigate('Messages')} />
      <Button title="Relatórios" variant="secondary" onPress={() => navigation.navigate('Reports')} />
      <Button title="Notificações" variant="secondary" onPress={() => navigation.navigate('NotificationPreferences')} />
      <Button title="Sair" variant="danger" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, color: colors.textSecondary },
  value: { ...typography.body, color: colors.textPrimary, marginBottom: spacing.sm },
  message: { ...typography.caption, color: colors.primary },
});
