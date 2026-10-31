import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScaleEvents } from '../scaleSession';
import type { ScaleResult } from '../icomonProtocol';
import type { ScaleReadingInput } from '../../types/api';

const sessions: Array<{ events: ScaleEvents; profile: unknown; connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];

vi.mock('../scaleSession', () => ({
  bluetoothAvailable: () => true,
  ScaleSession: class {
    deviceName = 'Relaxmedic-2419';
    deviceId = 'dispositivo-1';
    isConnected = true;
    connect = vi.fn(async () => this.events.onConnected(this.deviceName));
    close = vi.fn();
    profile: unknown;
    events: ScaleEvents;
    constructor(profile: unknown, events: ScaleEvents) {
      this.profile = profile;
      this.events = events;
      sessions.push(this as never);
    }
  },
}));

import { ScaleModal } from '../ScaleModal';

const impedance = {
  khz20: { arms: [213.4, 215.5] as [number, number], legs: [194.5, 201.7] as [number, number], trunk: 15 },
  khz100: { arms: [181.1, 181.9] as [number, number], legs: [161.7, 174.2] as [number, number], trunk: 13.9 },
};
const result = (withImpedance: boolean): ScaleResult => ({
  kind: 'result',
  seq: 1,
  measuredAt: new Date(),
  weightKg: 104.05,
  impedance: withImpedance ? impedance : null,
});

beforeEach(() => {
  sessions.length = 0;
});

describe('Balança na avaliação', () => {
  it('conecta com o perfil da avaliação, mostra o peso ao vivo e salva peso + composição + impedâncias', async () => {
    const onSubmit = vi.fn(async (_input: ScaleReadingInput) => {});
    const onClose = vi.fn();
    render(<ScaleModal heightCm={181} age={40} sex="male" onSubmit={onSubmit} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    expect(sessions[0].profile).toEqual({ heightCm: 181, age: 40, sex: 'male' });
    await screen.findByText(/Balança conectada/);

    act(() => sessions[0].events.onLive({ kind: 'live', weightKg: 104.05, stable: true }));
    expect(screen.getByText('104,05 kg')).toBeInTheDocument();
    expect(screen.getByText(/medindo a bioimpedância/)).toBeInTheDocument();

    act(() => sessions[0].events.onResult(result(true), 'aa bb'));
    const table = screen.getByRole('table', { name: 'Resultado da balança' });
    expect(table.textContent).toContain('Gordura corporal');
    expect(table.textContent).toContain('Metabolismo basal');
    for (const label of ['Massa muscular', 'Massa óssea', 'Proteína', 'Peso ideal (IMC 22)']) expect(table.textContent).toContain(label);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar na avaliação' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const input = onSubmit.mock.calls[0][0] as unknown as Record<string, any>;
    expect(input).toMatchObject({ status: 'confirmed', driverId: 'icomon-ffb0', deviceIdentifier: 'Relaxmedic-2419', rawPayload: { resultFrameHex: 'aa bb' } });
    expect(input.idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    expect(input.normalized.weightKg).toBe(104.05);
    expect(input.normalized.bodyFatPercent).toBeGreaterThan(0);
    expect(input.normalized.impedanceData.khz20).toEqual(impedance.khz20);
    expect(input.normalized.visceralFatLevel).toBeUndefined();
    expect(input.normalized.muscleMassKg).toBeGreaterThan(0);
    expect(input.normalized.boneMassKg).toBeGreaterThan(0);
    expect(input.normalized.impedanceData.derived.proteinKg).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });

  it('sem idade ou sexo na avaliação, pede antes de conectar', () => {
    render(<ScaleModal heightCm={170} age={null} sex={null} onSubmit={vi.fn()} onClose={vi.fn()} />);
    const connect = screen.getByRole('button', { name: 'Conectar' });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Idade'), { target: { value: '35' } });
    fireEvent.change(screen.getByLabelText('Sexo'), { target: { value: 'female' } });
    expect(connect).not.toBeDisabled();
    fireEvent.click(connect);
    expect(sessions[0].profile).toEqual({ heightCm: 170, age: 35, sex: 'female' });
  });

  it('sem bioimpedância: avisa, salva só o peso ou descarta', async () => {
    const onSubmit = vi.fn(async (_input: ScaleReadingInput) => {});
    render(<ScaleModal heightCm={181} age={40} sex="male" onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await screen.findByText(/Balança conectada/);
    act(() => sessions[0].events.onResult(result(false), 'cc'));
    expect(screen.getByRole('alert').textContent).toMatch(/só o peso/);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ status: 'discarded' });
    expect(onSubmit.mock.calls[0][0].normalized).toBeUndefined();
  });

  it('"Pesar de novo" com a balança conectada volta a esperar a próxima pesagem', async () => {
    render(<ScaleModal heightCm={181} age={40} sex="male" onSubmit={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
    await screen.findByText(/Balança conectada/);
    act(() => sessions[0].events.onResult(result(true), 'dd'));
    fireEvent.click(screen.getByRole('button', { name: 'Pesar de novo' }));
    expect(screen.getByText(/Balança conectada/)).toBeInTheDocument();
    expect(sessions).toHaveLength(1);
  });
});
