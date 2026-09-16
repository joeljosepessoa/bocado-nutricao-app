import React, { useEffect, useReducer, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as api from '../api/endpoints';
import type { ConfirmScaleReadingInput, NormalizedScaleReading as ReadingFields } from '../types/api';
import { ScreenContainer } from '../components/ScreenContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { ScaleDriverRegistry } from '../ble/registry';
import { MockBleTransport } from '../ble/mockTransport';
import { createMockScaleDriver, MOCK_ADVERTISEMENT, MOCK_SERVICE_DESCRIPTOR, encodeMockPayload } from '../ble/mockDriver';
import { simulateReading } from '../ble/simulateReading';
import { buildIdempotencyKey } from '../ble/idempotency';
import { initialScaleFlowState, scaleFlowReducer } from '../ble/stateMachine';
import type { BleTransport, ScaleDriver, ScaleDriverDescriptor, Unsubscribe } from '../ble/types';
import { enqueueScaleReadingOffline, flushScaleReadingQueue } from '../offline/sync';
import { colors, spacing, typography } from '../theme/tokens';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScaleConnect'>;

const FIELD_LABELS: Record<keyof ReadingFields, string> = {
  weightKg: 'Peso',
  bodyFatPercent: '% de gordura',
  fatMassKg: 'Massa gorda',
  leanMassKg: 'Massa magra',
  skeletalMuscleMassKg: 'Massa muscular esquelética',
  muscleMassKg: 'Massa muscular',
  bodyWaterPercent: 'Água corporal',
  visceralFatLevel: 'Gordura visceral',
  basalMetabolicRateKcal: 'Metabolismo basal',
  bodyAgeYears: 'Idade corporal',
  boneMassKg: 'Massa óssea',
  segmentalData: 'Dados por segmento',
  impedanceData: 'Impedância (bruta)',
};

function descriptorOf(driver: ScaleDriver): ScaleDriverDescriptor {
  const { id, manufacturer, model, protocolVersion, capabilities } = driver;
  return { id, manufacturer, model, protocolVersion, capabilities };
}

function isNetworkError(error: unknown): boolean {
  return !(error as { response?: unknown } | undefined)?.response;
}

export function ScaleConnectScreen({ route }: Props) {
  const { clientId, evaluationId } = route.params;
  const [state, dispatch] = useReducer(scaleFlowReducer, initialScaleFlowState);

  const registryRef = useRef<ScaleDriverRegistry | null>(null);
  const transportRef = useRef<BleTransport | null>(null);
  const driverRef = useRef<ScaleDriver | null>(null);
  const stopScanRef = useRef<Unsubscribe | null>(null);
  const stopReadingRef = useRef<Unsubscribe | null>(null);

  if (!registryRef.current) {
    registryRef.current = new ScaleDriverRegistry();
    registryRef.current.register(createMockScaleDriver());
  }
  if (!transportRef.current) {
    transportRef.current = new MockBleTransport({
      advertisement: MOCK_ADVERTISEMENT,
      serviceDescriptor: MOCK_SERVICE_DESCRIPTOR,
      generatePayload: () => ({
        deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier,
        serviceUuid: MOCK_SERVICE_DESCRIPTOR.serviceUuid,
        characteristicUuid: MOCK_SERVICE_DESCRIPTOR.characteristicUuids[0],
        bytesBase64: encodeMockPayload(simulateReading()),
        capturedAt: new Date().toISOString(),
      }),
    });
  }

  useEffect(
    () => () => {
      stopScanRef.current?.();
      stopReadingRef.current?.();
    },
    [],
  );

  function beginAwaitingReading(driver: ScaleDriver) {
    dispatch({ type: 'AWAITING_READING' });
    stopReadingRef.current = driver.onReading(transportRef.current!, (raw) => {
      const normalized = driver.decode(raw);
      const validation = driver.validate(normalized);
      if (!validation.ok) {
        dispatch({ type: 'READING_INVALID', message: validation.reason ?? 'Leitura inválida.' });
        return;
      }
      dispatch({ type: 'READING_RECEIVED', rawPayload: raw, normalized });
    });
  }

  function handleStartScan() {
    dispatch({ type: 'START_SCAN' });
    stopScanRef.current = transportRef.current!.startScan(async (advertisement) => {
      stopScanRef.current?.();
      const driver = registryRef.current!.findMatchingDriver(advertisement);
      if (!driver) {
        dispatch({ type: 'DEVICE_INCOMPATIBLE' });
        return;
      }
      driverRef.current = driver;
      dispatch({ type: 'DEVICE_DISCOVERED', advertisement, driver: descriptorOf(driver) });
      try {
        await driver.connect(transportRef.current!, { deviceIdentifier: advertisement.deviceIdentifier });
        dispatch({ type: 'CONNECTED' });
        beginAwaitingReading(driver);
      } catch {
        dispatch({ type: 'CONNECT_FAILED', message: 'Não foi possível conectar ao dispositivo.' });
      }
    });
  }

  function handleReconnect() {
    dispatch({ type: 'RECONNECT' });
    handleStartScan();
  }

  function handleReset() {
    stopScanRef.current?.();
    stopReadingRef.current?.();
    driverRef.current?.disconnect(transportRef.current!).catch(() => undefined);
    driverRef.current = null;
    dispatch({ type: 'RESET' });
  }

  async function submitReading(status: 'confirmed' | 'discarded') {
    if (!state.rawPayload || !state.driver) {
      return;
    }
    const idempotencyKey = await buildIdempotencyKey({
      deviceIdentifier: state.rawPayload.deviceIdentifier,
      driverId: state.driver.id,
      bytesBase64: state.rawPayload.bytesBase64,
      recordedAt: state.rawPayload.capturedAt,
    });
    const payload: ConfirmScaleReadingInput = {
      status,
      driverId: state.driver.id,
      deviceIdentifier: state.rawPayload.deviceIdentifier,
      protocolVersion: state.driver.protocolVersion,
      recordedAt: state.rawPayload.capturedAt,
      idempotencyKey,
      rawPayload: { bytesBase64: state.rawPayload.bytesBase64 },
      normalized: status === 'confirmed' ? state.normalized : undefined,
    };

    if (status === 'discarded') {
      // Descartar é instantâneo na tela — o registro (para auditoria) sai
      // em segundo plano pela mesma fila offline do confirmar, sem travar
      // o profissional esperando rede.
      dispatch({ type: 'DISCARD' });
      enqueueScaleReadingOffline(clientId, evaluationId, payload)
        .then(() => flushScaleReadingQueue())
        .catch(() => undefined);
      return;
    }

    dispatch({ type: 'CONFIRM' });
    try {
      const result = await api.confirmScaleReading(clientId, evaluationId, payload);
      dispatch({ type: 'CONFIRM_SUCCEEDED', readingId: result.id });
    } catch (error) {
      if (isNetworkError(error)) {
        await enqueueScaleReadingOffline(clientId, evaluationId, payload);
        dispatch({ type: 'CONFIRM_QUEUED_OFFLINE' });
        flushScaleReadingQueue().catch(() => undefined);
      } else {
        dispatch({ type: 'CONFIRM_FAILED', message: 'O servidor recusou esta leitura.' });
      }
    }
  }

  return (
    <ScreenContainer>
      <StatusRow status={state.status} />

      {state.status === 'idle' ? (
        <Card>
          <Text style={styles.hint}>Aproxime o cliente da balança e toque em procurar.</Text>
          <Button title="Procurar balanças" onPress={handleStartScan} />
          <SupportedDrivers registry={registryRef.current} />
        </Card>
      ) : null}

      {state.status === 'scanning' ? (
        <Card>
          <Text style={styles.hint}>Procurando dispositivos por perto…</Text>
        </Card>
      ) : null}

      {state.status === 'incompatible' ? (
        <Card>
          <Text style={styles.errorText}>Nenhum driver compatível reconheceu este dispositivo.</Text>
          <Button title="Procurar novamente" onPress={handleStartScan} />
        </Card>
      ) : null}

      {state.status === 'connecting' ? (
        <Card>
          <Text style={styles.hint}>Conectando a {state.advertisement?.localName ?? state.driver?.model}…</Text>
          {state.advertisement?.rssi != null ? (
            <Text style={styles.caption}>Sinal: {state.advertisement.rssi} dBm</Text>
          ) : null}
        </Card>
      ) : null}

      {state.status === 'connected' || state.status === 'awaitingReading' ? (
        <Card>
          <Text style={styles.deviceName}>{state.driver?.manufacturer} — {state.driver?.model}</Text>
          <Text style={styles.hint}>
            {state.status === 'awaitingReading' ? 'Aguardando leitura — peça para o cliente subir na balança.' : 'Dispositivo conectado.'}
          </Text>
        </Card>
      ) : null}

      {state.status === 'reviewing' && state.normalized ? (
        <Card>
          <Text style={styles.deviceName}>Leitura recebida</Text>
          {(Object.keys(state.normalized) as Array<keyof ReadingFields>)
            .filter((key) => state.normalized![key] != null && key !== 'segmentalData' && key !== 'impedanceData')
            .map((key) => (
              <View key={key} style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
                <Text style={styles.fieldValue}>{String(state.normalized![key])}</Text>
              </View>
            ))}
          <View style={styles.actionsRow}>
            <Button title="Descartar" variant="secondary" onPress={() => submitReading('discarded')} />
            <Button title="Confirmar" onPress={() => submitReading('confirmed')} />
          </View>
        </Card>
      ) : null}

      {state.status === 'syncing' ? (
        <Card>
          <Text style={styles.hint}>Enviando leitura confirmada…</Text>
        </Card>
      ) : null}

      {state.status === 'queuedOffline' ? (
        <Card>
          <Text style={styles.hint}>Sem conexão agora — a leitura foi salva no aparelho e será enviada assim que a rede voltar.</Text>
          <Button title="Concluir" onPress={handleReset} />
        </Card>
      ) : null}

      {state.status === 'confirmed' ? (
        <Card>
          <Text style={styles.successText}>Leitura aplicada à avaliação como dado oficial de bioimpedância.</Text>
          <Button title="Concluir" onPress={handleReset} />
        </Card>
      ) : null}

      {state.status === 'error' ? (
        <Card>
          <Text style={styles.errorText}>{state.errorMessage ?? 'Ocorreu um erro.'}</Text>
          <Button title="Tentar novamente" onPress={handleStartScan} />
        </Card>
      ) : null}

      {state.status === 'disconnected' ? (
        <Card>
          <Text style={styles.errorText}>Conexão com a balança foi perdida.</Text>
          <Button title="Reconectar" onPress={handleReconnect} />
        </Card>
      ) : null}
    </ScreenContainer>
  );
}

function StatusRow({ status }: { status: string }) {
  const label: Record<string, string> = {
    idle: 'Pronto',
    scanning: 'Procurando',
    incompatible: 'Dispositivo incompatível',
    connecting: 'Conectando',
    connected: 'Conectado',
    awaitingReading: 'Aguardando leitura',
    reviewing: 'Revisar leitura',
    syncing: 'Enviando',
    queuedOffline: 'Salvo offline',
    confirmed: 'Confirmado',
    discarded: 'Descartado',
    disconnected: 'Desconectado',
    error: 'Erro',
  };
  const tone =
    status === 'confirmed'
      ? 'success'
      : status === 'error' || status === 'incompatible' || status === 'disconnected'
        ? 'danger'
        : status === 'idle'
          ? 'neutral'
          : 'progress';
  return <StatusPill label={label[status] ?? status} tone={tone} />;
}

function SupportedDrivers({ registry }: { registry: ScaleDriverRegistry | null }) {
  const supported = registry?.listSupported() ?? [];
  if (supported.length === 0) {
    return <Text style={styles.caption}>Nenhum driver de fabricante real cadastrado ainda.</Text>;
  }
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.caption}>Balanças suportadas:</Text>
      {supported.map((driver) => (
        <Text key={driver.id} style={styles.caption}>
          • {driver.manufacturer} — {driver.model}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { ...typography.body, color: colors.textSecondary },
  caption: { ...typography.caption, color: colors.textSecondary },
  deviceName: { ...typography.subtitle, color: colors.textPrimary },
  errorText: { ...typography.body, color: colors.danger },
  successText: { ...typography.body, color: colors.success },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  fieldLabel: { ...typography.caption, color: colors.textSecondary },
  fieldValue: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
});
