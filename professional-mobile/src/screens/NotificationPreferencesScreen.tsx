import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Card } from '../components/Card';
import { ScreenContainer } from '../components/ScreenContainer';
import * as api from '../api/endpoints';
import type { NotificationEventType, NotificationPreference } from '../types/api';
import { colors, spacing, typography } from '../theme/tokens';

const EVENT_LABELS: Record<NotificationEventType, string> = {
  report_ready: 'Relatório disponível',
  evaluation_released: 'Avaliação física liberada',
  diet_published: 'Nova dieta publicada',
  workout_published: 'Novo treino publicado',
};

export function NotificationPreferencesScreen() {
  const [preferences, setPreferences] = useState<NotificationPreference[] | null>(null);
  const [savingType, setSavingType] = useState<NotificationEventType | null>(null);

  useEffect(() => {
    api.listNotificationPreferences().then(setPreferences);
  }, []);

  async function toggle(eventType: NotificationEventType, enabled: boolean) {
    setPreferences((prev) => prev?.map((p) => (p.eventType === eventType ? { ...p, enabled } : p)) ?? prev);
    setSavingType(eventType);
    try {
      await api.updateNotificationPreference(eventType, enabled);
    } catch {
      setPreferences((prev) => prev?.map((p) => (p.eventType === eventType ? { ...p, enabled: !enabled } : p)) ?? prev);
    } finally {
      setSavingType(null);
    }
  }

  return (
    <ScreenContainer>
      <Text style={styles.subtitle}>Escolha quais avisos você quer receber por notificação.</Text>
      <Card>
        {(preferences ?? []).map((pref) => (
          <View key={pref.eventType} style={styles.row}>
            <Text style={styles.label}>{EVENT_LABELS[pref.eventType]}</Text>
            <Switch
              value={pref.enabled}
              disabled={savingType === pref.eventType}
              onValueChange={(value) => toggle(pref.eventType, value)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={pref.enabled ? colors.primary : undefined}
            />
          </View>
        ))}
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...typography.body, color: colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  label: { ...typography.body, color: colors.textPrimary, flexShrink: 1, paddingRight: spacing.sm },
});
