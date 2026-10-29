import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { CustomForm, FormQuestion, FormResponse } from '../../types/api';
import { FormEditorPage } from '../FormEditorPage';
import { FormFillPage } from '../FormFillPage';
import { answerText, changeType, formProblems, missingRequired, starterQuestions } from '../formModel';

vi.mock('../../api/endpoints', () => ({
  getForm: vi.fn(),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  getFormResponse: vi.fn(),
  createFormResponse: vi.fn(),
  updateFormResponse: vi.fn(),
  deleteFormResponse: vi.fn(),
}));

const QUESTIONS: FormQuestion[] = [
  { id: 'fome', type: 'scale', label: 'Fome durante a semana', help: '0 = nenhuma, 10 = muita', required: true },
  { id: 'peso', type: 'number', label: 'Peso em casa', unit: 'kg', required: false },
  { id: 'treinou', type: 'yes_no', label: 'Treinou?', required: false },
  { id: 'dif', type: 'multiple_choice', label: 'Dificuldades', options: ['Doces', 'Tempo', 'Fim de semana'], required: false },
];

const form: CustomForm = { id: 'f1', name: 'Check-in semanal', description: null, questions: QUESTIONS, deletedAt: null, createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z' };

function renderAt(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/formularios" element={<div>lista</div>} />
          <Route path="/formularios/novo" element={<FormEditorPage />} />
          <Route path="/formularios/:formId" element={<FormEditorPage />} />
          <Route path="/clients/:clientId" element={<div>paciente</div>} />
          <Route path="/clients/:clientId/forms/new" element={<FormFillPage />} />
          <Route path="/clients/:clientId/forms/:responseId" element={<FormFillPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('formulários — regras do painel', () => {
  it('confere o formulário antes de salvar', () => {
    expect(formProblems('', [])).toEqual(['Dê um nome ao formulário.', 'Adicione pelo menos uma pergunta.']);
    expect(formProblems('X', [{ id: 'a', type: 'single_choice', label: 'Humor', options: ['Bom', ' '], required: false }])).toEqual(['Pergunta 1: coloque pelo menos 2 opções.']);
  });

  it('trocar o tipo mantém o texto e só deixa opções em escolha', () => {
    const q = changeType({ id: 'a', type: 'short_text', label: 'Humor', required: true }, 'single_choice');
    expect(q).toEqual({ id: 'a', type: 'single_choice', label: 'Humor', required: true, options: ['', ''] });
    expect(changeType(q, 'yes_no')).toEqual({ id: 'a', type: 'yes_no', label: 'Humor', required: true });
  });

  it('modelos prontos vêm com ids próprios e texto das respostas fica legível', () => {
    const parq = starterQuestions('parq');
    expect(parq).toHaveLength(8);
    expect(new Set(parq.map((q) => q.id)).size).toBe(8);
    expect(answerText(QUESTIONS[0], 7)).toBe('7 / 10');
    expect(answerText(QUESTIONS[1], 72.5)).toBe('72,5 kg');
    expect(answerText(QUESTIONS[2], false)).toBe('Não');
    expect(answerText(QUESTIONS[3], ['Doces', 'Tempo'])).toBe('Doces, Tempo');
    expect(answerText(QUESTIONS[3], [])).toBe('—');
    expect(missingRequired(QUESTIONS, {}).map((q) => q.id)).toEqual(['fome']);
  });
});

describe('editor de formulário', () => {
  beforeEach(() => {
    vi.mocked(api.createForm).mockReset().mockResolvedValue(form);
  });

  it('cria a partir do Check-in semanal e salva as perguntas limpas', async () => {
    renderAt('/formularios/novo?modelo=checkin');
    expect(screen.getByLabelText('Nome do formulário')).toHaveValue('Check-in semanal');
    expect(screen.getByText('Perguntas (9)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remover pergunta 9' }));
    await userEvent.click(screen.getByRole('button', { name: '+ Pergunta' }));
    await userEvent.type(screen.getByLabelText('Texto da pergunta 9'), 'Remédios em uso');
    await userEvent.click(screen.getByRole('button', { name: 'Criar formulário' }));

    await waitFor(() => expect(api.createForm).toHaveBeenCalled());
    const body = vi.mocked(api.createForm).mock.calls[0][0];
    expect(body.name).toBe('Check-in semanal');
    expect(body.questions).toHaveLength(9);
    expect(body.questions[8]).toMatchObject({ type: 'short_text', label: 'Remédios em uso' });
    expect(await screen.findByText('lista')).toBeInTheDocument();
  });

  it('não deixa salvar pergunta vazia', async () => {
    renderAt('/formularios/novo');
    await userEvent.type(screen.getByLabelText('Nome do formulário'), 'Teste');
    await userEvent.click(screen.getByRole('button', { name: 'Criar formulário' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Pergunta 1: escreva a pergunta.');
    expect(api.createForm).not.toHaveBeenCalled();
  });
});

describe('preencher formulário do paciente', () => {
  beforeEach(() => {
    vi.mocked(api.getForm).mockReset().mockResolvedValue(form);
    vi.mocked(api.createFormResponse).mockReset();
    vi.mocked(api.getFormResponse).mockReset();
  });

  it('preenche, exige a obrigatória e mostra as respostas depois de salvar', async () => {
    const saved: FormResponse = {
      id: 'r1',
      formId: 'f1',
      clientId: 'c1',
      formName: 'Check-in semanal',
      questions: QUESTIONS,
      answers: { fome: 6, peso: 72.5, treinou: true, dif: ['Doces'] },
      filledAt: '2026-10-29T15:00:00Z',
      createdAt: '2026-10-29T15:00:00Z',
      updatedAt: '2026-10-29T15:00:00Z',
    };
    vi.mocked(api.createFormResponse).mockResolvedValue(saved);
    vi.mocked(api.getFormResponse).mockResolvedValue(saved);
    renderAt('/clients/c1/forms/new?form=f1');

    expect(await screen.findByText('Check-in semanal')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Responda: Fome durante a semana');

    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Fome durante a semana' })).getByRole('radio', { name: '6' }));
    await userEvent.type(screen.getByLabelText('Peso em casa'), '72,5');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Treinou?' })).getByRole('radio', { name: 'Sim' }));
    await userEvent.click(screen.getByRole('button', { name: 'Doces' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(api.createFormResponse).toHaveBeenCalled());
    expect(vi.mocked(api.createFormResponse).mock.calls[0]).toEqual([
      'c1',
      expect.objectContaining({ formId: 'f1', answers: { fome: 6, peso: '72,5', treinou: true, dif: ['Doces'] } }),
    ]);
    expect(await screen.findByText('72,5 kg')).toBeInTheDocument();
    expect(screen.getByText('6 / 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar respostas' })).toBeInTheDocument();
  });
});
