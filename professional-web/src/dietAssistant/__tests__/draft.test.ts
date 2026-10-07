import { describe, expect, it } from 'vitest';
import type { OrganizedDietProposal, ProposalDietItem } from '../../types/api';
import {
  asCustomName,
  draftProblems,
  draftToPayload,
  LIVE_WARNINGS,
  proposalToDraft,
  removeChoice,
  removeFood,
  selectFood,
  updateFood,
  withoutNotice,
  type DietDraft,
} from '../draft';

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

const notFound = { matchStatus: 'not_found' as const, matchedFood: null, warnings: ['Alimento não identificado no catálogo — revisar.'] };

const proposal: OrganizedDietProposal = {
  warnings: ['Trecho não organizado: "100 g feijão" — revisar.'],
  guidelines: ['Água: no mínimo 2,5 litros por dia.', 'Durma de 7 a 9 horas por noite.'],
  supplements: [{ sourceText: 'Creatina: 3 a 5 g', name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null, warnings: [] }],
  days: [
    {
      label: 'DIA DE TREINO',
      kind: 'training',
      usageNotes: null,
      warnings: [],
      meals: [
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
                { label: null, items: [item('65 g de aipim', 'Aipim', 65, 'g', notFound)] },
              ],
            },
            {
              kind: 'fixed',
              label: null,
              choices: [{ label: null, items: [item('salada de folhas à vontade', 'salada de folhas', null, null, { ...notFound, freeQuantity: true }), item('3 a 5 g de azeite', 'Azeite', 3, 'g', { quantityMax: 5 })] }],
            },
          ],
        },
      ],
    },
  ],
};

const groups = (draft: DietDraft) => draft.days[0].meals[0].groups;

describe('rascunho do Assistente de Dieta (estrutura por dia/bloco/opção)', () => {
  it('preserva exatamente quantidades, faixas, "à vontade", unidades e o texto de origem', () => {
    const draft = proposalToDraft(proposal);
    expect(draft.days[0]).toMatchObject({ label: 'DIA DE TREINO', kind: 'training' });
    const [carbo, fixos] = groups(draft);
    expect(carbo).toMatchObject({ kind: 'alternatives', label: 'Carboidrato' });
    expect(carbo.choices.map((c) => c.foods.map((f) => [f.sourceText, f.quantity, f.unit]))).toEqual([[['65 g de arroz', 65, 'g']], [['65 g de aipim', 65, 'g']]]);
    const [salad, oil] = fixos.choices[0].foods;
    expect([salad.freeQuantity, salad.quantity, salad.unit]).toEqual([true, null, null]);
    expect([oil.quantity, oil.quantityMax]).toEqual([3, 5]);
    // O aviso do backend que vira aviso "vivo" não é duplicado como observação.
    expect(carbo.choices[1].foods[0].notices).toEqual([]);
    expect(draft.guidelines).toBe('Água: no mínimo 2,5 litros por dia.\nDurma de 7 a 9 horas por noite.');
    expect(draft.supplements[0]).toMatchObject({ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g' });
  });

  it('não deixa criar com alimento pendente ou aviso geral; resolve escolhendo no catálogo OU usando nome livre', () => {
    let draft = proposalToDraft(proposal);
    const problems = draftProblems(draft);
    expect(problems.some((p) => p.includes('aviso(s) geral(is)'))).toBe(true);
    expect(problems.filter((p) => p.endsWith(LIVE_WARNINGS.foodNotSelected))).toHaveLength(2);

    const [carbo, fixos] = groups(draft);
    draft = updateFood(draft, carbo.choices[1].foods[0].key, (food) => selectFood(food, { id: 'f-aipim', name: 'Aipim cozido' }));
    draft = updateFood(draft, fixos.choices[0].foods[0].key, asCustomName);
    draft = { ...draft, notices: withoutNotice(draft.notices, proposal.warnings[0]) };
    expect(draftProblems(draft)).toEqual([]);
  });

  it('regras da estrutura e da faixa entram nas pendências', () => {
    let draft = proposalToDraft(proposal);
    const [carbo, fixos] = groups(draft);
    draft = updateFood(draft, fixos.choices[0].foods[1].key, (f) => ({ ...f, quantityMax: 2 }));
    draft = removeChoice(removeChoice(draft, carbo.choices[0].key), carbo.choices[1].key);
    const problems = draftProblems(draft);
    expect(problems).toContain('DIA DE TREINO · Refeição 1 (ALMOÇO) — Carboidrato: Bloco "escolha 1" sem nenhuma opção.');
    expect(problems.some((p) => p.endsWith(LIVE_WARNINGS.rangeInvalid))).toBe(true);
  });

  it('o payload leva a árvore revisada (catálogo, nome livre, à vontade, faixa), suplementos e orientações — sem publicar', () => {
    let draft = proposalToDraft(proposal);
    const [carbo, fixos] = groups(draft);
    draft = removeFood(draft, carbo.choices[1].foods[0].key);
    draft = removeChoice(draft, carbo.choices[1].key);
    draft = updateFood(draft, fixos.choices[0].foods[0].key, asCustomName);
    draft = { ...draft, notices: [] };
    expect(draftToPayload(draft)).toEqual({
      days: [
        {
          label: 'DIA DE TREINO',
          kind: 'training',
          usageNotes: null,
          meals: [
            {
              name: 'ALMOÇO',
              time: null,
              notes: null,
              groups: [
                { kind: 'alternatives', label: 'Carboidrato', choices: [{ label: null, foods: [{ foodId: 'f-Arroz', quantity: 65, unit: 'g', notes: null }] }] },
                {
                  kind: 'fixed',
                  label: null,
                  choices: [
                    {
                      label: null,
                      foods: [
                        { customFoodName: 'salada de folhas', isFreeQuantity: true, notes: null },
                        { foodId: 'f-Azeite', quantity: 3, quantityMax: 5, unit: 'g', notes: null },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      supplements: [{ name: 'Creatina', quantity: 3, quantityMax: 5, unitText: 'g', timing: null, notes: null }],
      patientGuidelines: 'Água: no mínimo 2,5 litros por dia.\nDurma de 7 a 9 horas por noite.',
    });
    expect(draftToPayload(draft, true).replaceDraft).toBe(true);
    expect(JSON.stringify(draftToPayload(draft))).not.toMatch(/publish/);
  });
});
