import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/endpoints';
import type { EvaluationListItem } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { formatDate } from '../lib/format';
import { colors, radius, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'EvaluationPicker'>;

export function EvaluationPickerScreen({ route, navigation }: Props) {
  const { clientId, clientName } = route.params;
  const [evaluations, setEvaluations] = useState<EvaluationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [heightCm, setHeightCm] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listEvaluations(clientId);
      setEvaluations(res.items);
    } catch {
      setError('Não foi possível carregar as avaliações.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const height = Number(heightCm);
    if (!height || height < 30) {
      setError('Informe uma altura válida em cm para iniciar a avaliação.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const created = await api.createEvaluation(clientId, height);
      navigation.navigate('ScaleConnect', { clientId, clientName, evaluationId: created.id });
    } catch {
      setError('Não foi possível criar a avaliação.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <Text style={styles.heading}>{clientName}</Text>
      <FlatList
        style={{ flex: 1 }}
        data={evaluations}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('ScaleConnect', { clientId, clientName, evaluationId: item.id })}
          >
            <Text style={styles.rowTitle}>Avaliação de {formatDate(item.evaluatedAt)}</Text>
            <Text style={styles.rowSubtitle}>
              {item.weightKg != null ? `${item.weightKg} kg · ` : ''}
              {item.calculatedMetrics?.bodyFatPercentSource === 'bioimpedance' ? 'bioimpedância' : 'sem bioimpedância'}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nenhuma avaliação ainda — crie uma para conectar a balança.</Text> : null
        }
      />
      <TextField
        label="Nova avaliação — altura (cm)"
        value={heightCm}
        onChangeText={setHeightCm}
        keyboardType="numeric"
        placeholder="Ex.: 178"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button title="Criar avaliação e conectar balança" onPress={handleCreate} loading={creating} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.subtitle, color: colors.textPrimary },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  rowSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  error: { color: colors.danger, ...typography.caption },
});
