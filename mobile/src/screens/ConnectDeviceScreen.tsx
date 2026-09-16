import React, { useEffect, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/endpoints';
import type { DeviceMetricType, MetricSampleInput } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { StatusPill } from '../components/StatusPill';
import { WearableDriverRegistry } from '../ble/registry';
import { MockBleTransport } from '../ble/mockTransport';
import { createHeartRateServiceDriver } from '../ble/heartRateServiceDriver';
import { MOCK_HR_ADVERTISEMENT, MOCK_HR_SERVICE_DESCRIPTOR, simulateHeartRatePayload } from '../ble/mockHeartRateDevice';
import type { BleTransport, NormalizedDeviceSample, Unsubscribe, WearableDriver } from '../ble/types';
import { enqueueDeviceMetricsOffline, flushDeviceMetricQueue } from '../offline/sync';
import { colors, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ConnectDevice'>;

type BleStatus = 'idle' | 'scanning' | 'connecting' | 'listening' | 'error';

interface BleState {
  status: BleStatus;
  samples: NormalizedDeviceSample[];
  errorMessage?: string;
}

type BleEvent =
  | { type: 'SCAN' }
  | { type: 'CONNECTING' }
  | { type: 'LISTENING' }
  | { type: 'SAMPLE'; sample: NormalizedDeviceSample }
  | { type: 'ERROR'; message: string }
  | { type: 'RESET' };

function bleReducer(state: BleState, event: BleEvent): BleState {
  switch (event.type) {
    case 'SCAN':
      return { status: 'scanning', samples: [] };
    case 'CONNECTING':
      return { ...state, status: 'connecting' };
    case 'LISTENING':
      return { ...state, status: 'listening' };
    case 'SAMPLE':
      return { ...state, samples: [...state.samples, event.sample] };
    case 'ERROR':
      return { ...state, status: 'error', errorMessage: event.message };
    case 'RESET':
      return { status: 'idle', samples: [] };
    default:
      return state;
  }
}

const MANUAL_METRICS: Array<{ type: DeviceMetricType; label: string; unit: string }> = [
  { type: 'heart_rate', label: 'Frequência cardíaca', unit: 'bpm' },
  { type: 'steps', label: 'Passos', unit: 'steps' },
  { type: 'active_calories', label: 'Calorias ativas', unit: 'kcal' },
  { type: 'body_temperature', label: 'Temperatura corporal', unit: '°C' },
];

async function syncSamples(connectionId: string, samples: MetricSampleInput[]): Promise<'synced' | 'queued'> {
  try {
    await api.ingestDeviceMetrics(connectionId, samples);
    return 'synced';
  } catch {
    await enqueueDeviceMetricsOffline(connectionId, samples);
    flushDeviceMetricQueue().catch(() => undefined);
    return 'queued';
  }
}

export function ConnectDeviceScreen({ navigation }: Props) {
  const [source, setSource] = useState<'picker' | 'ble' | 'manual'>('picker');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ScreenContainer>
      {source === 'picker' ? (
        <SourcePicker onPick={setSource} />
      ) : source === 'ble' ? (
        <BleHeartRateFlow
          onCancel={() => setSource('picker')}
          saving={saving}
          setSaving={setSaving}
          error={error}
          setError={setError}
          onDone={() => navigation.goBack()}
        />
      ) : (
        <ManualEntryForm
          onCancel={() => setSource('picker')}
          saving={saving}
          setSaving={setSaving}
          error={error}
          setError={setError}
          onDone={() => navigation.goBack()}
        />
      )}
    </ScreenContainer>
  );
}

function SourcePicker({ onPick }: { onPick: (source: 'ble' | 'manual') => void }) {
  return (
    <>
      <Text style={styles.heading}>Conectar dispositivo</Text>
      <Card>
        <Text style={styles.itemTitle}>Cinta de frequência cardíaca (Bluetooth)</Text>
        <Text style={styles.itemBody}>Dispositivos com o perfil padrão Heart Rate Service.</Text>
        <Button title="Conectar via Bluetooth" onPress={() => onPick('ble')} />
      </Card>
      <Card>
        <Text style={styles.itemTitle}>Registro manual</Text>
        <Text style={styles.itemBody}>Digite um valor você mesmo — sem precisar de um dispositivo.</Text>
        <Button title="Adicionar manualmente" variant="secondary" onPress={() => onPick('manual')} />
      </Card>
      <Card>
        <Text style={styles.itemTitle}>Apple Health</Text>
        <Text style={styles.itemBody}>Em breve — requer uma versão do app com build nativo.</Text>
        <StatusPill label="Indisponível nesta versão" tone="neutral" />
      </Card>
      <Card>
        <Text style={styles.itemTitle}>Google Health Connect</Text>
        <Text style={styles.itemBody}>Em breve — requer uma versão do app com build nativo.</Text>
        <StatusPill label="Indisponível nesta versão" tone="neutral" />
      </Card>
    </>
  );
}

interface FlowProps {
  onCancel: () => void;
  onDone: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}

function BleHeartRateFlow({ onCancel, onDone, saving, setSaving, error, setError }: FlowProps) {
  const [state, dispatch] = useReducer(bleReducer, { status: 'idle', samples: [] });
  const registryRef = useRef<WearableDriverRegistry | null>(null);
  const transportRef = useRef<BleTransport | null>(null);
  const driverRef = useRef<WearableDriver | null>(null);
  const stopScanRef = useRef<Unsubscribe | null>(null);
  const stopReadingRef = useRef<Unsubscribe | null>(null);

  if (!registryRef.current) {
    registryRef.current = new WearableDriverRegistry();
    registryRef.current.register(createHeartRateServiceDriver());
  }
  if (!transportRef.current) {
    transportRef.current = new MockBleTransport({
      advertisement: MOCK_HR_ADVERTISEMENT,
      serviceDescriptor: MOCK_HR_SERVICE_DESCRIPTOR,
      generatePayload: () => simulateHeartRatePayload(),
      readingDelayMs: 1000,
      repeatEveryMs: 2000,
    });
  }

  useEffect(
    () => () => {
      stopScanRef.current?.();
      stopReadingRef.current?.();
      driverRef.current?.disconnect(transportRef.current!).catch(() => undefined);
    },
    [],
  );

  function handleStart() {
    dispatch({ type: 'SCAN' });
    stopScanRef.current = transportRef.current!.startScan(async (advertisement) => {
      stopScanRef.current?.();
      const driver = registryRef.current!.findMatchingDriver(advertisement);
      if (!driver) {
        dispatch({ type: 'ERROR', message: 'Nenhum driver compatível encontrado para este dispositivo.' });
        return;
      }
      driverRef.current = driver;
      dispatch({ type: 'CONNECTING' });
      try {
        await driver.connect(transportRef.current!, { deviceIdentifier: advertisement.deviceIdentifier });
        dispatch({ type: 'LISTENING' });
        stopReadingRef.current = driver.onReading(transportRef.current!, (raw) => {
          const normalized = driver.decode(raw);
          if (!normalized) return;
          const validation = driver.validate(normalized);
          if (!validation.ok) return;
          dispatch({ type: 'SAMPLE', sample: normalized });
        });
      } catch {
        dispatch({ type: 'ERROR', message: 'Não foi possível conectar ao dispositivo.' });
      }
    });
  }

  async function handleFinish() {
    stopScanRef.current?.();
    stopReadingRef.current?.();
    await driverRef.current?.disconnect(transportRef.current!);

    if (state.samples.length === 0) {
      onCancel();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const consent = await api.listDeviceConnections();
      let connection = consent.items.find((c) => c.driverId === driverRef.current?.id && c.status === 'active');
      if (!connection) {
        connection = await api.createDeviceConnection({
          sourceType: 'ble_direct',
          driverId: driverRef.current!.id,
          deviceIdentifier: MOCK_HR_ADVERTISEMENT.deviceIdentifier,
        });
      }
      await syncSamples(connection.id, state.samples);
      onDone();
    } catch {
      setError('Não foi possível salvar as leituras agora.');
    } finally {
      setSaving(false);
    }
  }

  const lastBpm = state.samples[state.samples.length - 1]?.value;

  return (
    <>
      <Text style={styles.heading}>Cinta de frequência cardíaca</Text>
      <Card>
        {state.status === 'idle' ? (
          <>
            <Text style={styles.itemBody}>Aproxime a cinta e toque em procurar.</Text>
            <Button title="Procurar" onPress={handleStart} />
          </>
        ) : null}
        {state.status === 'scanning' ? <Text style={styles.itemBody}>Procurando dispositivo…</Text> : null}
        {state.status === 'connecting' ? <Text style={styles.itemBody}>Conectando…</Text> : null}
        {state.status === 'listening' ? (
          <>
            <Text style={styles.bpm}>{lastBpm != null ? `${lastBpm} bpm` : 'Aguardando leitura…'}</Text>
            <Text style={styles.itemBody}>{state.samples.length} leitura(s) coletada(s)</Text>
          </>
        ) : null}
        {state.status === 'error' ? <Text style={styles.errorText}>{state.errorMessage}</Text> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.actionsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} />
          {state.status === 'listening' || state.status === 'error' ? (
            <Button title="Concluir e salvar" onPress={handleFinish} loading={saving} />
          ) : null}
        </View>
      </Card>
    </>
  );
}

function ManualEntryForm({ onCancel, onDone, saving, setSaving, error, setError }: FlowProps) {
  const [metricType, setMetricType] = useState<DeviceMetricType>('heart_rate');
  const [value, setValue] = useState('');

  const metric = MANUAL_METRICS.find((m) => m.type === metricType)!;

  async function handleSubmit() {
    const numeric = Number(value);
    if (!value || Number.isNaN(numeric)) {
      setError('Informe um valor numérico.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const consent = await api.listDeviceConnections();
      let connection = consent.items.find((c) => c.sourceType === 'manual_import' && c.status === 'active');
      if (!connection) {
        connection = await api.createDeviceConnection({ sourceType: 'manual_import' });
      }
      const now = new Date().toISOString();
      await syncSamples(connection.id, [
        { metricType, value: numeric, unit: metric.unit, startedAt: now, endedAt: now },
      ]);
      onDone();
    } catch {
      setError('Não foi possível salvar o registro agora.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Text style={styles.heading}>Registro manual</Text>
      <Card>
        <Text style={styles.itemBody}>Métrica</Text>
        <View style={styles.actionsRow}>
          {MANUAL_METRICS.map((m) => (
            <Button
              key={m.type}
              title={m.label}
              variant={m.type === metricType ? 'primary' : 'secondary'}
              onPress={() => setMetricType(m.type)}
            />
          ))}
        </View>
        <TextField label={`Valor (${metric.unit})`} keyboardType="numeric" value={value} onChangeText={setValue} />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.actionsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onCancel} disabled={saving} />
          <Button title="Salvar" onPress={handleSubmit} loading={saving} />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.subtitle, color: colors.textPrimary },
  itemTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  itemBody: { ...typography.caption, color: colors.textSecondary },
  bpm: { ...typography.title, color: colors.primaryDark },
  errorText: { color: colors.danger, ...typography.caption },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
