import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ClipboardList, Scale, Trash2, TrendingDown, TrendingUp, WifiOff } from 'lucide-react-native';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { EmptyState, ErrorState, FadeIn, GradientCard, LoadingState, PageTitle } from '../components/ui';
import { WeightChart } from '../components/WeightChart';
import * as api from '../api/endpoints';
import type { WeightList } from '../types/api';
import { formatKg, latestWeight, weightGoalText, type WeightPoint } from '../dashboard/dashboardModel';
import { formatDateTime, formatDelta, parseWeightInput, totalWeightChange, weightRows } from '../tracking/trackingModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

/** Registro de Peso: registrar, ver a evolução de todos os registros reais e apagar os próprios. */
export function WeightScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [data, setData] = useState<WeightList | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.getWeights());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const save = async () => {
    const value = parseWeightInput(input);
    if (value === null) {
      setError('Informe um peso entre 20 e 400 kg (ex.: 72,4).');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await api.addWeight(value);
      setInput('');
      setMessage(`Peso de ${formatKg(value)} registrado.`);
      await load();
    } catch {
      setError('Não foi possível registrar agora. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string, weightKg: number) => {
    Alert.alert('Apagar registro', `Apagar o registro de ${formatKg(weightKg)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteWeight(id);
            await load();
          } catch {
            Alert.alert('Erro', 'Não foi possível apagar agora.');
          }
        },
      },
    ]);
  };

  if (!data && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar seus registros." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!data) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const current = latestWeight(data.items);
  const change = totalWeightChange(data.items);
  const points: WeightPoint[] = data.items.map((item) => ({ timestamp: new Date(item.recordedAt).getTime(), value: item.weightKg }));
  const rows = weightRows(data.items);

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Registro de Peso" subtitle="Acompanhe seu peso ao longo do tempo" />

      <FadeIn>
        <GradientCard>
          <Text style={styles.heroLabel}>Peso atual</Text>
          <Text style={styles.heroValue}>{current ? formatKg(current.weightKg) : '--'}</Text>
          <View style={styles.heroRow}>
            <View>
              <Text style={styles.heroLabel}>Meta</Text>
              <Text style={styles.heroSmall}>{weightGoalText(data.targetWeightKg)}</Text>
            </View>
            {change !== null ? (
              <View style={styles.heroChange}>
                {change <= 0 ? <TrendingDown size={18} color="#FFFFFF" /> : <TrendingUp size={18} color="#FFFFFF" />}
                <Text style={styles.heroSmall}>{formatDelta(change)} no total</Text>
              </View>
            ) : null}
          </View>
        </GradientCard>
      </FadeIn>

      <FadeIn delay={60}>
        <Card>
          <Text style={styles.cardTitle}>Novo registro</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={input}
              onChangeText={(text) => {
                setInput(text);
                setMessage(null);
              }}
              keyboardType="decimal-pad"
              placeholder="Ex.: 72,4"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Peso em quilos"
              returnKeyType="done"
              onSubmitEditing={save}
            />
            <Text style={styles.unit}>kg</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {message ? <Text style={styles.success}>{message}</Text> : null}
          <Button title="Registrar peso" onPress={save} loading={saving} icon={<Scale size={18} color={colors.textInverse} />} />
        </Card>
      </FadeIn>

      <FadeIn delay={120}>
        <Card>
          <Text style={styles.cardTitle}>Evolução</Text>
          {points.length >= 2 ? (
            <WeightChart points={points} />
          ) : (
            <Text style={styles.muted}>Registre seu peso para acompanhar a evolução — o gráfico aparece a partir do segundo registro.</Text>
          )}
        </Card>
      </FadeIn>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhum registro ainda" description="Seus registros de peso aparecem aqui." />
      ) : (
        <FadeIn delay={160}>
          <Card>
            <Text style={styles.cardTitle}>Histórico</Text>
            {rows.map((row, index) => (
              <View key={row.id ?? `evaluation-${row.recordedAt}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                <View style={styles.flex}>
                  <Text style={styles.rowValue}>{formatKg(row.weightKg)}</Text>
                  <Text style={styles.rowDate}>
                    {formatDateTime(row.recordedAt)}
                    {row.source === 'evaluation' ? ' · Avaliação' : ''}
                  </Text>
                </View>
                {row.delta !== null ? (
                  <Text style={[styles.delta, { color: row.delta > 0 ? colors.danger : colors.success }]}>{formatDelta(row.delta)}</Text>
                ) : null}
                {row.id ? (
                  <Pressable
                    onPress={() => remove(row.id as string, row.weightKg)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Apagar registro de ${formatKg(row.weightKg)}`}
                    style={styles.trash}
                  >
                    <Trash2 size={18} color={colors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </Card>
        </FadeIn>
      )}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    heroLabel: { ...typography.caption, color: 'rgba(255,255,255,0.85)' },
    heroValue: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
    heroSmall: { ...typography.body, fontWeight: '700', color: '#FFFFFF' },
    heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    heroChange: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardTitle: { ...typography.subtitle, color: colors.textPrimary },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
      fontSize: 22,
      fontWeight: '700',
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
    },
    unit: { ...typography.subtitle, color: colors.textSecondary },
    error: { ...typography.caption, color: colors.danger },
    success: { ...typography.caption, color: colors.success },
    muted: { ...typography.body, color: colors.textSecondary },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    rowValue: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
    rowDate: { ...typography.caption, color: colors.textSecondary },
    delta: { ...typography.caption, fontWeight: '700' },
    trash: { padding: 4 },
  });
