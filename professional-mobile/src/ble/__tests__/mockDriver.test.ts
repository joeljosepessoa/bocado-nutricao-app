import { createMockScaleDriver, encodeMockPayload, MOCK_ADVERTISEMENT, MOCK_SERVICE_DESCRIPTOR } from '../mockDriver';
import { MockBleTransport } from '../mockTransport';
import type { RawScalePayload } from '../types';

function payloadFor(bytesBase64: string): RawScalePayload {
  return {
    deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier,
    serviceUuid: MOCK_SERVICE_DESCRIPTOR.serviceUuid,
    characteristicUuid: MOCK_SERVICE_DESCRIPTOR.characteristicUuids[0],
    bytesBase64,
    capturedAt: new Date().toISOString(),
  };
}

describe('MockScaleDriver — matches/decode/validate', () => {
  it('matches reconhece o anúncio do serviço simulado', () => {
    const driver = createMockScaleDriver();
    expect(driver.matches(MOCK_ADVERTISEMENT)).toBe(true);
    expect(driver.matches({ deviceIdentifier: 'x', serviceUuids: ['0000dead-0000-1000-8000-00805f9b34fb'] })).toBe(
      false,
    );
  });

  it('decode extrai exatamente os campos presentes no payload — nada inventado', () => {
    const driver = createMockScaleDriver();
    const raw = payloadFor(encodeMockPayload({ weightKg: 82.4, bodyFatPercent: 18.2 }));
    const normalized = driver.decode(raw);
    expect(normalized).toEqual({ weightKg: 82.4, bodyFatPercent: 18.2 });
    expect(normalized.muscleMassKg).toBeUndefined();
  });

  it('decode de payload malformado não lança — devolve leitura vazia', () => {
    const driver = createMockScaleDriver();
    const raw = payloadFor('###não-é-base64-válido###');
    expect(() => driver.decode(raw)).not.toThrow();
  });

  it('validate rejeita ausência de peso', () => {
    const driver = createMockScaleDriver();
    const result = driver.validate({ bodyFatPercent: 20 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it('validate rejeita peso implausível', () => {
    const driver = createMockScaleDriver();
    expect(driver.validate({ weightKg: 0 }).ok).toBe(false);
    expect(driver.validate({ weightKg: -5 }).ok).toBe(false);
    expect(driver.validate({ weightKg: 900 }).ok).toBe(false);
  });

  it('validate rejeita %gordura fora de 0-100', () => {
    const driver = createMockScaleDriver();
    expect(driver.validate({ weightKg: 80, bodyFatPercent: 150 }).ok).toBe(false);
  });

  it('validate aceita leitura plausível', () => {
    const driver = createMockScaleDriver();
    expect(driver.validate({ weightKg: 80, bodyFatPercent: 18 }).ok).toBe(true);
  });

  it('driver é sem estado entre instâncias — connect de uma não afeta outra', async () => {
    const transport = new MockBleTransport({
      advertisement: MOCK_ADVERTISEMENT,
      serviceDescriptor: MOCK_SERVICE_DESCRIPTOR,
      generatePayload: () => payloadFor(encodeMockPayload({ weightKg: 80 })),
    });
    const driverA = createMockScaleDriver();
    const driverB = createMockScaleDriver();

    await driverA.connect(transport, { deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier });
    await expect(driverB.discoverServices(transport)).rejects.toThrow();
  });

  it('conecta, descobre serviços e recebe uma leitura via transporte simulado', async () => {
    const transport = new MockBleTransport({
      advertisement: MOCK_ADVERTISEMENT,
      serviceDescriptor: MOCK_SERVICE_DESCRIPTOR,
      generatePayload: () => payloadFor(encodeMockPayload({ weightKg: 79.5 })),
      readingDelayMs: 5,
    });
    const driver = createMockScaleDriver();
    await driver.connect(transport, { deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier });

    const services = await driver.discoverServices(transport);
    expect(services[0].serviceUuid).toBe(MOCK_SERVICE_DESCRIPTOR.serviceUuid);

    const raw = await new Promise<RawScalePayload>((resolve) => {
      driver.onReading(transport, resolve);
    });
    expect(driver.decode(raw).weightKg).toBe(79.5);
  });
});
