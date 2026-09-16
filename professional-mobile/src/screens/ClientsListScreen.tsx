import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/endpoints';
import type { ClientListItem } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useAuth } from '../auth/AuthContext';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClientsList'>;

export function ClientsListScreen({ navigation }: Props) {
  const { logout } = useAuth();
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listClients(query || undefined);
      setClients(res.items);
    } catch {
      setError('Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
    // Carrega só na montagem — buscas seguintes disparam por onSubmitEditing, não a cada tecla.
  }, [load]);

  return (
    <ScreenContainer scroll={false}>
      <TextField
        label="Buscar cliente"
        value={search}
        onChangeText={setSearch}
        onSubmitEditing={() => load(search)}
        placeholder="Nome ou e-mail"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        style={{ flex: 1 }}
        data={clients}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => load(search)}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              navigation.navigate('EvaluationPicker', { clientId: item.id, clientName: item.user.fullName })
            }
          >
            <Text style={styles.name}>{item.user.fullName}</Text>
            <Text style={styles.email}>{item.user.email}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Nenhum cliente encontrado.</Text> : null}
      />
      <Button title="Sair" variant="secondary" onPress={() => logout()} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  name: { ...typography.subtitle, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  error: { color: colors.danger, ...typography.caption },
});
