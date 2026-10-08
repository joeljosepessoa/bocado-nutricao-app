import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../api/endpoints';
import type { OrganizedDietProposal, ProposalDietItem } from '../../types/api';
import { DietAssistantPage } from '../DietAssistantPage';

vi.mock('../../api/endpoints', () => ({
  organizeDiet: vi.fn(),
  createDietWithAi: vi.fn(),
  createDietFromProposal: vi.fn(),
  acceptProfessionalAiConsent: vi.fn(),
  listFoods: vi.fn(),
}));

const item = (sourceText: string, rawFood: string, quantity: number | null, unit: ProposalDietItem['unit'], extra: Partial<ProposalDietItem> = {}): ProposalDietItem => ({
  sourceText,
  rawFood,
  quantity,
  quantityMax: null,
  freeQuantity: false,
  unitText: unit,
  unit,
  notes: null,
  matchStatus: 'matched',
  matchedFood: { id: `f-${rawFood}`, name: rawFood },
  candidates: [],
  warnings: [],
  ...extra,
});

const singleDay = (meals: OrganizedDietProposal['days'][number]['meals']): OrganizedDietProposal => ({
  warnings: [],
  supplements: [],
  guidelines: [],
  days: [{ label: null, kind: 'other', usageNotes: null, warnings: [], meals }],
});

const proposal = singleDay([
  {
    name: 'CAFÉ DA MANHÃ',
    time: null,
    notes: null,
    warnings: [],
    groups: [
      {
        kind: 'fixed',
        label: null,
        choices: [
          {
            label: null,
            items: [
              item('2 fatias de pão integral', 'Pão integral', 2, 'slice', { matchedFood: { id: 'f-pao', name: 'Pão integral' } }),
              item('150 g de fruta', 'Fruta', 150, 'g', {
                matchStatus: 'ambiguous',
                matchedFood: null,
                candidates: [{ id: 'f-mamao', name: 'Mamão papaia' }],
                warnings: ['Alimento com mais de uma correspondência possível — escolha no catálogo.'],
              }),
            ],
          },
        ],
      },
    ],
  },
]);

/** Dieta com dia de treino/descanso, opções, bloco "escolha 1", item à vontade fora do catálogo, suplemento e orientação. */
const structuredProposal: OrganizedDietProposal = {
  warnings: [],
  guidelines: ['Água: no mínimo 2,5 litros por dia.'],
  supplements: [{ sourceText: 'Creatina: 3 a 5 g por dia', name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null, warnings: [] }],
  days: [
    {
      label: 'DIA DE TREINO',
      kind: 'training',
      usageNotes: null,
      warnings: [],
      meals: [
        {
          name: 'CAFÉ DA MANHÃ',
          time: null,
          notes: null,
          warnings: [],
          groups: [
            {
              kind: 'meal_options',
              label: null,
              choices: [
                { label: 'Opção 1', items: [item('10 g de aveia', 'Aveia', 10, 'g'), item('2 ovos', 'Ovo', 2, 'unit')] },
                { label: 'Opção 2', items: [item('30 g de whey', 'Whey', 30, 'g')] },
              ],
            },
          ],
        },
        {
          name: 'ALMOÇO',
          time: null,
          notes: null,
          warnings: [],
          groups: [
            {
              kind: 'alternatives',
              label: 'Carboidrato',
              choices: [
                { label: null, items: [item('65 g de arroz', 'Arroz', 65, 'g')] },
                { label: null, items: [item('160 g de batata', 'Batata', 160, 'g')] },
              ],
            },
            {
              kind: 'fixed',
              label: null,
              choices: [
                {
                  label: null,
                  items: [
                    item('salada de folhas à vontade', 'salada de folhas', null, null, {
                      freeQuantity: true,
                      matchStatus: 'not_found',
                      matchedFood: null,
                      warnings: ['Alimento não identificado no catálogo — revisar.'],
                    }),
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      label: 'DIA DE DESCANSO',
      kind: 'rest',
      usageNotes: null,
      warnings: [],
      meals: [{ name: 'CEIA', time: null, notes: null, warnings: [], groups: [{ kind: 'fixed', label: null, choices: [{ label: null, items: [item('10 g de castanhas', 'Castanha', 10, 'g')] }] }] }],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/clients/c1/diet/assistant']}>
        <Routes>
          <Route path="/clients/:clientId/diet/assistant" element={<DietAssistantPage />} />
          <Route path="/clients/:clientId/diet" element={<div>Aba Dieta</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function organizeSample() {
  const user = userEvent.setup();
  vi.mocked(api.organizeDiet).mockResolvedValue({ text: '', structuredData: proposal } as never);
  renderPage();
  await user.type(screen.getByLabelText(/Cole aqui a dieta/), 'CAFÉ DA MANHÃ{enter}2 fatias de pão integral{enter}150 g de fruta');
  await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
  await screen.findByText(/Proposta de dieta organizada por IA/);
  return user;
}

describe('Assistente de Dieta', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deixa claro que a IA não altera a prescrição; o modo "manter exatamente como escrevi" é o padrão e o outro modo está disponível', () => {
    renderPage();
    expect(screen.getByRole('note').textContent).toMatch(/A IA não altera quantidades, alimentos ou prescrição/);
    expect(screen.getByRole('radio', { name: /Manter exatamente como escrevi/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Deixar a IA montar\/ajustar/ })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /Deixar a IA montar\/ajustar/ })).not.toBeChecked();
  });

  describe('modo "Deixar a IA montar/ajustar"', () => {
    const created: OrganizedDietProposal = {
      ...singleDay([
        {
          name: 'Almoço',
          time: '12:00',
          notes: null,
          warnings: [],
          groups: [
            {
              kind: 'alternatives',
              label: 'Carboidrato',
              choices: [
                { label: null, items: [item('', 'Arroz, tipo 1, cozido', 100, 'g', { matchedFood: { id: 'f-arroz', name: 'Arroz, tipo 1, cozido' } })] },
                { label: null, items: [item('', 'Batata, inglesa, cozida', 200, 'g', { matchedFood: { id: 'f-batata', name: 'Batata, inglesa, cozida' } })] },
              ],
            },
          ],
        },
      ]),
      mode: 'create',
      guidelines: ['Beba água ao longo do dia.'],
      nutrition: {
        targetKcal: 1800,
        days: [
          {
            label: null,
            min: { kcal: 103.2, proteinG: 2.4, carbG: 23.8, fatG: 0, fiberG: 0 },
            max: { kcal: 128.3, proteinG: 2.5, carbG: 28.1, fatG: 0.2, fiberG: 1.6 },
          },
        ],
      },
    };

    async function chooseCreate() {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('radio', { name: /Deixar a IA montar\/ajustar/ }));
      return user;
    }

    it('troca o formulário: pedido + meta opcional; explica consentimento e cálculo pelo sistema', async () => {
      await chooseCreate();
      expect(screen.queryByLabelText(/Cole aqui a dieta/)).not.toBeInTheDocument();
      expect(screen.getByRole('note').textContent).toMatch(/só com alimentos do catálogo/);
      expect(screen.getByRole('note').textContent).toMatch(/O sistema calcula calorias e\s+macros/);
      expect(screen.getByRole('button', { name: 'Montar com IA' })).toBeDisabled();
    });

    it('envia o pedido, a meta e as refeições; mostra o cálculo do sistema e a proposta ligada ao catálogo; cria o RASCUNHO', async () => {
      const user = await chooseCreate();
      vi.mocked(api.createDietWithAi).mockResolvedValue({ text: '', structuredData: created } as never);
      vi.mocked(api.createDietFromProposal).mockResolvedValue({} as never);
      await user.type(screen.getByLabelText('O que a dieta deve atender'), 'Emagrecimento, sem lactose');
      await user.type(screen.getByLabelText(/Meta de kcal por dia/), '1800');
      await user.type(screen.getByLabelText(/Refeições por dia/), '5');
      await user.click(screen.getByRole('button', { name: 'Montar com IA' }));

      expect(api.createDietWithAi).toHaveBeenCalledWith('c1', { dietGoal: 'Emagrecimento, sem lactose', targetKcal: 1800, mealsPerDay: 5 });
      expect(api.organizeDiet).not.toHaveBeenCalled();
      expect(await screen.findByText(/Proposta de dieta montada por IA com alimentos do catálogo/)).toBeInTheDocument();
      const summary = screen.getByText('Cálculo do sistema para a proposta da IA').closest('section, div')!.parentElement!;
      expect(summary.textContent).toMatch(/Meta informada: 1\.800 kcal por dia/);
      expect(summary.textContent).toMatch(/103–128 kcal/);
      expect(screen.getByText('Catálogo: Arroz, tipo 1, cozido')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Montar novamente' })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
      await screen.findByText('Aba Dieta');
      const payload = vi.mocked(api.createDietFromProposal).mock.calls[0][1];
      expect(payload.days![0].meals[0].groups[0]).toMatchObject({
        kind: 'alternatives',
        label: 'Carboidrato',
        choices: [{ foods: [{ foodId: 'f-arroz', quantity: 100, unit: 'g' }] }, { foods: [{ foodId: 'f-batata', quantity: 200, unit: 'g' }] }],
      });
      expect(payload.patientGuidelines).toBe('Beba água ao longo do dia.');
    });

    it('meta fora de 800–6000 kcal bloqueia o envio com explicação', async () => {
      const user = await chooseCreate();
      await user.type(screen.getByLabelText('O que a dieta deve atender'), 'Hipertrofia');
      await user.type(screen.getByLabelText(/Meta de kcal por dia/), '300');
      expect(screen.getByRole('button', { name: 'Montar com IA' })).toBeDisabled();
      expect(screen.getByRole('alert').textContent).toMatch(/entre 800 e 6000 kcal/);
    });

    it('paciente sem consentimento: mostra o motivo, sem botão de ativar (só o paciente autoriza no app)', async () => {
      const user = await chooseCreate();
      vi.mocked(api.createDietWithAi).mockRejectedValue({
        response: { status: 403, data: { message: 'O cliente ainda não autorizou o processamento de dados por IA. Peça ao cliente que acesse Privacidade e dados no aplicativo.' } },
      });
      await user.type(screen.getByLabelText('O que a dieta deve atender'), 'Hipertrofia');
      await user.click(screen.getByRole('button', { name: 'Montar com IA' }));
      expect((await screen.findByRole('alert')).textContent).toMatch(/O cliente ainda não autorizou/);
      expect(screen.queryByRole('button', { name: /Ativar assistente de IA/ })).not.toBeInTheDocument();
      expect(api.createDietFromProposal).not.toHaveBeenCalled();
    });
  });

  it('mostra a proposta com o nome COMO ESCRITO, o texto original e as quantidades intactas; fora do catálogo fica "Sem cálculo"', async () => {
    await organizeSample();
    expect(api.organizeDiet).toHaveBeenCalledWith('c1', expect.stringContaining('150 g de fruta'));
    expect(screen.getByText('150 g de fruta')).toBeTruthy();
    expect((screen.getByLabelText('Nome de Fruta') as HTMLInputElement).value).toBe('Fruta');
    expect((screen.getByLabelText('Quantidade de Fruta') as HTMLInputElement).value).toBe('150');
    expect((screen.getByLabelText('Quantidade de Pão integral') as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('Sem cálculo')).toBeTruthy();
    expect(screen.getByText('Catálogo: Pão integral')).toBeTruthy();
  });

  it('o profissional escolhe a sugestão e cria RASCUNHO; rascunho existente só é substituído após confirmação', async () => {
    const user = await organizeSample();
    await user.click(screen.getByRole('button', { name: 'Mamão papaia' }));

    vi.mocked(api.createDietFromProposal)
      .mockRejectedValueOnce({ response: { status: 409, data: { message: 'Já existe um rascunho em aberto (versão 2).' } } })
      .mockResolvedValueOnce({} as never);
    await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
    expect(await screen.findByText('Substituir o rascunho atual?')).toBeTruthy();
    expect(vi.mocked(api.createDietFromProposal).mock.calls[0][1]).toEqual({
      days: [
        {
          label: null,
          kind: 'other',
          usageNotes: null,
          meals: [
            {
              name: 'CAFÉ DA MANHÃ',
              time: null,
              notes: null,
              groups: [
                {
                  kind: 'fixed',
                  label: null,
                  choices: [
                    {
                      label: null,
                      foods: [
                        { customFoodName: 'Pão integral', foodId: 'f-pao', quantity: 2, unit: 'slice', notes: null },
                        { customFoodName: 'Fruta', foodId: 'f-mamao', quantity: 150, unit: 'g', notes: null },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      supplements: [],
      patientGuidelines: null,
    });

    await user.click(screen.getByRole('button', { name: 'Substituir rascunho' }));
    expect(await screen.findByText('Aba Dieta')).toBeTruthy();
    expect(vi.mocked(api.createDietFromProposal).mock.calls[1][1]).toMatchObject({ replaceDraft: true });
  });

  it('revisão na mesma árvore da dieta: dias, opções, bloco "escolha 1", nome livre, suplemento e orientações', async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizeDiet).mockResolvedValue({ text: '', structuredData: structuredProposal } as never);
    vi.mocked(api.createDietFromProposal).mockResolvedValue({} as never);
    renderPage();
    await user.type(screen.getByLabelText(/Cole aqui a dieta/), 'DIA DE TREINO');
    await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
    await screen.findByText(/Proposta de dieta organizada por IA/);

    expect(screen.getByRole('tab', { name: 'DIA DE TREINO' })).toHaveAttribute('aria-selected', 'true');
    const cafe = screen.getByRole('region', { name: 'Refeição CAFÉ DA MANHÃ' });
    expect(within(cafe).getByText('Escolha 1 opção')).toBeInTheDocument();
    expect(within(cafe).getAllByRole('article').map((a) => a.getAttribute('aria-label'))).toEqual(['Opção 1', 'Opção 2']);
    const almoco = screen.getByRole('region', { name: 'Refeição ALMOÇO' });
    expect(within(within(almoco).getByRole('region', { name: 'Carboidrato' })).getByText('Escolha 1')).toBeInTheDocument();
    expect((screen.getByLabelText('À vontade: salada de folhas') as HTMLInputElement).checked).toBe(true);

    // Item fora do catálogo fica como escrito, sem cálculo — e não impede criar.
    expect(within(almoco).getByText('Sem cálculo')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'DIA DE DESCANSO' }));
    expect(screen.getByRole('region', { name: 'Refeição CEIA' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Refeição ALMOÇO' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Criar dieta como rascunho' }));
    await screen.findByText('Aba Dieta');
    const payload = vi.mocked(api.createDietFromProposal).mock.calls[0][1];
    expect(payload.days!.map((d) => [d.label, d.kind, d.meals.length])).toEqual([
      ['DIA DE TREINO', 'training', 2],
      ['DIA DE DESCANSO', 'rest', 1],
    ]);
    const [cafeOut, almocoOut] = payload.days![0].meals;
    expect(cafeOut.groups[0]).toMatchObject({ kind: 'meal_options', choices: [{ label: 'Opção 1' }, { label: 'Opção 2' }] });
    expect(almocoOut.groups[0]).toMatchObject({ kind: 'alternatives', label: 'Carboidrato' });
    expect(almocoOut.groups[0].choices).toHaveLength(2);
    expect(almocoOut.groups[1].choices[0].foods).toEqual([{ customFoodName: 'salada de folhas', isFreeQuantity: true, notes: null }]);
    expect(payload.supplements).toEqual([{ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null }]);
    expect(payload.patientGuidelines).toBe('Água: no mínimo 2,5 litros por dia.');
  });

  it('erro da IA (resposta recusada) é mostrado e nada é salvo', async () => {
    const user = userEvent.setup();
    vi.mocked(api.organizeDiet).mockRejectedValue({
      response: { status: 503, data: { message: 'A organização foi recusada porque alteraria a dieta escrita.' } },
    });
    renderPage();
    await user.type(screen.getByLabelText(/Cole aqui a dieta/), 'ALMOÇO');
    await user.click(screen.getByRole('button', { name: 'Organizar com IA' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/alteraria a dieta escrita/);
    expect(api.createDietFromProposal).not.toHaveBeenCalled();
  });
});
