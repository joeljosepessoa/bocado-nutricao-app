import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import * as api from '../api/endpoints';
import type { DeviceConnection, DeviceMetricSample } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { flushDeviceMetricQueue } from '../offline/sync';
import { colors, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

const SOURCE_LABELS: Record<DeviceConnection['sourceType'], string> = {
  ble_direct: 'Bluetooth (cinta de FC)',
  apple_healthkit: 'Apple Health',
  android_health_connect: 'Health Connect',
  manufacturer_api: 'API de fabricante',
  manual_import: 'Registro manual',
};

const METRIC_LABELS: Record<DeviceMetricSample['metricType'], string> = {
  heart_rate: 'Frequência cardíaca',
  resting_heart_rate: 'FC em repouso',
  steps: 'Passos',
  distance: 'Distância',
  active_calories: 'Calorias ativas',
  sleep_session: 'Sono',
  workout_activity: 'Atividade de treino',
  exercise_duration: 'Duração de exercício',
  oxygen_saturation: 'Saturação de oxigênio',
  body_temperature: 'Temperatura corporal',
  respiratory_rate: 'Frequência respiratória',
};

export function ActivityScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [consentedAt, setConsentedAt] = useState<string | null | undefined>(undefined);
  const [connections, setConnections] = useState<DeviceConnection[]>([]);
  const [samplesByConnection, setSamplesByConnection] = useState<Record<string, DeviceMetricSample[]>>({});
  const [loading, setLoading] = useState(true);
  const [consenting, setConsenting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listDeviceConnections();
      setConsentedAt(res.consentedAt);
      setConnections(res.items);
      const samplesEntries = await Promise.all(
        res.items
          .filter((c) => c.status === 'active')
          .map(async (c) => [c.id, (await api.listOwnDeviceMetrics(c.id)).items] as const),
      );
      setSamplesByConnection(Object.fromEntries(samplesEntries));
    } catch {
      // tela mostra o que já tem; sem estado de erro dedicado por ora
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    flushDeviceMetricQueue().catch(() => undefined);
    const unsubscribe = navigation.addListener('focus', () => {
      load();
      flushDeviceMetricQueue().catch(() => undefined);
    });
    return unsubscribe;
    // load é recriado a cada render (useCallback com deps vazias, então é
    // estável); só navigation precisa disparar o efeito de novo.
  }, [navigation, load]);

  async function handleAcceptConsent() {
    setConsenting(true);
    try {
      await api.acceptDeviceDataConsent();
      await load();
    } finally {
      setConsenting(false);
    }
  }

  async function handleToggleShare(connection: DeviceConnection, value: boolean) {
    setConnections((prev) => prev.map((c) => (c.id === connection.id ? { ...c, sharedWithProfessional: value } : c)));
    try {
      await api.setDeviceShareWithProfessional(connection.id, value);
    } catch {
      await load();
    }
  }

  async function handleRevoke(connection: DeviceConnection) {
    await api.revokeDeviceConnection(connection.id);
    await load();
  }

  if (loading && consentedAt === undefined) {
    return (
      <ScreenContainer>
        <Text style={styles.body}>Carregando…</Text>
      </ScreenContainer>
    );
  }

  if (!consentedAt) {
    return (
      <ScreenContainer>
        <Text style={styles.heading}>Dados de atividade e dispositivos</Text>
        <Card>
          <Text style={styles.body}>
            Você pode conectar uma cinta de frequência cardíaca ou registrar dados de atividade manualmente. Esses
            dados ficam visíveis só para você — compartilhar com seu profissional é opcional, ativado dispositivo por
            dispositivo, e você pode revogar a qualquer momento.
          </Text>
          <Text style={styles.body}>Nenhum dado é coletado antes de você aceitar.</Text>
          <Button title="Aceitar e continuar" onPress={handleAcceptConsent} loading={consenting} />
        </Card>
      </ScreenContainer>
    );
  }

  const activeConnections = connections.filter((c) => c.status !== 'revoked');

  return (
    <ScreenContainer onRefresh={load} refreshing={loading}>
      <Text style={styles.heading}>Atividade</Text>

      {activeConnections.length === 0 ? (
        <Card>
          <Text style={styles.body}>Nenhum dispositivo conectado ainda.</Text>
        </Card>
      ) : (
        activeConnections.map((connection) => (
          <Card key={connection.id}>
            <View style={styles.rowBetween}>
              <Text style={styles.itemTitle}>{SOURCE_LABELS[connection.sourceType]}</Text>
              <StatusPill
                label={connection.status === 'active' ? 'Ativo' : 'Erro'}
                tone={connection.status === 'active' ? 'success' : 'danger'}
              />
            </View>

            {(samplesByConnection[connection.id] ?? []).length === 0 ? (
              <Text style={styles.caption}>Nenhuma leitura ainda.</Text>
            ) : (
              (samplesByConnection[connection.id] ?? []).slice(0, 3).map((sample) => (
                <Text key={sample.id} style={styles.caption}>
                  {METRIC_LABELS[sample.metricType]}: {sample.value} {sample.unit} —{' '}
                  {new Date(sample.startedAt).toLocaleString('pt-BR')}
                </Text>
              ))
            )}

            <View style={styles.rowBetween}>
              <Text style={styles.caption}>Compartilhar com meu profissional</Text>
              <Switch
                value={connection.sharedWithProfessional}
                onValueChange={(value) => handleToggleShare(connection, value)}
              />
            </View>

            <Button title="Desconectar" variant="danger" onPress={() => handleRevoke(connection)} />
          </Card>
        ))
      )}

      <Button title="+ Conectar dispositivo" onPress={() => navigation.navigate('ConnectDevice')} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.subtitle, color: colors.textPrimary },
  itemTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  body: { ...typography.body, color: colors.textSecondary },
  caption: { ...typography.caption, color: colors.textSecondary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
