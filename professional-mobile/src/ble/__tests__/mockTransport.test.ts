import { MockBleTransport, type MockBleTransportOptions } from '../mockTransport';
import { MOCK_ADVERTISEMENT, MOCK_SERVICE_DESCRIPTOR, encodeMockPayload } from '../mockDriver';

function makeTransport(overrides: Partial<MockBleTransportOptions> = {}) {
  return new MockBleTransport({
    advertisement: MOCK_ADVERTISEMENT,
    serviceDescriptor: MOCK_SERVICE_DESCRIPTOR,
    generatePayload: () => ({
      deviceIdentifier: MOCK_ADVERTISEMENT.deviceIdentifier,
      serviceUuid: MOCK_SERVICE_DESCRIPTOR.serviceUuid,
      characteristicUuid: MOCK_SERVICE_DESCRIPTOR.characteristicUuids[0],
      bytesBase64: encodeMockPayload({ weightKg: 81 }),
      capturedAt: new Date().toISOString(),
    }),
    discoveryDelayMs: 5,
    readingDelayMs: 5,
    ...overrides,
  });
}

describe('MockBleTransport', () => {
  it('startScan descobre o dispositivo simulado depois do atraso configurado', async () => {
    const transport = makeTransport();
    const discovered = await new Promise((resolve) => transport.startScan(resolve));
    expect(discovered).toEqual(MOCK_ADVERTISEMENT);
  });

  it('cancelar o scan (Unsubscribe) impede a descoberta', async () => {
    const transport = makeTransport({ discoveryDelayMs: 10 });
    const onDiscovered = jest.fn();
    const unsubscribe = transport.startScan(onDiscovered);
    unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDiscovered).not.toHaveBeenCalled();
  });

  it('discoverServices devolve o serviço configurado', async () => {
    const transport = makeTransport();
    const services = await transport.discoverServices(MOCK_ADVERTISEMENT.deviceIdentifier);
    expect(services).toEqual([MOCK_SERVICE_DESCRIPTOR]);
  });

  it('subscribeToReadings só emite depois de connect — dispositivo desconectado não recebe leitura', async () => {
    const transport = makeTransport();
    const onPayload = jest.fn();
    transport.subscribeToReadings(MOCK_ADVERTISEMENT.deviceIdentifier, onPayload);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(onPayload).not.toHaveBeenCalled();
  });

  it('conecta e recebe uma leitura simulada', async () => {
    const transport = makeTransport();
    await transport.connect(MOCK_ADVERTISEMENT.deviceIdentifier);

    const raw = await new Promise((resolve) => {
      transport.subscribeToReadings(MOCK_ADVERTISEMENT.deviceIdentifier, resolve);
    });
    expect((raw as { deviceIdentifier: string }).deviceIdentifier).toBe(MOCK_ADVERTISEMENT.deviceIdentifier);
  });

  it('disconnect impede leituras subsequentes', async () => {
    const transport = makeTransport();
    await transport.connect(MOCK_ADVERTISEMENT.deviceIdentifier);
    await transport.disconnect(MOCK_ADVERTISEMENT.deviceIdentifier);

    const onPayload = jest.fn();
    transport.subscribeToReadings(MOCK_ADVERTISEMENT.deviceIdentifier, onPayload);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(onPayload).not.toHaveBeenCalled();
  });
});
