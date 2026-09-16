import { ScaleDriverRegistry } from '../registry';
import { createMockScaleDriver, MOCK_ADVERTISEMENT } from '../mockDriver';
import type { BleAdvertisement, ScaleDriver } from '../types';

function fakeDriver(id: string, serviceUuid: string): ScaleDriver {
  return {
    id,
    manufacturer: 'Fabricante Teste',
    model: id,
    protocolVersion: '1.0',
    capabilities: ['weightKg'],
    matches: (advertisement: BleAdvertisement) => advertisement.serviceUuids.includes(serviceUuid),
    connect: async () => undefined,
    disconnect: async () => undefined,
    discoverServices: async () => [],
    onReading: () => () => undefined,
    decode: () => ({}),
    validate: () => ({ ok: true }),
  };
}

describe('ScaleDriverRegistry', () => {
  it('começa vazio — nenhum driver de fabricante real registrado por padrão', () => {
    const registry = new ScaleDriverRegistry();
    expect(registry.listSupported()).toEqual([]);
  });

  it('encontra o driver cujo matches() aceita o anúncio', () => {
    const registry = new ScaleDriverRegistry();
    registry.register(createMockScaleDriver());

    const found = registry.findMatchingDriver(MOCK_ADVERTISEMENT);
    expect(found?.id).toBe('mock-scale-v1');
  });

  it('devolve null quando nenhum driver reconhece o anúncio (dispositivo incompatível)', () => {
    const registry = new ScaleDriverRegistry();
    registry.register(createMockScaleDriver());

    const found = registry.findMatchingDriver({ deviceIdentifier: 'x', serviceUuids: ['0000dead-0000'] });
    expect(found).toBeNull();
  });

  it('usa o primeiro driver registrado que dá match, na ordem de registro', () => {
    const registry = new ScaleDriverRegistry();
    registry.register(fakeDriver('driver-a', 'svc-shared'));
    registry.register(fakeDriver('driver-b', 'svc-shared'));

    const found = registry.findMatchingDriver({ deviceIdentifier: 'x', serviceUuids: ['svc-shared'] });
    expect(found?.id).toBe('driver-a');
  });

  it('listSupported expõe só o descriptor (fabricante/modelo/capacidades), não os métodos do driver', () => {
    const registry = new ScaleDriverRegistry();
    registry.register(createMockScaleDriver());

    const [descriptor] = registry.listSupported();
    expect(descriptor).toEqual({
      id: 'mock-scale-v1',
      manufacturer: 'Bocado (simulação)',
      model: 'Balança de teste',
      protocolVersion: '1.0',
      capabilities: ['weightKg', 'bodyFatPercent', 'muscleMassKg', 'bodyWaterPercent'],
    });
  });
});
