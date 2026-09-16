import { createHeartRateServiceDriver, decodeHeartRateMeasurementBytes } from '../heartRateServiceDriver';
import { MockBleTransport } from '../mockTransport';
import {
  MOCK_HR_ADVERTISEMENT,
  MOCK_HR_SERVICE_DESCRIPTOR,
  simulateHeartRatePayload,
} from '../mockHeartRateDevice';
import { bytesToBase64 } from '../base64';
import type { RawDevicePayload } from '../types';

function payload(bytes: number[]): RawDevicePayload {
  return {
    deviceIdentifier: MOCK_HR_ADVERTISEMENT.deviceIdentifier,
    serviceUuid: MOCK_HR_SERVICE_DESCRIPTOR.serviceUuid,
    characteristicUuid: MOCK_HR_SERVICE_DESCRIPTOR.characteristicUuids[0],
    bytesBase64: bytesToBase64(bytes),
    capturedAt: new Date().toISOString(),
  };
}

describe('decodeHeartRateMeasurementBytes — formato oficial do characteristic 0x2A37', () => {
  it('decodifica HR de 8 bits com contato detectado', () => {
    // flags: bit0=0 (8-bit), bits1-2=11 (contato suportado e detectado)
    const result = decodeHeartRateMeasurementBytes([0b00000110, 72]);
    expect(result).toEqual({ bpm: 72, sensorContactSupported: true, sensorContactDetected: true });
  });

  it('decodifica HR de 16 bits (little-endian)', () => {
    // flags: bit0=1 (16-bit)
    const result = decodeHeartRateMeasurementBytes([0b00000001, 0xc8, 0x00]); // 200 bpm
    expect(result?.bpm).toBe(200);
  });

  it('reconhece contato suportado mas não detectado', () => {
    const result = decodeHeartRateMeasurementBytes([0b00000100, 80]); // bits1-2 = 10
    expect(result?.sensorContactSupported).toBe(true);
    expect(result?.sensorContactDetected).toBe(false);
  });

  it('reconhece dispositivo sem suporte a status de contato', () => {
    const result = decodeHeartRateMeasurementBytes([0b00000000, 65]);
    expect(result?.sensorContactSupported).toBe(false);
  });

  it('devolve null para pacote vazio ou curto demais', () => {
    expect(decodeHeartRateMeasurementBytes([])).toBeNull();
    expect(decodeHeartRateMeasurementBytes([0b00000001, 0x48])).toBeNull(); // 16-bit mas falta o segundo byte
  });
});

describe('HeartRateServiceDriver', () => {
  it('matches reconhece o serviço 0x180D', () => {
    const driver = createHeartRateServiceDriver();
    expect(driver.matches(MOCK_HR_ADVERTISEMENT)).toBe(true);
    expect(driver.matches({ deviceIdentifier: 'x', serviceUuids: ['0000dead-0000-1000-8000-00805f9b34fb'] })).toBe(
      false,
    );
  });

  it('decode produz uma amostra heart_rate instantânea', () => {
    const driver = createHeartRateServiceDriver();
    const sample = driver.decode(payload([0b00000110, 68]));
    expect(sample).toEqual({
      metricType: 'heart_rate',
      value: 68,
      unit: 'bpm',
      startedAt: expect.any(String),
      endedAt: expect.any(String),
    });
    expect(sample?.startedAt).toBe(sample?.endedAt);
  });

  it('decode devolve null quando o sensor não detecta contato — não fabrica leitura', () => {
    const driver = createHeartRateServiceDriver();
    const sample = driver.decode(payload([0b00000100, 80]));
    expect(sample).toBeNull();
  });

  it('validate rejeita FC fora de faixa plausível', () => {
    const driver = createHeartRateServiceDriver();
    expect(driver.validate({ metricType: 'heart_rate', value: 10, unit: 'bpm', startedAt: '', endedAt: '' }).ok).toBe(
      false,
    );
    expect(
      driver.validate({ metricType: 'heart_rate', value: 300, unit: 'bpm', startedAt: '', endedAt: '' }).ok,
    ).toBe(false);
  });

  it('validate aceita FC plausível', () => {
    const driver = createHeartRateServiceDriver();
    expect(
      driver.validate({ metricType: 'heart_rate', value: 75, unit: 'bpm', startedAt: '', endedAt: '' }).ok,
    ).toBe(true);
  });

  it('conecta, descobre serviço e recebe leitura via transporte simulado', async () => {
    const transport = new MockBleTransport({
      advertisement: MOCK_HR_ADVERTISEMENT,
      serviceDescriptor: MOCK_HR_SERVICE_DESCRIPTOR,
      generatePayload: () => simulateHeartRatePayload(70),
      readingDelayMs: 5,
    });
    const driver = createHeartRateServiceDriver();
    await driver.connect(transport, { deviceIdentifier: MOCK_HR_ADVERTISEMENT.deviceIdentifier });

    const services = await driver.discoverServices(transport);
    expect(services[0].serviceUuid).toBe(MOCK_HR_SERVICE_DESCRIPTOR.serviceUuid);

    const raw = await new Promise<RawDevicePayload>((resolve) => driver.onReading(transport, resolve));
    expect(driver.decode(raw)?.value).toBe(70);
  });

  it('driver é sem estado entre instâncias', async () => {
    const transport = new MockBleTransport({
      advertisement: MOCK_HR_ADVERTISEMENT,
      serviceDescriptor: MOCK_HR_SERVICE_DESCRIPTOR,
      generatePayload: () => simulateHeartRatePayload(70),
    });
    const driverA = createHeartRateServiceDriver();
    const driverB = createHeartRateServiceDriver();
    await driverA.connect(transport, { deviceIdentifier: MOCK_HR_ADVERTISEMENT.deviceIdentifier });
    await expect(driverB.discoverServices(transport)).rejects.toThrow();
  });
});
