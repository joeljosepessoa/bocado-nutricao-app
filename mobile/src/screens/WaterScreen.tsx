import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Droplets, GlassWater, Plus, RotateCcw, Trash2, WifiOff } from 'lucide-react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import { ErrorState, FadeIn, GradientCard, LoadingState, PageTitle, ProgressBar } from '../components/ui';
import * as api from '../api/endpoints';
import type { WaterDay, WaterHistory } from '../types/api';
import { formatMl, localDateKey, waterGoalNote, waterProgress } from '../dashboard/dashboardModel';
import { WATER_QUICK_AMOUNTS, parseWaterInput, waterBars } from '../tracking/trackingModel';
import { radius, spacing, typography } from '../theme/tokens';
import { useStyles, useTheme, type ThemeColors } from '../theme/theme';

const BAR_HEIGHT = 96;

/** Água: registro do dia (rápido ou personalizado), meta, apagar/zerar e os últimos 7 dias. */
export function WaterScreen() {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const [day, setDay] = useState<WaterDay | null>(null);
  const [history, setHistory] = useState<WaterHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  const today = () => localDateKey(new Date());

  const load = useCallback(async () => {
    try {
      const [dayResult, historyResult] = await Promise.all([api.getWaterDay(localDateKey(new Date())), api.getWaterHistory(7)]);
      setDay(dayResult);
      setHistory(historyResult);
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

  // Toda alteração devolve o dia atualizado; o histórico é recarregado em seguida.
  const mutate = async (action: () => Promise<WaterDay>) => {
    setBusy(true);
    setError(null);
    try {
      setDay(await action());
      setHistory(await api.getWaterHistory(7));
    } catch {
      setError('Não foi possível salvar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const addCustom = () => {
    const value = parseWaterInput(custom);
    if (value === null) {
      setError('Informe uma quantidade entre 10 e 3000 ml.');
      return;
    }
    setCustom('');
    mutate(() => api.addWater(value, today()));
  };

  const confirmReset = () => {
    Alert.alert('Zerar o dia', 'Apagar todos os registros de água de hoje?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Zerar', style: 'destructive', onPress: () => mutate(() => api.resetWaterDay(today())) },
    ]);
  };

  if (!day && failed) {
    return (
      <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
        <ErrorState message="Não foi possível carregar sua hidratação." onRetry={refresh} retrying={refreshing} icon={WifiOff} />
      </ScreenContainer>
    );
  }
  if (!day) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  const progress = waterProgress(day);
  const bars = history ? waterBars(history, new Date()) : [];

  return (
    <ScreenContainer onRefresh={refresh} refreshing={refreshing}>
      <PageTitle title="Água" subtitle="Registre o que você bebeu hoje" />

      <FadeIn>
        <GradientCard colors={['#06B6D4', '#2563EB']}>
          <View style={styles.heroRow}>
            <View style={styles.flex}>
              <Text style={styles.heroLabel}>Hoje</Text>
              <Text style={styles.heroValue}>{formatMl(day.totalMl)}</Text>
              <Text style={styles.heroLabel}>de {formatMl(day.goalMl)}</Text>
            </View>
            <View style={styles.percentCircle}>
              <Text style={styles.percentText}>{Math.round((progress?.percent ?? 0) * 100)}%</Text>
            </View>
          </View>
          <ProgressBar value={(progress?.percent ?? 0) * 100} colors={['#FFFFFF', '#E0F2FE']} />
          <Text style={styles.heroNote}>{waterGoalNote(day.goalSource)}</Text>
        </GradientCard>
      </FadeIn>

      <FadeIn delay={60}>
        <Card>
          <Text style={styles.cardTitle}>Adicionar</Text>
          <View style={styles.quickGrid}>
            {WATER_QUICK_AMOUNTS.map((amount) => (
              <Pressable
                key={amount}
                disabled={busy}
                onPress={() => mutate(() => api.addWater(amount, today()))}
                accessibilityRole="button"
                accessibilityLabel={`Adicionar ${amount} ml`}
                style={({ pressed }) => [styles.quick, (pressed || busy) && styles.pressed]}
              >
                <GlassWater size={22} color={colors.water} />
                <Text style={styles.quickText}>{amount} ml</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.customRow}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              keyboardType="number-pad"
              placeholder="Outra quantidade (ml)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Quantidade de água em ml"
              onSubmitEditing={addCustom}
            />
            <Pressable
              onPress={addCustom}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Adicionar quantidade digitada"
              style={({ pressed }) => [styles.addButton, (pressed || busy) && styles.pressed]}
            >
              <Plus size={22} color="#FFFFFF" />
            </Pressable>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Card>
      </FadeIn>

      <FadeIn delay={120}>
        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Registros de hoje</Text>
            {day.entries.length > 0 ? (
              <Pressable onPress={confirmReset} disabled={busy} accessibilityRole="button" style={styles.resetButton} hitSlop={6}>
                <RotateCcw size={14} color={colors.danger} />
                <Text style={styles.resetText}>Zerar dia</Text>
              </Pressable>
            ) : null}
          </View>
          {day.entries.length === 0 ? (
            <Text style={styles.muted}>Nenhum registro hoje. Toque em uma quantidade acima.</Text>
          ) : (
            [...day.entries].reverse().map((entry, index) => (
              <View key={entry.id} style={[styles.entry, index > 0 && styles.entryBorder]}>
                <Droplets size={18} color={colors.water} />
                <Text style={[styles.entryText, styles.flex]}>{formatMl(entry.amountMl)}</Text>
                <Text style={styles.entryTime}>
                  {new Date(entry.loggedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Pressable
                  onPress={() => mutate(() => api.deleteWaterEntry(entry.id))}
                  disabled={busy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Apagar registro de ${formatMl(entry.amountMl)}`}
                >
                  <Trash2 size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))
          )}
        </Card>
      </FadeIn>

      {bars.length > 0 ? (
        <FadeIn delay={160}>
          <Card>
            <Text style={styles.cardTitle}>Últimos 7 dias</Text>
            <View style={styles.bars}>
              {bars.map((bar) => (
                <View key={bar.date} style={styles.barColumn} accessibilityLabel={`${bar.weekday}: ${formatMl(bar.totalMl)}`}>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { height: Math.max(bar.percent * BAR_HEIGHT, bar.totalMl > 0 ? 4 : 0), backgroundColor: bar.percent >= 1 ? colors.success : colors.water },
                      ]}
                    />
                  </View>
                  <Text style={styles.barLabel}>{bar.weekday}</Text>
                </View>
              ))}
            </View>
          </Card>
        </FadeIn>
      ) : null}
    </ScreenContainer>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pressed: { opacity: 0.6 },
    heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    heroLabel: { ...typography.caption, color: 'rgba(255,255,255,0.9)' },
    heroValue: { fontSize: 36, fontWeight: '800', color: '#FFFFFF' },
    heroNote: { ...typography.tiny, color: 'rgba(255,255,255,0.85)' },
    percentCircle: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 4,
      borderColor: 'rgba(255,255,255,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    percentText: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
    cardTitle: { ...typography.subtitle, color: colors.textPrimary },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    quick: {
      flexBasis: '22%',
      flexGrow: 1,
      alignItems: 'center',
      gap: 4,
      paddingVertical: spacing.sm + 4,
      borderRadius: radius.md,
      backgroundColor: colors.waterSoft,
    },
    quickText: { ...typography.caption, fontWeight: '700', color: colors.textPrimary },
    customRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      ...typography.body,
      color: colors.textPrimary,
      backgroundColor: colors.surfaceMuted,
    },
    addButton: { width: 46, height: 46, borderRadius: radius.md, backgroundColor: colors.water, alignItems: 'center', justifyContent: 'center' },
    error: { ...typography.caption, color: colors.danger },
    muted: { ...typography.body, color: colors.textSecondary },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resetButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    resetText: { ...typography.caption, fontWeight: '600', color: colors.danger },
    entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    entryBorder: { borderTopWidth: 1, borderTopColor: colors.border },
    entryText: { ...typography.body, fontWeight: '600', color: colors.textPrimary },
    entryTime: { ...typography.caption, color: colors.textSecondary },
    bars: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 6 },
    barColumn: { flex: 1, alignItems: 'center', gap: 4 },
    barTrack: { width: '70%', height: BAR_HEIGHT, borderRadius: 6, backgroundColor: colors.surfaceMuted, justifyContent: 'flex-end', overflow: 'hidden' },
    barFill: { width: '100%', borderRadius: 6 },
    barLabel: { ...typography.tiny, color: colors.textSecondary },
  });
