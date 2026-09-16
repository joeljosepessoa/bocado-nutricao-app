import { MockBleTransport, type MockBleTransportOptions } from '../mockTransport';
import { MOCK_HR_ADVERTISEMENT, MOCK_HR_SERVICE_DESCRIPTOR, simulateHeartRatePayload } from '../mockHeartRateDevice';

function makeTransport(overrides: Partial<MockBleTransportOptions> = {}) {
  return new MockBleTransport({
    advertisement: MOCK_HR_ADVERTISEMENT,
    serviceDescriptor: MOCK_HR_SERVICE_DESCRIPTOR,
    generatePayload: () => simulateHeartRatePayload(70),
    discoveryDelayMs: 5,
    readingDelayMs: 5,
    ...overrides,
  });
}

describe('MockBleTransport (mobile)', () => {
  it('startScan descobre o dispositivo simulado', async () => {
    const transport = makeTransport();
    const discovered = await new Promise((resolve) => transport.startScan(resolve));
    expect(discovered).toEqual(MOCK_HR_ADVERTISEMENT);
  });

  it('cancelar o scan impede a descoberta', async () => {
    const transport = makeTransport({ discoveryDelayMs: 10 });
    const onDiscovered = jest.fn();
    const unsubscribe = transport.startScan(onDiscovered);
    unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDiscovered).not.toHaveBeenCalled();
  });

  it('subscribeToReadings só emite depois de connect', async () => {
    const transport = makeTransport();
    const onPayload = jest.fn();
    transport.subscribeToReadings(MOCK_HR_ADVERTISEMENT.deviceIdentifier, onPayload);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(onPayload).not.toHaveBeenCalled();
  });

  it('conecta e recebe leituras repetidas (repeatEveryMs)', async () => {
    const transport = makeTransport({ readingDelayMs: 5, repeatEveryMs: 10 });
    await transport.connect(MOCK_HR_ADVERTISEMENT.deviceIdentifier);

    const received: unknown[] = [];
    const unsubscribe = transport.subscribeToReadings(MOCK_HR_ADVERTISEMENT.deviceIdentifier, (raw) => {
      received.push(raw);
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    unsubscribe();
    expect(received.length).toBeGreaterThan(1);
  });

  it('disconnect impede leituras subsequentes', async () => {
    const transport = makeTransport();
    await transport.connect(MOCK_HR_ADVERTISEMENT.deviceIdentifier);
    await transport.disconnect(MOCK_HR_ADVERTISEMENT.deviceIdentifier);

    const onPayload = jest.fn();
    transport.subscribeToReadings(MOCK_HR_ADVERTISEMENT.deviceIdentifier, onPayload);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(onPayload).not.toHaveBeenCalled();
  });
});
