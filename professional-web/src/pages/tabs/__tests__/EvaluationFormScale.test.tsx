import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as api from '../../../api/endpoints';
import type { ClientDetail, EvaluationDetail } from '../../../types/api';
import type { ScaleEvents } from '../../../scale/scaleSession';
import type { ScaleResult } from '../../../scale/icomonProtocol';

vi.mock('../../../api/endpoints', () => ({
  createEvaluation: vi.fn(),
  updateEvaluation: vi.fn(),
  getEvaluation: vi.fn(),
  generateDraftNote: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  uploadEvaluationPhoto: vi.fn(),
  getEvaluationPhotoUrl: vi.fn(),
  deleteEvaluationPhoto: vi.fn(),
  submitScaleReading: vi.fn(),
}));

const sessions: Array<{ events: ScaleEvents; profile: unknown }> = [];
vi.mock('../../../scale/scaleSession', () => ({
  bluetoothAvailable: () => true,
  ScaleSession: class {
    deviceName = 'Relaxmedic-2419';
    deviceId = 'dispositivo-1';
    isConnected = true;
    profile: unknown;
    events: ScaleEvents;
    constructor(profile: unknown, events: ScaleEvents) {
      this.profile = profile;
      this.events = events;
      sessions.push(this);
    }
    connect = vi.fn(async () => this.events.onConnected(this.deviceName));
    close = vi.fn();
  },
}));

import { EvaluationFormPage } from '../EvaluationFormPage';

const pad = (n: number) => String(n).padStart(2, '0');
const today = new Date();
const birthDate40 = `${today.getFullYear() - 40}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

function renderNew() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const client = { birthDate: birthDate40, gender: 'masculino' } as Partial<ClientDetail>;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/clients/client-1/evaluations/new']}>
        <Routes>
          <Route path="/clients/:clientId" element={<Outlet context={{ client }} />}>
            <Route path="evaluations/new" element={<EvaluationFormPage />} />
            <Route path="evaluations/:evaluationId" element={<div>detalhe</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const result = (withImpedance: boolean): ScaleResult => ({
  kind: 'result',
  seq: 1,
  measuredAt: new Date(),
  weightKg: 104.05,
  impedance: withImpedance
    ? {
        khz20: { arms: [213.4, 215.5], legs: [194.5, 201.7], trunk: 15 },
        khz100: { arms: [181.1, 181.9], legs: [161.7, 174.2], trunk: 13.9 },
      }
    : null,
});

async function weigh(withImpedance: boolean) {
  fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '181' } });
  fireEvent.click(screen.getByRole('button', { name: 'Conectar balança' }));
  fireEvent.click(screen.getByRole('button', { name: 'Conectar' }));
  await screen.findByText(/Balança conectada/);
  await act(async () => sessions[0].events.onResult(result(withImpedance), 'aa bb'));
}

const valueOf = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

describe('Avaliação — balança no quadro Bioimpedância', () => {
  beforeEach(() => {
    sessions.length = 0;
    sessionStorage.clear();
    vi.clearAllMocks();
    vi.mocked(api.createEvaluation).mockResolvedValue({ id: 'eval-1' } as EvaluationDetail);
    vi.mocked(api.submitScaleReading).mockResolvedValue(undefined);
  });
  afterEach(() => cleanup());

  it('a leitura completa preenche sozinha peso, equipamento e bioimpedância, e vai junto ao salvar', async () => {
    renderNew();
    await weigh(true);

    expect(sessions[0].profile).toEqual({ heightCm: 181, age: 40, sex: 'male' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(valueOf('Peso (kg)')).toBe('104.05');
    expect(valueOf('Equipamento')).toBe('Relaxmedic-2419');
    expect(Number(valueOf('Gordura corporal (%)'))).toBeGreaterThan(0);
    expect(Number(valueOf('Músculo esquelético (kg)'))).toBeGreaterThan(0);
    expect(Number(valueOf('Água corporal (%)'))).toBeGreaterThan(0);
    expect(Number(valueOf('Massa muscular (kg)'))).toBeGreaterThan(Number(valueOf('Músculo esquelético (kg)')));
    expect(Number(valueOf('Massa óssea (kg)'))).toBeGreaterThan(0);
    expect(Number(valueOf('Metabolismo basal (kcal)'))).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toMatch(/preenchidos pela balança/);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.submitScaleReading).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.createEvaluation).mock.calls[0][1];
    expect(payload.weightKg).toBe(104.05);
    expect(payload.bioimpedance).toMatchObject({ equipment: 'Relaxmedic-2419' });
    const [clientId, evaluationId, reading] = vi.mocked(api.submitScaleReading).mock.calls[0];
    expect([clientId, evaluationId]).toEqual(['client-1', 'eval-1']);
    expect(reading).toMatchObject({ status: 'confirmed', driverId: 'icomon-ffb0' });
    expect(reading.normalized?.impedanceData).toBeDefined();
  });

  it('valor corrigido depois da balança: salva o que foi digitado, sem a marca de balança conectada', async () => {
    renderNew();
    await weigh(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Gordura corporal (%)'), { target: { value: '23.3' } });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.createEvaluation).toHaveBeenCalled());
    expect(vi.mocked(api.createEvaluation).mock.calls[0][1].bioimpedance).toMatchObject({ bodyFatPercent: 23.3 });
    expect(api.submitScaleReading).not.toHaveBeenCalled();
  });

  it('sem bioimpedância, a janela avisa e só preenche o peso se o profissional escolher', async () => {
    renderNew();
    await weigh(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(valueOf('Peso (kg)')).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Usar só o peso' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(valueOf('Peso (kg)')).toBe('104.05');
    expect(valueOf('Gordura corporal (%)')).toBe('');
    expect(screen.getByRole('status').textContent).toMatch(/sem bioimpedância/);
  });

  it('"Descartar" na avaliação nova só fecha a janela, sem gravar nada', async () => {
    renderNew();
    await weigh(false);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.submitScaleReading).not.toHaveBeenCalled();
    expect(valueOf('Peso (kg)')).toBe('');
  });
});
