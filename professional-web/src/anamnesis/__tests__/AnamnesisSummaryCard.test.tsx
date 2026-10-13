import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { AnamnesisContent, AnamnesisView } from '../../types/api';
import { AnamnesisSummaryCard } from '../AnamnesisSummaryCard';
import { summaryRows } from '../options';

vi.mock('../../api/endpoints', () => ({
  getAnamnesis: vi.fn(),
  saveAnamnesis: vi.fn(),
}));

const blank: AnamnesisContent = {
  maritalStatus: null,
  cpf: null,
  rg: null,
  occupation: null,
  address: null,
  goals: [],
  goalDescription: null,
  conditions: [],
  otherConditions: null,
  medications: [],
  supplements: [],
  hormones: [],
  surgeries: null,
  allergies: null,
  familyHistory: [],
  smoking: null,
  alcohol: null,
  waterIntake: null,
  sleepHours: null,
  sleepQuality: null,
  stressLevel: null,
  bowelFrequency: null,
  trainingFrequency: null,
  trainingDuration: null,
  trainingModality: null,
  cardio: null,
  dailySteps: null,
  mealsPerDay: null,
  mealTimes: null,
  foodPreferences: null,
  intolerances: null,
  restrictions: null,
  aversions: null,
  notes: null,
};

const view = (content: Partial<AnamnesisContent> = {}, extra: Partial<AnamnesisView['anamnesis']> = {}): AnamnesisView => ({
  client: { id: 'c1', fullName: 'Paciente Exemplo', email: 'paciente@example.com', birthDate: null, gender: null, phone: null },
  anamnesis: { ...blank, ...content, completedAt: null, updatedAt: null, ...extra },
});

const filled: Partial<AnamnesisContent> = {
  goals: ['weight_loss', 'health'],
  goalDescription: 'Perder 8 kg até dezembro',
  conditions: ['hypertension', 'gastritis'],
  otherConditions: 'Enxaqueca',
  allergies: 'Camarão',
  medications: [
    { name: 'Losartana', dosage: '50 mg', frequency: '1x ao dia' },
    { name: 'Omeprazol', dosage: null, frequency: null },
  ],
  supplements: [{ name: 'Creatina', dosage: '3 g', frequency: null }],
  intolerances: 'Lactose',
  restrictions: 'Não come carne vermelha',
  familyHistory: ['diabetes'],
  occupation: 'Professora',
  sleepHours: '6',
};

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AnamnesisSummaryCard clientId="c1" />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('summaryRows — o que entra no resumo', () => {
  it('ficha em branco não gera nenhuma linha', () => {
    expect(summaryRows({ ...blank })).toEqual([]);
  });

  it('traz só o que foi preenchido, com os rótulos das opções e na ordem da consulta', () => {
    expect(summaryRows({ ...blank, ...filled })).toEqual([
      { label: 'Objetivo', value: 'Emagrecimento, Saúde — Perder 8 kg até dezembro' },
      { label: 'Patologias', value: 'Hipertensão, Gastrite — Enxaqueca', alert: true },
      { label: 'Alergias', value: 'Camarão', alert: true },
      { label: 'Medicamentos', value: 'Losartana (50 mg, 1x ao dia); Omeprazol' },
      { label: 'Suplementos', value: 'Creatina (3 g)' },
      { label: 'Intolerâncias', value: 'Lactose' },
      { label: 'Restrições', value: 'Não come carne vermelha' },
      { label: 'Histórico familiar', value: 'Diabetes' },
    ]);
  });

  it('texto livre sozinho aparece sem o travessão', () => {
    expect(summaryRows({ ...blank, goalDescription: '  Melhorar os exames  ', otherConditions: 'Enxaqueca' })).toEqual([
      { label: 'Objetivo', value: 'Melhorar os exames' },
      { label: 'Patologias', value: 'Enxaqueca', alert: true },
    ]);
  });
});

describe('Resumo da anamnese na ficha do paciente', () => {
  it('sem ficha: avisa que não foi preenchida e oferece preencher', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue(view());
    renderCard();

    expect(await screen.findByText('Ainda não preenchida')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preencher anamnese' })).toBeInTheDocument();
    expect(screen.queryByText('Objetivo')).not.toBeInTheDocument();
  });

  it('ficha em andamento: mostra o que já foi informado', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue(view(filled, { updatedAt: '2026-10-12T15:00:00.000Z' }));
    renderCard();

    expect(await screen.findByText('Em andamento')).toBeInTheDocument();
    expect(screen.getByText('Emagrecimento, Saúde — Perder 8 kg até dezembro')).toBeInTheDocument();
    expect(screen.getByText('Hipertensão, Gastrite — Enxaqueca')).toBeInTheDocument();
    expect(screen.getByText('Camarão')).toBeInTheDocument();
    expect(screen.getByText('Losartana (50 mg, 1x ao dia); Omeprazol')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir anamnese' })).toBeInTheDocument();
    // O que não é do resumo (profissão, sono) fica só na ficha completa.
    expect(screen.queryByText('Professora')).not.toBeInTheDocument();
  });

  it('ficha concluída: mostra a data de conclusão', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue(view(filled, { updatedAt: '2026-10-12T15:00:00.000Z', completedAt: '2026-10-12T15:00:00.000Z' }));
    renderCard();

    expect(await screen.findByText('Concluída em 12/10/2026')).toBeInTheDocument();
  });

  it('ficha iniciada sem nenhum dos itens do resumo: diz isso em vez de ficar vazia', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue(view({ occupation: 'Professora' }, { updatedAt: '2026-10-12T15:00:00.000Z' }));
    renderCard();

    expect(await screen.findByText(/Nenhum objetivo, patologia, alergia, medicamento ou restrição informado/)).toBeInTheDocument();
  });

  it('falha ao carregar: avisa, sem derrubar a página', async () => {
    vi.mocked(api.getAnamnesis).mockRejectedValue(new Error('falhou'));
    renderCard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a anamnese.');
  });

  it('o botão abre a ficha completa e, ao fechar, o resumo é recarregado', async () => {
    vi.mocked(api.getAnamnesis).mockResolvedValue(view());
    renderCard();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Preencher anamnese' }));
    expect(await screen.findByText('Anamnese — Paciente Exemplo')).toBeInTheDocument();

    vi.mocked(api.getAnamnesis).mockResolvedValue(view({ allergies: 'Camarão' }, { updatedAt: '2026-10-12T15:00:00.000Z' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    await waitFor(() => expect(screen.queryByText('Anamnese — Paciente Exemplo')).not.toBeInTheDocument());
    expect(await screen.findByText('Camarão')).toBeInTheDocument();
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
  });
});
