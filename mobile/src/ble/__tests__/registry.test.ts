import { WearableDriverRegistry } from '../registry';
import { createHeartRateServiceDriver } from '../heartRateServiceDriver';
import { MOCK_HR_ADVERTISEMENT } from '../mockHeartRateDevice';
import type { BleAdvertisement, WearableDriver } from '../types';

function fakeDriver(id: string, serviceUuid: string): WearableDriver {
  return {
    id,
    manufacturer: 'Fabricante Teste',
    model: id,
    protocolVersion: '1.0',
    capabilities: ['heart_rate'],
    matches: (advertisement: BleAdvertisement) => advertisement.serviceUuids.includes(serviceUuid),
    connect: async () => undefined,
    disconnect: async () => undefined,
    discoverServices: async () => [],
    onReading: () => () => undefined,
    decode: () => null,
    validate: () => ({ ok: true }),
  };
}

describe('WearableDriverRegistry — instância independente do ScaleDriverRegistry', () => {
  it('começa vazio', () => {
    const registry = new WearableDriverRegistry();
    expect(registry.listSupported()).toEqual([]);
  });

  it('encontra o driver de Heart Rate Service pelo anúncio', () => {
    const registry = new WearableDriverRegistry();
    registry.register(createHeartRateServiceDriver());

    const found = registry.findMatchingDriver(MOCK_HR_ADVERTISEMENT);
    expect(found?.id).toBe('heart-rate-service-v1');
  });

  it('devolve null para dispositivo incompatível', () => {
    const registry = new WearableDriverRegistry();
    registry.register(createHeartRateServiceDriver());

    const found = registry.findMatchingDriver({ deviceIdentifier: 'x', serviceUuids: ['0000dead-0000'] });
    expect(found).toBeNull();
  });

  it('usa o primeiro driver registrado que dá match', () => {
    const registry = new WearableDriverRegistry();
    registry.register(fakeDriver('driver-a', 'svc-shared'));
    registry.register(fakeDriver('driver-b', 'svc-shared'));

    const found = registry.findMatchingDriver({ deviceIdentifier: 'x', serviceUuids: ['svc-shared'] });
    expect(found?.id).toBe('driver-a');
  });
});
